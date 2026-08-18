import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseAvailableGlobalStat,
  GLOBAL_STAT_DEFAULTS,
  GLOBAL_TARGET_PRESETS,
} from "../src/calculator/globalPresets.js";

test("global presets map four superior/attack targets to the requested totals", () => {
  assert.deepEqual(GLOBAL_TARGET_PRESETS, {
    top: [
      { stat: "优越代码伤害增加", minCount: 4, minTotal: 110 },
      { stat: "攻击力增加", minCount: 4, minTotal: 50 },
    ],
    graduation: [
      { stat: "优越代码伤害增加", minCount: 4, minTotal: 100 },
      { stat: "攻击力增加", minCount: 4, minTotal: 45 },
    ],
    excellent: [
      { stat: "优越代码伤害增加", minCount: 4, minTotal: 90 },
      { stat: "攻击力增加", minCount: 4, minTotal: 40 },
    ],
    starter: [
      { stat: "优越代码伤害增加", minCount: 4, minTotal: 80 },
      { stat: "攻击力增加", minCount: 4, minTotal: 30 },
    ],
  });
});

test("global stat defaults use the requested counts and totals", () => {
  assert.deepEqual(GLOBAL_STAT_DEFAULTS, {
    "优越代码伤害增加": { minCount: 4, minTotal: 80 },
    "攻击力增加": { minCount: 4, minTotal: 40 },
    "最大装弹数增加": { minCount: 1, minTotal: 60 },
    "暴击伤害增加": { minCount: 1, minTotal: 15 },
    "暴击率增加": { minCount: 1, minTotal: 5 },
    "防御力增加": { minCount: 1, minTotal: 10 },
    "命中率增加": { minCount: 1, minTotal: 10 },
    "蓄力速度增加": { minCount: 1, minTotal: 4 },
    "蓄力伤害增加": { minCount: 1, minTotal: 10 },
  });
});

test("global conditions choose only an unused stat", () => {
  const stats = ["优越代码伤害增加", "攻击力增加", "最大装弹数增加"];
  assert.equal(chooseAvailableGlobalStat(stats, ["攻击力增加"], "优越代码伤害增加"), "优越代码伤害增加");
  assert.equal(chooseAvailableGlobalStat(stats, ["优越代码伤害增加"], "优越代码伤害增加"), "攻击力增加");
  assert.equal(chooseAvailableGlobalStat(stats, stats, "优越代码伤害增加"), "");
});
