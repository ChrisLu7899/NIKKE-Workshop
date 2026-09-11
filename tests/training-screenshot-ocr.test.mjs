import test from "node:test";
import assert from "node:assert/strict";

import {
  enforceTrainingPageFieldExclusivity,
  isTrainingScreenshotResult,
  mergeTrainingOcrEntriesIntoDraft,
} from "../src/domain/trainingScreenshotOcr.js";
import {
  deriveIdentityRegionsFromRarityWordmark,
  countStars,
  findCoreBadge,
  findCubeStripeCandidates,
  findIdentityBar,
  isRarityWordmarkAnchor,
  recognizeAffection,
  recognizeCubeLevel,
  projectRarityWordmarkFromIdentityBar,
} from "../src/domain/trainingOcrCore.js";
import { recognizeTrainingDigit } from "../src/domain/trainingOcrDigits.js";
import * as classLevelField from "../src/domain/trainingOcrFields/classLevel.js";
import * as enterpriseLevelField from "../src/domain/trainingOcrFields/enterpriseLevel.js";
import * as limitBreakField from "../src/domain/trainingOcrFields/limitBreak.js";

const recognized = (field, value) => ({ field, status: "recognized", value, confidence: 0.9 });
const notVisible = (field) => ({ field, status: "not_visible", value: null, confidence: 0 });

function rgbaFixture(width, height, color = [28, 28, 28]) {
  const raw = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < raw.length; offset += 4) {
    raw[offset] = color[0];
    raw[offset + 1] = color[1];
    raw[offset + 2] = color[2];
    raw[offset + 3] = 255;
  }
  return raw;
}

function paintPixels(raw, width, left, top, rows, color = [220, 220, 220]) {
  rows.forEach((row, y) => [...row].forEach((pixel, x) => {
    if (pixel !== "#") return;
    const offset = (((top + y) * width) + left + x) * 4;
    raw[offset] = color[0];
    raw[offset + 1] = color[1];
    raw[offset + 2] = color[2];
  }));
}

test("core badge ranks its glyph only against legal core levels", () => {
  const rows = [
    ".....#####.", ".#########.", ".#########.", ".......###.",
    ".......###.", ".......###.", ".......###.", ".......###.",
    ".########..", ".#########.", ".##....####", ".......####",
    ".......####", ".......####", ".......####", "###########",
    "##########.", "#####......",
  ];
  const mask = Uint8Array.from(rows.flatMap((row) => [...row].map((pixel) => pixel === "#" ? 1 : 0)));
  assert.equal(recognizeTrainingDigit(mask, 11, 18).value, null);
  assert.equal(recognizeTrainingDigit(mask, 11, 18, { allowedValues: [1, 2, 3, 4, 5, 6, 7] }).value, 3);
});

test("cropped portrait screenshot uses the rarity-independent identity bar and treats three gray stars as zero breakthrough", async () => {
  const width = 561;
  const height = 902;
  const raw = rgbaFixture(width, height, [245, 245, 245]);
  paintPixels(raw, width, 83, 102, Array(94).fill("#".repeat(403)), [55, 55, 55]);
  const identityBar = findIdentityBar(raw, width, height);
  assert.ok(identityBar);
  const wordmark = projectRarityWordmarkFromIdentityBar(identityBar, width, height);

  const regions = deriveIdentityRegionsFromRarityWordmark(wordmark, width, height);
  const star = [
    "....#....", "...###...", "#########", ".#######.", "..#####..",
    ".#######.", ".##...##.", "#.......#",
  ];
  const scaledStar = star.flatMap((row) => Array(4).fill([...row].map((pixel) => pixel.repeat(4)).join("")));
  [0, 32, 64].forEach((offset) => paintPixels(raw, width, regions.stars.x + 50 + offset, regions.stars.y + 16, scaledStar, [135, 135, 135]));
  const stars = countStars(raw, width, regions.stars);
  assert.equal(stars.value, 0);

  const result = await limitBreakField.recognize({
    raw,
    width,
    anchors: { identityBar, rarityWordmark: wordmark, coreBadge: null },
    regions,
  });
  assert.equal(result.status, "recognized");
  assert.deepEqual(result.value, { stars: 0, core: 0, total: 0 });
});

