// SPDX-License-Identifier: GPL-3.0-or-later
import assets from '../data/characterMetadataAssets.json' with {type:'json'};
const aliases={
  burst:{step1:'burst-1',step2:'burst-2',step3:'burst-3',allstep:'burst-all'},
  element:{electronic:'electric',elect:'electric'},
  weapon:{'rocket launcher':'rl',assault:'ar','assault rifle':'ar','machine gun':'mg',shotgun:'sg','submachine gun':'smg','sniper rifle':'sr'},
  manufacturer:{tetraline:'tetra'},
};
export function characterMetadataAsset(group,value){
  if(!Object.hasOwn(assets,group)) return '';
  const normalized=typeof value==='string'?value.trim().toLowerCase():'';
  const key=aliases[group]?.[normalized]||normalized;
  return Object.hasOwn(assets[group],key)?`/ui-assets/nikke/${assets[group][key]}`:'';
}
