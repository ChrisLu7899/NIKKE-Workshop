// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  createEquipmentRecognitionRegions,
  locateEquipmentEffectRowCenters,
  locateLargestEquipmentPanel,
} from "../src/domain/equipmentScreenshotTemplate.js";

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

test("two lock icons infer the trailing unearned-effect row on unleveled equipment", () => {
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
