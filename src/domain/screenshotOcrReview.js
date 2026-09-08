// SPDX-License-Identifier: GPL-3.0-or-later
import { CUBE_ICON_CATALOG } from "./cubeIconCatalog.js";
import { normalizeCharacterName } from "./localCharacterRoster.js";
import { validateOcrPreview } from "./equipmentScreenshotOcr.js";
import { TRAINING_FIELD_LABELS, validateTrainingOcrPreview } from "./trainingScreenshotOcr.js";

export const TRAINING_NUMERIC_RANGES = Object.freeze({
  characterLevel: [1, 9999], affection: [0, 100], combatPower: [1, 99999999],
  classLevel: [1, 500], enterpriseLevel: [1, 500],
  skill1Level: [1, 10], skill2Level: [1, 10], burstSkillLevel: [1, 10], cubeLevel: [1, 15],
});
const integerIn = (value, min, max) => value !== "" && value !== null && value !== undefined
  && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;

export function isValidTrainingValue(field, value) {
  if (TRAINING_NUMERIC_RANGES[field]) return integerIn(value, ...TRAINING_NUMERIC_RANGES[field]);
  if (field === "cubeType") return CUBE_ICON_CATALOG.some((cube) => cube.cubeId === Number(value?.cubeId));
  if (field === "limitBreak") return integerIn(value?.stars, 0, 3) && integerIn(value?.core, 0, 7)
    && (Number(value.core) === 0 || Number(value.stars) === 3);
  if (field === "collectible") return ["R", "SR", "SSR"].includes(value?.rarity)
    && integerIn(value?.stars, value?.rarity === "SSR" ? 1 : 0, 3);
  return false;
}

export function editTrainingField(result, value) {
  const field = result.field;
  const valid = isValidTrainingValue(field, value);
  const normalized = !valid ? value : TRAINING_NUMERIC_RANGES[field] ? Number(value)
    : field === "cubeType" ? { ...CUBE_ICON_CATALOG.find((cube) => cube.cubeId === Number(value.cubeId)) }
    : field === "limitBreak" ? { stars: Number(value.stars), core: Number(value.core) }
    : { rarity: value.rarity, stars: Number(value.stars), color: { R: "blue", SR: "purple", SSR: "orange" }[value.rarity] };
  return { ...result, value: normalized, status: valid ? "recognized" : "uncertain", manual: true,
    excluded: !valid, confidence: 1, original: result.original || result,
    warnings: valid ? [] : ["请输入有效值；核心突破大于 0 时星级须为 3。"],
    evidence: { ...result.evidence, method: "manual-confirmation" } };
}

export function selectedOcrEntries(entries) {
  return (entries || []).filter((entry) => !entry.excluded && ["training", "equipment"].includes(entry.type));
}

export function trainingOcrConflicts(entries) {
  const seen = new Map(), conflicts = [];
  for (const entry of entries || []) {
    if (entry.excluded) continue;
    for (const [field, result] of Object.entries(entry.fields || {})) {
      if (result.excluded || result.status !== "recognized") continue;
      const value = field === "cubeType" ? result.value?.cubeId
        : field === "collectible" ? [result.value?.rarity, result.value?.stars]
        : field === "limitBreak" ? [result.value?.stars, result.value?.core] : result.value;
      const key = `${normalizeCharacterName(entry.characterName)}:${field}`;
      const previous = seen.get(key);
      if (previous && JSON.stringify(previous.value) !== JSON.stringify(value)) conflicts.push({
        field, characterName: entry.characterName, files: [previous.fileName, entry.fileName],
        message: `${entry.characterName}的${TRAINING_FIELD_LABELS[field]}存在冲突（${previous.fileName} / ${entry.fileName}），请只勾选要保留的结果。`,
      });
      else seen.set(key, { value, fileName: entry.fileName });
    }
  }
  return conflicts;
}

export function validateMixedOcrPreview(entries) {
  const selected = selectedOcrEntries(entries);
  const training = selected.filter((entry) => entry.type === "training");
  return [...validateOcrPreview(selected.filter((entry) => entry.type === "equipment")),
    ...validateTrainingOcrPreview(training), ...trainingOcrConflicts(training).map((item) => item.message),
    ...training.flatMap((entry) => Object.entries(entry.fields || {}).filter(([field, result]) => (
      !result.excluded && result.status === "recognized" && !isValidTrainingValue(field, result.value)
    )).map(([field]) => `${entry.characterName}的${TRAINING_FIELD_LABELS[field]}数值无效`)),
  ];
}

export function existingTrainingValue(record, field) {
  if (!record) return null;
  if (field === "limitBreak") return { stars: record.limitBreak?.grade ?? "?", core: record.limitBreak?.core ?? "?" };
  if (field === "collectible") return record.favoriteItemRarity
    ? `${record.favoriteItemRarity} · 等级 ${record.favoriteItemLevel ?? "未知"}` : null;
  if (field === "cubeType") return { nameCn: record.cubeNameCn || String(record.cubeId || "—") };
  return record[({ characterLevel: "level", affection: "affectionLevel", combatPower: "combat", enterpriseLevel: "corporationLevel" })[field] || field] ?? null;
}
