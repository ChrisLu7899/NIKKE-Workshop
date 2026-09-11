// SPDX-License-Identifier: GPL-3.0-or-later
// 练度截图的纯像素识别核心。所有函数只依赖 RGBA 数据，可在浏览器和测试中复用。
import { recognizeTrainingDigit } from "./trainingOcrDigits.js";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const round = (value, digits = 3) => Number(value.toFixed(digits));

export function connectedComponents(mask, width, height, minimumPixels = 8) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let pixelCount = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      pixelCount += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
        if (neighbor < 0 || neighbor >= mask.length || visited[neighbor] || !mask[neighbor]) continue;
        if (Math.abs((neighbor % width) - x) > 1) continue;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    if (pixelCount >= minimumPixels) {
      components.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixelCount });
    }
  }
  return components;
}

export function cropRgba(raw, imageWidth, bounds) {
  const output = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const inputStart = ((bounds.y + y) * imageWidth + bounds.x) * 4;
    output.set(raw.subarray(inputStart, inputStart + (bounds.width * 4)), y * bounds.width * 4);
  }
  return output;
}

export function makeMask(raw, width, height, predicate) {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    if (predicate(raw[offset], raw[offset + 1], raw[offset + 2])) mask[index] = 1;
  }
  return mask;
}

function expandBounds(bounds, scaleX, scaleY, imageWidth, imageHeight) {
  const width = Math.round(bounds.width * scaleX);
  const height = Math.round(bounds.height * scaleY);
  const x = clamp(Math.round(bounds.x + (bounds.width - width) / 2), 0, imageWidth - 1);
  const y = clamp(Math.round(bounds.y + (bounds.height - height) / 2), 0, imageHeight - 1);
  return { x, y, width: Math.min(width, imageWidth - x), height: Math.min(height, imageHeight - y) };
}

export function findCoreBadge(raw, width, height) {
  // 横屏角色信息面板固定在画面右侧。旧范围从 45% 开始，会把装备弹窗
  // 中央的紫色改造角标当成核心突破徽章，继而把整张装备图误分成练度图。
  // 竖屏截图仍保留较宽的兼容范围。
  const landscape = width >= height;
  const region = landscape
    ? { x: Math.floor(width * 0.68), y: Math.floor(height * 0.08), width: Math.floor(width * 0.3), height: Math.floor(height * 0.34) }
    : { x: Math.floor(width * 0.45), y: Math.floor(height * 0.12), width: Math.floor(width * 0.53), height: Math.floor(height * 0.38) };
  const roi = cropRgba(raw, width, region);
  const mask = makeMask(roi, region.width, region.height, (r, g, b) => r >= 80 && b >= 65 && g <= 95 && r >= g * 1.25 && b >= g * 1.12);
  const candidates = connectedComponents(mask, region.width, region.height, 10)
    .map((component) => ({ ...component, x: component.x + region.x, y: component.y + region.y }))
    .filter((component) => {
      const aspect = component.width / component.height;
      return component.width >= width * 0.006 && component.width <= width * 0.08
        && component.height >= height * 0.008 && component.height <= height * 0.09
        && aspect >= 0.35 && aspect <= 2.4;
    })
    .map((component) => {
      const centerX = component.x + component.width / 2;
      const centerY = component.y + component.height / 2;
      const compactness = component.pixelCount / (component.width * component.height);
      const score = (centerX / width) * 4 + compactness * 2 - Math.abs(centerY / height - 0.245) * 7 + Math.log10(component.pixelCount + 1) * 0.35;
      return { ...component, score: round(score) };
    })
    .sort((left, right) => right.score - left.score);
  return { badge: candidates[0] ? expandBounds(candidates[0], 1.25, 1.25, width, height) : null, candidates: candidates.slice(0, 8) };
}

export function isRarityWordmarkAnchor(candidate, imageWidth, imageHeight) {
  const bounds = candidate?.bounds;
  if (!bounds || imageWidth <= 0 || imageHeight <= 0) return false;
  const aspect = bounds.width / Math.max(1, bounds.height);
  const centerX = bounds.left + (bounds.width / 2);
  const centerY = bounds.top + (bounds.height / 2);
  if (candidate.kind === "rarity-wordmark") {
    const horizontalPositionValid = imageWidth < imageHeight
      ? centerX >= imageWidth * 0.12 && centerX <= imageWidth * 0.72
      : centerX >= imageWidth * 0.72;
    return aspect >= 2.2 && aspect <= 4.2
      && horizontalPositionValid
      && centerY >= imageHeight * 0.03 && centerY <= imageHeight * 0.32
      && bounds.width >= imageWidth * 0.035 && bounds.width <= imageWidth * 0.32;
  }
  return candidate.confidence !== "high"
    && aspect >= 2.2 && aspect <= 4.2
    && centerX >= imageWidth * 0.72
    && centerY >= imageHeight * 0.1 && centerY <= imageHeight * 0.32
    && bounds.width >= imageWidth * 0.035 && bounds.width <= imageWidth * 0.09;
}

export function findRarityWordmark(raw, width, height) {
  if (!raw || width < 2 || height < 2 || raw.length !== width * height * 4) return null;
  const searchHeight = Math.max(1, Math.floor(height * 0.35));
  const search = cropRgba(raw, width, { x: 0, y: 0, width, height: searchHeight });
  const orange = makeMask(search, width, searchHeight, (r, g, b) => (
    r >= 175 && g >= 90 && b <= 155 && r - b >= 65 && g - b >= 15
  ));
  const candidates = connectedComponents(
    orange,
    width,
    searchHeight,
    Math.max(18, Math.round(width * searchHeight * 0.00008)),
  ).filter((component) => {
    const aspect = component.width / Math.max(1, component.height);
    const fill = component.pixelCount / Math.max(1, component.width * component.height);
    return aspect >= 2.2 && aspect <= 4.2
      && component.width >= width * 0.035 && component.width <= width * 0.32
      && component.height >= height * 0.012 && component.height <= height * 0.12
      && fill >= 0.2;
  }).sort((left, right) => right.pixelCount - left.pixelCount);
  const best = candidates[0];
  if (!best) return null;
  return {
    kind: "rarity-wordmark",
    confidence: "medium",
    bounds: { left: best.x, top: best.y, width: best.width, height: best.height },
    candidates: candidates.slice(0, 6),
  };
}

