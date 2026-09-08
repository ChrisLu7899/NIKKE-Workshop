// SPDX-License-Identifier: GPL-3.0-or-later

import { favoriteItemStarCount, favoriteItemStarsToLevel } from "./favoriteItem.js";
import { TRAINING_FIELD_STATUS, trainingFieldResult } from "./trainingOcrFieldContract.js";

const SKILL_LEVEL_FIELDS = ["skill1Level", "skill2Level", "burstSkillLevel"];
const CUBE_FIELDS = ["cubeType", "cubeLevel"];

function suppressedField(field, current, warning) {
  return trainingFieldResult(field, {
    status: TRAINING_FIELD_STATUS.NOT_VISIBLE,
    region: current?.evidence?.region || null,
    method: "training-page-mutual-exclusion",
    warnings: [warning],
  });
}

export function enforceTrainingPageFieldExclusivity(fields = {}) {
  const next = { ...fields };
  const recognized = (field) => next[field]?.status === TRAINING_FIELD_STATUS.RECOGNIZED && !next[field]?.excluded;
  // 三个技能共享同一套完整布局定位；其中任意一个被可靠识别，就能确认这是技能页。
  // 若极端情况下技能与魔方同时误命中，技能页结构优先，防止黄色 SSR 色块伪装成魔方卡。
  const skillPageDetected = SKILL_LEVEL_FIELDS.some(recognized);
  const cubePageDetected = CUBE_FIELDS.some(recognized);
  if (skillPageDetected) {
    for (const field of CUBE_FIELDS) {
      next[field] = suppressedField(field, next[field], "已识别到技能页；同一截图不会同时包含魔方信息。");
    }
  } else if (cubePageDetected) {
    for (const field of SKILL_LEVEL_FIELDS) {
      next[field] = suppressedField(field, next[field], "已识别到魔方卡；同一截图不会同时包含技能等级。");
    }
  }
  return next;
}

export const TRAINING_FIELD_LABELS = Object.freeze({
  collectible: "珍藏品",
  limitBreak: "突破",
  characterLevel: "角色等级",
  affection: "好感度",
  combatPower: "战斗力",
  classLevel: "职业等级",
  enterpriseLevel: "企业等级",
  skill1Level: "技能 1",
  skill2Level: "技能 2",
  burstSkillLevel: "爆裂技能",
  cubeType: "魔方",
  cubeLevel: "魔方等级",
});

export function formatTrainingFieldValue(field, value) {
  if (value === null || value === undefined) return "—";
  if (field === "collectible") return `${value.rarity} · ${value.stars} 星`;
  if (field === "limitBreak") return `${value.stars} 星 · 核心 ${String(value.core).padStart(2, "0")}`;
  if (field === "cubeType") return value.nameCn || value.nameEn || String(value.cubeId);
  return String(value);
}

export function mergeTrainingOcrEntriesIntoDraft(draft, entries) {
  const next = {
    ...draft,
    limitBreak: { ...(draft?.limitBreak || { grade: null, core: null }) },
  };
  const normalizedEntries = (entries || []).filter((entry) => !entry.excluded).map((entry) => ({
    ...entry,
    fields: enforceTrainingPageFieldExclusivity(entry?.fields || {}),
  }));
  const recognizedByField = new Map();
  const methodPriority = (result) => {
    const method = String(result?.evidence?.method || "");
    if (/template-match|glyphs|structure|star-color|skill-level-badge/.test(method)) return 2;
    if (/constrained.*ocr/.test(method)) return 1;
    return 0;
  };
  const isBetter = (candidate, current) => {
    if (!current) return true;
    const confidenceDelta = Number(candidate?.confidence || 0) - Number(current?.confidence || 0);
    if (Math.abs(confidenceDelta) > 0.0001) return confidenceDelta > 0;
    return methodPriority(candidate) > methodPriority(current);
  };
  for (const entry of normalizedEntries) {
    for (const result of Object.values(entry?.fields || {})) {
      if (result?.status !== TRAINING_FIELD_STATUS.RECOGNIZED || result.excluded) continue;
      const current = recognizedByField.get(result.field);
      if (isBetter(result, current)) recognizedByField.set(result.field, result);
    }
  }
  // 魔方种类与等级必须优先取自同一张截图，避免模板种类来自真魔方页、
  // 等级却被另一张图片的低置信 OCR 覆盖。
  let bestCubePair = null;
  for (const entry of normalizedEntries) {
    const type = entry?.fields?.cubeType;
    const level = entry?.fields?.cubeLevel;
    if (type?.status !== TRAINING_FIELD_STATUS.RECOGNIZED || level?.status !== TRAINING_FIELD_STATUS.RECOGNIZED || type.excluded || level.excluded) continue;
    const score = Math.min(Number(type.confidence || 0), Number(level.confidence || 0));
    const priority = methodPriority(type) + methodPriority(level);
    if (!bestCubePair || priority > bestCubePair.priority || (priority === bestCubePair.priority && score > bestCubePair.score)) {
      bestCubePair = { type, level, score, priority };
    }
  }
  if (bestCubePair) {
    recognizedByField.set("cubeType", bestCubePair.type);
    recognizedByField.set("cubeLevel", bestCubePair.level);
  }
  for (const result of recognizedByField.values()) {
    const value = result.value;
    if (result.field === "characterLevel") next.level = value;
    else if (result.field === "limitBreak") next.limitBreak = { grade: value.stars, core: value.core };
    else if (result.field === "affection") next.affectionLevel = value;
    else if (result.field === "combatPower") next.combat = value;
    else if (result.field === "classLevel") next.classLevel = value;
    else if (result.field === "enterpriseLevel") next.corporationLevel = value;
    else if (result.field === "skill1Level") next.skill1Level = value;
    else if (result.field === "skill2Level") next.skill2Level = value;
    else if (result.field === "burstSkillLevel") next.burstSkillLevel = value;
    else if (result.field === "collectible") {
      const previousLevel = next.favoriteItemLevel;
      const compatible = previousLevel !== null && previousLevel !== undefined && previousLevel !== ""
        && next.favoriteItemRarity === value.rarity && favoriteItemStarCount(value.rarity, previousLevel) === value.stars;
      next.favoriteItemRarity = value.rarity;
      next.favoriteItemObservation = { rarity: value.rarity, stars: value.stars, source: "screenshot" };
      next.favoriteItemLevel = compatible ? previousLevel
        : value.rarity === "SSR" || value.stars === 0 ? favoriteItemStarsToLevel(value.rarity, value.stars) : null;
    } else if (result.field === "cubeType") {
      next.cubeId = value.cubeId;
      next.cubeResourceId = value.resourceId;
      next.cubeNameCn = value.nameCn;
      next.cubeNameEn = value.nameEn;
    } else if (result.field === "cubeLevel") next.cubeLevel = value;
  }
  return next;
}

export function validateTrainingOcrPreview(entries) {
  return (entries || []).flatMap((entry) => {
    const recognized = Object.values(entry?.fields || {}).filter(({ status, excluded }) => status === TRAINING_FIELD_STATUS.RECOGNIZED && !excluded);
    return recognized.length ? [] : [`${entry.characterName}/${entry.fileName} 没有识别到可保存的练度字段`];
  });
}

export function isTrainingScreenshotResult(result) {
  const fields = result?.fields || {};
  const recognized = (field) => fields[field]?.status === TRAINING_FIELD_STATUS.RECOGNIZED;
  return Object.keys(TRAINING_FIELD_LABELS).some(recognized);
}
