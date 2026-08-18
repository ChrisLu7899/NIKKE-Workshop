// SPDX-License-Identifier: GPL-3.0-or-later
// 本地模板数据签名工具

const normalizeForCompare = (value) => {
  if (Array.isArray(value)) return value.map((item) => normalizeForCompare(item));
  if (value && typeof value === "object") {
    const normalized = {};
    Object.keys(value).sort().forEach((key) => {
      normalized[key] = normalizeForCompare(value[key]);
    });
    return normalized;
  }
  return value;
};

const normalizeCharacterEntry = (entry) => {
  const normalized = normalizeForCompare(entry || {});
  if (Array.isArray(normalized.showStats)) {
    normalized.showStats = [...normalized.showStats].sort();
  }
  return normalized;
};

const normalizeCharacters = (data) => {
  const elements = data?.elements || {};
  const normalizedElements = {};
  ["Electronic", "Fire", "Wind", "Water", "Iron", "Utility"].forEach((key) => {
    const list = Array.isArray(elements[key]) ? elements[key] : [];
    if (list.length > 0) normalizedElements[key] = list.map(normalizeCharacterEntry);
  });

  const options = {};
  if (data?.options?.showEquipDetails === false) options.showEquipDetails = false;
  return normalizeForCompare({ elements: normalizedElements, options });
};

export const buildCharactersSignature = (data) =>
  JSON.stringify(normalizeCharacters(data || {}));