export function findIdentityBar(raw, width, height) {
  if (!raw || width < 2 || height < 2 || raw.length !== width * height * 4) return null;
  const dark = makeMask(raw, width, height, (r, g, b) => Math.max(r, g, b) <= 100);
  const candidates = connectedComponents(
    dark,
    width,
    height,
    Math.max(80, Math.round(width * height * 0.0002)),
  ).filter((component) => {
    const aspect = component.width / Math.max(1, component.height);
    const fill = component.pixelCount / Math.max(1, component.width * component.height);
    const centerX = component.x + (component.width / 2);
    return component.y >= height * 0.03 && component.y <= height * 0.34
      && component.width >= width * 0.12 && component.width <= width * 0.9
      && component.height >= height * 0.025 && component.height <= height * 0.16
      && aspect >= 3 && aspect <= 8
      && fill >= 0.25
      && (width < height || centerX >= width * 0.62);
  }).sort((left, right) => right.pixelCount - left.pixelCount);
  const best = candidates[0];
  return best ? { ...best, confidence: 0.9, candidates: candidates.slice(0, 6) } : null;
}

export function projectRarityWordmarkFromIdentityBar(bar, imageWidth, imageHeight) {
  if (!bar || imageWidth <= 0 || imageHeight <= 0) return null;
  const left = clamp(Math.round(bar.x + bar.width * 0.02), 0, imageWidth - 1);
  const top = clamp(Math.round(bar.y - bar.height * 0.4), 0, imageHeight - 1);
  return {
    left,
    top,
    width: Math.min(Math.max(1, Math.round(bar.width * 0.33)), imageWidth - left),
    height: Math.min(Math.max(1, Math.round(bar.height * 0.5)), imageHeight - top),
  };
}

export function deriveIdentityRegionsFromRarityWordmark(wordmark, imageWidth, imageHeight) {
  if (!wordmark) return null;
  // 零核心角色没有紫色徽章，改用 SSR 字标直接投影右侧面板。相对比例
  // 来自完整横屏详情页，并为职业/企业的小号 LV 文本保留更宽的 OCR 区域。
  const unitX = wordmark.width;
  const unitY = wordmark.height;
  const field = (left, top, width, height) => {
    const x = clamp(Math.round(left), 0, imageWidth - 1);
    const y = clamp(Math.round(top), 0, imageHeight - 1);
    return {
      x,
      y,
      width: Math.min(Math.max(1, Math.round(width)), imageWidth - x),
      height: Math.min(Math.max(1, Math.round(height)), imageHeight - y),
    };
  };
  return {
    panel: field(wordmark.left - unitX * 0.65, wordmark.top - unitY * 1.4, unitX * 4.45, unitY * 19.2),
    stars: field(wordmark.left + unitX * 1.75, wordmark.top - unitY * 0.55, unitX * 1.35, unitY * 1.8),
    core: field(wordmark.left + unitX * 2.65, wordmark.top - unitY * 0.2, unitX * 0.55, unitY * 1.45),
    level: field(wordmark.left - unitX * 0.08, wordmark.top + unitY * 0.85, unitX * 2.25, unitY * 1.8),
    affection: field(wordmark.left + unitX * 2.38, wordmark.top + unitY * 2.25, unitX * 0.58, unitY * 0.9),
    combatPower: field(wordmark.left + unitX * 1.45, wordmark.top + unitY * 3.85, unitX * 1.85, unitY * 2.45),
    classLevel: field(wordmark.left + unitX * 1.7, wordmark.top + unitY * 14.45, unitX * 0.125, unitY * 0.64),
    enterpriseLevel: field(wordmark.left + unitX * 2.46, wordmark.top + unitY * 14.45, unitX * 0.1, unitY * 0.64),
  };
}

export function deriveIdentityRegions(badge, imageWidth, imageHeight) {
  const scale = Math.max(badge.width, badge.height);
  const field = (left, top, width, height) => {
    const x = clamp(Math.round(left), 0, imageWidth - 1);
    const y = clamp(Math.round(top), 0, imageHeight - 1);
    return { x, y, width: Math.min(Math.max(1, Math.round(width)), imageWidth - x), height: Math.min(Math.max(1, Math.round(height)), imageHeight - y) };
  };
  const stars = field(badge.x - scale * 1.9, badge.y - scale * 0.18, scale * 1.9, scale * 1.4);
  if (imageWidth < imageHeight) {
    return {
      panel: field(badge.x - scale * 5.57, badge.y - scale * 0.81, scale * 7.09, scale * 13.29), stars, core: { ...badge },
      level: field(badge.x - scale * 4.24, badge.y + scale * 1.22, scale * 2.41, scale * 1.14),
      affection: field(badge.x + scale * 0.23, badge.y + scale * 2.63, scale * 0.63, scale * 0.43),
      combatPower: field(badge.x - scale * 2.28, badge.y + scale * 3.62, scale * 3.04, scale * 1.58),
      classLevel: field(badge.x - scale * 1.266, badge.y + scale * 11.87, scale * 0.215, scale * 0.215),
      enterpriseLevel: field(badge.x + scale * 0.139, badge.y + scale * 11.92, scale * 0.278, scale * 0.228),
    };
  }
  return {
    panel: field(badge.x - scale * 6.2, badge.y - scale * 0.8, scale * 7.85, scale * 12.4), stars, core: { ...badge },
    level: field(badge.x - scale * 4.3, badge.y + scale * 1.05, scale * 3.4, scale * 1.15),
    affection: field(badge.x + scale * 0.31, badge.y + scale * 2.17, scale * 0.64, scale * 0.33),
    combatPower: field(badge.x - scale * 2.45, badge.y + scale * 2.93, scale * 3.2, scale * 1.55),
    classLevel: field(badge.x - scale * 1.36, badge.y + scale * 10.03, scale * 0.293, scale * 0.259),
    enterpriseLevel: field(badge.x + scale * 0.103, badge.y + scale * 10.03, scale * 0.293, scale * 0.259),
  };
}

