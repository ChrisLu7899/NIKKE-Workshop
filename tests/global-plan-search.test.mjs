// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  expandGlobalPlanNeighbors,
  selectDiversifiedAssignments,
} from "../src/calculator/globalPlanSearch.js";

const superiorValues = [
  954, 1094, 1234, 1375, 1515,
  1655, 1795, 1935, 2075, 2215,
  2356, 2496, 2636, 2776, 2916,
];

test("global neighborhood keeps a balanced 9+9 alternative beside an approximate 8+10 seed", () => {
  const seedPlan = {
    targetsByEquipment: [8, 10, 10, 10].map(tier => [{ stat: "优越代码伤害增加", tier }]),
    approximateCost: 63.46,
    totalLines: 4,
  };
  const currentTiers = [0, 8, 3, 9];
  const success = [1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.33, 0.26, 0.19, 0.12, 0.05, 0.04, 0.03, 0.02, 0.01];
  const neighbors = expandGlobalPlanNeighbors(seedPlan, {
    conditions: [{
      stat: "优越代码伤害增加",
      minCount: 4,
      minTotalBasis: 8500,
    }],
    tierBasis: (_stat, tier) => superiorValues[tier - 1],
    estimateCost: (equipmentIndex, _stat, tier) => {
      if (currentTiers[equipmentIndex] >= tier) return 0;
      return (currentTiers[equipmentIndex] > 0 ? 1 : 10) / success[tier - 1];
    },
    perConditionLimit: 4,
  });

  assert.ok(neighbors.some(plan => plan.targetsByEquipment
    .map(targets => targets[0].tier)
    .every((tier, index) => tier === [9, 9, 10, 10][index])));
  assert.ok(neighbors.every(plan => plan.targetsByEquipment
    .flat()
    .reduce((sum, target) => sum + superiorValues[target.tier - 1], 0) >= 8500));
});

test("assignment pruning retains balanced distributions even when approximate cost ranks them poorly", () => {
  const assignments = [];
  for (let first = 1; first <= 15; first += 1) {
    for (let second = 1; second <= 15; second += 1) {
      const tiers = [first, second, 10, 10];
      const totalBasis = tiers.reduce((sum, tier) => sum + superiorValues[tier - 1], 0);
      if (totalBasis >= 8500) {
        assignments.push({
          tiers,
          totalBasis,
          approximateCost: first === 8 && second === 10 ? 1 : 100 + first + second,
        });
      }
    }
  }
  const selected = selectDiversifiedAssignments(assignments, 12);
  assert.ok(selected.some(assignment => assignment.tiers.join(",") === "9,9,10,10"));
});

test("global neighborhood can change target count and exchange targets between full equipment", () => {
  const seedPlan = {
    targetsByEquipment: [
      [{ stat: "优越", tier: 10 }, { stat: "攻击", tier: 8 }, { stat: "装弹", tier: 6 }],
      [{ stat: "优越", tier: 10 }, { stat: "攻击", tier: 8 }, { stat: "蓄速", tier: 6 }],
      [{ stat: "优越", tier: 10 }],
      [{ stat: "优越", tier: 10 }],
    ],
    approximateCost: 0,
    totalLines: 8,
  };
  const conditions = [
    { stat: "优越", minCount: 4, minTotalBasis: 40 },
    { stat: "攻击", minCount: 1, minTotalBasis: 8 },
    { stat: "装弹", minCount: 1, minTotalBasis: 6 },
    { stat: "蓄速", minCount: 1, minTotalBasis: 6 },
  ];
  const neighbors = expandGlobalPlanNeighbors(seedPlan, {
    conditions,
    tierBasis: (_stat, tier) => tier,
    estimateCost: (_equipmentIndex, _stat, tier) => tier,
    perConditionLimit: 20,
  });
  assert.ok(neighbors.some(plan => plan.targetsByEquipment.flat().filter(target => target.stat === "攻击").length === 2));
  assert.ok(neighbors.some(plan => plan.targetsByEquipment[0].some(target => target.stat === "蓄速")
    && plan.targetsByEquipment[1].some(target => target.stat === "装弹")));
});
