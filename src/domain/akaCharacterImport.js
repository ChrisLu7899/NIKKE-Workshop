// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createEmptyEquipments,
  findCatalogCharacterByName,
  normalizeCharacterName,
  normalizeEquipments,
  normalizeLocalCharacterRecord,
} from "./localCharacterRoster.js";

export const AKA_EQUIPMENT_FUNCTION_BY_STAT_NO = Object.freeze({
  0: "IncElementDmg",
  1: "StatAccuracyCircle",
  2: "StatAmmoLoad",
  3: "StatAtk",
  4: "StatChargeDamage",
  5: "StatChargeTime",
  6: "StatCritical",
  7: "StatCriticalDamage",
  8: "StatDef",
});

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const validTier = (value) => {
  const number = finiteNumber(value);
  if (number === null) return null;
  const tier = Math.trunc(number);
  return tier >= 1 && tier <= 15 ? tier : null;
};

export function akaStatValueToPercent(value) {
  const number = finiteNumber(value);
  return number === null ? null : number / 100;
}

function resolveLinePosition(statInfo, sourceIndex, zeroBased) {
  const index = finiteNumber(statInfo?.index);
  const position = index === null
    ? sourceIndex + 1
    : Math.trunc(index) + (zeroBased ? 1 : 0);
  return position >= 1 && position <= 3 ? position : null;
}

export function akaEquipmentInfosToEquipments(equipmentInfos, existingEquipments = null) {
  const equipments = existingEquipments
    ? normalizeEquipments(existingEquipments)
    : createEmptyEquipments();

  (Array.isArray(equipmentInfos) ? equipmentInfos : []).forEach((equipment) => {
    const slotNo = Math.trunc(Number(equipment?.slotNo));
    if (!Number.isInteger(slotNo) || slotNo < 0 || slotNo > 3) return;

    const statInfos = Array.isArray(equipment?.statInfos) ? equipment.statInfos : [];
    const zeroBased = statInfos.some((statInfo) => Number(statInfo?.index) === 0);
    const nextSlot = createEmptyEquipments()[slotNo];
    const occupied = new Set();

    statInfos.forEach((statInfo, sourceIndex) => {
      const position = resolveLinePosition(statInfo, sourceIndex, zeroBased);
      const functionType = AKA_EQUIPMENT_FUNCTION_BY_STAT_NO[Math.trunc(Number(statInfo?.statNo))];
      if (!position || !functionType || occupied.has(position)) return;
      occupied.add(position);
      nextSlot[position - 1] = {
        position,
        functionType,
        value: akaStatValueToPercent(statInfo?.statValue),
        level: validTier(statInfo?.statValueLevel),
        locked: null,
      };
    });
    equipments[slotNo] = nextSlot;
  });

  return equipments;
}

export function akaBreakthroughToLimitBreak(value, fallback = { grade: null, core: null }) {
  const number = finiteNumber(value);
  if (number === null || number < 0) return { ...fallback };
  const breakthrough = Math.trunc(number);
  return {
    grade: Math.min(3, breakthrough),
    core: Math.max(0, breakthrough - 3),
  };
}

function findExistingStandardRecord(localRecords, catalogCharacter, characterName) {
  const nameCode = String(catalogCharacter?.name_code || "").trim();
  const normalizedName = normalizeCharacterName(characterName);
  return (Array.isArray(localRecords) ? localRecords : []).find((record) => (
    !record?.custom
    && (
      (nameCode && String(record?.nameCode || "").trim() === nameCode)
      || normalizeCharacterName(record?.base?.name) === normalizedName
      || normalizeCharacterName(record?.base?.nameCn) === normalizedName
    )
  )) || null;
}

export function buildAkaCharacterImportPreview({
  userInfo,
  catalog,
  localRecords,
} = {}) {
  const characters = Array.isArray(userInfo?.characterList) ? userInfo.characterList : [];
  const items = [];
  const unmatched = [];
  const seenCodes = new Set();

  characters.forEach((character) => {
    const characterName = String(character?.characterName || "").trim();
    const catalogCharacter = findCatalogCharacterByName(catalog, characterName);
    if (!characterName || !catalogCharacter) {
      if (characterName) unmatched.push(characterName);
      return;
    }

    const nameCode = String(catalogCharacter?.name_code || "").trim();
    if (!nameCode || seenCodes.has(nameCode)) return;
    seenCodes.add(nameCode);

    const existing = findExistingStandardRecord(localRecords, catalogCharacter, characterName);
    const normalized = existing ? normalizeLocalCharacterRecord(existing) : null;
    const draft = {
      ...(normalized || {}),
      level: normalized?.level ?? "",
      limitBreak: akaBreakthroughToLimitBreak(
        character?.breakthroughLevel,
        normalized?.limitBreak || { grade: null, core: null },
      ),
      combat: normalized?.combat ?? "",
      affectionLevel: normalized?.affectionLevel ?? "",
      equipments: akaEquipmentInfosToEquipments(
        character?.equipmentInfos,
        normalized?.equipments,
      ),
    };

    items.push({
      characterName,
      catalogCharacter,
      draft,
      custom: false,
      existingLocalId: existing?.localId || "",
      source: "aka",
    });
  });

  return {
    total: characters.length,
    items,
    unmatched: [...new Set(unmatched)],
  };
}
