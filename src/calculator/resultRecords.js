// SPDX-License-Identifier: GPL-3.0-or-later

export const CALCULATOR_RUN_RECORDS_KEY = "calculatorRunRecords";

export function normalizeRunRecordStore(value) {
  const entries = value?.entries && typeof value.entries === "object"
    ? value.entries
    : {};
  return {
    version: 1,
    updatedAt: Number(value?.updatedAt || 0),
    entries: Object.fromEntries(
      Object.entries(entries).filter(([key, record]) =>
        Boolean(key) && record && typeof record === "object" && record.characterKey === key
      ),
    ),
  };
}

export function upsertRunRecord(store, record) {
  const current = normalizeRunRecordStore(store);
  if (!record?.characterKey) return current;
  const savedAt = Number(record.savedAt || Date.now());
  return {
    version: 1,
    updatedAt: savedAt,
    entries: {
      ...current.entries,
      [record.characterKey]: {
        ...record,
        savedAt,
      },
    },
  };
}

export function listRunRecords(store) {
  return Object.values(normalizeRunRecordStore(store).entries)
    .sort((left, right) => Number(right.savedAt || 0) - Number(left.savedAt || 0));
}

export function sortRunRecords(records, mode = "time-asc") {
  const sorted = [...(records || [])];
  const nameTieBreaker = (left, right) => String(left.characterName || "")
    .localeCompare(String(right.characterName || ""), "zh-CN");
  const compare = (left, right) => {
    const leftTime = Number(left.savedAt || 0);
    const rightTime = Number(right.savedAt || 0);
    const leftCost = Number(left.totalExpectedCost || 0);
    const rightCost = Number(right.totalExpectedCost || 0);
    if (mode === "time-desc") return rightTime - leftTime || nameTieBreaker(left, right);
    if (mode === "cost-asc") return leftCost - rightCost || leftTime - rightTime || nameTieBreaker(left, right);
    if (mode === "cost-desc") return rightCost - leftCost || leftTime - rightTime || nameTieBreaker(left, right);
    return leftTime - rightTime || nameTieBreaker(left, right);
  };
  return sorted.sort(compare);
}
