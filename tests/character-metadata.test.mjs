// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {characterMetadataAsset} from '../src/domain/characterMetadata.js';
import {readApprovedUi} from '../scripts/sync-character-card-ui.mjs';
import {METADATA_GROUPS,METADATA_RECIPE} from '../scripts/sync-character-metadata.mjs';
import catalog from '../src/data/characterMetadataAssets.json' with {type:'json'};
const base=new URL('../public/ui-assets/nikke/',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');
test('23 metadata routes resolve to source-bound native glyphs or declared composites',async()=>{
 const proof=JSON.parse(await readFile(new URL('metadata/native/extracted-sources.json',base)));
 assert.equal(proof.items.length,23);assert.deepEqual(proof.recipe,METADATA_RECIPE);
 for(const group of METADATA_GROUPS) for(const [id,file] of Object.entries(catalog[group])){
  assert.equal(characterMetadataAsset(group,id),`/ui-assets/nikke/${file}`);
  const item=proof.items.find(i=>i.group===group&&i.id===id);
  const raw=proof.inputs[group].items.find(i=>i.id===id);
  const bytes=await readFile(new URL(file,base));assert.equal(sha(bytes),item.png_sha256);
  assert.equal(item.source_png_sha256,raw.png_sha256);assert.equal(raw.review_status,'visually_verified');
  if(['class','weapon','manufacturer'].includes(group)) assert.equal(sha(bytes),raw.png_sha256);
  else assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[110,122]);
 }
 assert.deepEqual(proof.inputs.manufacturer.items.map(i=>i.sprite_name),['icn_corp_01','icn_corp_02','icn_corp_03','icn_corp_04','icn_corp_05']);
 assert.equal(proof.inputs.burst.items.at(-1).sprite_name,'icn_burst_all');
});
test('known aliases and unknown metadata do not guess a resource filename',()=>{
 for(const [group,a,b] of [['burst','Step1','burst-1'],['burst','AllStep','burst-all'],['element','Electronic','electric'],['manufacturer','Tetraline','tetra'],['weapon','Rocket Launcher','rl']]){
  assert.equal(characterMetadataAsset(group,a),characterMetadataAsset(group,b));
 }
 for(const group of METADATA_GROUPS) for(const bad of [null,undefined,'undefined','','not-a-real-code','../outside','constructor','__proto__',{}]) assert.equal(characterMetadataAsset(group,bad),'');
 assert.equal(characterMetadataAsset('not-group','ar'),'');
});
test('metadata import rejects unreviewed and corrupted individual glyphs',async()=>{
 const proof=JSON.parse(await readFile(new URL('metadata/native/extracted-sources.json',base))).inputs.class;
 const dir=await mkdtemp(path.join(tmpdir(),'nikke-metadata-test-'));
 try{
  await mkdir(path.join(dir,'class'));
  for(const i of proof.items) await writeFile(path.join(dir,i.file),await readFile(new URL(catalog.class[i.id],base)));
  const save=()=>writeFile(path.join(dir,'manifest.json'),JSON.stringify(proof));await save();
  assert.equal((await readApprovedUi(dir,'class')).assets.length,3);
  proof.items[0].review_status='candidate';await save();await assert.rejects(readApprovedUi(dir,'class'),/Unreviewed/);
  proof.items[0].review_status='visually_verified';await save();
  await writeFile(path.join(dir,proof.items[0].file),'bad');await assert.rejects(readApprovedUi(dir,'class'),/Invalid UI PNG/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
