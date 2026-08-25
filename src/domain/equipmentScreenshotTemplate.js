// SPDX-License-Identifier: GPL-3.0-or-later
// 固定装备截图模板：先定位外层白色面板，再按面板宽度建立受约束识别区域。

export const EQUIPMENT_SCREENSHOT_TEMPLATE_VERSION = 3;

/**
 * OVERLOAD 标识与外层白色装备面板的固定几何关系。
 *
 * 游戏截图只会发生等比例缩放、平移和裁切，不会发生拉伸或透视变形。
 * 这些比例由满级、未满级以及两种游戏窗口尺寸的真实截图共同标定；
 * Logo 的红色像素边缘会受抗锯齿影响，因此保留约 1% 的边界细化空间。
 */
export const OVERLOAD_PANEL_GEOMETRY = Object.freeze({
  version: 1,
  overloadWidthRatio: 0.2114,
  overloadCenterXRatio: 0.4977,
  overloadTopOffsetRatio: 0.0394,
  panelAspectRatio: 1.688,
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function normalizeBounds(bounds) {
  const left = Math.round(Number(bounds?.left) || 0);
  const top = Math.round(Number(bounds?.top) || 0);
  const width = Math.max(1, Math.round(Number(bounds?.width) || 1));
  const height = Math.max(1, Math.round(Number(bounds?.height) || 1));
  return { left, top, width, height };
}

function rectWithinPanel(panel, { left, top, width, height }) {
  const panelRight = panel.left + panel.width;
  const panelBottom = panel.top + panel.height;
  const safeLeft = clamp(Math.round(left), panel.left, panelRight - 1);
  const safeTop = clamp(Math.round(top), panel.top, panelBottom - 1);
  return {
    left: safeLeft,
    top: safeTop,
    width: Math.max(1, Math.min(Math.round(width), panelRight - safeLeft)),
    height: Math.max(1, Math.min(Math.round(height), panelBottom - safeTop)),
  };
}

function clipRectToImage(rect, imageWidth, imageHeight) {
  const width = Math.max(1, Math.round(Number(imageWidth) || 1));
  const height = Math.max(1, Math.round(Number(imageHeight) || 1));
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const visibleLeft = clamp(rect.left, 0, width);
  const visibleTop = clamp(rect.top, 0, height);
  const visibleRight = clamp(right, 0, width);
  const visibleBottom = clamp(bottom, 0, height);
  const clippedEdges = {
    left: rect.left < 0,
    top: rect.top < 0,
    right: right > width,
    bottom: bottom > height,
  };
  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
    return {
      bounds: null,
      clippedEdges,
      visibleCoverage: 0,
    };
  }
  const bounds = {
    left: visibleLeft,
    top: visibleTop,
    width: visibleRight - visibleLeft,
    height: visibleBottom - visibleTop,
  };
  return {
    bounds,
    clippedEdges,
    visibleCoverage: (bounds.width * bounds.height) / (rect.width * rect.height),
  };
}

/**
 * 根据已经确认的 OVERLOAD Logo 包围框投影外层白色装备面板。
 *
 * `panelBounds` 是未受截图边缘影响的理论面板；`visibleBounds` 是限制到
 * 当前图片后的可见区域。调用方可通过 `clippedEdges` 和
 * `visibleCoverage` 决定是否需要用户确认，不能把被裁掉的内容视作已识别。
 */
export function projectEquipmentPanelFromOverload(
  rawOverloadBounds,
  { imageWidth, imageHeight, geometry = OVERLOAD_PANEL_GEOMETRY } = {},
) {
  const rawWidth = Number(rawOverloadBounds?.width);
  const rawHeight = Number(rawOverloadBounds?.height);
  if (!Number.isFinite(rawWidth) || rawWidth <= 0 || !Number.isFinite(rawHeight) || rawHeight <= 0) {
    return null;
  }
  const overload = normalizeBounds(rawOverloadBounds);
  const overloadWidthRatio = Number(geometry?.overloadWidthRatio);
  const overloadCenterXRatio = Number(geometry?.overloadCenterXRatio);
  const overloadTopOffsetRatio = Number(geometry?.overloadTopOffsetRatio);
  const panelAspectRatio = Number(geometry?.panelAspectRatio);
  if (
    !Number.isFinite(overloadWidthRatio) || overloadWidthRatio <= 0
    || !Number.isFinite(overloadCenterXRatio)
    || !Number.isFinite(overloadTopOffsetRatio)
    || !Number.isFinite(panelAspectRatio) || panelAspectRatio <= 0
  ) {
    return null;
  }

  const panelWidth = overload.width / overloadWidthRatio;
  const panelBounds = normalizeBounds({
    left: overload.left + (overload.width / 2) - (panelWidth * overloadCenterXRatio),
    top: overload.top - (panelWidth * overloadTopOffsetRatio),
    width: panelWidth,
    height: panelWidth * panelAspectRatio,
  });
  const hasImageBounds = Number.isFinite(Number(imageWidth))
    && Number(imageWidth) > 0
    && Number.isFinite(Number(imageHeight))
    && Number(imageHeight) > 0;
  const visible = hasImageBounds
    ? clipRectToImage(panelBounds, imageWidth, imageHeight)
    : {
      bounds: panelBounds,
      clippedEdges: { left: false, top: false, right: false, bottom: false },
      visibleCoverage: 1,
    };

  return {
    modelVersion: Number(geometry?.version) || 1,
    overloadBounds: overload,
    panelBounds,
    visibleBounds: visible.bounds,
    clippedEdges: visible.clippedEdges,
    visibleCoverage: visible.visibleCoverage,
  };
}

function maskRatio(mask, width, height, rawRect, excludedRect = null) {
  const left = clamp(Math.floor(rawRect.left), 0, width);
  const top = clamp(Math.floor(rawRect.top), 0, height);
  const right = clamp(Math.ceil(rawRect.left + rawRect.width), 0, width);
  const bottom = clamp(Math.ceil(rawRect.top + rawRect.height), 0, height);
  let matched = 0;
  let total = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (
        excludedRect
        && x >= excludedRect.left
        && x < excludedRect.left + excludedRect.width
        && y >= excludedRect.top
        && y < excludedRect.top + excludedRect.height
      ) {
        continue;
      }
      matched += mask[(y * width) + x] ? 1 : 0;
      total += 1;
    }
  }
  return total > 0 ? matched / total : 0;
}

