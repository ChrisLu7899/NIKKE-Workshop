// SPDX-License-Identifier: GPL-3.0-or-later
// 浏览器内本地 OCR。截图、识别结果和模型文件均不会离开本机。

import { createWorker, PSM } from "tesseract.js";
import {
  classifyOcrLockStateFromRgba,
  classifyOcrValueStyleFromRgba,
  createOcrLabelPreviewLine,
  resolveEquipmentSlot,
} from "../domain/equipmentScreenshotOcr.js";
import {
  createEquipmentRecognitionRegions,
  locateEquipmentEffectRowCenters,
  locateLargestEquipmentPanel,
} from "../domain/equipmentScreenshotTemplate.js";
import { matchEquipmentIcon } from "./equipmentIconMatcher.js";
import { matchEquipmentValueTemplate } from "./equipmentValueTemplateMatcher.js";

let cachedWorkers = null;
let workerInitialization = null;
let progressListener = null;

const extensionUrl = (path) => (
  globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : `/${path}`
);

function canvasCrop(bitmap, { left, top, width, height, scale = 2, mode = "threshold", threshold = 180 }) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, left, top, width, height, 0, 0, canvas.width, canvas.height);
  if (mode === "raw") return canvas;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (mode === "cyan") {
      const cyan = green > red + 18 && blue > red + 18 && green + blue > 230;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = cyan ? 0 : 255;
    } else if (mode === "lightText") {
      const gray = (red * 0.299) + (green * 0.587) + (blue * 0.114);
      pixels[index] = pixels[index + 1] = pixels[index + 2] = gray > threshold ? 0 : 255;
    } else {
      const gray = (red * 0.299) + (green * 0.587) + (blue * 0.114);
      pixels[index] = pixels[index + 1] = pixels[index + 2] = gray < threshold ? 0 : 255;
    }
    pixels[index + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function canvasPreviewUrl(bitmap, rect, { maximumWidth = 720 } = {}) {
  const scale = Math.min(1, maximumWidth / rect.width);
  const canvas = canvasCrop(bitmap, { ...rect, scale, mode: "raw" });
  return canvas.toDataURL("image/jpeg", 0.9);
}

function locateEquipmentPanel(bitmap) {
  const sampleWidth = Math.min(360, bitmap.width);
  const scale = sampleWidth / bitmap.width;
  const sampleHeight = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const mask = new Uint8Array(sampleWidth * sampleHeight);
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    mask[pixel] = luminance >= 188 && chroma <= 52 ? 1 : 0;
  }
  const located = locateLargestEquipmentPanel(mask, sampleWidth, sampleHeight);
  if (!located) {
    return {
      bounds: { left: 0, top: 0, width: bitmap.width, height: bitmap.height },
      confidence: "fallback",
      coverage: 1,
    };
  }
  const padding = Math.max(2, Math.round(2 / scale));
  const left = Math.max(0, Math.floor(located.left / scale) - padding);
  const top = Math.max(0, Math.floor(located.top / scale) - padding);
  const right = Math.min(bitmap.width, Math.ceil((located.left + located.width) / scale) + padding);
  const bottom = Math.min(bitmap.height, Math.ceil((located.top + located.height) / scale) + padding);
  return {
    bounds: { left, top, width: right - left, height: bottom - top },
    confidence: "high",
    coverage: located.coverage,
  };
}

function locateEffectRowCenters(bitmap, panel) {
  const left = Math.round(panel.left + (panel.width * 0.86));
  const right = Math.round(panel.left + (panel.width * 0.96));
  const top = Math.round(panel.top + (panel.height * 0.45));
  const bottom = Math.round(panel.top + (panel.height * 0.9));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const rowScores = Array.from({ length: height }, (_, relativeY) => {
    let score = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = ((relativeY * width) + x) * 4;
      const luminance = (pixels[offset] * 0.299)
        + (pixels[offset + 1] * 0.587)
        + (pixels[offset + 2] * 0.114);
      if (luminance < 120) score += 1;
    }
    return { y: top + relativeY, score };
  });
  return locateEquipmentEffectRowCenters(rowScores, {
    panelWidth: panel.width,
    minimumScore: Math.max(5, Math.round(panel.width * 0.012)),
  });
}