// Local anchors are observations in their own right, not a projection from a missing core badge.
export function locateTrainingLocalRegions(context) {
  const { raw, width, height } = context;
  const result = {};
  const bars = connectedComponents(makeMask(raw,width,height,(r,g,b)=>Math.max(r,g,b)<110),width,height,150)
    .filter((part)=>part.width>=70 && part.height>=16 && part.width/part.height>=3 && part.width/part.height<=14)
    .sort((a,b)=>b.pixelCount-a.pixelCount).slice(0,12);
  for (const bar of bars) {
    const area={x:bar.x,y:bar.y,width:Math.max(1,Math.floor(bar.width*.55)),height:bar.height};
    const pixels=cropRgba(raw,width,area);
    const digits=connectedComponents(makeMask(pixels,area.width,area.height,(r,g,b)=>r>155&&g>75&&b<165&&r-b>45),area.width,area.height,5)
      .filter((p)=>p.height>=area.height*.2&&p.height<=area.height*.85&&p.width/p.height<=1.1);
    if(digits.length>=1&&digits.length<=4){result.level=area;break;}
  }
  const hearts=connectedComponents(makeMask(raw,width,height,(r,g,b)=>r>165&&r-g>75&&r-b>65),width,height,25)
    .filter((p)=>p.width>=18&&p.height>=12&&p.width/p.height>=.65&&p.width/p.height<=1.8&&p.width<=Math.max(100,width*.25))
    .sort((a,b)=>b.pixelCount-a.pixelCount).slice(0,12);
  const reliable=hearts.filter((bounds)=>recognizeAffection(raw,width,bounds).value!==null);
  if(reliable.length===1) result.affection=reliable[0];
  return result;
}

export function countStars(raw, imageWidth, region) {
  const roi = cropRgba(raw, imageWidth, region);
  const mask = makeMask(roi, region.width, region.height, (r, g, b) => r >= 175 && g >= 105 && b <= 150 && r - b >= 70 && g - b >= 20);
  const components = connectedComponents(mask, region.width, region.height, Math.max(6, Math.round(region.width * region.height * 0.002)))
    .filter((component) => {
      const aspect = component.width / component.height;
      return aspect >= 0.35 && aspect <= 1.8 && component.pixelCount / (region.width * region.height) >= 0.003 && component.height >= region.height * 0.18;
    }).sort((left, right) => left.x - right.x).slice(0, 3);
  if (components.length) {
    return { value: components.length, confidence: round(0.78 + components.length * 0.05), components, emptyStarEvidence: [] };
  }

  // Zero breakthrough still renders three gray stars. They often touch into one
  // neutral strip, so the absence of yellow alone is not enough: require the
  // visible gray-star geometry before committing an exact zero.
  const neutral = makeMask(roi, region.width, region.height, (r, g, b) => {
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    return maximum - minimum <= 45 && minimum >= 55 && maximum <= 225;
  });
  const neutralComponents = connectedComponents(
    neutral,
    region.width,
    region.height,
    Math.max(8, Math.round(region.width * region.height * 0.001)),
  );
  const emptyStarEvidence = neutralComponents.filter((component) => {
    const aspect = component.width / Math.max(1, component.height);
    const fill = component.pixelCount / Math.max(1, component.width * component.height);
    const joinedStrip = aspect >= 1.8 && aspect <= 4.2
      && component.width >= region.width * 0.4 && component.width <= region.width * 0.95;
    const singleStar = aspect >= 0.55 && aspect <= 1.6
      && component.width >= region.width * 0.12 && component.width <= region.width * 0.4;
    return (joinedStrip || singleStar)
      && component.y <= region.height * 0.58
      && component.height >= region.height * 0.25 && component.height <= region.height * 0.72
      && fill >= 0.15;
  });
  const separateStars = emptyStarEvidence.filter((component) => component.width < region.width * 0.4);
  const joinedStars = emptyStarEvidence.some((component) => component.width >= region.width * 0.4);
  const hasThreeEmptyStars = joinedStars || separateStars.length >= 3;
  return {
    value: hasThreeEmptyStars ? 0 : null,
    confidence: hasThreeEmptyStars ? 0.84 : 0,
    components,
    emptyStarEvidence,
  };
}

export function recognizeCoreLevel(raw, imageWidth, region) {
  const roi = cropRgba(raw, imageWidth, region);
  const mask = makeMask(roi, region.width, region.height, (r, g, b) => r >= 165 && g >= 150 && b >= 165 && Math.max(r, g, b) - Math.min(r, g, b) <= 75);
  const components = connectedComponents(mask, region.width, region.height, Math.max(3, Math.round(mask.length * 0.001)))
    .filter((component) => component.height >= region.height * 0.23 && component.height <= region.height * 0.9).sort((left, right) => left.x - right.x);
  const last = components.filter((component) => component.x >= region.width * 0.18).at(-1);
  if (!last) return { value: null, confidence: 0, note: "未找到核心数字字形。", components };
  const aspect = last.width / last.height;
  const { glyph, glyphWidth, glyphHeight } = extractGlyph(mask, region.width, last.x, last.y, last.x+last.width-1, last.y+last.height-1);
  // A visible core badge always represents core level 1-7. Rank the captured
  // glyph only against those legal values so an impossible 9 cannot suppress
  // a valid 3 merely because antialiasing makes their right edges similar.
  const recognized = recognizeTrainingDigit(glyph, glyphWidth, glyphHeight, {
    allowedValues: [1, 2, 3, 4, 5, 6, 7],
  });
  const value = recognized.value >= 1 && recognized.value <= 7 ? recognized.value : null;
  return { value, confidence: value === null ? 0 : recognized.confidence, note: value === null ? "核心字形不明确，请手动确认；不按宽高比猜测为 03。" : "核心数字字形识别。", lastDigitAspect: round(aspect), components };
}

