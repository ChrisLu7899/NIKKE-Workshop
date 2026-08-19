import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveTargetGoal,
  forcedRetentionMask,
  includesForcedRetention,
  lockTransitionCost,
  rerollStoneCost,
  validateForcedRetention,
} from "../src/calculator/forcedRetention.js";

const isTargetCode = code => String(code || "").startsWith("T");

test("forced retention masks must remain locked in every action", () => {
  const slots = [
    { code: "T0", forced: true },
    { code: "T1", forced: false },
    { code: "X", forced: false },
  ];

  assert.equal(forcedRetentionMask(slots), 0b001);
  assert.equal(includesForcedRetention(0b001, slots), true);
  assert.equal(includesForcedRetention(0b011, slots), true);
  assert.equal(includesForcedRetention(0b010, slots), false);
});

test("an unlocked forced line pays its first lock and every later locked reroll", () => {
  const forcedMask = 0b001;

  assert.equal(lockTransitionCost(0, forcedMask), 2);
  assert.equal(rerollStoneCost(forcedMask), 2);
  assert.equal(lockTransitionCost(0, forcedMask) + rerollStoneCost(forcedMask), 4);

  assert.equal(lockTransitionCost(forcedMask, forcedMask), 0);
  assert.equal(rerollStoneCost(forcedMask), 2);
});

test("an already locked forced line does not pay the first lock twice", () => {
  const forcedMask = 0b001;
  assert.equal(lockTransitionCost(forcedMask, forcedMask), 0);
  assert.equal(lockTransitionCost(forcedMask, forcedMask) + rerollStoneCost(forcedMask), 2);
});

test("a retained non-target occupies one of the three available line slots", () => {
  const slots = [
    { code: "X", forced: true },
    { code: "T0", forced: false },
    { code: "T1", forced: false },
  ];
  assert.equal(effectiveTargetGoal(slots, 3, isTargetCode), 2);
});

test("forced retention rejects impossible tier and mandatory target combinations", () => {
  assert.match(
    validateForcedRetention(
      [{ stat: "攻击力增加", tier: 5, forceKeep: true }],
      [{ stat: "攻击力增加", tier: 10, flagged: true }],
    ),
    /当前档位低于目标最低档位/,
  );

  assert.match(
    validateForcedRetention(
      [{ stat: "防御力增加", tier: 10, forceKeep: true }],
      [
        { stat: "攻击力增加", tier: 10, flagged: true },
        { stat: "优越代码伤害增加", tier: 10, flagged: true },
        { stat: "最大装弹数增加", tier: 10, flagged: true },
      ],
    ),
    /剩余位置无法容纳全部必选目标/,
  );
});
