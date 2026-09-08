// SPDX-License-Identifier: GPL-3.0-or-later

import { PSM } from "tesseract.js";
import {
  deriveIdentityRegions,
  deriveIdentityRegionsFromRarityWordmark,
  findCoreBadge,
  findCubeIconRegion,
  findCubeStripeCandidates,
  isRarityWordmarkAnchor,
  locateTrainingLocalRegions,
} from "../domain/trainingOcrCore.js";
import { locateOverloadLogoFromRgba } from "../domain/equipmentScreenshotTemplate.js";
import { TRAINING_FIELD_STATUS, constrainedNumericResult, trainingFieldResult } from "../domain/trainingOcrFieldContract.js";
import { checkOcrSignal } from "./ocrTask.js";
import { enforceTrainingPageFieldExclusivity } from "../domain/trainingScreenshotOcr.js";
import * as collectible from "../domain/trainingOcrFields/collectible.js";
import * as limitBreak from "../domain/trainingOcrFields/limitBreak.js";
import * as characterLevel from "../domain/trainingOcrFields/characterLevel.js";
import * as affection from "../domain/trainingOcrFields/affection.js";
import * as combatPower from "../domain/trainingOcrFields/combatPower.js";
import * as classLevel from "../domain/trainingOcrFields/classLevel.js";
import * as enterpriseLevel from "../domain/trainingOcrFields/enterpriseLevel.js";
import * as skill1Level from "../domain/trainingOcrFields/skill1Level.js";
import * as skill2Level from "../domain/trainingOcrFields/skill2Level.js";
import * as burstSkillLevel from "../domain/trainingOcrFields/burstSkillLevel.js";
import * as cubeType from "../domain/trainingOcrFields/cubeType.js";
import * as cubeLevel from "../domain/trainingOcrFields/cubeLevel.js";
import { matchCubeIcon } from "./cubeIconMatcher.js";

const FIELD_MODULES = [
  collectible, limitBreak, characterLevel, affection, combatPower, classLevel, enterpriseLevel,
  skill1Level, skill2Level, burstSkillLevel, cubeType, cubeLevel,
];
const SKILL_LEVEL_FIELDS = ["skill1Level", "skill2Level", "burstSkillLevel"];
const CUBE_FIELDS = new Set(["cubeType", "cubeLevel"]);

function bitmapCanvas(bitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  return canvas;
}

function cropCanvas(bitmap, bounds, scale = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function binaryCropCanvas(bitmap, bounds, scale, predicate) {
  const source = cropCanvas(bitmap, bounds, 1);
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  const imageData = sourceContext.getImageData(0, 0, source.width, source.height);
  for (let offset = 0; offset < imageData.data.length; offset += 4) {
    const active = predicate(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2]);
    const value = active ? 0 : 255;
    imageData.data[offset] = value;
    imageData.data[offset + 1] = value;
    imageData.data[offset + 2] = value;
    imageData.data[offset + 3] = 255;
  }
  sourceContext.putImageData(imageData, 0, 0);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function previewUrl(bitmap, bounds) {
  const scale = Math.min(1, 720 / Math.max(1, bounds.width));
  return cropCanvas(bitmap, bounds, scale).toDataURL("image/jpeg", 0.9);
}

async function recognizeText(worker, bitmap, bounds, {
  scale = 4,
  pageSegmentationMode = PSM.SINGLE_LINE,
  whitelist = "",
  padding = 0,
  binaryPredicate = null,
  smooth = true,
} = {}) {
  await worker.setParameters({
    tessedit_pageseg_mode: pageSegmentationMode,
    tessedit_char_whitelist: whitelist,
  });
  const crop = binaryPredicate
    ? binaryCropCanvas(bitmap, bounds, scale, binaryPredicate)
    : cropCanvas(bitmap, bounds, scale);
  if (!binaryPredicate && !smooth) {
    const source = cropCanvas(bitmap, bounds, 1);
    const context = crop.getContext("2d");
    context.clearRect(0, 0, crop.width, crop.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, crop.width, crop.height);
  }
  let input = crop;
  if (padding > 0) {
    const border = Math.max(2, Math.round(Math.max(crop.width, crop.height) * padding));
    const padded = document.createElement("canvas");
    padded.width = crop.width + (border * 2);
    padded.height = crop.height + (border * 2);
    const context = padded.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, padded.width, padded.height);
    context.drawImage(crop, border, border);
    input = padded;
  }
  const result = await worker.recognize(input, {}, { text: true });
  return { text: result.data.text.trim(), confidence: Math.max(0, Math.min(1, (result.data.confidence || 0) / 100)) };
}

