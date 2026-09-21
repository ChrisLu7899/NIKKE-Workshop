// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  createCandidateDecisionStage,
  createPolicyBranchStage,
} from "../src/calculator/policyTree.js";

test("policy branch stage exposes exit probabilities and next decisions lazily", () => {
  const records = [
    {
      state: { label: "root" },
      terminal: false,
      actions: [{
        name: "wash names",
        mode: "name",
        immediateCost: 1,
        transitions: [
          { index: 0, probability: 0.5 },
          { index: 1, probability: 0.3 },
          { index: 2, probability: 0.2 },
        ],
      }],
    },
    {
      state: { label: "values" },
      terminal: false,
      actions: [{
        name: "wash values",
        mode: "value",
        immediateCost: 2,
        transitions: [{ index: 2, probability: 1 }],
      }],
    },
    { state: { label: "done" }, terminal: true, actions: [] },
  ];
  const input = {
    records,
    policy: Int16Array.from([0, 0, -1]),
    values: Float64Array.from([3.2, 2, 0]),
    describeAction: (_state, action) => action.name,
  };

  const root = createPolicyBranchStage({ ...input, startIndex: 0 });
  assert.equal(root.actionText, "wash names");
  assert.ok(Math.abs(root.stageExpectedCost - 2) < 1e-10);
  assert.equal(root.branches.length, 2);
  assert.ok(Math.abs(root.branches[0].probability - 0.6) < 1e-10);
  assert.equal(root.branches[0].nextActionText, "wash values");
  assert.ok(Math.abs(root.branches[1].probability - 0.4) < 1e-10);
  assert.equal(root.branches[1].terminal, true);

  const child = createPolicyBranchStage({ ...input, startIndex: 1 });
  assert.equal(child.actionText, "wash values");
  assert.equal(child.branches.length, 1);
  assert.equal(child.branches[0].terminal, true);
});

test("candidate decision stage separates one-roll retained and accepted results", () => {
  const records = [
    {
      state: { label: "root" },
      terminal: false,
      actions: [{
        name: "wash values",
        immediateCost: 2,
        candidateTransitions: [
          { index: 0, probability: 0.5 },
          { index: 1, probability: 0.3 },
          { index: 2, probability: 0.2 },
        ],
        acceptedStateIndexes: [1, 2],
      }],
    },
    {
      state: { label: "better" },
      terminal: false,
      actions: [{ name: "lock and wash", immediateCost: 3 }],
    },
    { state: { label: "done" }, terminal: true, actions: [] },
  ];
  const stage = createCandidateDecisionStage({
    records,
    policy: Int16Array.from([0, 0, -1]),
    values: Float64Array.from([8, 3, 0]),
    startIndex: 0,
    describeAction: (_state, action) => action.name,
  });

  assert.equal(stage.actionText, "wash values");
  assert.equal(stage.singleCost, 2);
  assert.ok(Math.abs(stage.retainProbability - 0.5) < 1e-10);
  assert.ok(Math.abs(stage.acceptedProbability - 0.5) < 1e-10);
  assert.ok(Math.abs(stage.expectedAttempts - 2) < 1e-10);
  assert.ok(Math.abs(stage.stageExpectedCost - 4) < 1e-10);
  assert.deepEqual(stage.branches.map(branch => branch.probability), [0.3, 0.2]);
  assert.equal(stage.branches[0].nextActionText, "lock and wash");
  assert.equal(stage.branches[1].terminal, true);
});
