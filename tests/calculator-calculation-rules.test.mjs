import test from "node:test";
import assert from "node:assert/strict";

import {
  applyKeepOrReplacePolicy,
  CALCULATION_RULES,
  canKeepRerollCandidate,
  evaluateKeepOrReplaceAction,
  usesDuplicateSafeRerolls,
} from "../src/calculator/calculationRules.js";

test("only the current global rule enables duplicate protection and candidate retention", () => {
  assert.equal(usesDuplicateSafeRerolls(CALCULATION_RULES.GLOBAL_CURRENT), true);
  assert.equal(canKeepRerollCandidate(CALCULATION_RULES.GLOBAL_CURRENT), true);
  assert.equal(usesDuplicateSafeRerolls(CALCULATION_RULES.CN_LEGACY), false);
  assert.equal(canKeepRerollCandidate(CALCULATION_RULES.CN_LEGACY), false);
});

test("keep-or-replace accepts only the candidate prefix that lowers expected cost", () => {
  const values = Float64Array.from([10, 0, 30]);
  const transitions = [
    { index: 1, probability: 0.2 },
    { index: 2, probability: 0.3 },
    { index: 0, probability: 0.5 },
  ];
  const decision = evaluateKeepOrReplaceAction(1, transitions, values, 0);

  assert.equal(decision.acceptedStateIndexes.has(1), true);
  assert.equal(decision.acceptedStateIndexes.has(2), false);
  assert.ok(Math.abs(decision.value - 5) < 1e-12);
  assert.ok(Math.abs(decision.acceptedProbability - 0.2) < 1e-12);

  const effective = applyKeepOrReplacePolicy(
    transitions,
    0,
    decision.acceptedStateIndexes,
  );
  const byState = new Map(effective.map(item => [item.index, item.probability]));
  assert.ok(Math.abs(byState.get(1) - 0.2) < 1e-12);
  assert.ok(Math.abs(byState.get(0) - 0.8) < 1e-12);
});

test("keeping a low-tier current result can reject a worse candidate", () => {
  const values = Float64Array.from([20, 8, 28, 0]);
  const transitions = [
    { index: 1, probability: 0.35 },
    { index: 2, probability: 0.55 },
    { index: 3, probability: 0.10 },
  ];
  const decision = evaluateKeepOrReplaceAction(1, transitions, values, 0);
  assert.deepEqual([...decision.acceptedStateIndexes].sort((a, b) => a - b), [1, 3]);
  assert.equal(decision.acceptedStateIndexes.has(2), false);
});