test("练度 OCR 只覆盖成功识别的字段", () => {
  const existing = {
    level: 400,
    combat: 123456,
    affectionLevel: 30,
    skill1Level: 7,
    skill2Level: 8,
    burstSkillLevel: 9,
    limitBreak: { grade: 2, core: 0 },
  };
  const merged = mergeTrainingOcrEntriesIntoDraft(existing, [{
    fields: {
      characterLevel: recognized("characterLevel", 445),
      combatPower: notVisible("combatPower"),
      affection: recognized("affection", 40),
      skill1Level: notVisible("skill1Level"),
      skill2Level: recognized("skill2Level", 10),
    },
  }]);

  assert.equal(merged.level, 445);
  assert.equal(merged.combat, 123456);
  assert.equal(merged.affectionLevel, 40);
  assert.equal(merged.skill1Level, 7);
  assert.equal(merged.skill2Level, 10);
  assert.equal(merged.burstSkillLevel, 9);
  assert.deepEqual(merged.limitBreak, { grade: 2, core: 0 });
});

test("练度 OCR 可合并突破、珍藏品和魔方字段", () => {
  const merged = mergeTrainingOcrEntriesIntoDraft({}, [{
    fields: {
      limitBreak: recognized("limitBreak", { stars: 3, core: 1, total: 4 }),
      collectible: recognized("collectible", { rarity: "SR", color: "purple", stars: 3 }),
      cubeType: recognized("cubeType", { cubeId: 1000304, resourceId: 10004, nameCn: "战术巨熊魔方", nameEn: "Bastion Cube" }),
      cubeLevel: recognized("cubeLevel", 15),
    },
  }]);

  assert.deepEqual(merged.limitBreak, { grade: 3, core: 1 });
  assert.equal(merged.favoriteItemRarity, "SR");
  assert.equal(merged.favoriteItemLevel, null);
  assert.equal(merged.favoriteItemObservation.stars, 3);
  assert.equal(merged.cubeId, 1000304);
  assert.equal(merged.cubeResourceId, 10004);
  assert.equal(merged.cubeLevel, 15);
});

test("多张练度图冲突时保留同一真魔方页的种类与等级", () => {
  const result = (field, value, confidence, method) => ({
    field,
    value,
    confidence,
    status: "recognized",
    evidence: { method },
  });
  const merged = mergeTrainingOcrEntriesIntoDraft({}, [
    {
      fields: {
        cubeType: result("cubeType", { cubeId: 15, nameCn: "真实魔方" }, 0.8, "17-cube-icon-template-match"),
        cubeLevel: result("cubeLevel", 15, 0.72, "cube-card-level-glyphs"),
      },
    },
    {
      fields: {
        cubeType: result("cubeType", { cubeId: 4, nameCn: "误检候选" }, 0.9, "17-cube-icon-template-match"),
        cubeLevel: result("cubeLevel", 4, 0.9, "constrained-cube-level-ocr"),
      },
    },
  ]);

  assert.equal(merged.cubeId, 15);
  assert.equal(merged.cubeNameCn, "真实魔方");
  assert.equal(merged.cubeLevel, 15);
});

test("识别到技能页时排除同图中的魔方误检", () => {
  const fields = enforceTrainingPageFieldExclusivity({
    skill1Level: recognized("skill1Level", 10),
    skill2Level: recognized("skill2Level", 10),
    burstSkillLevel: recognized("burstSkillLevel", 10),
    cubeType: recognized("cubeType", { cubeId: 4 }),
    cubeLevel: recognized("cubeLevel", 4),
  });

  assert.equal(fields.skill1Level.status, "recognized");
  assert.equal(fields.cubeType.status, "not_visible");
  assert.equal(fields.cubeLevel.status, "not_visible");
});

