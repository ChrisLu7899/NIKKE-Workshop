import assert from "node:assert/strict";
import test from "node:test";

import {
  RECOMMENDATION_PRESETS,
  RECOMMENDATION_PRESET_GROUPS,
  getRecommendationPreset,
  listRecommendationAdvice,
  mergeRecommendationAdvice,
  recommendationCollectionId,
} from "../src/data/recommendationPresets.js";
import { normalizeLineupPresetTitle } from "../src/data/recommendationLineupPresets.js";

test("recognized recommendation groups keep their expected sizes and source order", () => {
  assert.deepEqual(
    RECOMMENDATION_PRESETS.map(({ name, items }) => [name, items.length]),
    [
      ["版本推图阵容", 8],
      ["克拉肯全自动9阶", 7],
      ["克拉肯9阶", 5],
      ["过激派9阶", 5],
      ["死神9阶", 5],
      ["镜像容器9阶", 5],
      ["茵迪维利亚9阶", 7],
      ["1阶段减减冷却角色", 8],
      ["灵活搭配辅助", 10],
      ["双子辅助", 10],
      ["燃烧代码主C", 10],
      ["水冷代码主C", 10],
      ["风压代码主C", 10],
      ["电击代码主C", 11],
      ["铁甲代码主C", 10],
      ["极乐净土塔", 5],
      ["泰特拉塔", 5],
      ["米西利斯塔", 4],
      ["朝圣者/超标准塔", 5],
      ["霰弹队", 6],
      ["暴击队", 2],
    ],
  );
});

test("recommendation groups expose non-selectable display sections in the requested order", () => {
  assert.deepEqual(
    RECOMMENDATION_PRESET_GROUPS.map(({ name, presetIds }) => [name, presetIds]),
    [
      ["推图阵容", ["version-campaign-lineup"]],
      ["异常拦截", ["kraken-auto-stage-9", "kraken-stage-9", "radical-stage-9", "harvester-stage-9", "mirror-container-stage-9", "indivilia-stage-9"]],
      ["辅助角色", ["stage-one-cooldown", "flexible-support", "paired-support"]],
      ["个突主C", ["fire-main-c", "water-main-c", "wind-main-c", "electric-main-c", "iron-main-c"]],
      ["企业塔", ["elysion-tower", "tetra-tower", "missilis-tower", "pilgrim-overspec-tower"]],
      ["其他", ["shotgun-team", "critical-team"]],
    ],
  );
});

test("lineup headings are normalized from recognized image titles", () => {
  assert.equal(normalizeLineupPresetTitle(" 镜像容器9阶（伤害溢出不用打水晶鞋了） "), "镜像容器9阶");
  assert.equal(normalizeLineupPresetTitle("朝圣者 / 超标准塔"), "朝圣者/超标准塔");
  assert.equal(normalizeLineupPresetTitle("克拉肯9阶："), "克拉肯9阶");
});

test("corrected avatar identities keep their verified name codes and source order", () => {
  const expectedCodesById = {
    "stage-one-cooldown": ["5169", "5137", "1021", "5011", "5049", "5129", "5158", "5110"],
    "flexible-support": ["5065", "5155", "5007", "5126", "5151", "5160", "5021", "5125", "5116", "5098"],
    "water-main-c": ["5161", "5145", "5066", "5007", "5122", "5018", "5146", "5103", "5128", "5121"],
    "wind-main-c": ["5105", "5156", "5155", "5133", "5177", "5174", "5163", "5132", "1019", "5178"],
    "electric-main-c": ["5170", "5124", "5152", "5140", "5013", "5045", "5127", "5097", "5077", "5134", "5041"],
    "iron-main-c": ["5175", "5129", "5176", "5143", "5142", "5150", "5012", "5101", "5164", "5165"],
    "shotgun-team": ["5081", "5145", "5002", "5167", "5024", "5158"],
    "version-campaign-lineup": ["5169", "5065", "5175", "5161", "5007", "5155", "5129", "5066"],
    "radical-stage-9": ["5169", "5065", "5175", "5129", "5130"],
    "harvester-stage-9": ["5169", "5065", "5161", "5066", "5007"],
    "mirror-container-stage-9": ["5169", "5065", "5170", "5066", "5007"],
    "indivilia-stage-9": ["5169", "5065", "5129", "5066", "5130", "5155", "5007"],
    "tetra-tower": ["5169", "5172", "5173", "1021", "5004"],
  };

  for (const [id, expectedCodes] of Object.entries(expectedCodesById)) {
    const preset = RECOMMENDATION_PRESETS.find((entry) => entry.id === id);
    assert.ok(preset, `missing recommendation preset ${id}`);
    assert.deepEqual(preset.items.map((entry) => entry.nameCode), expectedCodes, preset.name);
  }
});

test("recognized recommendation entries use unique stable codes and complete fields", () => {
  for (const preset of RECOMMENDATION_PRESETS) {
    const codes = preset.items.map((entry) => entry.nameCode);
    assert.equal(new Set(codes).size, codes.length);
    for (const entry of preset.items) {
      for (const key of ["nameCode", "name", "note", "equipment", "lines", "skills", "cube", "collectible"]) {
        assert.ok(String(entry[key] || "").trim(), `${preset.name} / ${entry.name || entry.nameCode} missing ${key}`);
      }
    }
    assert.equal(getRecommendationPreset(recommendationCollectionId(preset.id)), preset);
  }
});

test("character advice includes cultivation data, prefers the active preset, and ignores avatar-only lineups", () => {
  const privatyAdvice = listRecommendationAdvice("5007", recommendationCollectionId("water-main-c"));
  assert.deepEqual(privatyAdvice.map(({ presetId }) => presetId), ["water-main-c", "flexible-support"]);
  assert.equal(privatyAdvice[0].lines, "无装弹、攻击、优越（优越和攻击收益接近）");
  assert.deepEqual(mergeRecommendationAdvice(privatyAdvice), {
    note: "2级；可以轴外，很好用",
    equipment: "4T10，头手甲升级",
    lines: "无装弹、攻击、优越（优越和攻击收益接近）",
    skills: "10/10/7+",
    cube: "遗迹巨熊",
    collectible: "珍藏品3阶",
  });

  const campaignOnlyCharacter = listRecommendationAdvice("5175", recommendationCollectionId("version-campaign-lineup"));
  assert.deepEqual(campaignOnlyCharacter.map(({ presetId }) => presetId), ["iron-main-c"]);

  assert.deepEqual(listRecommendationAdvice("missing-character"), []);
});
