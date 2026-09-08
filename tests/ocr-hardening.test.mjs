import test from 'node:test';
import assert from 'node:assert/strict';
import {runOcrTask, runScreenshotBatch, createOcrWorkerPool} from '../src/services/ocrTask.js';
import {constrainedNumericResult} from '../src/domain/trainingOcrFieldContract.js';
import {editTrainingField, validateMixedOcrPreview, trainingOcrConflicts} from '../src/domain/screenshotOcrReview.js';
import {mergeTrainingOcrEntriesIntoDraft} from '../src/domain/trainingScreenshotOcr.js';
import {matchEquipmentFunctionType} from '../src/domain/equipmentScreenshotOcr.js';
import {recognizeSkillField} from '../src/domain/trainingOcrFields/skillLevelShared.js';
const result=(field,value)=>({field,value,status:'recognized',confidence:.9});
const entry=(name,value)=>({type:'training',characterName:'灰姑娘',fileName:name,fields:{characterLevel:result('characterLevel',value)}});

test('strict numeric OCR retains confidence and accepts all skill levels',()=>{
  for(let n=1;n<=10;n++) assert.equal(constrainedNumericResult(String(n),.95,{max:10}).value,n);
  for(const s of ['12foo','', '1.5','-1','11']) assert.equal(constrainedNumericResult(s,.95,{max:10}).value,null);
  const weak=constrainedNumericResult('15',.01,{max:15});
  assert.equal(weak.value,null); assert.equal(weak.confidence,.01);
});
test('ambiguous equipment text cannot invent an attack affix',()=>{
  for(const s of ['力','增加','xyz']) assert.equal(matchEquipmentFunctionType(s),'');
});
test('review catches cross-image conflicts and honors exclusion',()=>{
  const a=entry('a',616), b=entry('b',445);
  assert.equal(trainingOcrConflicts([a,b]).length,1);
  assert.equal(validateMixedOcrPreview([a,b]).length,1);
  b.excluded=true;
  assert.deepEqual(validateMixedOcrPreview([a,b]),[]);
  assert.equal(mergeTrainingOcrEntriesIntoDraft({},[a,b]).level,616);
});
test('manual edits preserve evidence and reject out of range',()=>{
  const original=result('skill1Level',10), edited=editTrainingField(original,'7');
  assert.equal(edited.value,7); assert.equal(edited.original.value,10);
  assert.equal(editTrainingField(edited,'11').excluded,true);
});
test('star observation preserves compatible exact level without inventing one',()=>{
  const e={fields:{collectible:result('collectible',{rarity:'SR',stars:2})}};
  assert.equal(mergeTrainingOcrEntriesIntoDraft({favoriteItemRarity:'SR',favoriteItemLevel:6},[e]).favoriteItemLevel,6);
  assert.equal(mergeTrainingOcrEntriesIntoDraft({},[e]).favoriteItemLevel,null);
});
test('partial skill layout independently reads 1–9 and keeps missing burst unknown',async()=>{
  for(let n=1;n<=9;n++) {
    const badge={recognition:{value:null},digitRegion:{x:1,y:1,width:20,height:20}};
    const ctx={cache:{skillLevels:{group:{skill1:badge,skill2:badge}}},ocrSkillLevel:async()=>constrainedNumericResult(String(n),.95,{max:10})};
    assert.equal((await recognizeSkillField(ctx,'skill1Level','skill1')).value,n);
    assert.equal((await recognizeSkillField(ctx,'burstSkillLevel','burst')).status,'not_visible');
  }
});
test('a failed image does not discard successes or stop later files',async()=>{
  const seen=[];const groups=[{characterName:'test',images:['a','bad','c'].map(name=>({name}))}];
  const r=await runScreenshotBatch(groups,async({file})=>{if(file.name==='bad')throw Error('broken');return {type:'training'};},{onResult:r=>seen.push(r)});
  assert.equal(r.length,3);assert.equal(r[1].type,'error');assert.equal(r[1].excluded,true);assert.equal(seen.length,3);
});
test('cancel preserves completed image and does not start another',async()=>{
  const c=new AbortController();
  const r=await runScreenshotBatch([{images:[{name:'a'},{name:'b'}]}],async()=>({type:'training'}),{signal:c.signal,onResult:()=>c.abort()});
  assert.equal(r.length,1);
});
test('single-image timeout stops its worker',async()=>{
  let stopped=false;
  await assert.rejects(runOcrTask(()=>new Promise(()=>{}),{timeoutMs:10,onStop:()=>{stopped=true;}}),/超时/);
  assert.equal(stopped,true);
});
test('failed worker initialization can retry and loaded worker is reusable',async()=>{
  let count=0,terminated=0;
  const pool=createOcrWorkerPool(async()=>{if(++count===1)throw Error('load');return {terminate:()=>{terminated++;}};});
  await assert.rejects(pool.get('eng'),/load/);
  const w=await pool.get('eng');assert.equal(await pool.get('eng'),w);assert.equal(count,2);
  pool.reset();await new Promise(r=>setTimeout(r,0));assert.equal(terminated,1);
});
