// SPDX-License-Identifier: GPL-3.0-or-later
// 为洗词条计算器生成不含账号凭据的最小角色装备快照。

import { isUnowned } from "./ael.js";
import { resolveSimplifiedChineseCharacterName } from "../data/characterNameOverrides.js";
import { getRecordedLocalCharacters, localRecordToCalculatorCharacter } from "../domain/localCharacterRoster.js";

const ELEMENT_ORDER = ["Electronic", "Fire", "Wind", "Water", "Iron", "Utility"];

export const CALCULATOR_SNAPSHOT_VERSION = 4;
export const CALCULATOR_OWNERSHIP_SOURCE = "GetUserCharacters";
export const CALCULATOR_UNIFIED_SOURCE = "NIKKEWorkshopCharacterData";
const MIN_SUPPORTED_CALCULATOR_SNAPSHOT_VERSION = 2;

export function isVerifiedCalculatorSnapshot(snapshot) {
  return Number(snapshot?.version) >= MIN_SUPPORTED_CALCULATOR_SNAPSHOT_VERSION
    && [CALCULATOR_OWNERSHIP_SOURCE, CALCULATOR_UNIFIED_SOURCE].includes(snapshot?.ownershipSource);
}

const normalizeEquipmentLine = (line, fallbackPosition) => ({
  position: Math.max(1, Math.min(3, Number(line?.position || fallbackPosition))),
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
    return Array.isArray(lines)
      ? lines.map((line, index) => normalizeEquipmentLine(line, index + 1))
      : [];
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
    source: "sync",
    characters,
  };
}

export function extractSyncedCalculatorSnapshot(snapshot) {
  return {
    version: CALCULATOR_SNAPSHOT_VERSION,
    ownershipSource: CALCULATOR_OWNERSHIP_SOURCE,
    updatedAt: snapshot?.updatedAt || Date.now(),
    accounts: (Array.isArray(snapshot?.accounts) ? snapshot.accounts : [])
      .filter((account) => account?.source !== "local"),
  };
}

export function buildUnifiedCalculatorSnapshot(syncSnapshot, localRecords) {
  const synced = extractSyncedCalculatorSnapshot(syncSnapshot || {});
  const syncedCodes = new Set(synced.accounts.flatMap((account) => account.characters || []).map((character) => character.nameCode));
  const localCharacters = getRecordedLocalCharacters(localRecords)
    .map(localRecordToCalculatorCharacter)
    .filter((character) => !syncedCodes.has(character.nameCode));
  return {
    version: CALCULATOR_SNAPSHOT_VERSION,
    ownershipSource: CALCULATOR_UNIFIED_SOURCE,
    updatedAt: Date.now(),
    accounts: [
      ...synced.accounts,
      ...(localCharacters.length ? [{ accountName: "已录入", source: "local", characters: localCharacters }] : []),
    ],
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
