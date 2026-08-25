// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  OVERLOAD_PANEL_GEOMETRY,
  createEquipmentRecognitionRegions,
  locateEquipmentEffectRowCenters,
  locateLargestEquipmentPanel,
  locateOverloadLogoFromRgba,
  projectEquipmentPanelFromOverload,
} from "../src/domain/equipmentScreenshotTemplate.js";

function intersectionOverUnion(left, right) {
  const intersectionLeft = Math.max(left.left, right.left);
  const intersectionTop = Math.max(left.top, right.top);
  const intersectionRight = Math.min(left.left + left.width, right.left + right.width);
  const intersectionBottom = Math.min(left.top + left.height, right.top + right.height);
  const intersection = Math.max(0, intersectionRight - intersectionLeft)
    * Math.max(0, intersectionBottom - intersectionTop);
  const union = (left.width * left.height) + (right.width * right.height) - intersection;
  return union > 0 ? intersection / union : 0;
}

function clipRect(rect, width, height) {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(width, rect.left + rect.width);
  const bottom = Math.min(height, rect.top + rect.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function createRgbaFixture(width, height, color = [48, 48, 48]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function paintRect(pixels, imageWidth, imageHeight, rect, color) {
  const left = Math.max(0, Math.floor(rect.left));
  const top = Math.max(0, Math.floor(rect.top));
  const right = Math.min(imageWidth, Math.ceil(rect.left + rect.width));
  const bottom = Math.min(imageHeight, Math.ceil(rect.top + rect.height));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = ((y * imageWidth) + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
}

function paintOverloadWord(pixels, imageWidth, imageHeight, bounds) {
  const letterWidth = 5;
  const gap = 1;
  for (let letter = 0; letter < 8; letter += 1) {
    paintRect(pixels, imageWidth, imageHeight, {
      left: bounds.left + (letter * (letterWidth + gap)),
      top: bounds.top,
      width: letterWidth,
      height: bounds.height,
    }, [244, 24, 52]);
  }
}

test("OVERLOAD detector prefers the red wordmark on its projected white panel", () => {
  const width = 800;
  const height = 462;
  const pixels = createRgbaFixture(width, height);
  const panel = { left: 289, top: 36, width: 222, height: 375 };
  const overload = { left: 376, top: 45, width: 47, height: 14 };
  paintRect(pixels, width, height, panel, [242, 242, 242]);
  paintOverloadWord(pixels, width, height, overload);
  // 背景红条和面板内的红色装备图标都不能胜过真正的横向字标。
  paintRect(pixels, width, height, { left: 650, top: 80, width: 52, height: 15 }, [240, 20, 40]);
  paintRect(pixels, width, height, { left: 382, top: 72, width: 36, height: 28 }, [220, 50, 90]);

  const located = locateOverloadLogoFromRgba(pixels, width, height);
  assert.ok(located);
  assert.equal(located.confidence, "high");
  assert.deepEqual(located.bounds, overload);
  assert.ok(intersectionOverUnion(located.projection.visibleBounds, panel) >= 0.98);
});

test("OVERLOAD detector does not mark a red word without panel structure as high confidence", () => {
  const width = 480;
  const height = 320;
  const pixels = createRgbaFixture(width, height);
  const overload = { left: 210, top: 40, width: 47, height: 14 };
  paintRect(pixels, width, height, { left: 190, top: 30, width: 90, height: 40 }, [242, 242, 242]);
  paintOverloadWord(pixels, width, height, overload);
  const located = locateOverloadLogoFromRgba(pixels, width, height);
  assert.ok(!located || located.confidence === "medium");
});

test("OVERLOAD geometry projects the same panel for max-level and upgradable equipment", () => {
  const fixtures = [
    {
      image: { width: 2334, height: 1349 },
      overload: { left: 1096, top: 133, width: 138, height: 40 },
      panel: { left: 842, top: 108, width: 648, height: 1091 },
    },
    {
      image: { width: 2334, height: 1349 },
      overload: { left: 1096, top: 136, width: 138, height: 39 },
      panel: { left: 842, top: 111, width: 648, height: 1086 },
    },
  ];
  fixtures.forEach((fixture) => {
    const projected = projectEquipmentPanelFromOverload(fixture.overload, {
      imageWidth: fixture.image.width,
      imageHeight: fixture.image.height,
    });
    assert.ok(projected);
    assert.ok(intersectionOverUnion(projected.visibleBounds, fixture.panel) >= 0.97);
    assert.equal(projected.clippedEdges.left, false);
    assert.equal(projected.clippedEdges.bottom, false);
  });
});

test("OVERLOAD geometry remains stable across a second game resolution", () => {
  const projected = projectEquipmentPanelFromOverload(
    { left: 1193, top: 114, width: 167, height: 48 },
    { imageWidth: 2560, imageHeight: 1600 },
  );
  const expected = { left: 881, top: 82, width: 796, height: 1350 };
  assert.ok(intersectionOverUnion(projected.visibleBounds, expected) >= 0.97);
  assert.equal(projected.modelVersion, OVERLOAD_PANEL_GEOMETRY.version);
});

test("OVERLOAD geometry preserves visible panel bounds through scaling, offsets, and crops", () => {
  const baseLogo = { left: 1096, top: 133, width: 138, height: 40 };
  const basePanel = { left: 842, top: 108, width: 648, height: 1091 };
  const scales = [0.5, 0.75, 1, 1.25, 1.5];
  const crops = [
    { left: 0, top: 0, width: 2334, height: 1349 },
    { left: 120, top: 0, width: 2050, height: 1349 },
    { left: 0, top: 80, width: 2334, height: 1180 },
    { left: 760, top: 90, width: 1300, height: 1160 },
    { left: 860, top: 120, width: 1180, height: 1080 },
    { left: 940, top: 125, width: 1000, height: 1030 },
  ];
  let checked = 0;
  scales.forEach((scale) => {
    crops.forEach((crop) => {
      const transform = (rect) => ({
        left: (rect.left - crop.left) * scale,
        top: (rect.top - crop.top) * scale,
        width: rect.width * scale,
        height: rect.height * scale,
      });
      const imageWidth = crop.width * scale;
      const imageHeight = crop.height * scale;
      const expectedVisible = clipRect(transform(basePanel), imageWidth, imageHeight);
      const projected = projectEquipmentPanelFromOverload(transform(baseLogo), {
        imageWidth,
        imageHeight,
      });
      assert.ok(expectedVisible);
      assert.ok(projected.visibleBounds);
      assert.ok(intersectionOverUnion(projected.visibleBounds, expectedVisible) >= 0.95);
      assert.ok(projected.visibleCoverage > 0 && projected.visibleCoverage <= 1);
      checked += 1;
    });
  });
  assert.equal(checked, 30);
});

test("OVERLOAD geometry rejects invalid logo bounds", () => {
  assert.equal(projectEquipmentPanelFromOverload(null), null);
  assert.equal(projectEquipmentPanelFromOverload({ width: 0, height: 40 }), null);
  assert.equal(projectEquipmentPanelFromOverload({ width: 138, height: 0 }), null);
});

test("the largest bright connected region locates the outer equipment panel despite text holes", () => {
  const width = 100;
  const height = 160;
  const mask = new Uint8Array(width * height);
  for (let y = 6; y < 154; y += 1) {
    for (let x = 8; x < 92; x += 1) mask[(y * width) + x] = 1;
  }
  // 模拟文字、图标和三条深色词条造成的孔洞，外层面板仍应保持连通。
  for (let y = 20; y < 35; y += 1) {
    for (let x = 35; x < 65; x += 1) mask[(y * width) + x] = 0;
  }
  for (let row = 0; row < 3; row += 1) {
    for (let y = 116 + (row * 9); y < 121 + (row * 9); y += 1) {
      for (let x = 15; x < 85; x += 1) mask[(y * width) + x] = 0;
    }
  }
  const panel = locateLargestEquipmentPanel(mask, width, height);
  assert.equal(panel.left, 8);
  assert.equal(panel.top, 6);
  assert.equal(panel.width, 84);
  assert.equal(panel.height, 148);
  assert.ok(panel.coverage > 0.75);
});

test("fixed template regions stay inside the detected panel and preserve three physical rows", () => {
  const regions = createEquipmentRecognitionRegions({ left: 12, top: 10, width: 651, height: 1096 });
  assert.deepEqual(regions.effectRows.map((row) => row.position), [1, 2, 3]);
  assert.ok(regions.equipmentIcon.top < regions.equipmentName.top);
  assert.ok(regions.effectRows[0].full.top < regions.effectRows[1].full.top);
  assert.ok(regions.effectRows[1].full.top < regions.effectRows[2].full.top);
  const panelRight = regions.panel.left + regions.panel.width;
  const panelBottom = regions.panel.top + regions.panel.height;
  [
    regions.equipmentIcon,
    regions.equipmentName,
    regions.slotLabel,
    ...regions.effectRows.flatMap((row) => [row.full, row.label, row.value, row.lock]),
  ].forEach((rect) => {
    assert.ok(rect.left >= regions.panel.left);
    assert.ok(rect.top >= regions.panel.top);
    assert.ok(rect.left + rect.width <= panelRight);
    assert.ok(rect.top + rect.height <= panelBottom);
  });
});

test("lock-column row centers override bottom anchoring when the panel has an extra footer", () => {
  const panel = { left: 8, top: 140, width: 694, height: 1230 };
  const centers = [1045, 1090, 1135];
  const regions = createEquipmentRecognitionRegions(panel, { effectRowCenters: centers });
  regions.effectRows.forEach((row, index) => {
    const actualCenter = row.full.top + (row.full.height / 2);
    assert.ok(Math.abs(actualCenter - centers[index]) <= 1);
  });
});

test("three evenly spaced lock-icon runs are selected from unrelated dark controls", () => {
  const scores = [];
  const addRun = (start, end, score) => {
    for (let y = start; y <= end; y += 1) scores.push({ y, score });
    scores.push({ y: end + 1, score: 0 });
  };
  addRun(720, 750, 20); // unrelated dark block
  addRun(790, 824, 30);
  addRun(833, 867, 28);
  addRun(876, 910, 29);
  addRun(940, 975, 35); // unrelated footer button
  scores.sort((left, right) => left.y - right.y);
  const centers = locateEquipmentEffectRowCenters(scores, {
    panelWidth: 666,
    minimumScore: 5,
  });
  assert.equal(centers.length, 3);
  assert.ok(Math.abs(centers[0] - 807) < 1);
  assert.ok(Math.abs(centers[1] - 850) < 1);
  assert.ok(Math.abs(centers[2] - 893) < 1);
});

test("two adjacent lock icons infer the trailing unearned-effect row", () => {
  const scores = [];
  const addRun = (start, end, score) => {
    for (let y = start; y <= end; y += 1) scores.push({ y, score });
    scores.push({ y: end + 1, score: 0 });
  };
  addRun(790, 824, 30);
  addRun(833, 867, 28);
  // “LV 升级”是更靠下且更高的深色控件，不应被当成第三条效果栏。
  addRun(930, 990, 40);
  scores.push({ y: 1040, score: 0 });
  scores.sort((left, right) => left.y - right.y);
  const centers = locateEquipmentEffectRowCenters(scores, {
    panelWidth: 666,
    minimumScore: 5,
  });
  assert.equal(centers.length, 3);
  assert.ok(Math.abs(centers[0] - 807) < 1);
  assert.ok(Math.abs(centers[1] - 850) < 1);
  assert.ok(Math.abs(centers[2] - 893) < 1);
});

test("two separated lock icons infer an unearned-effect row in the middle", () => {
  const scores = [];
  const addRun = (start, end, score) => {
    for (let y = start; y <= end; y += 1) scores.push({ y, score });
    scores.push({ y: end + 1, score: 0 });
  };
  addRun(790, 824, 30);
  addRun(876, 910, 29);
  addRun(940, 995, 40); // unrelated footer button
  scores.push({ y: 1040, score: 0 });
  scores.sort((left, right) => left.y - right.y);
  const centers = locateEquipmentEffectRowCenters(scores, {
    panelWidth: 666,
    minimumScore: 5,
  });
  assert.equal(centers.length, 3);
  assert.ok(Math.abs(centers[0] - 807) < 1);
  assert.ok(Math.abs(centers[1] - 850) < 1);
  assert.ok(Math.abs(centers[2] - 893) < 1);
});
