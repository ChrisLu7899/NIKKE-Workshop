// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { createPolicyStageSummary } from "../src/calculator/policySummary.js";

test("policy stage summary separates current-stage and remaining total expectations", () => {
  const records = [
    {
      state: { label: "value" },
      terminal: false,
      actions: [{
        name: "reroll value",
        mode: "value",
        immediateCost: 1,
        transitions: [
          { index: 0, probability: 0.88 },
          { index: 1, probability: 0.12 },
        ],
      }],
    },
    {
      state: { label: "name" },
      terminal: false,
      actions: [{
        name: "reroll name",
        mode: "name",
        immediateCost: 2,
        transitions: [
          { index: 1, probability: 0.9 },
          { index: 2, probability: 0.1 },
        ],
      }],
    },
    { state: { label: "done" }, terminal: true, actions: [] },
  ];
  const summary = createPolicyStageSummary({
    recordList: records,
    policy: Int16Array.from([0, 0, -1]),
    values: Float64Array.from([28.333333333333, 20, 0]),
    startIndex: 0,
    describeAction: (_state, action) => action.name,
  });

  assert.equal(summary.branched, false);
  assert.equal(summary.stages.length, 2);
  assert.ok(Math.abs(summary.stages[0].stageExpectedCost - 8.333333333333) < 1e-8);
  assert.ok(Math.abs(summary.stages[0].totalExpectedCost - 28.333333333333) < 1e-8);
  assert.ok(Math.abs(summary.stages[1].stageExpectedCost - 20) < 1e-8);
  assert.ok(Math.abs(summary.stages[1].totalExpectedCost - 20) < 1e-8);
});