test("识别到魔方字段时排除同图中的技能误检", () => {
  const fields = enforceTrainingPageFieldExclusivity({
    skill1Level: notVisible("skill1Level"),
    skill2Level: notVisible("skill2Level"),
    burstSkillLevel: notVisible("burstSkillLevel"),
    cubeType: recognized("cubeType", { cubeId: 15 }),
    cubeLevel: notVisible("cubeLevel"),
  });

  assert.equal(fields.cubeType.status, "recognized");
  assert.equal(fields.cubeLevel.status, "not_visible");
  assert.equal(fields.skill1Level.status, "not_visible");
  assert.equal(fields.skill2Level.status, "not_visible");
  assert.equal(fields.burstSkillLevel.status, "not_visible");
});

test("智能识别只把可靠练度结构判定为练度截图", () => {
  assert.equal(isTrainingScreenshotResult({ fields: { collectible: recognized("collectible", { rarity: "SR", stars: 3 }) } }), true);
  assert.equal(isTrainingScreenshotResult({ fields: { characterLevel: recognized("characterLevel", 616) } }), true);
  assert.equal(isTrainingScreenshotResult({ fields: {
    skill1Level: recognized("skill1Level", 10),
    skill2Level: recognized("skill2Level", 10),
  } }), true);
  assert.equal(isTrainingScreenshotResult({ fields: {
    cubeType: recognized("cubeType", { cubeId: 1000304 }),
    cubeLevel: recognized("cubeLevel", 15),
  } }), true);
});

test("landscape core-badge search ignores the central equipment upgrade badge", () => {
  const width = 1000;
  const height = 600;
  const raw = rgbaFixture(width, height, [245, 245, 245]);
  paintPixels(raw, width, 480, 120, Array(28).fill("#".repeat(28)), [170, 35, 150]);
  assert.equal(findCoreBadge(raw, width, height).badge, null);
  paintPixels(raw, width, 900, 120, Array(28).fill("#".repeat(28)), [170, 35, 150]);
  assert.ok(findCoreBadge(raw, width, height).badge);
});

test("魔方黄色横条定位会忽略上半区的 SSR 类似色块", () => {
  const width = 1000;
  const height = 1000;
  const raw = rgbaFixture(width, height);
  const stripe = Array(8).fill("#".repeat(40));
  paintPixels(raw, width, 730, 135, stripe, [220, 145, 40]);
  paintPixels(raw, width, 730, 735, stripe, [220, 145, 40]);

  const candidates = findCubeStripeCandidates({ raw, width, height });
  assert.equal(candidates.length, 1);
  assert.ok(candidates[0].stripe.y >= 735);
});

test("zero-core landscape screenshots derive identity regions from the SSR wordmark", () => {
  const detection = { confidence: "medium", bounds: { left: 2087, top: 292, width: 136, height: 47 } };
  assert.equal(isRarityWordmarkAnchor(detection, 2560, 1600), true);
  const regions = deriveIdentityRegionsFromRarityWordmark(detection.bounds, 2560, 1600);
  assert.ok(regions.level.x < regions.combatPower.x);
  assert.ok(regions.classLevel.x < regions.enterpriseLevel.x);
  assert.equal(regions.classLevel.width, 17);
  assert.equal(regions.enterpriseLevel.width, 14);
  assert.ok(regions.panel.x + regions.panel.width <= 2560);
});

