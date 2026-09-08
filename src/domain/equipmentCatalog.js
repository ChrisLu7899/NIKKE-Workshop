// SPDX-License-Identifier: GPL-3.0-or-later
import catalog from '../data/equipmentCatalog.json' with { type: 'json' };
import { normalizeEquipmentMetadata } from './equipmentMetadata.js';

export const EQUIPMENT_SLOT_KEYS = Object.freeze(['head', 'body', 'arms', 'legs']);
export const EQUIPMENT_SLOT_LABELS = Object.freeze(['头部', '身躯', '臂部', '腿部']);
const SLOT_BY_TYPE = { Module_A: 0, Module_B: 1, Module_C: 2, Module_D: 3 };
const records = new Map(catalog.records.map((item) => [Number(item.id), item]));
const CORPORATIONS = Object.freeze({ 1: 'ELYSION', 2: 'MISSILIS', 3: 'TETRA', 4: 'PILGRIM', 7: 'ABNORMAL' });
const CORPORATION_NAMES = Object.freeze({ ELYSION: '极乐净土', MISSILIS: '米西利斯', TETRA: '泰特拉', PILGRIM: '朝圣者', ABNORMAL: '反常' });
export function equipmentCorporation(value) {
  const key = CORPORATIONS[value] || String(value ?? '').trim().toUpperCase();
  return Object.hasOwn(CORPORATION_NAMES, key) ? key : '';
}
export const equipmentRecord = (tid) => records.get(Number(tid)) || null;
export const equipmentSlot = (item) => SLOT_BY_TYPE[item?.item_sub_type] ?? null;
export const isNonOverloadEquipment = (meta) => meta?.tid === 0
  || Boolean(equipmentRecord(meta?.tid) && equipmentRecord(meta.tid).item_rare !== 'T10');

// Existing equipment OCR confirms OVERLOAD affixes. Save identity at the same
// boundary, so previously synced ordinary gear cannot mask a confirmed T10.
export function mergeOverloadOcrMetadata(previous, entries, characterClass) {
  const result = normalizeEquipmentMetadata(previous);
  for (const entry of entries || []) {
    const slot = EQUIPMENT_SLOT_LABELS.indexOf(entry.equipmentSlot);
    if (slot < 0 || !entry.lines?.some(line => line.functionType)) continue;
    const record = catalog.records.find(r => r.item_rare === 'T10' && equipmentSlot(r) === slot
      && r.class.toLowerCase() === String(characterClass).toLowerCase());
    if (record) result[slot] = result[slot]?.tid === record.id ? result[slot]
      : { tid: record.id, level: null, corporationType: null };
  }
  return result;
}

export function resolveEquipmentDisplay(metadata, slotIndex, lines, characterClass) {
  const meta = normalizeEquipmentMetadata(metadata)[slotIndex];
  const record = equipmentRecord(meta?.tid);
  const slotLabel = EQUIPMENT_SLOT_LABELS[slotIndex];
  const fallback = { state: meta?.tid === 0 ? 'empty' : 'unknown', icon: '', tier: '', isOverload: false,
    className: '', manufacturer: '', label: meta?.tid === 0 ? `${slotLabel}未装备` : `${slotLabel}装备信息未知`, metadata: meta };
  if (meta) {
    if (!meta.tid) return fallback;
    if (!record || equipmentSlot(record) !== slotIndex) return { ...fallback, label: `${slotLabel}装备编号 ${meta.tid} 待匹配` };
    const icon = catalog.icons[record.resource_id] || '';
    // Enterprise origin is independent of tier. Unknown origins are not inferred
    // from the character; T10 retains its distinct OVERLOAD badge.
    const manufacturer = /^T[1-9]$/.test(record.item_rare) ? equipmentCorporation(meta.corporationType) : '';
    return { state: 'known', icon: icon ? `/ui-assets/nikke/${icon}` : '', tier: record.item_rare,
      isOverload: record.item_rare === 'T10', className: record.class, manufacturer,
      label: `${slotLabel} · ${record.item_rare}${manufacturer ? ` · ${CORPORATION_NAMES[manufacturer]}企业装备` : ''} · ${record.name_localkey || record.resource_id}${meta.level === null ? '' : ` · 强化 ${meta.level}`}`,
      metadata: meta, resourceId: record.resource_id, tid: meta.tid };
  }
  // Legacy/OCR records contain only real OVERLOAD affixes, never a generic equipment default.
  const family = { attacker: 'vmetal', defender: '99', supporter: 'code' }[String(characterClass).toLowerCase()];
  if (family && lines?.some((line) => line?.functionType)) return {
    ...fallback, state: 'legacy-overload', tier: 'T10', isOverload: true, className: characterClass,
    icon: `/ui-assets/nikke/equipment/overload/${family}-${EQUIPMENT_SLOT_KEYS[slotIndex]}.png`, label: `${slotLabel} · T10（根据改造词条）`,
  };
  return fallback;
}