function isDarkEffectRow(bitmap, rect) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, rect.left, rect.top, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let luminance = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    luminance += (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
  }
  return luminance / (pixels.length / 4) < 135;
}

function detectLockState(bitmap, rect) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, rect.left, rect.top, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return classifyOcrLockStateFromRgba(context.getImageData(0, 0, canvas.width, canvas.height).data);
}

function detectValueStyle(bitmap, rect, { darkBackground = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, rect.left, rect.top, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return classifyOcrValueStyleFromRgba(
    context.getImageData(0, 0, canvas.width, canvas.height).data,
    { darkBackground },
  );
}

function reportWorkerProgress(message) {
  if (message.progress != null) {
    progressListener?.({ phase: message.status, progress: message.progress });
  }
}

async function createLocalWorkers() {
  const common = {
    workerPath: extensionUrl("ocr/worker.min.js"),
    corePath: extensionUrl("ocr/core"),
    langPath: extensionUrl("ocr/lang"),
    workerBlobURL: false,
    logger: reportWorkerProgress,
  };
  // 数值只允许匹配档位表中的游戏字体模板，不再加载英文数字 OCR 模型。
  // 这样既缩短首次初始化，也避免错误数字被“最近合法档位”放大成确定结果。
  const textWorker = await createWorker("chi_sim", 1, common);
  await textWorker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    preserve_interword_spaces: "1",
  });
  return { textWorker };
}

async function getLocalWorkers(onProgress) {
  progressListener = onProgress || null;
  if (cachedWorkers) return cachedWorkers;
  if (!workerInitialization) {
    workerInitialization = createLocalWorkers()
      .then((workers) => {
        cachedWorkers = workers;
        return workers;
      })
      .catch((error) => {
        workerInitialization = null;
        cachedWorkers = null;
        throw error;
      });
  }
  return workerInitialization;
}

// 管理页空闲时调用；识别时会复用同一个初始化 Promise 和常驻 Worker。
export async function prewarmLocalScreenshotOcr({ onProgress } = {}) {
  await getLocalWorkers(onProgress);
}

