// SPDX-License-Identifier: GPL-3.0-or-later
// 截图 OCR 的纯领域解析：部位、词条、合法档位和预览校验。

import {
  EQUIPMENT_FUNCTION_LABELS,
  EQUIPMENT_FUNCTION_TYPES,
  createEmptyEquipments,
  normalizeCharacterName,
} from "./localCharacterRoster.js";
import { tierValue } from "./equipmentAffixes.js";

export const SCREENSHOT_EQUIPMENT_SLOTS = Object.freeze(["头部", "身躯", "臂部", "腿部"]);

export const OCR_VALUE_STYLES = Object.freeze({
  LIGHT_BLACK: "light-black-text",
  LIGHT_BLUE: "light-blue-text",
  DARK_BLUE: "dark-blue-text",
});

export const OCR_EQUIPMENT_LINE_STATES = Object.freeze({
  UNEARNED: "unearned",
  UNLOCKED: "unlocked",
  LOCKED: "locked",
  NEEDS_CONFIRMATION: "needs-confirmation",
});

const hasFiniteOcrNumber = (value) => (
  value !== null
  && value !== ""
  && Number.isFinite(Number(value))
);

const hasIntegerOcrTier = (value) => (
  value !== null
  && value !== ""
  && Number.isInteger(Number(value))
);

export function resolveOcrEquipmentLineState({
  unearned = false,
  functionType = "",
  value = null,
  level = null,
  locked = null,
} = {}) {
  if (unearned) return OCR_EQUIPMENT_LINE_STATES.UNEARNED;
  if (
    functionType
    && hasFiniteOcrNumber(value)
    && hasIntegerOcrTier(level)
    && typeof locked === "boolean"
  ) {
    return locked
      ? OCR_EQUIPMENT_LINE_STATES.LOCKED
      : OCR_EQUIPMENT_LINE_STATES.UNLOCKED;
  }
  return OCR_EQUIPMENT_LINE_STATES.NEEDS_CONFIRMATION;
}

export function expectedOcrValueStyle(level) {
  const tier = Number(level);
  if (tier >= 1 && tier <= 11) return OCR_VALUE_STYLES.LIGHT_BLACK;
  if (tier >= 12 && tier <= 14) return OCR_VALUE_STYLES.LIGHT_BLUE;
  if (tier === 15) return OCR_VALUE_STYLES.DARK_BLUE;
  return "";
}

export function isOcrValueStyleCompatible(level, valueStyle) {
  return !valueStyle || expectedOcrValueStyle(level) === valueStyle;
}

export function classifyOcrValueStyleFromRgba(pixels, { darkBackground = false } = {}) {
  if (!pixels?.length) return "";
  let opaque = 0;
  let blueText = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 32) continue;
    opaque += 1;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (blue >= 105 && green >= 70 && blue - red >= 38 && green - red >= 18) blueText += 1;
  }
  if (!opaque) return "";
  if (darkBackground) return OCR_VALUE_STYLES.DARK_BLUE;
  return blueText / opaque >= 0.003
    ? OCR_VALUE_STYLES.LIGHT_BLUE
    : OCR_VALUE_STYLES.LIGHT_BLACK;
}

export function classifyOcrLockStateFromRgba(pixels) {
  if (!pixels?.length) return null;
  let opaque = 0;
  let cyan = 0;
  let lockInk = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 32) continue;
    opaque += 1;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    if (blue >= 100 && green >= 75 && blue - red >= 38 && green - red >= 18) cyan += 1;
    if (luminance <= 175 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 32) lockInk += 1;
  }
  if (!opaque) return null;
  if (cyan / opaque >= 0.012) return true;
  if (lockInk / opaque >= 0.02) return false;
  return null;
}

const EQUIPMENT_NAME_SUFFIXES = Object.freeze([
  ["头部", ["金属面罩", "型头盔", "护目镜", "面罩", "头盔"]],
  ["身躯", ["金属背心", "型防护服", "防护服", "夹克", "背心"]],
  ["臂部", ["金属护臂", "型臂铠", "护臂", "臂铠", "手套"]],
  ["腿部", ["金属靴子", "型护腿", "靴子", "护腿", "鞋"]],
]);

const SLOT_ALIASES = Object.freeze([
  ["头部", ["头部", "头盔"]],
  ["身躯", ["身体", "身躯", "躯干"]],
  // “臂部”在当前装备截图的小灰色标签中常被 OCR 成“涌部”。
  ["臂部", ["手部", "臂部", "手臂", "涌部"]],
  ["腿部", ["足部", "腿部", "鞋"]],
]);

const OCR_LABEL_ALIASES = Object.freeze({
  IncElementDmg: ["优越代码伤害增加", "优越代码", "优越代玛伤害增加"],
  StatAtk: ["攻击力增加", "攻击力"],
  StatAmmoLoad: ["最大装弹数增加", "最大装弹", "最大芍弹数增加", "最大装单数增加"],
  StatChargeTime: ["蓄力速度增加", "蓄力速度"],
  StatChargeDamage: ["蓄力伤害增加", "蓄力伤害"],
  StatCritical: ["暴击率增加", "暴击率", "时击率增加"],
  StatCriticalDamage: ["暴击伤害增加", "暴击伤害", "时击伤害增加"],
  StatAccuracyCircle: ["命中率增加", "命中率"],
  StatDef: ["防御力增加", "防御力"],
});