async function locateCube(context, bitmap) {
  if (Object.hasOwn(context.cache, "cube")) return context.cache.cube;
  const candidates = findCubeStripeCandidates(context);
  const scored = [];
  for (const candidate of candidates) {
    const iconRegion = findCubeIconRegion(context, candidate.card);
    try {
      const match = await matchCubeIcon(cropCanvas(bitmap, iconRegion));
      scored.push({ ...candidate, iconRegion, match });
    } catch (error) { scored.push({ ...candidate, iconRegion, match: null, error: error.message }); }
  }
  scored.sort((left, right) => (left.match?.score ?? 1) - (right.match?.score ?? 1));
  context.cache.cube = scored[0] || null;
  return context.cache.cube;
}

export async function recognizeTrainingScreenshot(file, workers, { characterName, onProgress, bitmap: sharedBitmap, signal } = {}) {
  const bitmap = sharedBitmap || await createImageBitmap(file);
  try {
    checkOcrSignal(signal);
    onProgress?.({ phase: "training-locating", fileName: file.name });
    const canvas = bitmapCanvas(bitmap);
    const imageData = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, bitmap.width, bitmap.height);
    const anchor = findCoreBadge(imageData.data, bitmap.width, bitmap.height);
    const wordmarkDetection = anchor.badge
      ? null
      : locateOverloadLogoFromRgba(imageData.data, bitmap.width, bitmap.height);
    const rarityWordmark = isRarityWordmarkAnchor(wordmarkDetection, bitmap.width, bitmap.height)
      ? wordmarkDetection.bounds
      : null;
    const anchoredRegions = anchor.badge
      ? deriveIdentityRegions(anchor.badge, bitmap.width, bitmap.height)
      : deriveIdentityRegionsFromRarityWordmark(rarityWordmark, bitmap.width, bitmap.height);
    const regions = anchoredRegions || locateTrainingLocalRegions({ raw: imageData.data, width: bitmap.width, height: bitmap.height });
    const context = {
      raw: imageData.data,
      width: bitmap.width,
      height: bitmap.height,
      layout: bitmap.width >= bitmap.height ? "landscape" : "portrait",
      anchors: {
        coreBadge: anchor.badge,
        rarityWordmark,
        identitySource: anchor.badge ? "core-badge" : rarityWordmark ? "rarity-wordmark" : "",
      },
      regions,
      cache: {},
      ocrCoreLevel: async (bounds) => {
        const digits = { x: bounds.x + Math.round(bounds.width * .24), y: bounds.y + Math.round(bounds.height * .25),
          width: Math.round(bounds.width * .53), height: Math.round(bounds.height * .5) };
        const result = await recognizeText(await workers.getNumericWorker(), bitmap, digits, {
          scale: 6, whitelist: "01234567", padding: .15,
          binaryPredicate: (r, g, b) => Math.min(r, g, b) >= 180,
        });
        return constrainedNumericResult(result.text, result.confidence, { max: 7, minConfidence: .8 });
      },
      ocrCharacterLevel: async (bounds) => {
        const result = await recognizeText(await workers.getNumericWorker(), bitmap, bounds, {
          scale: 5,
          pageSegmentationMode: PSM.SPARSE_TEXT,
          whitelist: "0123456789",
          binaryPredicate: (r, g, b) => r > 155 && g > 75 && b < 165 && r - b > 45,
        });
        return { ...constrainedNumericResult(result.text, result.confidence, { max: 9999 }), note: "仅读取橙黄色当前等级；低置信结果不写入。" };
      },
      ocrCombatPower: async (bounds) => {
        const result = await recognizeText(await workers.getNumericWorker(), bitmap, bounds, { scale: 4, pageSegmentationMode: PSM.SINGLE_LINE, whitelist: "0123456789" });
        return constrainedNumericResult(result.text, result.confidence, { max: 99999999 });
      },
      ocrResearchLevel: async (bounds) => {
        const worker = await workers.getNumericWorker();
        const result = await recognizeText(worker, bitmap, bounds, { scale: 6, pageSegmentationMode: PSM.SINGLE_LINE, whitelist: "0123456789", padding: 0.15, smooth: false });
        return constrainedNumericResult(result.text, result.confidence, { max: 500 });
      },
      ocrCubeLevel: async (bounds) => {
        const worker = await workers.getNumericWorker();
        const result = await recognizeText(worker, bitmap, bounds, { scale: 6, pageSegmentationMode: PSM.SINGLE_LINE, whitelist: "0123456789" });
        return constrainedNumericResult(result.text, result.confidence, { max: 15 });
      },
      ocrSkillLevel: async (bounds) => {
        const result = await recognizeText(await workers.getNumericWorker(), bitmap, bounds, {
          scale: 5, whitelist: "0123456789", padding: 0.15,
          binaryPredicate: (r, g, b) => Math.min(r, g, b) >= 155,
        });
        return constrainedNumericResult(result.text, result.confidence, { max: 10, minConfidence: 0.8 });
      },
    };
    context.getCube = () => locateCube(context, bitmap);
    const recognizedFields = {};
    for (let index = 0; index < FIELD_MODULES.length; index += 1) {
      checkOcrSignal(signal);
      const module = FIELD_MODULES[index];
      onProgress?.({ phase: "training-field", current: index + 1, total: FIELD_MODULES.length, field: module.field, fileName: file.name });
      const skillPageDetected = SKILL_LEVEL_FIELDS.some((field) => recognizedFields[field]?.status === TRAINING_FIELD_STATUS.RECOGNIZED);
      if (CUBE_FIELDS.has(module.field) && skillPageDetected) {
        recognizedFields[module.field] = trainingFieldResult(module.field, {
          status: TRAINING_FIELD_STATUS.NOT_VISIBLE,
          method: "training-page-mutual-exclusion",
          warnings: ["已识别到技能页，跳过同图的魔方识别。"],
        });
        continue;
      }
      try {
        recognizedFields[module.field] = await module.recognize(context);
      } catch (error) {
        recognizedFields[module.field] = trainingFieldResult(module.field, { status: TRAINING_FIELD_STATUS.ERROR, warnings: [error instanceof Error ? error.message : String(error)] });
      }
    }
    const fields = enforceTrainingPageFieldExclusivity(recognizedFields);
    checkOcrSignal(signal);
    const recognizedPatch = Object.fromEntries(Object.values(fields).filter(({ status }) => status === TRAINING_FIELD_STATUS.RECOGNIZED).map(({ field, value }) => [field, value]));
    const visibleBounds = regions?.panel || { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    return {
      id: `${characterName}:${file.name}:${file.lastModified}:training`,
      type: "training",
      characterName,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      panelPreviewUrl: previewUrl(bitmap, visibleBounds),
      image: { width: bitmap.width, height: bitmap.height, layout: context.layout },
      anchors: context.anchors,
      fields,
      recognizedPatch,
      warnings: Object.values(fields).flatMap((field) => field.warnings || []),
      mergeRule: "只覆盖 status=recognized 的字段；未出现或不确定字段保持原值。",
    };
  } finally {
    if (!sharedBitmap) bitmap.close();
  }
}
