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
      ["版本推图阵容", 5],
      ["克拉肯9阶", 8],
      ["过激派9阶", 5],
      ["死神9阶", 5],
      ["镜像容器9阶", 5],
      ["茵迪维利亚9阶", 5],
      ["1阶段减减冷却角色", 8],
      ["灵活搭配辅助", 11],
      ["双子辅助", 10],
      ["燃烧代码主C", 7],
      ["水冷代码主C", 12],
      ["风压代码主C", 11],
      ["电击代码主C", 9],
      ["铁甲代码主C", 10],
      ["极乐净土塔", 5],
      ["泰特拉塔", 5],
      ["米西利斯塔", 5],
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
      ["异常拦截", ["kraken-stage-9", "radical-stage-9", "harvester-stage-9", "mirror-container-stage-9", "indivilia-stage-9"]],
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
    "flexible-support": ["5065", "5155", "5007", "5126", "5151", "5160", "5021", "5125", "5116", "5098", "5165"],
    "fire-main-c": ["5185", "5186", "5129", "5180", "5159", "5138", "5179"],
    "water-main-c": ["5161", "5145", "5066", "5007", "5122", "5182", "5183", "5135", "5146", "5103", "5128", "5121"],
    "wind-main-c": ["5105", "5156", "5155", "5133", "5177", "5181", "5174", "5163", "5132", "1019", "5178"],
    "electric-main-c": ["5170", "5124", "5152", "5140", "5013", "5045", "5127", "5097", "5077"],
    "iron-main-c": ["5175", "5129", "5176", "5143", "5142", "5150", "5012", "5101", "5164", "5165"],
    "shotgun-team": ["5081", "5145", "5002", "5167", "5024", "5158"],
    "version-campaign-lineup": ["5185", "5126", "5161", "5169", "5065"],
    "kraken-stage-9": ["5169", "5155", "5105", "5156", "5130", "5137", "5066", "5065"],
    "radical-stage-9": ["5169", "5065", "5175", "5129", "5130"],
    "harvester-stage-9": ["5169", "5065", "5161", "5066", "5007"],
    "mirror-container-stage-9": ["5169", "5065", "5170", "5066", "5007"],
    "indivilia-stage-9": ["5185", "5126", "5129", "5169", "5065"],
    "tetra-tower": ["5169", "5172", "1021", "5004", "5173"],
    "missilis-tower": ["5170", "5126", "5182", "5011", "5099"],
    "pilgrim-overspec-tower": ["5169", "5155", "5185", "5175", "5065"],
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
  assert.equal(privatyAdvice[0].lines, "无装弹、攻击、优越（优越和攻击收益差不多）");
  assert.deepEqual(mergeRecommendationAdvice(privatyAdvice), {
    note: "高伤主力；2红级；可以轴外，很好用",
    equipment: "4T10，头手甲升级",
    lines: "无装弹、攻击、优越（优越和攻击收益差不多）",
    skills: "10/10/7+",
    cube: "遗迹巨熊魔方",
    collectible: "珍藏品3阶",
  });

  const campaignOnlyCharacter = listRecommendationAdvice("5175", recommendationCollectionId("version-campaign-lineup"));
  assert.deepEqual(campaignOnlyCharacter.map(({ presetId }) => presetId), ["iron-main-c"]);

  assert.deepEqual(listRecommendationAdvice("missing-character"), []);
});

test("Scarlet output tiers preserve the source image's 红级 terminology", () => {
  for (const [presetId, nameCode] of [
    ["wind-main-c", "5156"],
    ["electric-main-c", "5170"],
    ["electric-main-c", "5124"],
  ]) {
    const preset = RECOMMENDATION_PRESETS.find(entry => entry.id === presetId);
    const item = preset?.items.find(entry => entry.nameCode === nameCode);
    assert.match(item?.note || "", /(?:^|；)3\.5红级(?:；|$)/);
  }

  const redLotusShadow = RECOMMENDATION_PRESETS
    .find(entry => entry.id === "wind-main-c")
    ?.items.find(entry => entry.nameCode === "5105");
  assert.match(redLotusShadow?.note || "", /(?:^|；)3红级(?:；|$)/);

  for (const preset of RECOMMENDATION_PRESETS) {
    for (const item of preset.items) {
      assert.doesNotMatch(
        item.note,
        /(?:^|；)(?:推荐|预计|超)?(?:\d+(?:\.\d+)?|1～3)级/,
        `${preset.name} / ${item.name} 丢失“红级”专有词`,
      );
    }
  }
});

