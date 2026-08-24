// SPDX-License-Identifier: GPL-3.0-or-later
// 固定装备截图模板：先定位外层白色面板，再按面板宽度建立受约束识别区域。

export const EQUIPMENT_SCREENSHOT_TEMPLATE_VERSION = 3;

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
  const minimumWidth = width * 0.5;
  const minimumHeight = height * 0.55;

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
    if (fillRatio < 0.35 || coverage < 0.35) continue;
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