async function recognizeImage(file, workers, { characterName, onProgress }) {
  const bitmap = await createImageBitmap(file);
  onProgress?.({ phase: "locating", fileName: file.name });
  const panelDetection = locateEquipmentPanel(bitmap);
  const effectRowCenters = locateEffectRowCenters(bitmap, panelDetection.bounds);
  const regions = createEquipmentRecognitionRegions(panelDetection.bounds, { effectRowCenters });
  const slotCanvas = canvasCrop(bitmap, {
    ...regions.slotLabel,
    scale: 3,
  });
  const equipmentNameCanvas = canvasCrop(bitmap, {
    ...regions.equipmentName,
    scale: 3,
  });
  const equipmentIconCanvas = canvasCrop(bitmap, {
    ...regions.equipmentIcon,
    scale: 1,
    mode: "raw",
  });
  const [slotResult, equipmentNameResult, equipmentIconMatch] = await Promise.all([
    workers.textWorker.recognize(slotCanvas, {}, { text: true }),
    workers.textWorker.recognize(equipmentNameCanvas, {}, { text: true }),
    matchEquipmentIcon(equipmentIconCanvas),
  ]);
  const lines = [];
  for (let index = 0; index < 3; index += 1) {
    onProgress?.({ phase: "recognizing", fileName: file.name, line: index + 1 });
    const effectRow = regions.effectRows[index];
    const darkRow = isDarkEffectRow(bitmap, effectRow.full);
    const labelRect = {
      ...effectRow.label,
      scale: 4,
    };
    const labelMode = darkRow ? "lightText" : "threshold";
    const rowCanvas = canvasCrop(bitmap, { ...labelRect, mode: labelMode, threshold: darkRow ? 128 : 180 });
    const locked = detectLockState(bitmap, effectRow.lock);
    const valueStyle = detectValueStyle(bitmap, effectRow.value, { darkBackground: darkRow });
    const rowResult = await workers.textWorker.recognize(rowCanvas, {}, { text: true });
    const rawLabel = rowResult.data.text.trim();
    let previewLine = createOcrLabelPreviewLine(index + 1, {
      rawLabel,
      locked,
      valueStyle,
    });
    // 名称无法匹配时，只对同一个名称区域切换二值化方式再识别一次。
    // 不允许通过数值反推词条名称。
    if (!previewLine.functionType) {
      const alternateLabelCanvas = canvasCrop(bitmap, {
        ...labelRect,
        mode: darkRow ? "threshold" : "lightText",
        threshold: darkRow ? 180 : 150,
      });
      const alternateLabelResult = await workers.textWorker.recognize(alternateLabelCanvas, {}, { text: true });
      previewLine = createOcrLabelPreviewLine(index + 1, {
        rawLabel,
        alternateLabel: alternateLabelResult.data.text.trim(),
        locked,
        valueStyle,
      });
    }
    if (previewLine.functionType) {
      const templateMatch = await matchEquipmentValueTemplate(
        bitmap,
        effectRow.value,
        previewLine.functionType,
        { valueStyle },
      );
      if (templateMatch) {
        previewLine = {
          ...previewLine,
          value: templateMatch.value,
          level: templateMatch.level,
          confidence: "high",
          valueTemplateMatch: templateMatch,
          warnings: (previewLine.warnings || []).filter((warning) => (
            !/数值模板待匹配/.test(warning)
          )),
        };
      } else {
        previewLine = {
          ...previewLine,
          confidence: "low",
          warnings: [
            ...(previewLine.warnings || []).filter((warning) => warning !== "数值模板待匹配"),
            "数值模板匹配不确定，请确认",
          ],
        };
      }
    }
    lines.push(previewLine);
  }
  const rawSlot = slotResult.data.text.trim();
  const rawEquipmentName = equipmentNameResult.data.text.trim();
  const slotResolution = resolveEquipmentSlot({ rawEquipmentName, rawSlot, equipmentIconMatch });
  const {
    equipmentSlot,
    equipmentSlotSource,
    slotFromIcon,
    slotFromName,
    slotFromLabel,
    conflict: slotConflict,
  } = slotResolution;
  const result = {
    id: `${characterName}:${file.name}:${file.lastModified}`,
    characterName,
    fileName: file.name,
    previewUrl: URL.createObjectURL(file),
    panelPreviewUrl: canvasPreviewUrl(bitmap, regions.panel),
    equipmentIconPreviewUrl: canvasPreviewUrl(bitmap, regions.equipmentIcon, { maximumWidth: 180 }),
    template: {
      version: regions.templateVersion,
      panel: regions.panel,
      equipmentIcon: regions.equipmentIcon,
      equipmentName: regions.equipmentName,
      effectRows: regions.effectRows,
      confidence: panelDetection.confidence,
      coverage: panelDetection.coverage,
      effectRowsLocated: effectRowCenters.length === 3,
    },
    equipmentSlot,
    rawSlot,
    rawEquipmentName,
    matchedEquipmentName: equipmentIconMatch.name,
    equipmentIconMatch,
    equipmentSlotSource,
    lines,
    warnings: [
      ...(panelDetection.confidence !== "high" ? ["未可靠定位白色装备面板，已按整张图片回退识别"] : []),
      ...(!equipmentSlot ? ["未识别装备部位"] : []),
      ...(equipmentIconMatch.confidence === "low" ? ["装备图标匹配置信度较低，建议检查部位"] : []),
      ...(slotConflict ? [`装备图标判定为${slotFromIcon || "未知"}，名称/标签判定为${slotFromName || slotFromLabel || "未知"}；已优先采用装备图标`] : []),
      ...lines.flatMap((line) => line.warnings || []),
    ],
  };
  bitmap.close();
  return result;
}

export async function recognizeScreenshotGroups(groups, { onProgress } = {}) {
  const workers = await getLocalWorkers(onProgress);
  const results = [];
  try {
    const files = (groups || []).flatMap((group) => group.images.map((file) => ({ characterName: group.characterName, file })));
    for (let index = 0; index < files.length; index += 1) {
      const item = files[index];
      onProgress?.({ phase: "image", current: index + 1, total: files.length, fileName: item.file.name });
      results.push(await recognizeImage(item.file, workers, { characterName: item.characterName, onProgress }));
    }
  } finally {
    progressListener = null;
  }
  return results;
}

export function releaseOcrPreviewUrls(results) {
  (results || []).forEach((result) => {
    if (result.previewUrl) URL.revokeObjectURL(result.previewUrl);
  });
}
