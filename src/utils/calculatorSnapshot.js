// SPDX-License-Identifier: GPL-3.0-or-later
// 为洗词条计算器生成不含账号凭据的最小角色装备快照。

import { isUnowned } from "./ael.js";
import { resolveSimplifiedChineseCharacterName } from "../data/characterNameOverrides.js";
import { getRecordedLocalCharacters, localRecordToCalculatorCharacter } from "../domain/localCharacterRoster.js";
import { normalizeEquipmentMetadata, mergeEquipmentMetadata } from "../domain/equipmentMetadata.js";
import {
  normalizeResearchLevels,
  resolveCharacterResearchLevels,
} from "./researchLevels.js";

const ELEMENT_ORDER = ["Electronic", "Fire", "Wind", "Water", "Iron", "Utility"];

export const CALCULATOR_SNAPSHOT_VERSION = 7;
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
  ...(typeof line?.locked === "boolean" ? { locked: line.locked } : {}),
});

const normalizeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeLimitBreak = (value) => ({
  grade: Math.max(0, normalizeNumber(value?.grade) || 0),
  core: Math.max(0, normalizeNumber(value?.core) || 0),
});

const normalizeCharacter = (character, researchLevels) => {
  const resolvedResearch = resolveCharacterResearchLevels(
    researchLevels,
    character?.class,
    character?.corporation,
  );
  return {
    id: String(character?.id ?? character?.name_code ?? ""),
    nameCode: String(character?.name_code ?? ""),
    nameCn: resolveSimplifiedChineseCharacterName(character) || "未知妮姬",
    nameEn: String(character?.name_en || character?.name_cn || character?.name_code || "Unknown Nikke"),
    level: normalizeNumber(character?.level ?? character?.lv),
    combat: normalizeNumber(character?.combat),
    affectionLevel: normalizeNumber(character?.affection_level ?? character?.attractive_lv),
    favoriteItemRarity: String(character?.item_rare ?? character?.favoriteItemRarity ?? "").trim().toUpperCase(),
    favoriteItemLevel: normalizeNumber(character?.item_level ?? character?.favoriteItemLevel),
    classLevel: resolvedResearch.classLevel,
    corporationLevel: resolvedResearch.corporationLevel,
    skill1Level: normalizeNumber(character?.skill1_level ?? character?.skill1_lv ?? character?.skill1Level),
    skill2Level: normalizeNumber(character?.skill2_level ?? character?.skill2_lv ?? character?.skill2Level),
    burstSkillLevel: normalizeNumber(character?.skill_burst_level ?? character?.ulti_skill_lv ?? character?.burstSkillLevel),
    cubeId: normalizeNumber(character?.cube_id ?? character?.cubeId),
    cubeLevel: normalizeNumber(character?.cube_level ?? character?.cubeLevel),
    limitBreak: normalizeLimitBreak(character?.limit_break ?? character?.limitBreak),
    equipmentMetadata: normalizeEquipmentMetadata(character?.equipmentMetadata ?? character?.raw_equipments),
    equipments: Array.from({ length: 4 }, (_, slot) => {
      const lines = character?.equipments?.[slot];
      return Array.isArray(lines)
        ? lines.map((line, index) => normalizeEquipmentLine(line, index + 1))
        : [];
    }),
  };
};

export function buildCalculatorAccountSnapshot(dict) {
  const researchLevels = normalizeResearchLevels(dict?.researchLevels);
  const characters = ELEMENT_ORDER.flatMap((element) => {
    const list = dict?.elements?.[element];
    return Array.isArray(list) ? list : [];
  })
    .filter((character) => !isUnowned(character))
    .map((character) => normalizeCharacter(character, researchLevels));

  return {
    accountName: String(dict?.name || "未命名账号"),
    source: "sync",
    researchLevels,
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
  const localCharacters = getRecordedLocalCharacters(localRecords)
    .map(localRecordToCalculatorCharacter);
  const localByCode = new Map(localCharacters
    .filter((character) => character.nameCode)
    .map((character) => [character.nameCode, character]));
  const effectiveSyncedAccounts = synced.accounts.map((account) => ({
    ...account,
    characters: (account.characters || []).map((character) => {
      const local = localByCode.get(character.nameCode);
      return local ? {
        ...character,
        ...local,
        favoriteItemRarity: local.favoriteItemRarity || character.favoriteItemRarity,
        favoriteItemLevel: local.favoriteItemLevel ?? character.favoriteItemLevel,
        classLevel: local.classLevel ?? character.classLevel,
        corporationLevel: local.corporationLevel ?? character.corporationLevel,
        skill1Level: local.skill1Level ?? character.skill1Level,
        skill2Level: local.skill2Level ?? character.skill2Level,
        burstSkillLevel: local.burstSkillLevel ?? character.burstSkillLevel,
        cubeId: local.cubeId ?? character.cubeId,
        cubeLevel: local.cubeLevel ?? character.cubeLevel,
        equipmentMetadata: mergeEquipmentMetadata(local.equipmentMetadata, character.equipmentMetadata),
      } : character;
    }),
  }));
  const syncedCodes = new Set(effectiveSyncedAccounts
    .flatMap((account) => account.characters || [])
    .map((character) => character.nameCode));
  const localOnlyCharacters = localCharacters
    .filter((character) => !syncedCodes.has(character.nameCode));
  return {
    version: CALCULATOR_SNAPSHOT_VERSION,
    ownershipSource: CALCULATOR_UNIFIED_SOURCE,
    updatedAt: Date.now(),
    accounts: [
      ...effectiveSyncedAccounts,
      ...(localOnlyCharacters.length ? [{ accountName: "已录入", source: "local", characters: localOnlyCharacters }] : []),
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
