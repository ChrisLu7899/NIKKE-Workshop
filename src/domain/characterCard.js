// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EQUIPMENT_FUNCTION_LABELS,
  EQUIPMENT_LINE_COUNT,
  EQUIPMENT_SLOT_COUNT,
} from "./localCharacterRoster.js";
import {
  FAVORITE_ITEM_STAR_LEVELS,
  favoriteItemStarCount,
  favoriteItemStarsToLevel,
  normalizeFavoriteItemLevel,
} from "./favoriteItem.js";
import { normalizeEquipmentMetadata } from './equipmentMetadata.js';
import { resolveEquipmentDisplay, isNonOverloadEquipment } from './equipmentCatalog.js';

export const CHARACTER_CARD_SLOT_KEYS = Object.freeze(["head", "body", "arms", "legs"]);
export const CHARACTER_CARD_SLOT_LABELS = Object.freeze(["头部", "身躯", "臂部", "腿部"]);
export function normalizeCharacterCardRarity(value) {
  const rarity = typeof value === "string" ? value.trim().toUpperCase() : "";
  return ["R", "SR", "SSR"].includes(rarity) ? rarity : "";
}

export function characterCardRarityAsset(value) {
  const rarity = normalizeCharacterCardRarity(value);
  return rarity ? `/ui-assets/nikke/metadata/rarity/${rarity.toLowerCase()}.png` : "";
}
export { FAVORITE_ITEM_STAR_LEVELS, favoriteItemStarCount, favoriteItemStarsToLevel };

const CLASS_EQUIPMENT_FAMILY = Object.freeze({
  attacker: "vmetal",
  defender: "99",
  supporter: "code",
});

export const COLLECTIBLE_DOLL_BY_WEAPON = Object.freeze({
  AR: "collectible-ar-cooking.png",
  SMG: "collectible-smg-coffee.png",
  MG: "collectible-mg-shopping.png",
  SG: "collectible-sg-battling.png",
  SR: "collectible-sr-napping.png",
  RL: "collectible-rl-exercising.png",
});

const COLLECTIBLE_WEAPON_ALIASES = Object.freeze({
  AR: "AR",
  ASSAULTRIFLE: "AR",
  ASSAULT: "AR",
  SMG: "SMG",
  SUBMACHINEGUN: "SMG",
  MG: "MG",
  MACHINEGUN: "MG",
  SG: "SG",
  SHOTGUN: "SG",
  SR: "SR",
  SNIPERRIFLE: "SR",
  RL: "RL",
  ROCKETLAUNCHER: "RL",
});

const firstPresent = (...values) => values.find((value) => (
  value !== null && value !== undefined && String(value).trim() !== ""
));

