import test from 'node:test';
import assert from 'node:assert/strict';

import { locateLargestEquipmentPanel } from '../src/domain/equipmentScreenshotTemplate.js';

function makeMask(width, height, panel, noise = []) {
  const mask = new Uint8Array(width * height);
  const fill = ({ x, y, w, h }) => {
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy += 1) {
      for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx += 1) {
        mask[yy * width + xx] = 1;
      }
    }
  };
  fill(panel);
  noise.forEach(fill);
  return mask;
}

function assertContains(actual, expected, tolerance = 2) {
  assert.ok(actual, '应找到装备弹窗');
  assert.ok(actual.left <= expected.x + tolerance);
  assert.ok(actual.top <= expected.y + tolerance);
  assert.ok(actual.left + actual.width >= expected.x + expected.w - tolerance);
  assert.ok(actual.top + actual.height >= expected.y + expected.h - tolerance);
}

test('完整宽屏截图中可定位约 28% 宽的装备弹窗', () => {
  const width = 800;
  const height = 462;
  const panel = { x: 286, y: 31, w: 226, h: 397 };
  const mask = makeMask(width, height, panel, [
    { x: 18, y: 20, w: 54, h: 18 },
    { x: 688, y: 292, w: 70, h: 34 },
  ]);
  assertContains(locateLargestEquipmentPanel(mask, width, height), panel);
});

test('未满级装备底部增高时仍定位完整弹窗', () => {
  const width = 800;
  const height = 462;
  const panel = { x: 286, y: 31, w: 226, h: 420 };
  const mask = makeMask(width, height, panel);
  assertContains(locateLargestEquipmentPanel(mask, width, height), panel);
});

test('偏移、缩放和边缘裁切变体仍优先选择装备弹窗', () => {
  const variants = [
    { width: 720, height: 462, panel: { x: 228, y: 24, w: 226, h: 410 } },
    { width: 640, height: 420, panel: { x: 172, y: 16, w: 210, h: 388 } },
    { width: 520, height: 390, panel: { x: 64, y: 6, w: 214, h: 378 } },
    { width: 360, height: 390, panel: { x: 0, y: 8, w: 205, h: 374 } },
  ];
  for (const variant of variants) {
    const mask = makeMask(variant.width, variant.height, variant.panel, [
      { x: variant.width - 48, y: 20, w: 32, h: 18 },
    ]);
    assertContains(
      locateLargestEquipmentPanel(mask, variant.width, variant.height),
      variant.panel,
    );
  }
});