const cleanOcrText = (value) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\s【】[\]（）()：:·,，。.%?？!！|｜]/g, "")
  .replace(/[0-9]/g, "")
  .trim();

const cleanEquipmentNameText = (value) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\s【】[\]（）()：:·,，。.%?？!！|｜]/g, "")
  .toLowerCase()
  .trim();

function levenshtein(left, right) {
  if (!left) return right.length;
  if (!right) return left.length;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[right.length];
}

function fuzzyMatch(rawText, options, maxDistance = 2) {
  const source = cleanOcrText(rawText);
  if (!source) return null;
  const ranked = options.map(({ value, aliases }) => {
    const score = Math.min(...aliases.map((alias) => {
      const target = cleanOcrText(alias);
      if (source.includes(target) || target.includes(source)) return Math.abs(source.length - target.length) * 0.25;
      return levenshtein(source, target);
    }));
    return { value, score };
  }).sort((left, right) => left.score - right.score);
  return ranked[0] && ranked[0].score <= maxDistance ? ranked[0] : null;
}

export function matchEquipmentSlot(rawText) {
  const source = cleanOcrText(rawText);
  if (!source) return "";
  if (/[头盔]/.test(source)) return "头部";
  if (/[身躯]/.test(source)) return "身躯";
  if (/[臂手涌]/.test(source)) return "臂部";
  if (/[足腿鞋]/.test(source)) return "腿部";
  return fuzzyMatch(source, SLOT_ALIASES.map(([value, aliases]) => ({ value, aliases })), 2)?.value || "";
}

export function matchEquipmentSlotFromName(rawText) {
  const source = cleanEquipmentNameText(rawText);
  if (!source) return "";
  for (const [slot, suffixes] of EQUIPMENT_NAME_SUFFIXES) {
    if (suffixes.some((suffix) => source.includes(cleanEquipmentNameText(suffix)))) return slot;
  }
  return "";
}

export function resolveEquipmentSlot({ rawEquipmentName = "", rawSlot = "", equipmentIconMatch = null } = {}) {
  const slotFromIcon = equipmentIconMatch?.confidence !== "low" ? equipmentIconMatch?.slot || "" : "";
  const slotFromName = matchEquipmentSlotFromName(rawEquipmentName);
  const slotFromLabel = matchEquipmentSlot(rawSlot);
  return {
    equipmentSlot: slotFromIcon || slotFromName || slotFromLabel,
    equipmentSlotSource: slotFromIcon ? "equipmentIcon" : slotFromName ? "equipmentName" : slotFromLabel ? "slotLabel" : "",
    ...(slotFromIcon ? { slotFromIcon } : {}),
    slotFromName,
    slotFromLabel,
    conflict: Boolean(
      (slotFromIcon && slotFromName && slotFromIcon !== slotFromName)
      || (slotFromIcon && slotFromLabel && slotFromIcon !== slotFromLabel)
      || (!slotFromIcon && slotFromName && slotFromLabel && slotFromName !== slotFromLabel)
    ),
  };
}

export function matchEquipmentFunctionType(rawText) {
  const source = cleanOcrText(rawText);
  if ((source.match(/[\u4e00-\u9fff]/g) || []).length < 3) return "";
  const options = EQUIPMENT_FUNCTION_TYPES.map((value) => ({
    value,
    aliases: [EQUIPMENT_FUNCTION_LABELS[value], ...(OCR_LABEL_ALIASES[value] || [])],
  }));
  const ranked = options.map(({ value, aliases }) => ({
    value,
    score: Math.min(...aliases.map((alias) => {
      const target = cleanOcrText(alias);
      // Reject truncated generic fragments; exact known aliases remain valid.
      if (source === target) return 0;
      if (source.length < target.length * 0.7) return 1;
      return levenshtein(source, target) / Math.max(source.length, target.length);
    })),
  })).sort((a, b) => a.score - b.score);
  // Labels come from a closed set of nine affixes. OCR commonly substitutes
  // two visually similar Han characters in the same otherwise-complete label
  // (for example 暴→暮 and 害→家). Accept the nearest legal candidate when it
  // remains clearly separated from the runner-up; ambiguous or fragmentary
  // text still stays unresolved instead of being forced into a value.
  return ranked[0].score <= 0.4 && ranked[1].score - ranked[0].score >= 0.12 ? ranked[0].value : "";
}

export function isUnearnedEquipmentEffect(rawText) {
  const source = cleanOcrText(rawText);
  if (!source) return false;
  if (source.includes("未获得效果") || source.includes("未获得")) return true;
  return levenshtein(source, "未获得效果") <= 2;
}