const finiteNumber = (value) => {
  if (value === null || value === undefined || typeof value === "boolean" || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const characterCardNumber = finiteNumber;
export const formatCharacterCardPercent = (value) => {
  const number = finiteNumber(value);
  return number === null ? "—" : `${number.toFixed(2)}%`;
};

const normalizeLine = (line, position) => {
  if (!line?.functionType) return null;
  return {
    position,
    functionType: String(line.functionType),
    label: EQUIPMENT_FUNCTION_LABELS[line.functionType] || String(line.functionType),
    value: finiteNumber(line.value),
    level: finiteNumber(line.level),
    locked: typeof line.locked === "boolean" ? line.locked : null,
  };
};

export function equipmentFamilyForClass(className) {
  return CLASS_EQUIPMENT_FAMILY[String(className || "").trim().toLocaleLowerCase()] || "vmetal";
}

export function formatCoreBreakthroughBadge(core) {
  const normalized = Math.max(0, Math.trunc(finiteNumber(core) || 0));
  if (normalized >= 7) return "MAX";
  return normalized > 0 ? String(normalized).padStart(2, "0") : "";
}

export function normalizeCollectibleWeaponType(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
  return COLLECTIBLE_WEAPON_ALIASES[normalized] || "";
}

export function collectibleDollAssetForWeapon(value) {
  return COLLECTIBLE_DOLL_BY_WEAPON[normalizeCollectibleWeaponType(value)] || "";
}

export function normalizeCharacterCardEquipments(equipments) {
  return Array.from({ length: EQUIPMENT_SLOT_COUNT }, (_, slotIndex) => {
    const source = Array.isArray(equipments?.[slotIndex]) ? equipments[slotIndex] : [];
    const byPosition = new Map();
    source.forEach((line, sourceIndex) => {
      const rawPosition = Number(line?.position || sourceIndex + 1);
      const position = Number.isInteger(rawPosition) && rawPosition >= 1 && rawPosition <= EQUIPMENT_LINE_COUNT
        ? rawPosition
        : sourceIndex + 1;
      const normalized = normalizeLine(line, position);
      if (normalized && !byPosition.has(position)) byPosition.set(position, normalized);
    });
    return Array.from({ length: EQUIPMENT_LINE_COUNT }, (_, lineIndex) => byPosition.get(lineIndex + 1) || null);
  });
}

export function summarizeCharacterCardAffixes(equipments, limit = 3) {
  const totals = new Map();
  let order = 0;
  normalizeCharacterCardEquipments(equipments).forEach((slot) => {
    slot.forEach((line) => {
      if (!line?.functionType || !Number.isFinite(line.level) || line.level <= 0) return;
      const current = totals.get(line.functionType);
      if (current) {
        current.totalLevel += line.level;
        if (Number.isFinite(line.value)) current.valueHundredths += Math.round(line.value * 100);
        else current.completeValue = false;
        return;
      }
      totals.set(line.functionType, {
        functionType: line.functionType,
        label: line.label,
        totalLevel: line.level,
        valueHundredths: Number.isFinite(line.value) ? Math.round(line.value * 100) : 0,
        completeValue: Number.isFinite(line.value),
        order: order++,
      });
    });
  });
  return [...totals.values()]
    .sort((left, right) => right.totalLevel - left.totalLevel || left.order - right.order)
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((item) => ({
      ...item,
      totalValue: item.completeValue ? item.valueHundredths / 100 : null,
    }));
}

export function buildCharacterCardData(catalogCharacter, characterData) {
  const base = characterData?.base || {};
  const className = firstPresent(base.class, catalogCharacter?.class, "");
  const equipmentMetadata = normalizeEquipmentMetadata(characterData?.equipmentMetadata ?? characterData?.raw_equipments);
  const equipments = normalizeCharacterCardEquipments(characterData?.equipments)
    .map((lines, slot) => isNonOverloadEquipment(equipmentMetadata[slot]) ? lines.map(() => null) : lines);
  const equipmentDisplays = equipments.map((lines, slot) => resolveEquipmentDisplay(equipmentMetadata, slot, lines, className));
  const grade = Math.max(0, finiteNumber(characterData?.limitBreak?.grade) || 0);
  const core = Math.max(0, finiteNumber(characterData?.limitBreak?.core) || 0);
  const favoriteItemRarity = String(firstPresent(
    characterData?.favoriteItemRarity,
    characterData?.itemRarity,
    characterData?.item_rare,
    "",
  ) || "").trim().toUpperCase();
  const rawFavoriteItemLevel = finiteNumber(firstPresent(
    characterData?.favoriteItemLevel,
    characterData?.itemLevel,
    characterData?.item_level,
  ));
  return {
    name: String(firstPresent(
      base.nameCn,
      base.name,
      characterData?.nameCn,
      catalogCharacter?.name_cn,
      catalogCharacter?.name_en,
      "未知妮姬",
    )),
    rarity: normalizeCharacterCardRarity(base.rarity)
      || normalizeCharacterCardRarity(catalogCharacter?.original_rare),
    level: finiteNumber(characterData?.level),
    levelCap: Math.max(1, finiteNumber(characterData?.levelCap) || 200),
    limitBreak: { grade: Math.min(3, grade), core },
    affection: finiteNumber(characterData?.affectionLevel),
    combat: finiteNumber(characterData?.combat),
    favoriteItemRarity,
    favoriteItemObservation: characterData?.favoriteItemObservation || null,
    favoriteItemLevel: rawFavoriteItemLevel === null
      ? null
      : normalizeFavoriteItemLevel(favoriteItemRarity, rawFavoriteItemLevel),
    classLevel: finiteNumber(characterData?.classLevel),
    corporationLevel: finiteNumber(characterData?.corporationLevel),
    skill1Level: finiteNumber(firstPresent(characterData?.skill1Level, characterData?.skill1_level, characterData?.skill1_lv)),
    skill2Level: finiteNumber(firstPresent(characterData?.skill2Level, characterData?.skill2_level, characterData?.skill2_lv)),
    burstSkillLevel: finiteNumber(firstPresent(characterData?.burstSkillLevel, characterData?.skill_burst_level, characterData?.ulti_skill_lv)),
    cubeId: finiteNumber(firstPresent(characterData?.cubeId, characterData?.cube_id)),
    cubeResourceId: finiteNumber(firstPresent(characterData?.cubeResourceId, characterData?.cube_resource_id)),
    cubeNameCn: String(firstPresent(characterData?.cubeNameCn, characterData?.cube_name_cn) ?? ""),
    cubeNameEn: String(firstPresent(characterData?.cubeNameEn, characterData?.cube_name_en) ?? ""),
    cubeLevel: finiteNumber(firstPresent(characterData?.cubeLevel, characterData?.cube_level)),
    element: String(firstPresent(base.element, catalogCharacter?.element) ?? ""),
    className: String(className ?? ""),
    burstStage: String(firstPresent(base.burstStage, catalogCharacter?.use_burst_skill) ?? ""),
    corporation: String(firstPresent(base.corporation, catalogCharacter?.corporation) ?? ""),
    weaponType: String(firstPresent(base.weaponType, catalogCharacter?.weapon_type) ?? ""),
    equipmentFamily: equipmentFamilyForClass(className),
    equipmentMetadata,
    equipmentDisplays,
    equipments,
    topAffixes: summarizeCharacterCardAffixes(equipments, 3),
  };
}
