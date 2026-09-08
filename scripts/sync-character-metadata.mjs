// SPDX-License-Identifier: GPL-3.0-or-later
// Consume only reviewed formal PNGs; composition is a Workshop display derivative.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {readApprovedUi} from './sync-character-card-ui.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
export const METADATA_GROUPS=['burst','element','weapon','class','manufacturer'];
// Preserve incumbent 1.0.10 accent colors; these are UI tokens, not claimed game shader values.
export const METADATA_RECIPE={version:1,frame:'hex-dark',burstHeight:62,elementBox:[68,76],
  colors:{fire:[254,0,10],water:[0,124,254],wind:[0,255,81],electric:[254,0,251],iron:[255,146,0]}};
async function tint(bytes,color){
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4) for(let channel=0;channel<3;channel++) data[i+channel]=Math.round(data[i+channel]*color[channel]/255);
  return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
export async function buildMetadataPlan(library='E:/NIKKE_files/output'){
  const inputs={};
  for(const group of [...METADATA_GROUPS,'frames']) inputs[group]=await readApprovedUi(path.join(library,`character_card_ui_${group}`),group);
  const frame=inputs.frames.assets[0].bytes;
  const frameMeta=await sharp(frame).metadata();
  const assets=[],mapping={},proof={schema:'character-metadata-derived-v1',recipe:METADATA_RECIPE,
    producer_sha256:hash(await readFile(fileURLToPath(import.meta.url))),sharp_version:sharp.versions.sharp,
    inputs:Object.fromEntries(Object.entries(inputs).map(([g,r])=>[g,r.provenance])),items:[]};
  for(const group of METADATA_GROUPS){
    mapping[group]={};
    for(const {item,bytes:original} of inputs[group].assets){
      let bytes=original;
      if(group==='burst'||group==='element'){
        const color=group==='element'?METADATA_RECIPE.colors[item.id]:[255,255,255];
        const base=group==='element'?await tint(frame,color):frame;
        const glyph=await sharp(await tint(original,color)).resize(group==='burst'
          ?{height:METADATA_RECIPE.burstHeight}
          :{width:METADATA_RECIPE.elementBox[0],height:METADATA_RECIPE.elementBox[1],fit:'inside'}).png().toBuffer();
        const gm=await sharp(glyph).metadata();
        bytes=await sharp(base).composite([{input:glyph,left:Math.round((frameMeta.width-gm.width)/2),top:Math.round((frameMeta.height-gm.height)/2)}]).png().toBuffer();
      }
      const file=`metadata/native/${group}/${item.id}.png`;
      mapping[group][item.id]=file;assets.push({file,bytes});
      proof.items.push({group,id:item.id,file,source_png_sha256:item.png_sha256,png_sha256:hash(bytes),
        method:group==='burst'||group==='element'?'original frame + original glyph; deterministic resize/tint/composite':'byte-identical original Sprite'});
    }
  }
  return {assets,mapping,proof};
}
async function main(){
  const args=process.argv.slice(2);
  if(args.some(a=>a!=='--check'&&!a.startsWith('--asset-library='))) throw new Error('Usage: node scripts/sync-character-metadata.mjs [--check] [--asset-library=<formal output root>]');
  const input=args.find(a=>a.startsWith('--asset-library='))?.slice(16);
  const {assets,mapping,proof}=await buildMetadataPlan(input);
  const dest=path.join(root,'public/ui-assets/nikke');
  const manifest=JSON.parse(await readFile(path.join(dest,'manifest.json'),'utf8'));
  const publicMapping={
    burst:Object.fromEntries(Object.entries(mapping.burst).map(([k,v])=>[k.replace('burst-',''),v])),
    element:{Fire:mapping.element.fire,Water:mapping.element.water,Wind:mapping.element.wind,Electronic:mapping.element.electric,Iron:mapping.element.iron},
    weapon:Object.fromEntries(Object.entries(mapping.weapon).map(([k,v])=>[k.toUpperCase(),v])),
    class:Object.fromEntries(Object.entries(mapping.class).map(([k,v])=>[k[0].toUpperCase()+k.slice(1),v])),
    manufacturer:Object.fromEntries(Object.entries(mapping.manufacturer).map(([k,v])=>[k[0].toUpperCase()+k.slice(1),v])),
  };
  const generated=[...assets.map(a=>({...a,file:path.join(dest,a.file)})),
    {file:path.join(dest,'metadata/native/extracted-sources.json'),bytes:Buffer.from(JSON.stringify(proof,null,2)+'\n')},
    {file:path.join(root,'src/data/characterMetadataAssets.json'),bytes:Buffer.from(JSON.stringify(mapping,null,2)+'\n')}];
  if(args.includes('--check')){
    for(const g of METADATA_GROUPS) if(JSON.stringify(manifest.assets[g])!==JSON.stringify(publicMapping[g])) throw new Error(`Mapping differs: ${g}`);
    for(const {file,bytes} of generated) if(!(await readFile(file)).equals(bytes)) throw new Error(`Metadata differs: ${file}`);
  }else{
    for(const {file,bytes} of generated){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);}
    Object.assign(manifest.assets,publicMapping);
    await writeFile(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  }
  console.log(JSON.stringify({checked:args.includes('--check'),groups:METADATA_GROUPS,icons:assets.length}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e);process.exitCode=1});