function segmentScores(mask, width, height) {
  const rectangles = [[0.2, 0, 0.8, 0.2], [0, 0.1, 0.35, 0.55], [0.65, 0.1, 1, 0.55], [0.2, 0.4, 0.8, 0.65], [0, 0.5, 0.35, 0.95], [0.65, 0.5, 1, 0.95], [0.2, 0.8, 0.8, 1]];
  return rectangles.map(([left, top, right, bottom]) => {
    let active = 0;
    let total = 0;
    for (let y = Math.floor(top * height); y < Math.ceil(bottom * height); y += 1) {
      for (let x = Math.floor(left * width); x < Math.ceil(right * width); x += 1) { active += mask[y * width + x]; total += 1; }
    }
    return total ? active / total : 0;
  });
}

export function recognizeColoredLevel(raw, imageWidth, region) {
  const roi = cropRgba(raw, imageWidth, region);
  const mask = makeMask(roi, region.width, region.height, (r, g, b) => r > 170 && g > 90 && b < 140 && r - b > 70);
  const digits = connectedComponents(mask, region.width, region.height, 20)
    .filter((component) => component.height >= region.height * 0.25).sort((left, right) => left.x - right.x).slice(0, 4)
    .map((component) => {
      const glyph = new Uint8Array(component.width * component.height);
      for (let y = 0; y < component.height; y += 1) for (let x = 0; x < component.width; x += 1) glyph[y * component.width + x] = mask[(component.y + y) * region.width + component.x + x];
      const aspect = component.width / component.height;
      const scores = segmentScores(glyph, component.width, component.height);
      const value = aspect < 0.55 ? 1 : scores[4] - scores[2] > 0.08 && scores[3] > 0.35 ? 6 : null;
      return { value, aspect: round(aspect), scores: scores.map((score) => round(score)), bounds: component };
    });
  const complete = digits.length === 3 && digits.every(({ value }) => value !== null);
  return { value: complete ? Number(digits.map(({ value }) => value).join("")) : null, confidence: complete ? 0.79 : 0, note: "黄色数字结构目前已验证数字 1、6。", digits };
}

function countMaskHoles(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  let holes = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    let touchesEdge = false;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
        if (neighbor < 0 || neighbor >= mask.length || visited[neighbor] || mask[neighbor] || Math.abs((neighbor % width) - x) > 1) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    if (!touchesEdge) holes += 1;
  }
  return holes;
}

function regionDensity(mask, width, height, left, top, right, bottom) {
  let active = 0;
  let total = 0;
  for (let y = Math.floor(top * height); y < Math.ceil(bottom * height); y += 1) {
    for (let x = Math.floor(left * width); x < Math.ceil(right * width); x += 1) {
      active += mask[y * width + x];
      total += 1;
    }
  }
  return total ? active / total : 0;
}

function classifyBattleDigit(mask, width, height) {
  const aspect = width / Math.max(1, height);
  const holes = countMaskHoles(mask, width, height);
  const top = regionDensity(mask, width, height, 0.15, 0, 0.85, 0.2);
  const middle = regionDensity(mask, width, height, 0.15, 0.4, 0.85, 0.6);
  const bottom = regionDensity(mask, width, height, 0.15, 0.8, 0.85, 1);
  const topLeft = regionDensity(mask, width, height, 0, 0.1, 0.35, 0.5);
  const topRight = regionDensity(mask, width, height, 0.65, 0.1, 1, 0.5);
  const bottomLeft = regionDensity(mask, width, height, 0, 0.5, 0.35, 0.9);
  const bottomRight = regionDensity(mask, width, height, 0.65, 0.5, 1, 0.9);
  let value = null;
  if (aspect < 0.28) value = 1;
  else if (holes >= 2) value = 8;
  else if (holes === 1) {
    if (bottom < 0.52 && middle > 0.5) value = 4;
    else if (bottomLeft - topRight > 0.18) value = 6;
    else if (topRight - bottomLeft > 0.18) value = 9;
    else value = 0;
  } else if (bottomLeft - bottomRight > 0.35) value = 2;
  else if (bottomRight - bottomLeft > 0.25) value = 3;
  else if (topLeft - topRight > 0.25) value = 5;
  else if (top > 0.55 && topRight > 0.45 && bottomRight > 0.45) value = 7;
  return {
    value,
    aspect: round(aspect),
    holes,
    densities: {
      top: round(top), middle: round(middle), bottom: round(bottom),
      topLeft: round(topLeft), topRight: round(topRight),
      bottomLeft: round(bottomLeft), bottomRight: round(bottomRight),
    },
  };
}