test("研究等级在通用 OCR 失败后回退到固定字形识别", async () => {
  const width = 17;
  const height = 15;
  const classRaw = rgbaFixture(width, height, [245, 245, 245]);
  const enterpriseRaw = rgbaFixture(width, height, [245, 245, 245]);
  paintPixels(classRaw, width, 0, 0, [
    ".................", "..###..###.####..", ".##.#.#..###..#..", "....#.#..#....#..",
    "....#.##.#....#..", "...##.##.#...##..", "..#...##.#####...", ".##...##.###.....",
    ".##...##.###.....", ".##....#.###.....", ".####..###.###...",
  ], [20, 20, 20]);
  paintPixels(enterpriseRaw, width, 0, 0, [
    "....#............", "....#............", ".................", "..#...##...##....",
    "..##.#.##.#.##...", "...#.#..#.#..#...", "...#.#..#.#......", "...#.#.##.#......",
    "...#.###..###....", "...#.#.##.#..#...", "...#.#..#.#..#...", "...#.#..#.#..#...",
    "...#.#..#.#..#...", "...#.####.####...",
  ], [20, 20, 20]);
  const context = (raw, field) => ({
    raw,
    width,
    layout: "landscape",
    regions: { [field]: { x: 0, y: 0, width, height } },
    ocrResearchLevel: async () => ({ value: null, confidence: 0, note: "OCR 未识别" }),
  });
  assert.equal((await classLevelField.recognize(context(classRaw, "classLevel"))).value, 202);
  assert.equal((await enterpriseLevelField.recognize(context(enterpriseRaw, "enterpriseLevel"))).value, 186);
});

test("好感度优先读取心形内封闭的 10", () => {
  const width = 80;
  const height = 42;
  const raw = rgbaFixture(width, height, [220, 30, 40]);
  paintPixels(raw, width, 29, 29, Array(12).fill("#####"), [245, 245, 245]);
  paintPixels(raw, width, 38, 28, Array(13).fill("###############"), [245, 245, 245]);
  assert.equal(recognizeAffection(raw, width, { x: 0, y: 0, width, height }).value, 10);
});

test("cube level glyphs distinguish level 12 instead of hard-coding level 15", () => {
  const width = 180;
  const height = 160;
  const raw = rgbaFixture(width, height);
  const card = { x: 20, y: 20, width: 100, height: 105 };
  const boundsTop = Math.round(card.y + card.height * 0.3);
  paintPixels(raw, width, card.x + 7, boundsTop + 28, [
    "#######", "....###", "....###", "....###", "....###", "....###", "....###",
    "....###", "....###", "....###", "....###", "....###", "....###",
    "....###", "....###", "....###", "....###", "....###", "....###",
    "....###", "....###", "....###", "....###", "....###", "....###", "....###",
  ]);
  paintPixels(raw, width, card.x + 17, boundsTop + 28, [
    "##########", "##########", "##########", "##########", "##########",
    ".......###", ".......###", ".......###", ".......###", ".......###",
    "##########", "##########", "##########", "##########", "##########",
    "###.......", "###.......", "###.......", "###.......", "###.......", "###.......",
    "##########", "##########", "##########", "##########", "##########",
  ]);
  const result = recognizeCubeLevel({ raw, width, height }, card);
  assert.equal(result.value, 12);
});

test("cube level glyph tie-break recognizes the real level 15 stroke shape", () => {
  const width = 180;
  const height = 160;
  const raw = rgbaFixture(width, height);
  const card = { x: 20, y: 20, width: 100, height: 105 };
  const boundsTop = Math.round(card.y + card.height * 0.3);
  paintPixels(raw, width, card.x + 7, boundsTop + 28, [
    ".##...", "######", "..####", "..####", "...###", "...###", "...###",
    "...###", "...###", "...###", "...###", "...###", "...###", "...###",
    "...###", "...###", "...###", "...###", "...###", "...###", "...###", "...##.",
  ]);
  paintPixels(raw, width, card.x + 15, boundsTop + 29, [
    "#########.", "##########", "####...##.", "###.......", "###.....##", "###...####",
    "###....###", "###.......", "########..", ".########.", ".....####.", "......###.",
    "###...###.", ".##...###.", "......###.", ".#....###.", "###...###.", "###...###.",
    "###...###.", ".########.", ".########.", "....###...",
  ]);
  const result = recognizeCubeLevel({ raw, width, height }, card);
  assert.equal(result.value, 15);
});
