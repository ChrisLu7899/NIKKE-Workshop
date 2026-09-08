// SPDX-License-Identifier: GPL-3.0-or-later
// Equipment identity is separate from OVERLOAD affixes. null = unknown; tid 0 = unequipped.
const integer = (value) => value !== null && value !== undefined && String(value).trim() !== '' && ['number', 'string'].includes(typeof value)
  && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function normalizeEquipmentMetadata(value) {
  return Array.from({ length: 4 }, (_, slot) => {
    const item = value?.[slot];
    const tid = integer(item?.tid);
    if (tid === null) return null;
    return { tid, level: tid ? integer(item.level) : null,
      corporationType: tid ? normalizeEquipmentCorporation(item.corporationType ?? item.corporation_type) : null };
  });
}

export function normalizeEquipmentCorporation(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = integer(value);
  if (number !== null) return number;
  const text = String(value).trim().toUpperCase();
  return ['NONE', 'ALL', 'ELYSION', 'MISSILIS', 'TETRA', 'PILGRIM', 'ABNORMAL'].includes(text) ? text : null;
}

export function mergeEquipmentMetadata(incoming, previous) {
  const old = normalizeEquipmentMetadata(previous);
  return normalizeEquipmentMetadata(incoming).map((item, slot) => {
    if (!item) return old[slot];
    if (!item.tid || old[slot]?.tid !== item.tid) return item;
    return { tid: item.tid, level: item.level ?? old[slot].level,
      corporationType: item.corporationType ?? old[slot].corporationType };
  });
}