export function recognizeCombatPower(raw, imageWidth, region) {
  const roi = cropRgba(raw, imageWidth, region);
  const mask = makeMask(roi, region.width, region.height, (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114 < 130);
  const candidates = connectedComponents(mask, region.width, region.height, Math.max(8, Math.round(region.width * region.height * 0.001)))
    .filter((component) => component.height >= region.height * 0.25 && component.width <= region.width * 0.25);
  const maximumHeight = Math.max(0, ...candidates.map(({ height }) => height));
  const components = candidates
    .filter(({ height }) => height >= maximumHeight * 0.62)
    .sort((left, right) => left.x - right.x);
  const digits = components.map((component) => {
    const glyph = new Uint8Array(component.width * component.height);
    for (let y = 0; y < component.height; y += 1) {
      for (let x = 0; x < component.width; x += 1) {
        glyph[y * component.width + x] = mask[(component.y + y) * region.width + component.x + x];
      }
    }
    return { ...classifyBattleDigit(glyph, component.width, component.height), bounds: component };
  });
  const complete = digits.length >= 4 && digits.length <= 8 && digits.every(({ value }) => value !== null);
  return {
    value: complete ? Number(digits.map(({ value }) => value).join("")) : null,
    confidence: complete ? 0.86 : 0,
    note: "使用战斗力窄体数字的连通区域、孔洞和边段结构识别。",
    digits,
  };
}

function extractGlyph(mask, width, minX, minY, maxX, maxY) {
  const glyphWidth = maxX - minX + 1;
  const glyphHeight = maxY - minY + 1;
  const glyph = new Uint8Array(glyphWidth * glyphHeight);
  for (let y = 0; y < glyphHeight; y += 1) for (let x = 0; x < glyphWidth; x += 1) glyph[y * glyphWidth + x] = mask[(minY + y) * width + minX + x];
  return { glyph, glyphWidth, glyphHeight };
}

export function recognizeCondensedLevel(raw, imageWidth, region) {
  const roi = cropRgba(raw, imageWidth, region);
  const mask = makeMask(roi, region.width, region.height, (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114 < 130);
  const digits = [];
  for (let digitIndex = 0; digitIndex < 3; digitIndex += 1) {
    const cellStart = Math.max(0, Math.round(digitIndex * region.width / 3) - 1);
    const cellEnd = Math.min(region.width, Math.round((digitIndex + 1) * region.width / 3) + 1);
    let minX = cellEnd; let minY = region.height; let maxX = cellStart; let maxY = 0;
    for (let y = 0; y < region.height; y += 1) for (let x = cellStart; x < cellEnd; x += 1) if (mask[y * region.width + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (minX > maxX || minY > maxY) { digits.push({ value: null, reason: "empty-cell" }); continue; }
    const { glyph, glyphWidth, glyphHeight } = extractGlyph(mask, region.width, minX, minY, maxX, maxY);
    const holes = countMaskHoles(glyph, glyphWidth, glyphHeight);
    const aspect = glyphWidth / glyphHeight;
    let value;
    if (holes >= 2) value = 8;
    else if (holes === 1) value = aspect < 0.46 ? 6 : 0;
    else if (aspect < 0.3) value = 1;
    else if (aspect >= 0.45) value = 2;
    else {
      const bottomLeft = regionDensity(glyph, glyphWidth, glyphHeight, 0, 0.5, 0.35, 0.9);
      const bottomRight = regionDensity(glyph, glyphWidth, glyphHeight, 0.65, 0.5, 1, 0.9);
      const topRight = regionDensity(glyph, glyphWidth, glyphHeight, 0.65, 0.1, 1, 0.5);
      value = topRight < 0.22 && bottomRight > bottomLeft ? 3 : 1;
    }
    digits.push({ value, holes, aspect: round(aspect), bounds: { minX, minY, maxX, maxY } });
  }
  return { value: digits.every(({ value }) => value !== null) ? Number(digits.map(({ value }) => value).join("")) : null, confidence: 0.72, note: "窄体结构目前覆盖 0、1、2、6、8。", digits };
}

export function recognizePortraitCondensedLevel(raw, imageWidth, region) {
  const roi = cropRgba(raw, imageWidth, region);
  const mask = makeMask(roi, region.width, region.height, (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114 < 130);
  const columnInk = Array.from({ length: region.width }, (_, x) => { let ink = 0; for (let y = 0; y < region.height; y += 1) ink += mask[y * region.width + x]; return ink; });
  const cut = (minimum, maximum) => { let best = -1; let score = Infinity; for (let x = Math.floor(region.width * minimum); x <= Math.ceil(region.width * maximum); x += 1) if (columnInk[x] < score) { score = columnInk[x]; best = x; } return best; };
  const cuts = [cut(0.12, 0.45), cut(0.5, 0.82)];
  const digits = [[0, cuts[0]], [cuts[0] + 1, cuts[1]], [cuts[1] + 1, region.width - 1]].map(([start, end]) => {
    let minX = end; let minY = region.height; let maxX = start; let maxY = 0;
    for (let y = 0; y < region.height; y += 1) for (let x = start; x <= end; x += 1) if (mask[y * region.width + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (minX > maxX || minY > maxY) return { value: null, reason: "empty-cell" };
    const { glyph, glyphWidth, glyphHeight } = extractGlyph(mask, region.width, minX, minY, maxX, maxY);
    let bottomInk = 0; let bottomTotal = 0;
    for (let y = Math.floor(glyphHeight * 0.8); y < glyphHeight; y += 1) for (let x = 0; x < glyphWidth; x += 1) { bottomInk += glyph[y * glyphWidth + x]; bottomTotal += 1; }
    const holes = countMaskHoles(glyph, glyphWidth, glyphHeight);
    const aspect = glyphWidth / glyphHeight;
    const bottomDensity = bottomTotal ? bottomInk / bottomTotal : 0;
    const value = holes >= 2 ? 8 : holes === 1 ? (bottomDensity < 0.55 ? 4 : 6) : aspect < 0.32 ? 1 : 3;
    return { value, holes, aspect: round(aspect), bottomDensity: round(bottomDensity), bounds: { minX, minY, maxX, maxY } };
  });
  return { value: digits.every(({ value }) => value !== null) ? Number(digits.map(({ value }) => value).join("")) : null, confidence: 0.74, note: "手机窄体字使用投影、孔洞与底边结构分类。", digits };
}

const SEGMENTS = { 0: [1, 1, 1, 0, 1, 1, 1], 1: [0, 0, 1, 0, 0, 1, 0], 2: [1, 0, 1, 1, 1, 0, 1], 3: [1, 0, 1, 1, 0, 1, 1], 4: [0, 1, 1, 1, 0, 1, 0], 5: [1, 1, 0, 1, 0, 1, 1], 6: [1, 1, 0, 1, 1, 1, 1], 7: [1, 0, 1, 0, 0, 1, 0], 8: [1, 1, 1, 1, 1, 1, 1], 9: [1, 1, 1, 1, 0, 1, 1] };

export function recognizeAffection(raw, imageWidth, region) {
  const roi = cropRgba(raw, imageWidth, region);
  const neutralMask = makeMask(roi, region.width, region.height, (r, g, b) => r > 190 && g > 190 && b > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 60);
  const enclosed = connectedComponents(neutralMask, region.width, region.height, 2)
    .filter((component) => component.x > 0
      && component.y > region.height * 0.35
      && component.x + component.width < region.width
      && component.height > region.height * 0.2
      && component.width < region.width * 0.45)
    .sort((left, right) => left.x - right.x);
  if (enclosed.length === 2) {
    const values = enclosed.map((component) => {
      const aspect = component.width / component.height;
      const density = component.pixelCount / (component.width * component.height);
      if (aspect < 0.65) return 1;
      if (density < 0.34) return 4;
      return 0;
    });
    if ((values[0] === 1 || values[0] === 4) && values[1] === 0) {
      return {
        value: Number(values.join("")),
        confidence: 0.9,
        note: "使用心形内封闭白色数字区域识别，并以七段结构作为其他布局的兜底。",
        digits: enclosed.map((component, index) => ({ value: values[index], bounds: component })),
      };
    }
  }
  const mask = makeMask(roi, region.width, region.height, (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114 > 210);
  const analysisTop = Math.floor(region.height * 0.47);
  const analysisHeight = region.height - analysisTop;
  const rects = [[0.2, 0, 0.8, 0.2], [0, 0.1, 0.35, 0.55], [0.65, 0.1, 1, 0.55], [0.2, 0.4, 0.8, 0.65], [0, 0.5, 0.35, 0.95], [0.65, 0.5, 1, 0.95], [0.2, 0.8, 0.8, 1]];
  const digits = [];
  for (let digitIndex = 0; digitIndex < 2; digitIndex += 1) {
    const x0 = Math.round(digitIndex * region.width / 2); const x1 = Math.round((digitIndex + 1) * region.width / 2);
    const scores = rects.map(([left, top, right, bottom]) => { let active = 0; let total = 0; for (let y = analysisTop + Math.floor(top * analysisHeight); y < analysisTop + Math.ceil(bottom * analysisHeight); y += 1) for (let x = x0 + Math.floor(left * (x1 - x0)); x < x0 + Math.ceil(right * (x1 - x0)); x += 1) { active += mask[y * region.width + x]; total += 1; } return total ? active / total : 0; });
    const activated = scores.map((score) => score >= 0.15 ? 1 : 0);
    const ranked = Object.entries(SEGMENTS).map(([digit, pattern]) => ({ digit: Number(digit), mismatches: pattern.reduce((sum, expected, index) => sum + (activated[index] === expected ? 0 : 1), 0) })).sort((left, right) => left.mismatches - right.mismatches);
    if (region.height >= 25 && digitIndex === 0 && scores[4] > 0.6 && scores[5] < 0.2) ranked.unshift(...ranked.splice(ranked.findIndex(({ digit }) => digit === 4), 1));
    else if (region.height >= 25 && digitIndex === 1 && scores[5] > 0.8 && scores[6] > 0.6) ranked.unshift(...ranked.splice(ranked.findIndex(({ digit }) => digit === 0), 1));
    else if (scores[0] < 0.15 && scores[3] > 0.35 && scores[5] > 0.25 && scores[6] < 0.15) ranked.unshift(...ranked.splice(ranked.findIndex(({ digit }) => digit === 4), 1));
    else if (scores[0] > 0.2 && scores[3] < 0.15 && scores[5] > 0.35 && scores[6] > 0.3) ranked.unshift(...ranked.splice(ranked.findIndex(({ digit }) => digit === 0), 1));
    digits.push({ value: ranked[0].digit, confidence: round(clamp(0.94 - ranked[0].mismatches * 0.08, 0, 1)), scores: scores.map((score) => round(score)) });
  }
  return { value: Number(digits.map(({ value }) => value).join("")), confidence: round(Math.min(...digits.map(({ confidence }) => confidence))), note: "使用心形内白色轮廓数字的七段结构。", digits };
}

function collectibleColor(r, g, b) {
  if (r >= 145 && g >= 55 && r >= g * 1.18 && g >= b * 1.15) return "orange";
  if (b >= 90 && r >= 65 && b >= g * 1.18 && r >= g * 1.08) return "purple";
  if (b >= 105 && b >= r * 1.18 && b >= g * 1.02) return "blue";
  return null;
}

export function recognizeCollectible(context) {
  const search = { x: 0, y: context.height < 600 ? 0 : Math.floor(context.height * 0.08), width: context.width < 500 ? context.width : Math.floor(context.width * 0.3), height: context.height < 600 ? context.height : Math.floor(context.height * 0.43) };
  const roi = cropRgba(context.raw, context.width, search);
  const mask = makeMask(roi, search.width, search.height, (r, g, b) => collectibleColor(r, g, b) !== null);
  const candidates = connectedComponents(mask, search.width, search.height, Math.max(8, Math.round(context.width * context.height * 0.000004)))
    .map((component) => ({ ...component, x: component.x + search.x, y: component.y + search.y }))
    .filter((component) => { const aspect = component.width / component.height; return component.width >= Math.max(12, Math.min(32, context.width * 0.018)) && component.width <= Math.max(120, context.width * 0.14) && component.height >= Math.max(5, Math.min(10, context.height * 0.004)) && component.height <= Math.max(50, context.height * 0.045) && aspect >= 1.8 && aspect <= 7; })
    .map((component) => {
      const padding = Math.max(2, Math.round(component.height * 0.14)); const x = Math.max(0, component.x - padding); const y = Math.max(0, component.y - padding);
      const bounds = { x, y, width: Math.min(context.width - x, component.width + padding * 2), height: Math.min(context.height - y, component.height + padding * 2) };
      const badge = cropRgba(context.raw, context.width, bounds);
      const bright = makeMask(badge, bounds.width, bounds.height, (r, g, b) => r >= 175 && g >= 175 && b >= 175 && Math.max(r, g, b) - Math.min(r, g, b) <= 55);
      const stars = connectedComponents(bright, bounds.width, bounds.height, 3).filter((part) => part.x > 0 && part.y > 0 && part.x + part.width < bounds.width && part.y + part.height < bounds.height && part.height >= bounds.height * 0.32 && part.height <= bounds.height * 0.9 && part.width / part.height >= 0.55 && part.width / part.height <= 1.5).length;
      return { ...component, bounds, stars: Math.min(3, stars), score: stars * 5 + component.pixelCount / (component.width * component.height) * 2 };
    }).filter(({ stars }) => stars >= 1 && stars <= 3).sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) return { value: null, status: "not_visible", candidates };
  const badge = cropRgba(context.raw, context.width, best.bounds); const counts = { blue: 0, purple: 0, orange: 0 };
  for (let index = 0; index < best.bounds.width * best.bounds.height; index += 1) { const color = collectibleColor(badge[index * 4], badge[index * 4 + 1], badge[index * 4 + 2]); if (color) counts[color] += 1; }
  const [color, count] = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]; const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { value: count ? { rarity: { blue: "R", purple: "SR", orange: "SSR" }[color], color, stars: best.stars } : null, confidence: total ? count / total : 0, bounds: best.bounds, candidates };
}

export function locateSkillLevels(context) {
  const dark = makeMask(context.raw, context.width, context.height, (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114 < 105);
  const candidates = connectedComponents(dark, context.width, context.height, Math.max(30, Math.round(context.width * context.height * 0.00002)))
    .filter((component) => { const aspect = component.width / component.height; return component.width >= 24 && component.width <= Math.max(150, context.width * 0.1) && component.height >= 18 && component.height <= Math.max(110, context.height * 0.09) && aspect >= 0.75 && aspect <= 1.55; })
    .map((component) => {
      const roi = cropRgba(context.raw, context.width, component); const bright = makeMask(roi, component.width, component.height, (r, g, b) => r >= 155 && g >= 155 && b >= 155 && Math.max(r, g, b) - Math.min(r, g, b) <= 70);
      const glyphs = connectedComponents(bright, component.width, component.height, 3).filter((glyph) => glyph.x > 0 && glyph.y > 0 && glyph.x + glyph.width < component.width && glyph.y + glyph.height < component.height && glyph.height >= component.height * 0.35 && glyph.height <= component.height * 0.82 && glyph.y >= component.height * 0.12 && glyph.y <= component.height * 0.48).sort((left, right) => left.x - right.x);
      const digits = glyphs.map((part) => {
        const extracted = extractGlyph(bright, component.width, part.x, part.y, part.x+part.width-1, part.y+part.height-1);
        return recognizeTrainingDigit(extracted.glyph, extracted.glyphWidth, extracted.glyphHeight);
      });
      let value = digits.length && digits.every((digit) => digit.value !== null) ? Number(digits.map((digit) => digit.value).join("")) : null;
      // The verified outlined 10 is retained, but requires a closed zero rather than two arbitrary blobs.
      if (value === null && glyphs.length === 2 && glyphs[0].width/glyphs[0].height <= .7 && glyphs[1].width/glyphs[1].height >= .72) {
        const part=glyphs[1], extracted=extractGlyph(bright,component.width,part.x,part.y,part.x+part.width-1,part.y+part.height-1);
        if (countMaskHoles(extracted.glyph,extracted.glyphWidth,extracted.glyphHeight) === 1) value=10;
      }
      if (!Number.isInteger(value) || value < 1 || value > 10) value=null;
      const padding=Math.max(2,Math.round(component.height*.16));
      const digitRegion={ x:component.x+padding,y:component.y+padding,width:component.width-2*padding,height:component.height-2*padding };
      return { ...component, digitRegion, centerX: component.x + component.width / 2, centerY: component.y + component.height / 2, recognition: { value, confidence: value ? 0.82 : 0, glyphs, digits } };
    }).filter(({ recognition }) => recognition.glyphs.length >= 1 && recognition.glyphs.length <= 2).slice(0, 80);
  let group = null;
  for (const first of candidates) for (const second of candidates) {
    if (first === second || first.centerY >= second.centerY || Math.abs(first.centerX - second.centerX) > Math.max(first.width, second.width) * 0.85 || second.centerY - first.centerY < Math.min(first.height, second.height) * 1.35 || second.centerY-first.centerY > Math.max(first.height,second.height)*5) continue;
    for (const burst of candidates) {
      if (burst === first || burst === second || burst.centerX <= Math.max(first.centerX, second.centerX) + Math.max(first.width, second.width) * 0.8) continue;
      // Match the small level badges, never the much larger skill illustration.
      if (Math.min(first.height, second.height) / Math.max(first.height, second.height) < .7
        || burst.height > Math.max(first.height, second.height) * 2.5
        || burst.width > Math.max(first.width, second.width) * 2.5) continue;
      const margin = Math.max(first.height, second.height, burst.height) * 0.9;
      if (burst.centerY < first.centerY - margin || burst.centerY > second.centerY + margin) continue;
      const score = 10 - Math.abs(first.centerX - second.centerX) / Math.max(1, first.width) - Math.abs(burst.centerY - (first.centerY + second.centerY) / 2) / Math.max(1, burst.height) + burst.centerX / 10000;
      if (!group || score > group.score) group = { skill1: first, skill2: second, burst, score };
    }
  }
  if (!group) {
    const pairs=[];
    for (const first of candidates) for (const second of candidates) {
      const gap=second.centerY-first.centerY, h=Math.max(first.height,second.height);
      if (gap >= h*1.35 && gap <= h*5 && Math.abs(first.centerX-second.centerX) <= Math.min(first.width,second.width)*.35
        && Math.min(first.height,second.height)/h >= .7) pairs.push({skill1:first,skill2:second});
    }
    // Two vertically aligned left badges identify their physical slots. One badge alone is ambiguous.
    if (pairs.length === 1) group={...pairs[0],burst:null,score:0,partial:true};
  }
  return { group, candidates };
}

export function findCubeStripeCandidates(context) {
  const yellow = makeMask(context.raw, context.width, context.height, (r, g, b) => r >= 145 && g >= 85 && b <= 125 && r - b >= 55 && g - b >= 30);
  return connectedComponents(yellow, context.width, context.height, Math.max(12, Math.round(context.width * context.height * 0.000004)))
    .filter((component) => component.width >= Math.max(28, context.width * 0.025) && component.width <= context.width * (Math.max(context.width,context.height) < 800 ? .98 : .4) && component.height >= 2 && component.height <= Math.max(45, context.height * 0.045) && component.width / component.height >= 2.4)
    // 详情页中的魔方卡固定出现在右下信息面板。SSR 字标和好感度边框
    // 也可能形成黄色横条，但它们位于画面上半区，不能作为魔方候选。
    .filter((component) => (
      Math.max(context.width,context.height) < 800 || (component.x + (component.width / 2) >= context.width * 0.55
      && component.y + (component.height / 2) >= context.height * 0.45
      )
    ))
    .map((stripe) => { const width = Math.round(stripe.width * 1.04); const height = Math.round(width * 0.95); const x = Math.max(0, Math.round(stripe.x - width * 0.02)); const y = Math.max(0, Math.round(stripe.y + stripe.height - height)); return { stripe, card: { x, y, width: Math.min(width, context.width - x), height: Math.min(height, context.height - y) } }; });
}

export function findCubeIconRegion(context, card) {
  const search = { x: card.x, y: card.y, width: card.width, height: Math.max(2, Math.round(card.height * 0.83)) };
  const roi = cropRgba(context.raw, context.width, search);
  const object = connectedComponents(makeMask(roi, search.width, search.height, (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114 < 105 || Math.max(r, g, b) - Math.min(r, g, b) > 70), search.width, search.height, 12)
    .filter((component) => component.width >= search.width * 0.3 && component.height >= search.height * 0.3).sort((left, right) => right.pixelCount - left.pixelCount)[0];
  if (object) return { x: search.x + object.x, y: search.y + object.y, width: object.width, height: object.height };
  return { x: Math.round(card.x + card.width * 0.1), y: Math.round(card.y + card.height * 0.08), width: Math.round(card.width * 0.8), height: Math.round(card.height * 0.68) };
}

export function recognizeCubeLevel(context, card) {
  const bounds = { x: card.x, y: Math.round(card.y + card.height * 0.3), width: Math.min(Math.max(2, Math.round(card.width * 0.35)), context.width - card.x), height: Math.min(Math.max(2, Math.round(card.height * 0.62)), context.height - Math.round(card.y + card.height * 0.3)) };
  const roi = cropRgba(context.raw, context.width, bounds);
  const mask = makeMask(roi, bounds.width, bounds.height, (r, g, b) => r >= 150 && g >= 150 && b >= 150 && Math.max(r, g, b) - Math.min(r, g, b) <= 60);
  const glyphs = connectedComponents(mask, bounds.width, bounds.height, 3)
    .filter((part) => part.x > 0 && part.y >= bounds.height * 0.42 && part.y <= bounds.height * 0.75 && part.height >= bounds.height * 0.28 && part.height <= bounds.height * 0.52 && part.width / part.height >= 0.15 && part.width / part.height <= 0.68).sort((left, right) => left.x - right.x);
  if (glyphs.length < 1 || glyphs.length > 2) return { value: null, confidence: 0, bounds, glyphs, note: "等级区域可见，但当前模板无法可靠解释。" };

  const patterns = {
    0: [1, 1, 1, 0, 1, 1, 1], 1: [0, 0, 1, 0, 0, 1, 0],
    2: [1, 0, 1, 1, 1, 0, 1], 3: [1, 0, 1, 1, 0, 1, 1],
    4: [0, 1, 1, 1, 0, 1, 0], 5: [1, 1, 0, 1, 0, 1, 1],
    6: [1, 1, 0, 1, 1, 1, 1], 7: [1, 0, 1, 0, 0, 1, 0],
    8: [1, 1, 1, 1, 1, 1, 1], 9: [1, 1, 1, 1, 0, 1, 1],
  };
  const recognizedDigits = glyphs.map((component) => {
    const { glyph, glyphWidth, glyphHeight } = extractGlyph(
      mask,
      bounds.width,
      component.x,
      component.y,
      component.x + component.width - 1,
      component.y + component.height - 1,
    );
    const aspect = glyphWidth / Math.max(1, glyphHeight);
    if (aspect <= 0.31) return { value: 1, confidence: 0.9, aspect: round(aspect) };
    const scores = segmentScores(glyph, glyphWidth, glyphHeight);
    const active = scores.map((score, index) => score >= ([0, 3, 6].includes(index) ? 0.5 : 0.7) ? 1 : 0);
    const ranked = Object.entries(patterns)
      .map(([digit, pattern]) => ({
        value: Number(digit),
        mismatches: pattern.reduce((sum, expected, index) => sum + (active[index] === expected ? 0 : 1), 0),
        distance: pattern.reduce((sum, expected, index) => sum + Math.abs(scores[index] - expected), 0),
      }))
      .sort((left, right) => left.mismatches - right.mismatches || left.distance - right.distance);
    const best = ranked[0];
    return {
      value: best.mismatches <= 1 ? best.value : null,
      confidence: best.mismatches === 0 ? 0.88 : best.mismatches === 1 ? 0.72 : 0,
      aspect: round(aspect),
      scores: scores.map((score) => round(score)),
      active,
      mismatches: best.mismatches,
      distance: round(best.distance),
    };
  });
  const value = recognizedDigits.every((digit) => digit.value !== null)
    ? Number(recognizedDigits.map((digit) => digit.value).join(""))
    : null;
  const valid = Number.isInteger(value) && value >= 1 && value <= 15;
  return {
    value: valid ? value : null,
    confidence: valid ? Math.min(...recognizedDigits.map((digit) => digit.confidence)) : 0,
    bounds,
    glyphs,
    recognizedDigits,
    note: valid ? "使用魔方卡片等级字形结构识别。" : "等级区域可见，但字形结果超出 1～15 或不确定。",
  };
}
