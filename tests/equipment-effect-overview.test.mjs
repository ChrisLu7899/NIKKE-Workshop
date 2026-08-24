import assert from "node:assert/strict";
import test from "node:test";

import {
  EQUIPMENT_EFFECT_DISPLAY_ORDER,
  summarizeEquipmentEffects,
} from "../src/calculator/equipmentEffectOverview.js";

const tiers = {
  "优越代码伤害增加": ["9.54%", "10.94%"],
  "攻击力增加": ["4.77%", "5.47%"],
  "最大装弹数增加": ["27.84%"],
  "暴击率增加": ["2.30%"],
  "暴击伤害增加": ["6.64%"],
  "蓄力速度增加": ["1.98%"],
  "蓄力伤害增加": ["4.77%"],
  "防御力增加": ["4.77%"],
  "命中率增加": ["4.77%"],
};

test("summarizeEquipmentEffects returns all nine effects in fixed order", () => {
  const summary = summarizeEquipmentEffects([
    { stat: "优越代码伤害增加", tier: 1 },
    { stat: "攻击力增加", tier: 1 },
    { stat: "优越代码伤害增加", tier: 2 },
    { stat: "空词条", tier: 0 },
  ], tiers);

  assert.deepEqual(summary.map(item => item.stat), EQUIPMENT_EFFECT_DISPLAY_ORDER);
  assert.equal(summary.length, 9);
  assert.equal(summary[0].formattedValue, "20.48%");
  assert.equal(summary[1].formattedValue, "4.77%");
  assert.equal(summary[2].formattedValue, "0.00%");
});

test("summarizeEquipmentEffects ignores invalid tiers and unknown effects", () => {
  const summary = summarizeEquipmentEffects([
    { stat: "攻击力增加", tier: 99 },
    { stat: "不存在的词条", tier: 1 },
    null,
  ], tiers);

  assert.ok(summary.every(item => item.formattedValue === "0.00%"));
});
