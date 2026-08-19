// SPDX-License-Identifier: GPL-3.0-or-later
// 为洗词条计算器生成不含账号凭据的最小角色装备快照。

import { isUnowned } from "./ael.js";
import { resolveSimplifiedChineseCharacterName } from "../data/characterNameOverrides.js";

const ELEMENT_ORDER = ["Electronic", "Fire", "Wind", "Water", "Iron", "Utility"];

export const CALCULATOR_SNAPSHOT_VERSION = 2;
export const CALCULATOR_OWNERSHIP_SOURCE = "GetUserCharacters";

export function isVerifiedCalculatorSnapshot(snapshot) {
  return Number(snapshot?.version) >= CALCULATOR_SNAPSHOT_VERSION
    && snapshot?.ownershipSource === CALCULATOR_OWNERSHIP_SOURCE;
}

const normalizeEquipmentLine = (line) => ({
  functionType: String(line?.function_type || ""),
  value: Number(line?.function_value || 0),
  level: Number(line?.level || 0),
});

const normalizeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeLimitBreak = (value) => ({
  grade: Math.max(0, normalizeNumber(value?.grade) || 0),
  core: Math.max(0, normalizeNumber(value?.core) || 0),
});

const normalizeCharacter = (character) => ({
  id: String(character?.id ?? character?.name_code ?? ""),
  nameCode: String(character?.name_code ?? ""),
  nameCn: resolveSimplifiedChineseCharacterName(character) || "未知妮姬",
  nameEn: String(character?.name_en || character?.name_cn || character?.name_code || "Unknown Nikke"),
  level: normalizeNumber(character?.level ?? character?.lv),
  combat: normalizeNumber(character?.combat),
  affectionLevel: normalizeNumber(character?.affection_level ?? character?.attractive_lv),
  limitBreak: normalizeLimitBreak(character?.limit_break ?? character?.limitBreak),
  equipments: Array.from({ length: 4 }, (_, slot) => {
    const lines = character?.equipments?.[slot];
    return Array.isArray(lines) ? lines.map(normalizeEquipmentLine) : [];
  }),
});

export function buildCalculatorAccountSnapshot(dict) {
  const characters = ELEMENT_ORDER.flatMap((element) => {
    const list = dict?.elements?.[element];
    return Array.isArray(list) ? list : [];
  })
    .filter((character) => !isUnowned(character))
    .map(normalizeCharacter);

  return {
    accountName: String(dict?.name || "未命名账号"),
    characters,
  };
}

export function buildCalculatorSnapshot(accountDicts) {
  const accounts = (accountDicts || [])
    .map(buildCalculatorAccountSnapshot)
    .filter((account) => account.characters.length > 0);

  return {
    version: CALCULATOR_SNAPSHOT_VERSION,
    ownershipSource: CALCULATOR_OWNERSHIP_SOURCE,
    updatedAt: Date.now(),
    accounts,
  };
}