function visibleRectArea(rect, width, height) {
  const left = clamp(Math.floor(rect.left), 0, width);
  const top = clamp(Math.floor(rect.top), 0, height);
  const right = clamp(Math.ceil(rect.left + rect.width), 0, width);
  const bottom = clamp(Math.ceil(rect.top + rect.height), 0, height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function measureProjectedPanelNeutrality(neutralMask, width, height, panel) {
  const unit = panel.width;
  const railTop = panel.top + (unit * 0.11);
  const railHeight = panel.height - (unit * 0.16);
  const leftRailRect = {
    left: panel.left + (unit * 0.025),
    top: railTop,
    width: unit * 0.055,
    height: railHeight,
  };
  const rightRailRect = {
    left: panel.left + (unit * 0.92),
    top: railTop,
    width: unit * 0.055,
    height: railHeight,
  };
  const leftArea = visibleRectArea(leftRailRect, width, height);
  const rightArea = visibleRectArea(rightRailRect, width, height);
  const visibleArea = leftArea + rightArea;
  if (visibleArea === 0) return 0;
  const leftRatio = maskRatio(neutralMask, width, height, leftRailRect);
  const rightRatio = maskRatio(neutralMask, width, height, rightRailRect);
  return ((leftRatio * leftArea) + (rightRatio * rightArea)) / visibleArea;
}

/**
 * 从 RGBA 像素中确认红色 OVERLOAD 标识。
 *
 * 主证据是固定的横向字形比例和红色像素密度；白色邻域以及由几何模型
 * 投影出的两侧面板亮度用于排除角色立绘、红色按钮和装备图标。返回中等
 * 置信候选供界面确认，但只有满足全部证据的候选会标记为 `high`。
 */
export function locateOverloadLogoFromRgba(rgba, width, height) {
  const imageWidth = Math.round(Number(width) || 0);
  const imageHeight = Math.round(Number(height) || 0);
  if (
    !rgba
    || imageWidth < 2
    || imageHeight < 2
    || rgba.length !== imageWidth * imageHeight * 4
  ) {
    return null;
  }

  const pixelCount = imageWidth * imageHeight;
  const redMask = new Uint8Array(pixelCount);
  const neutralMask = new Uint8Array(pixelCount);
  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += 4) {
    const red = rgba[offset];
    const green = rgba[offset + 1];
    const blue = rgba[offset + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    redMask[pixel] = red >= 165 && red - green >= 55 && red - blue >= 30 ? 1 : 0;
    neutralMask[pixel] = luminance >= 175 && maximum - minimum <= 70 ? 1 : 0;
  }

  // 字母之间存在窄缝。只做横向连接，避免把下方装备图标并入 Logo。
  const joinedMask = new Uint8Array(redMask);
  const horizontalJoin = Math.max(1, Math.min(3, Math.round(imageWidth / 400)));
  for (let y = 0; y < imageHeight; y += 1) {
    const rowStart = y * imageWidth;
    for (let x = 0; x < imageWidth; x += 1) {
      const index = rowStart + x;
      if (!redMask[index]) continue;
      for (let gap = 1; gap <= horizontalJoin; gap += 1) {
        if (x >= gap) joinedMask[index - gap] = 1;
        if (x + gap < imageWidth) joinedMask[index + gap] = 1;
      }
    }
  }

  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const minimumRedPixels = Math.max(18, Math.round(pixelCount * 0.000025));
  const minimumLogoWidth = Math.max(12, Math.round(imageWidth * 0.012));
  let best = null;

  for (let start = 0; start < pixelCount; start += 1) {
    if (!joinedMask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let redPixels = 0;
    let minX = imageWidth;
    let maxX = -1;
    let minY = imageHeight;
    let maxY = -1;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const current = queue[head++];
      const x = current % imageWidth;
      const y = Math.floor(current / imageWidth);
      if (redMask[current]) {
        redPixels += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      if (x > 0 && joinedMask[current - 1] && !visited[current - 1]) {
        visited[current - 1] = 1;
        queue[tail++] = current - 1;
      }
      if (x + 1 < imageWidth && joinedMask[current + 1] && !visited[current + 1]) {
        visited[current + 1] = 1;
        queue[tail++] = current + 1;
      }
      if (y > 0 && joinedMask[current - imageWidth] && !visited[current - imageWidth]) {
        visited[current - imageWidth] = 1;
        queue[tail++] = current - imageWidth;
      }
      if (
        y + 1 < imageHeight
        && joinedMask[current + imageWidth]
        && !visited[current + imageWidth]
      ) {
        visited[current + imageWidth] = 1;
        queue[tail++] = current + imageWidth;
      }
    }

    if (redPixels < minimumRedPixels || maxX < minX || maxY < minY) continue;
    const bounds = {
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
    const aspectRatio = bounds.width / bounds.height;
    if (
      bounds.width < minimumLogoWidth
      || bounds.height < 4
      || aspectRatio < 2.3
      || aspectRatio > 4.8
    ) {
      continue;
    }
    const redFillRatio = redPixels / (bounds.width * bounds.height);
    if (redFillRatio < 0.28) continue;
    const whiteHaloRatio = maskRatio(neutralMask, imageWidth, imageHeight, {
      left: bounds.left - (bounds.width * 0.35),
      top: bounds.top - (bounds.height * 0.5),
      width: bounds.width * 1.7,
      height: bounds.height * 1.75,
    }, bounds);
    if (whiteHaloRatio < 0.55) continue;
    const projection = projectEquipmentPanelFromOverload(bounds, {
      imageWidth,
      imageHeight,
    });
    if (!projection?.visibleBounds) continue;
    const panelNeutralRatio = measureProjectedPanelNeutrality(
      neutralMask,
      imageWidth,
      imageHeight,
      projection.panelBounds,
    );
    const aspectScore = clamp(1 - (Math.abs(aspectRatio - 3.35) / 1.45), 0, 1);
    const fillScore = clamp(1 - (Math.abs(redFillRatio - 0.75) / 0.42), 0, 1);
    const score = (aspectScore * 0.32)
      + (fillScore * 0.26)
      + (whiteHaloRatio * 0.22)
      + (panelNeutralRatio * 0.2);
    if (!best || score > best.score) {
      best = {
        bounds,
        score,
        projection,
        evidence: {
          aspectRatio,
          redFillRatio,
          whiteHaloRatio,
          panelNeutralRatio,
        },
      };
    }
  }

  if (!best || best.score < 0.68) return null;
  return {
    ...best,
    confidence: best.score >= 0.88
      && best.evidence.whiteHaloRatio >= 0.78
      && best.evidence.panelNeutralRatio >= 0.72
      ? "high"
      : "medium",
  };
}

/**
 * 根据已经定位的白色装备面板生成固定 ROI。
 *
 * 纵向 UI 会随游戏窗口比例略有压缩，因此顶部资料区、底部词条区分别
 * 锚定到面板顶部和底部；所有尺寸均以面板宽度缩放，避免整图留白影响。
 */
export function createEquipmentRecognitionRegions(rawPanelBounds, { effectRowCenters = [] } = {}) {
  const panel = normalizeBounds(rawPanelBounds);
  const unit = panel.width;
  const fromTop = (x, y, width, height) => rectWithinPanel(panel, {
    left: panel.left + (unit * x),
    top: panel.top + (unit * y),
    width: unit * width,
    height: unit * height,
  });
  const fromBottom = (x, bottomOffset, width, height) => rectWithinPanel(panel, {
    left: panel.left + (unit * x),
    top: panel.top + panel.height - (unit * bottomOffset),
    width: unit * width,
    height: unit * height,
  });

  const equipmentIcon = fromTop(0.39, 0.13, 0.22, 0.23);
  const equipmentName = fromTop(0.27, 0.38, 0.46, 0.08);
  const slotLabel = fromTop(0.035, 0.10, 0.23, 0.08);
  const rowHeight = 0.054;
  const rowStep = 0.0645;
  const firstRowBottomOffset = 0.405;
  const hasLocatedRows = effectRowCenters.length === 3
    && effectRowCenters.every((center) => Number.isFinite(Number(center)));
  const effectRows = Array.from({ length: 3 }, (_, index) => {
    const bottomOffset = firstRowBottomOffset - (rowStep * index);
    const locatedCenter = hasLocatedRows ? Number(effectRowCenters[index]) : null;
    const fromLocatedCenter = (x, width) => rectWithinPanel(panel, {
      left: panel.left + (unit * x),
      top: locatedCenter - ((unit * rowHeight) / 2),
      width: unit * width,
      height: unit * rowHeight,
    });
    const makeRegion = (x, width) => (
      locatedCenter === null
        ? fromBottom(x, bottomOffset, width, rowHeight)
        : fromLocatedCenter(x, width)
    );
    return {
      position: index + 1,
      full: makeRegion(0.075, 0.865),
      label: makeRegion(0.075, 0.47),
      value: makeRegion(0.525, 0.285),
      lock: makeRegion(0.815, 0.125),
    };
  });

  return {
    templateVersion: EQUIPMENT_SCREENSHOT_TEMPLATE_VERSION,
    panel,
    equipmentIcon,
    equipmentName,
    slotLabel,
    effectRows,
  };
}

/**
 * 从装备面板右侧锁图标列的逐行暗像素分数中定位三条效果栏中心。
 *
 * 锁图标与词条同行，并且不受截图底部是否出现“LV 升级”等额外区域影响。
 * 满级装备有三枚锁图标；未满级装备的“未获得效果”行没有锁图标，因此也
 * 支持用前两枚锁图标和固定栏距推导第三行。底部升级按钮不会参与推导。
 */
export function locateEquipmentEffectRowCenters(
  rowScores,
  { panelWidth, minimumScore = 5 } = {},
) {
  const width = Math.max(1, Number(panelWidth) || 1);
  if (!Array.isArray(rowScores) || rowScores.length === 0) return [];
  const runs = [];
  let current = [];
  rowScores.forEach((entry) => {
    const y = Number(entry?.y);
    const score = Number(entry?.score) || 0;
    if (Number.isFinite(y) && score >= minimumScore) {
      if (current.length && y > current[current.length - 1].y + 1) {
        runs.push(current);
        current = [];
      }
      current.push({ y, score });
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  });
  if (current.length) runs.push(current);

  const candidates = runs
    .filter((run) => run.length >= 2)
    .map((run) => {
      const total = run.reduce((sum, entry) => sum + entry.score, 0);
      return {
        center: run.reduce((sum, entry) => sum + (entry.y * entry.score), 0) / total,
        strength: total,
        height: run[run.length - 1].y - run[0].y + 1,
      };
    })
    .filter((candidate) => candidate.height <= width * 0.07)
    .sort((left, right) => left.center - right.center);

  const expectedStep = width * 0.0645;
  let best = null;
  for (let first = 0; first < candidates.length - 2; first += 1) {
    for (let second = first + 1; second < candidates.length - 1; second += 1) {
      for (let third = second + 1; third < candidates.length; third += 1) {
        const selected = [candidates[first], candidates[second], candidates[third]];
        const firstGap = selected[1].center - selected[0].center;
        const secondGap = selected[2].center - selected[1].center;
        const maximumDeviation = Math.max(
          Math.abs(firstGap - expectedStep),
          Math.abs(secondGap - expectedStep),
        );
        if (maximumDeviation > expectedStep * 0.38) continue;
        const spacingPenalty = (
          Math.abs(firstGap - expectedStep)
          + Math.abs(secondGap - expectedStep)
          + Math.abs(firstGap - secondGap)
        ) / expectedStep;
        const strengthBonus = Math.log1p(selected.reduce((sum, item) => sum + item.strength, 0));
        const score = spacingPenalty - (strengthBonus * 0.02);
        if (!best || score < best.score) best = { score, selected };
      }
    }
  }
  if (best) return best.selected.map((candidate) => candidate.center);

  // 未满级装备只有前两行存在锁图标。选择间距最接近模板行距的一对，
  // 然后按两行的实际间距推导“未获得效果”所在的第三行中心。
  let bestPair = null;
  for (let first = 0; first < candidates.length - 1; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      const firstCandidate = candidates[first];
      const secondCandidate = candidates[second];
      const gap = secondCandidate.center - firstCandidate.center;
      const deviation = Math.abs(gap - expectedStep);
      if (deviation > expectedStep * 0.38) continue;
      const strengthBonus = Math.log1p(firstCandidate.strength + secondCandidate.strength);
      const score = (deviation / expectedStep) - (strengthBonus * 0.02);
      if (!bestPair || score < bestPair.score) {
        bestPair = { score, firstCandidate, secondCandidate, gap };
      }
    }
  }
  if (!bestPair) return [];
  const inferredThird = bestPair.secondCandidate.center + bestPair.gap;
  const maximumY = Math.max(...rowScores.map((entry) => Number(entry?.y) || 0));
  if (inferredThird > maximumY) return [];
  return [bestPair.firstCandidate.center, bestPair.secondCandidate.center, inferredThird];
}

/**
 * 在下采样后的“亮、低饱和”布尔掩码中查找最大的白色装备面板。
 * 返回值仍是掩码坐标，由调用方映射回原图。
 */
export function locateLargestEquipmentPanel(mask, width, height) {
  if (!mask || mask.length !== width * height || width < 2 || height < 2) return null;
  const visited = new Uint8Array(mask.length);
  let best = null;
  const queue = new Int32Array(mask.length);
  // 完整 16:9 游戏截图里，装备弹窗宽度通常只有约 28%。旧规则要求
  // 至少占原图 50%，会在识别开始前直接排除正确候选。这里使用能覆盖
  // 完整截图、局部截图和轻度边缘裁切的下限，后续仍由面积与形状评分
  // 选择最可信的亮色面板。
  const minimumWidth = Math.max(32, width * 0.16);
  const minimumHeight = Math.max(48, height * 0.38);

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (head < tail) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ];
      neighbors.forEach((next) => {
        if (next >= 0 && mask[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      });
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    if (componentWidth < minimumWidth || componentHeight < minimumHeight) continue;
    const boundingArea = componentWidth * componentHeight;
    const fillRatio = count / boundingArea;
    const coverage = boundingArea / (width * height);
    // 备用亮色定位只会返回“需要确认”，不能再用 35% 整图覆盖率提前
    // 排除完整宽屏截图中约占 20%～25% 的真实面板。
    if (fillRatio < 0.35 || coverage < 0.08) continue;
    const score = count * (1 + coverage);
    if (!best || score > best.score) {
      best = {
        left: minX,
        top: minY,
        width: componentWidth,
        height: componentHeight,
        fillRatio,
        coverage,
        score,
      };
    }
  }

  return best;
}
