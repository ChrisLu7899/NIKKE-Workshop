// SPDX-License-Identifier: GPL-3.0-or-later

import {
  EQUIPMENT_FUNCTION_LABELS,
  EQUIPMENT_LINE_COUNT,
  EQUIPMENT_SLOT_COUNT,
} from "./localCharacterRoster.js";

export const CHARACTER_CARD_SLOT_KEYS = Object.freeze(["head", "body", "arms", "legs"]);
export const CHARACTER_CARD_SLOT_LABELS = Object.freeze(["头部", "身躯", "臂部", "腿部"]);

const CLASS_EQUIPMENT_FAMILY = Object.freeze({
  attacker: "vmetal",
  defender: "99",
  supporter: "code",
});

const firstPresent = (...values) => values.find((value) => (
  value !== null && value !== undefined && String(value).trim() !== ""
));

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
        return;
      }
      totals.set(line.functionType, {
        functionType: line.functionType,
        label: line.label,
        totalLevel: line.level,
        valueHundredths: Number.isFinite(line.value) ? Math.round(line.value * 100) : 0,
        order: order++,
      });
    });
  });
  return [...totals.values()]
    .sort((left, right) => right.totalLevel - left.totalLevel || left.order - right.order)
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((item) => ({
      ...item,
      totalValue: item.valueHundredths / 100,
    }));
}

export function buildCharacterCardData(catalogCharacter, characterData) {
  const base = characterData?.base || {};
  const className = firstPresent(base.class, catalogCharacter?.class, "");
  const equipments = normalizeCharacterCardEquipments(characterData?.equipments);
  const grade = Math.max(0, finiteNumber(characterData?.limitBreak?.grade) || 0);
  const core = Math.max(0, finiteNumber(characterData?.limitBreak?.core) || 0);
  return {
    name: String(firstPresent(
      base.nameCn,
      base.name,
      characterData?.nameCn,
      catalogCharacter?.name_cn,
      catalogCharacter?.name_en,
      "未知妮姬",
    )),
    rarity: String(firstPresent(base.rarity, catalogCharacter?.original_rare, "SSR")).toUpperCase(),
    level: finiteNumber(characterData?.level),
    levelCap: Math.max(1, finiteNumber(characterData?.levelCap) || 200),
    limitBreak: { grade: Math.min(3, grade), core },
    affection: finiteNumber(characterData?.affectionLevel),
    combat: finiteNumber(characterData?.combat),
    element: String(firstPresent(base.element, catalogCharacter?.element, "")),
    className: String(className),
    burstStage: String(firstPresent(base.burstStage, catalogCharacter?.use_burst_skill, "")),
    corporation: String(firstPresent(base.corporation, catalogCharacter?.corporation, "")),
    weaponType: String(firstPresent(base.weaponType, catalogCharacter?.weapon_type, "")),
    equipmentFamily: equipmentFamilyForClass(className),
    equipments,
    topAffixes: summarizeCharacterCardAffixes(equipments, 3),
  };
}
