// SPDX-License-Identifier: GPL-3.0-or-later
// 固定游戏字体下的数值模板匹配。只比较字形，不执行任意文本 OCR。

function contiguousRuns(flags) {
  const runs = [];
  let start = -1;
  for (let index = 0; index <= flags.length; index += 1) {
    const active = index < flags.length && Boolean(flags[index]);
    if (active && start < 0) start = index;
    else if (!active && start >= 0) {
      runs.push([start, index]);
      start = -1;
    }
  }
  return runs;
}

function foregroundBounds(mask, width, height) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[(y * width) + x]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function cropMask(mask, sourceWidth, bounds) {
  const output = new Uint8Array(bounds.width * bounds.height);
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      output[(y * bounds.width) + x] = mask[((bounds.top + y) * sourceWidth) + bounds.left + x];
    }
  }
  return { data: output, width: bounds.width, height: bounds.height };
}

export function createValueGlyphMask(rgba, width, height, { blueText = false } = {}) {
  const mask = new Uint8Array(width * height);
  for (let pixel = 0, index = 0; pixel < mask.length; pixel += 1, index += 4) {
    const red = rgba[index];
    const green = rgba[index + 1];
    const blue = rgba[index + 2];
    const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    mask[pixel] = blueText
      ? Number(blue >= 105 && green >= 70 && blue - red >= 38 && green - red >= 18)
      : Number(luminance < 178);
  }

  // 删除效果条的连续边框，但不能按整行墨迹比例删除；紧裁后的数字本身也
  // 可能占据一行的大部分宽度。
  for (let y = 0; y < height; y += 1) {
    const flags = Array.from({ length: width }, (_, x) => mask[(y * width) + x]);
    const longest = Math.max(0, ...contiguousRuns(flags).map(([start, end]) => end - start));
    if (longest >= Math.max(24, Math.round(width * 0.72))) {
      mask.fill(0, y * width, (y + 1) * width);
    }
  }

  const bounds = foregroundBounds(mask, width, height);
  return bounds ? cropMask(mask, width, bounds) : { data: new Uint8Array(1), width: 1, height: 1 };
}

function normalizeMask(mask, width = 160, height = 36) {
  const output = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(mask.height - 1, Math.floor((y * mask.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(mask.width - 1, Math.floor((x * mask.width) / width));
      output[(y * width) + x] = mask.data[(sourceY * mask.width) + sourceX];
    }
  }
  return { data: output, width, height };
}

export function resizeValueGlyphMask(mask, width, height) {
  return normalizeMask(mask, Math.max(1, width), Math.max(1, height));
}

// 将游戏字体的单字符模板组合成一个完整的合法百分比。候选文本由档位表
// 生成，因此匹配器不会产生表外数字，也不会用 OCR 猜测或修复数字。
export function composeValueGlyphMasks(glyphs, { gap = 2 } = {}) {
  const parts = (glyphs || []).filter((glyph) => glyph?.width > 0 && glyph?.height > 0);
  if (!parts.length) return { data: new Uint8Array(1), width: 1, height: 1 };
  const height = Math.max(...parts.map((part) => part.height));
  const width = parts.reduce((total, part) => total + part.width, 0) + (gap * (parts.length - 1));
  const data = new Uint8Array(width * height);
  let left = 0;
  parts.forEach((part) => {
    const top = height - part.height;
    for (let y = 0; y < part.height; y += 1) {
      for (let x = 0; x < part.width; x += 1) {
        data[((top + y) * width) + left + x] = part.data[(y * part.width) + x];
      }
    }
    left += part.width + gap;
  });
  return { data, width, height };
}

function dilate(mask, radius = 1) {
  const output = new Uint8Array(mask.data.length);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      let active = 0;
      for (let dy = -radius; dy <= radius && !active; dy += 1) {
        const sourceY = y + dy;
        if (sourceY < 0 || sourceY >= mask.height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sourceX = x + dx;
          if (sourceX < 0 || sourceX >= mask.width) continue;
          if (mask.data[(sourceY * mask.width) + sourceX]) {
            active = 1;
            break;
          }
        }
      }
      output[(y * mask.width) + x] = active;
    }
  }
  return { ...mask, data: output };
}

function shiftMask(mask, offsetX) {
  const output = new Uint8Array(mask.data.length);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const sourceX = x - offsetX;
      if (sourceX >= 0 && sourceX < mask.width) {
        output[(y * mask.width) + x] = mask.data[(y * mask.width) + sourceX];
      }
    }
  }
  return { ...mask, data: output };
}

function tolerantMaskScore(left, right) {
  const dilatedLeft = dilate(left);
  let best = 1;
  for (let offset = -2; offset <= 2; offset += 1) {
    const shifted = shiftMask(right, offset);
    const dilatedRight = dilate(shifted);
    let leftInk = 0;
    let rightInk = 0;
    let leftMatched = 0;
    let rightMatched = 0;
    for (let index = 0; index < left.data.length; index += 1) {
      if (left.data[index]) {
        leftInk += 1;
        if (dilatedRight.data[index]) leftMatched += 1;
      }
      if (shifted.data[index]) {
        rightInk += 1;
        if (dilatedLeft.data[index]) rightMatched += 1;
      }
    }
    const similarity = ((leftMatched / Math.max(1, leftInk)) + (rightMatched / Math.max(1, rightInk))) / 2;
    best = Math.min(best, 1 - similarity);
  }
  return best;
}

function columnRuns(mask) {
  const flags = Array.from({ length: mask.width }, (_, x) => {
    for (let y = 0; y < mask.height; y += 1) {
      if (mask.data[(y * mask.width) + x]) return 1;
    }
    return 0;
  });
  return contiguousRuns(flags);
}

function glyphMask(mask, run) {
  return cropMask(mask.data, mask.width, {
    left: run[0],
    top: 0,
    width: run[1] - run[0],
    height: mask.height,
  });
}

export function scoreValueGlyphMasks(observed, template) {
  const observedRuns = columnRuns(observed);
  const templateRuns = columnRuns(template);
  const overall = tolerantMaskScore(normalizeMask(observed), normalizeMask(template));
  if (observedRuns.length !== templateRuns.length) {
    return (overall * 0.45) + 0.5 + (Math.abs(observedRuns.length - templateRuns.length) * 0.01);
  }
  const glyphScore = observedRuns.reduce((total, run, index) => {
    const left = normalizeMask(glyphMask(observed, run), 28, 36);
    const right = normalizeMask(glyphMask(template, templateRuns[index]), 28, 36);
    return total + tolerantMaskScore(left, right);
  }, 0) / Math.max(1, observedRuns.length);
  return (overall * 0.7) + (glyphScore * 0.3);
}

export function rankValueTemplateCandidates(observed, candidates) {
  return (candidates || []).map((candidate) => ({
    ...candidate,
    score: scoreValueGlyphMasks(observed, candidate.mask),
  })).sort((left, right) => left.score - right.score || left.level - right.level);
}

export function scoreComposedValueGlyphMasks(observed, candidate) {
  if (!observed?.width || !observed?.height || !candidate?.width || !candidate?.height) return 1;
  return tolerantMaskScore(
    observed,
    resizeValueGlyphMask(candidate, observed.width, observed.height),
  );
}

export function rankComposedValueCandidates(observed, candidates) {
  return (candidates || []).map((candidate) => ({
    ...candidate,
    score: scoreComposedValueGlyphMasks(observed, candidate.mask),
  })).sort((left, right) => left.score - right.score || left.level - right.level);
}
