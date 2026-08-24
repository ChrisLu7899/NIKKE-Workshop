// SPDX-License-Identifier: GPL-3.0-or-later
// 12 类改造装备的纯本地图标匹配。只比较装备主体，忽略左侧企业、类型和等级叠层。

import { EQUIPMENT_ICON_CATALOG } from "../domain/equipmentIconCatalog.js";

const NORMALIZED_SIZE = 64;
const COMPARE_LEFT = 16;
const TRANSLATION_RADIUS = 3;
let cachedSamplesPromise = null;

const extensionUrl = (path) => {
  const normalized = String(path || "").replace(/^\/+/, "");
  return globalThis.chrome?.runtime?.getURL
    ? chrome.runtime.getURL(normalized)
    : new URL(`/${normalized}`, document.baseURI).href;
};

function normalizedCanvas(source) {
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const cropLeft = Math.round(sourceWidth * 0.07);
  const cropTop = Math.round(sourceHeight * 0.05);
  const cropRight = Math.round(sourceWidth * 0.95);
  const cropBottom = Math.round(sourceHeight * 0.95);
  const canvas = document.createElement("canvas");
  canvas.width = NORMALIZED_SIZE;
  canvas.height = NORMALIZED_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    cropLeft,
    cropTop,
    Math.max(1, cropRight - cropLeft),
    Math.max(1, cropBottom - cropTop),
    0,
    0,
    NORMALIZED_SIZE,
    NORMALIZED_SIZE,
  );
  return context.getImageData(0, 0, NORMALIZED_SIZE, NORMALIZED_SIZE);
}

export function createEquipmentIconFeatures(imageData) {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  const rgb = new Float32Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const target = pixel * 3;
    const red = data[offset] / 255;
    const green = data[offset + 1] / 255;
    const blue = data[offset + 2] / 255;
    rgb[target] = red;
    rgb[target + 1] = green;
    rgb[target + 2] = blue;
    gray[pixel] = (red * 0.299) + (green * 0.587) + (blue * 0.114);
  }
  const edges = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width) + x;
      const horizontal = gray[index + 1] - gray[index - 1];
      const vertical = gray[index + width] - gray[index - width];
      edges[index] = Math.min(1, Math.hypot(horizontal, vertical));
    }
  }
  return { width, height, rgb, gray, edges };
}

function correlation(left, right) {
  if (!left.length || left.length !== right.length) return 0;
  let leftMean = 0;
  let rightMean = 0;
  for (let index = 0; index < left.length; index += 1) {
    leftMean += left[index];
    rightMean += right[index];
  }
  leftMean /= left.length;
  rightMean /= right.length;
  let numerator = 0;
  let leftPower = 0;
  let rightPower = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] - leftMean;
    const rightValue = right[index] - rightMean;
    numerator += leftValue * rightValue;
    leftPower += leftValue * leftValue;
    rightPower += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftPower * rightPower);
  return denominator > 1e-8 ? Math.max(-1, Math.min(1, numerator / denominator)) : 0;
}

export function scoreEquipmentIconFeatures(candidate, sample) {
  const width = Math.min(candidate.width, sample.width);
  const height = Math.min(candidate.height, sample.height);
  let bestScore = Infinity;
  for (let deltaY = -TRANSLATION_RADIUS; deltaY <= TRANSLATION_RADIUS; deltaY += 1) {
    for (let deltaX = -TRANSLATION_RADIUS; deltaX <= TRANSLATION_RADIUS; deltaX += 1) {
      const candidateGray = [];
      const sampleGray = [];
      const candidateEdges = [];
      const sampleEdges = [];
      let rgbDifference = 0;
      let rgbCount = 0;
      for (let y = 1; y < height - 1; y += 1) {
        const sampleY = y + deltaY;
        if (sampleY < 1 || sampleY >= height - 1) continue;
        for (let x = COMPARE_LEFT; x < width - 1; x += 1) {
          const sampleX = x + deltaX;
          if (sampleX < COMPARE_LEFT || sampleX >= width - 1) continue;
          const candidateIndex = (y * candidate.width) + x;
          const sampleIndex = (sampleY * sample.width) + sampleX;
          const candidateRgbIndex = candidateIndex * 3;
          const sampleRgbIndex = sampleIndex * 3;
          rgbDifference += Math.abs(candidate.rgb[candidateRgbIndex] - sample.rgb[sampleRgbIndex]);
          rgbDifference += Math.abs(candidate.rgb[candidateRgbIndex + 1] - sample.rgb[sampleRgbIndex + 1]);
          rgbDifference += Math.abs(candidate.rgb[candidateRgbIndex + 2] - sample.rgb[sampleRgbIndex + 2]);
          rgbCount += 3;
          candidateGray.push(candidate.gray[candidateIndex]);
          sampleGray.push(sample.gray[sampleIndex]);
          candidateEdges.push(candidate.edges[candidateIndex]);
          sampleEdges.push(sample.edges[sampleIndex]);
        }
      }
      if (!rgbCount) continue;
      const rgbScore = rgbDifference / rgbCount;
      const grayScore = 1 - correlation(candidateGray, sampleGray);
      const edgeScore = 1 - correlation(candidateEdges, sampleEdges);
      bestScore = Math.min(bestScore, (rgbScore * 0.45) + (grayScore * 0.35) + (edgeScore * 0.2));
    }
  }
  return bestScore;
}

async function loadSample(record) {
  const response = await fetch(extensionUrl(record.assetPath));
  if (!response.ok) throw new Error(`无法读取装备图标样本：${record.name}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    return { record, features: createEquipmentIconFeatures(normalizedCanvas(bitmap)) };
  } finally {
    bitmap.close();
  }
}

async function getSamples() {
  if (!cachedSamplesPromise) {
    cachedSamplesPromise = Promise.all(EQUIPMENT_ICON_CATALOG.map(loadSample))
      .catch((error) => {
        cachedSamplesPromise = null;
        throw error;
      });
  }
  return cachedSamplesPromise;
}

export async function matchEquipmentIcon(source) {
  const candidate = createEquipmentIconFeatures(normalizedCanvas(source));
  const samples = await getSamples();
  const ranked = samples
    .map(({ record, features }) => ({ record, score: scoreEquipmentIconFeatures(candidate, features) }))
    .sort((left, right) => left.score - right.score);
  const best = ranked[0];
  const margin = (ranked[1]?.score ?? Infinity) - best.score;
  const confidence = margin >= 0.05 ? "high" : margin >= 0.025 ? "medium" : "low";
  return {
    ...best.record,
    score: best.score,
    margin,
    confidence,
    alternatives: ranked.slice(1, 4).map(({ record, score }) => ({ id: record.id, name: record.name, slot: record.slot, score })),
  };
}
