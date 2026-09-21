import test from "node:test";
import assert from "node:assert/strict";

import {
  duplicateSafeTierOutcomes,
  duplicateSafeTierGroupOutcomes,
  expectedDuplicateSafeValueRerolls,
} from "../src/calculator/duplicateReroll.js";

const TIER_WEIGHTS = [...Array(5).fill(12), ...Array(5).fill(7), ...Array(5).fill(1)];

test("same effect excludes the exact previous tier and renormalizes the remaining values", () => {
  const outcomes = duplicateSafeTierOutcomes(TIER_WEIGHTS, 1, true);
  assert.equal(outcomes.some(outcome => outcome.tier === 1), false);
  assert.ok(Math.abs(outcomes.reduce((sum, outcome) => sum + outcome.probability, 0) - 1) < 1e-12);
  assert.ok(Math.abs(outcomes.find(outcome => outcome.tier === 2).probability - 12 / 88) < 1e-12);
});

test("different effects and empty previous slots keep the ordinary tier distribution", () => {
  const differentEffect = duplicateSafeTierOutcomes(TIER_WEIGHTS, 1, false);
  const emptyPrevious = duplicateSafeTierOutcomes(TIER_WEIGHTS, null, true);
  assert.ok(Math.abs(differentEffect.find(outcome => outcome.tier === 1).probability - 0.12) < 1e-12);
  assert.deepEqual(emptyPrevious, differentEffect);
});

test("tier groups preserve exact duplicate-safe mass while reducing the state space", () => {
  const outcomes = duplicateSafeTierGroupOutcomes(TIER_WEIGHTS, 10, 12, false, true);
  const byGroup = new Map(outcomes.map(outcome => [`${outcome.tierWeight}:${outcome.ok}`, outcome.probability]));
  assert.ok(Math.abs([...byGroup.values()].reduce((sum, probability) => sum + probability, 0) - 1) < 1e-12);
  assert.ok(Math.abs(byGroup.get("12:false") - 48 / 88) < 1e-12);
  assert.ok(Math.abs(byGroup.get("7:false") - 28 / 88) < 1e-12);
  assert.ok(Math.abs(byGroup.get("7:true") - 7 / 88) < 1e-12);
  assert.ok(Math.abs(byGroup.get("1:true") - 5 / 88) < 1e-12);
});

test("duplicate-safe value rerolls use the exact non-repeating Markov expectation", () => {
  assert.ok(Math.abs(expectedDuplicateSafeValueRerolls(TIER_WEIGHTS, 10) - 6.57) < 1e-12);
  assert.equal(expectedDuplicateSafeValueRerolls(TIER_WEIGHTS, 1), 0);
  assert.equal(expectedDuplicateSafeValueRerolls(TIER_WEIGHTS, 16), Number.POSITIVE_INFINITY);
});