test("approved infographic maps the water attacker to Brade rather than Brid", () => {
  const water = getRecommendationPreset(recommendationCollectionId("water-main-c"));
  assert.equal(water.items[7].nameCode, "5135");
  assert.equal(water.items[7].name, "布蕾德");
  assert.equal(water.items.some(entry => entry.nameCode === "5018"), false);
  assert.equal(listRecommendationAdvice("5018").length, 0);
  const advice = mergeRecommendationAdvice(listRecommendationAdvice("5135"));
  assert.equal(advice.skills, "7/10/7");
  assert.equal(advice.cube, "遗迹分裂魔方");
  assert.equal(advice.collectible, "SR15级");
  assert.match(advice.note, /须配分摊\/持续伤害提升辅助/);
});

test("approved source preserves plus signs, threshold wording and skill references", () => {
  const entry = (presetId, code) => getRecommendationPreset(recommendationCollectionId(presetId)).items.find(item => item.nameCode === code);
  assert.equal(entry("stage-one-cooldown", "5049").skills, "10/4+/7+");
  assert.equal(entry("flexible-support", "5151").skills, "4+/4+/10");
  assert.equal(entry("fire-main-c", "5180").skills, "7+/10/7+");
  assert.equal(entry("iron-main-c", "5012").skills, "4+/4+/10");
  assert.match(entry("fire-main-c", "5129").note, /准4红级/);
  assert.match(entry("iron-main-c", "5129").note, /准4红级/);
  assert.match(entry("water-main-c", "5103").lines, /没核心技能2基本上没用/);
  assert.match(entry("electric-main-c", "5140").note, /让伊莎变3红/);
});

test("November infographic adds independent variants and replaces withdrawn recommendations", () => {
  const entry = (id, code) => getRecommendationPreset(recommendationCollectionId(id)).items.find(item => item.nameCode === code);
  assert.equal(entry("fire-main-c", "5185").name, "玛丽安：女王");
  assert.match(entry("fire-main-c", "5185").lines, /36%以上/);
  assert.match(entry("fire-main-c", "5186").note, /仅限普攻/);
  assert.match(entry("fire-main-c", "5186").lines, /12词追爆伤/);
  assert.equal(entry("water-main-c", "5182").skills, "4+/10/10");
  assert.equal(entry("water-main-c", "5183").skills, "7+/10/10");
  assert.equal(entry("wind-main-c", "5181").skills, "10/10/7+");
  assert.match(entry("wind-main-c", "5105").cube, /2技能要点10.*68%/);
  assert.equal(entry("flexible-support", "5165").lines, "优越、攻击、1装弹");
  assert.equal(entry("fire-main-c", "5004"), undefined);
  assert.equal(entry("electric-main-c", "5041"), undefined);
  assert.equal(entry("electric-main-c", "5134"), undefined);
  assert.equal(getRecommendationPreset(recommendationCollectionId("kraken-auto-stage-9")), null);
  // Removed fire advice must not survive through another preset as cultivation data.
  assert.equal(listRecommendationAdvice("5004").length, 0);
  assert.match(entry("water-main-c", "5066").note, /海伦抢米兰达buff/);
  assert.match(entry("critical-team", "5017").note, /普通玩家不推荐/);
});

test("China-exclusive characters expose their supplied cultivation advice without adding selectable presets", () => {
  const huapi = listRecommendationAdvice("cn-exclusive-huapi");
  assert.equal(huapi.length, 1);
  assert.equal(huapi[0].note, "1.5红级");
  assert.equal(huapi[0].lines, "4攻4优，2+装弹");
  assert.equal(huapi[0].skills, "7/7/7，10/10/7");
  assert.equal(huapi[0].cube, "战术/遗迹巨熊");

  const yingning = listRecommendationAdvice("cn-exclusive-yingning");
  assert.equal(yingning.length, 1);
  assert.equal(yingning[0].skills, "5/5/5 或 7/7/7");
  assert.equal(RECOMMENDATION_PRESETS.some((preset) => preset.id === "cn-exclusive-cultivation"), false);
});
