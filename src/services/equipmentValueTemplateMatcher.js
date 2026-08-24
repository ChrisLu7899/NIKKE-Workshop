// SPDX-License-Identifier: GPL-3.0-or-later
// 从 9 个词条各自的 15 个合法整值模板中匹配截图字形。

import { EQUIPMENT_TIER_VALUES } from "../domain/equipmentAffixes.js";
import {
  OCR_VALUE_STYLES,
  isOcrValueStyleCompatible,
} from "../domain/equipmentScreenshotOcr.js";
import {
  composeValueGlyphMasks,
  createValueGlyphMask,
  rankComposedValueCandidates,
  rankValueTemplateCandidates,
} from "../domain/equipmentValueTemplateMatch.js";

const templateCache = new Map();
const glyphCache = new Map();

const extensionUrl = (path) => (
  globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : `/${path}`
);

function imageDataFromBitmap(bitmap, rect = null) {
  const width = Math.max(1, Math.round(rect?.width || bitmap.width));
  const height = Math.max(1, Math.round(rect?.height || bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (rect) {
    context.drawImage(bitmap, rect.left, rect.top, rect.width, rect.height, 0, 0, width, height);
  } else {
    context.drawImage(bitmap, 0, 0, width, height);
  }
  return context.getImageData(0, 0, width, height);
}

async function loadTemplateMask(functionType, level) {
  const key = `${functionType}:${level}`;
  if (!templateCache.has(key)) {
    templateCache.set(key, (async () => {
      const response = await fetch(extensionUrl(`ocr/affix-value-templates/${functionType}/${level}.png`));
      if (!response.ok) throw new Error(`无法加载词条数值模板：${functionType}/${level}`);
      const bitmap = await createImageBitmap(await response.blob());
      try {
        const imageData = imageDataFromBitmap(bitmap);
        return createValueGlyphMask(imageData.data, imageData.width, imageData.height);
      } finally {
        bitmap.close();
      }
    })());
  }
  return templateCache.get(key);
}

const glyphFileName = (character) => (
  character === "." ? "dot" : character === "%" ? "percent" : character
);

async function loadGlyphMask(valueStyle, character) {
  const key = `${valueStyle}:${character}`;
  if (!glyphCache.has(key)) {
    glyphCache.set(key, (async () => {
      const response = await fetch(extensionUrl(
        `ocr/affix-values/${valueStyle}/${glyphFileName(character)}.png`,
      ));
      if (!response.ok) throw new Error(`无法加载数值字符模板：${valueStyle}/${character}`);
      const bitmap = await createImageBitmap(await response.blob());
      try {
        const imageData = imageDataFromBitmap(bitmap);
        return createValueGlyphMask(imageData.data, imageData.width, imageData.height, {
          blueText: valueStyle !== OCR_VALUE_STYLES.LIGHT_BLACK,
        });
      } finally {
        bitmap.close();
      }
    })());
  }
  return glyphCache.get(key);
}

async function createLegalGlyphCandidate(valueStyle, level, value) {
  const text = `${Number(value).toFixed(2)}%`;
  const glyphs = await Promise.all([...text].map((character) => loadGlyphMask(valueStyle, character)));
  return { level, value, mask: composeValueGlyphMasks(glyphs) };
}

export async function matchEquipmentValueTemplate(bitmap, rect, functionType, { valueStyle = "" } = {}) {
  const legal = EQUIPMENT_TIER_VALUES[functionType] || [];
  if (!legal.length) return null;
  const imageData = imageDataFromBitmap(bitmap, rect);
  const observed = createValueGlyphMask(imageData.data, imageData.width, imageData.height, {
    blueText: valueStyle === OCR_VALUE_STYLES.LIGHT_BLUE || valueStyle === OCR_VALUE_STYLES.DARK_BLUE,
  });
  if (observed.width <= 1 || observed.height <= 1) return null;

  const levels = legal.map((_, index) => index + 1)
    .filter((level) => !valueStyle || isOcrValueStyleCompatible(level, valueStyle));
  const fullValueCandidates = await Promise.all(levels.map(async (level) => ({
    level,
    value: legal[level - 1],
    mask: await loadTemplateMask(functionType, level),
  })));
  const effectiveStyle = valueStyle || OCR_VALUE_STYLES.LIGHT_BLACK;
  const glyphCandidates = await Promise.all(levels.map((level) => (
    createLegalGlyphCandidate(effectiveStyle, level, legal[level - 1])
  )));
  const glyphRanked = rankComposedValueCandidates(observed, glyphCandidates);
  const glyphBest = glyphRanked[0];
  const glyphMargin = (glyphRanked[1]?.score ?? 1) - (glyphBest?.score ?? 1);

  // 单字符模板在截图与素材字形高度一致时最可靠，优先采用。若缩放或
  // 抗锯齿使其证据不足，再回退到完整合法值模板；两者都不明确则留空。
  let best = null;
  let margin = 0;
  let method = "";
  if (glyphBest && glyphBest.score <= 0.05 && glyphMargin >= 0.015) {
    best = glyphBest;
    margin = glyphMargin;
    method = "glyph-sequence";
  } else {
    const fullRanked = rankValueTemplateCandidates(observed, fullValueCandidates);
    const fullBest = fullRanked[0];
    const fullMargin = (fullRanked[1]?.score ?? 1) - (fullBest?.score ?? 1);
    if (fullBest && fullBest.score <= 0.42 && fullMargin >= 0.012) {
      best = fullBest;
      margin = fullMargin;
      method = "full-value";
    }
  }
  if (!best) return null;
  return {
    level: best.level,
    value: best.value,
    score: best.score,
    margin,
    method,
    confidence: margin >= 0.04 ? "high" : "medium",
  };
}
