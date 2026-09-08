// SPDX-License-Identifier: GPL-3.0-or-later
// 17 种魔方的本地图标模板匹配，不发送图片或模板到网络。

import { CUBE_ICON_CATALOG } from "../domain/cubeIconCatalog.js";

const SIZE = 72;
let cachedSamplesPromise = null;

const extensionUrl = (path) => {
  const normalized = String(path || "").replace(/^\/+/, "");
  return globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(normalized) : new URL(`/${normalized}`, document.baseURI).href;
};

function normalizedImageData(source, { transparent = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!transparent) {
    context.fillStyle = "rgb(230,230,230)";
    context.fillRect(0, 0, SIZE, SIZE);
  }
  const scale = Math.min(SIZE / source.width, SIZE / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, (SIZE - width) / 2, (SIZE - height) / 2, width, height);
  return context.getImageData(0, 0, SIZE, SIZE);
}

function candidateColorFeatures(imageData) {
  let considered = 0;
  let bluePixels = 0;
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const offset = index * 4;
    const r = imageData.data[offset];
    const g = imageData.data[offset + 1];
    const b = imageData.data[offset + 2];
    if (Math.min(r, g, b) >= 235) continue;
    considered += 1;
    if (b - r > 20 && b - g > 5) bluePixels += 1;
  }
  return { blueRatio: considered ? bluePixels / considered : 0 };
}

function colorDistance(candidate, sample) {
  let error = 0;
  let weight = 0;
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const offset = index * 4;
    const alpha = sample.data[offset + 3] / 255;
    if (alpha < 0.35 || Math.floor(index / SIZE) > 55) continue;
    const dr = candidate.data[offset] - sample.data[offset];
    const dg = candidate.data[offset + 1] - sample.data[offset + 1];
    const db = candidate.data[offset + 2] - sample.data[offset + 2];
    error += (dr * dr + dg * dg + db * db) * alpha;
    weight += 3 * alpha;
  }
  return weight ? Math.sqrt(error / weight) / 255 : 1;
}

async function loadSample(record) {
  const response = await fetch(extensionUrl(record.assetPath));
  if (!response.ok) throw new Error(`无法读取魔方图标样本：${record.nameCn}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    return { record, imageData: normalizedImageData(bitmap, { transparent: true }) };
  } finally {
    bitmap.close();
  }
}

async function getSamples() {
  if (!cachedSamplesPromise) cachedSamplesPromise = Promise.all(CUBE_ICON_CATALOG.map(loadSample)).catch((error) => { cachedSamplesPromise = null; throw error; });
  return cachedSamplesPromise;
}

export async function matchCubeIcon(source) {
  const candidate = normalizedImageData(source);
  const features = candidateColorFeatures(candidate);
  let ranked = (await getSamples()).map(({ record, imageData }) => ({ ...record, score: colorDistance(candidate, imageData) })).sort((left, right) => left.score - right.score);
  const leading = new Set(ranked.slice(0, 2).map(({ cubeId }) => cubeId));
  if (leading.has(1000303) && leading.has(1000304)) {
    ranked = ranked.map((item) => ({
      ...item,
      score: item.score - (item.cubeId === 1000304 && features.blueRatio >= 0.32 ? 0.035 : item.cubeId === 1000303 && features.blueRatio < 0.32 ? 0.035 : 0),
    })).sort((left, right) => left.score - right.score);
  }
  const best = ranked[0];
  const margin = (ranked[1]?.score ?? 1) - best.score;
  const confidence = best.score <= 0.3 && margin >= 0.05 ? "high" : best.score <= 0.38 && margin >= 0.018 ? "medium" : "low";
  return { ...best, margin, confidence, sourceFeatures: features, alternatives: ranked.slice(1, 5).map(({ cubeId, nameCn, score }) => ({ cubeId, nameCn, score })) };
}