// 名称识别和数值字形匹配分层处理。这里不再根据数字反推词条，也不再
// 用字符替换、补前导数字或最近档位来“修复”OCR；没有足够图像证据时
// 保持数值为空，由预览界面明确要求确认。
export function createOcrLabelPreviewLine(position, {
  rawLabel = "",
  alternateLabel = "",
  locked = null,
  valueStyle = "",
} = {}) {
  if (isUnearnedEquipmentEffect(rawLabel) || isUnearnedEquipmentEffect(alternateLabel)) {
    return {
      position,
      functionType: "",
      value: null,
      level: null,
      locked: null,
      confidence: "high",
      rawLabel,
      alternateLabel,
      valueStyle,
      unearned: true,
      state: OCR_EQUIPMENT_LINE_STATES.UNEARNED,
      requiresConfirmation: false,
      warnings: [],
    };
  }
  const functionType = matchEquipmentFunctionType(rawLabel)
    || matchEquipmentFunctionType(alternateLabel);
  if (!functionType && !rawLabel && !alternateLabel) {
    return {
      position,
      functionType: "",
      value: null,
      level: null,
      locked: null,
      confidence: "low",
      rawLabel,
      alternateLabel,
      valueStyle,
      state: OCR_EQUIPMENT_LINE_STATES.NEEDS_CONFIRMATION,
      requiresConfirmation: true,
      warnings: ["词条区域为空或未识别，请确认"],
    };
  }
  const warnings = [
    functionType ? "数值模板待匹配" : "未识别词条名称",
  ].filter(Boolean);
  if (functionType && locked === null) warnings.push("锁定状态待确认");
  return {
    position,
    functionType,
    value: null,
    level: null,
    locked: functionType ? locked : null,
    confidence: functionType ? "medium" : "low",
    rawLabel,
    alternateLabel,
    valueStyle,
    state: OCR_EQUIPMENT_LINE_STATES.NEEDS_CONFIRMATION,
    requiresConfirmation: true,
    warnings,
  };
}

export function validateOcrPreview(entries) {
  const errors = [];
  const seenByCharacter = new Map();
  (entries || []).forEach((entry, entryIndex) => {
    if (!entry.characterName) errors.push(`第 ${entryIndex + 1} 张截图缺少角色文件夹名`);
    if (!entry.equipmentSlot) errors.push(`${entry.fileName || `第 ${entryIndex + 1} 张截图`}未确认装备部位`);
    const characterKey = normalizeCharacterName(entry.characterName);
    const slotKey = `${characterKey}:${entry.equipmentSlot}`;
    if (entry.equipmentSlot && seenByCharacter.has(slotKey)) errors.push(`${entry.characterName}存在重复的${entry.equipmentSlot}截图`);
    else if (entry.equipmentSlot) seenByCharacter.set(slotKey, true);
    const used = new Set();
    (entry.lines || []).forEach((line) => {
      if (line.requiresConfirmation) errors.push(`${entry.characterName}${entry.equipmentSlot}词条${line.position}需要确认识别结果`);
      if (!line.functionType) return;
      if (!EQUIPMENT_FUNCTION_TYPES.includes(line.functionType) || !Number.isInteger(Number(line.level)) || Number(line.level)<1 || Number(line.level)>15) {
        errors.push(`${entry.characterName}${entry.equipmentSlot}词条${line.position}需要确认有效词条与档位`);
      }
      if (used.has(line.functionType)) errors.push(`${entry.characterName}${entry.equipmentSlot}存在重复词条：${EQUIPMENT_FUNCTION_LABELS[line.functionType]}`);
      used.add(line.functionType);
      if (!hasFiniteOcrNumber(line.value) || !hasIntegerOcrTier(line.level)) errors.push(`${entry.characterName}${entry.equipmentSlot}词条${line.position}需要确认数值与档位`);
      else if (Math.abs(Number(line.value) - Number(tierValue(line.functionType, line.level))) > 0.001) errors.push(`${entry.characterName}${entry.equipmentSlot}词条${line.position}的数值与档位不一致`);
      else if (!isOcrValueStyleCompatible(line.level, line.valueStyle)) errors.push(`${entry.characterName}${entry.equipmentSlot}词条${line.position}的字色与档位不一致`);
      if (typeof line.locked !== "boolean") errors.push(`${entry.characterName}${entry.equipmentSlot}词条${line.position}需要确认锁定状态`);
    });
  });
  return [...new Set(errors)];
}

export function mergeOcrEntriesIntoEquipments(existingEquipments, entries) {
  const equipments = existingEquipments
    ? existingEquipments.map((slot) => slot.map((line) => ({ ...line })))
    : createEmptyEquipments();
  (entries || []).forEach((entry) => {
    const slotIndex = SCREENSHOT_EQUIPMENT_SLOTS.indexOf(entry.equipmentSlot);
    if (slotIndex < 0) return;
    const target = equipments[slotIndex].map((line) => ({ ...line }));
    (entry.lines || []).forEach((line) => {
      const index = Number(line.position) - 1;
      if (index < 0 || index >= 3) return;
      target[index] = {
        position: index + 1,
        functionType: line.functionType || "",
        value: line.functionType ? Number(line.value) : null,
        level: line.functionType ? Number(line.level) : null,
        locked: line.functionType ? Boolean(line.locked) : null,
      };
    });
    equipments[slotIndex] = target;
  });
  return equipments;
}
