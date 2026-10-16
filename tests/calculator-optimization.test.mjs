import test from "node:test";
import assert from "node:assert/strict";
import { evaluateKeepOrReplaceAction, prepareKeepOrReplaceAction, evaluatePreparedKeepOrReplaceValue } from "../src/calculator/calculationRules.js";
import { cannotImproveGlobalBeam } from "../src/calculator/globalPlanSearch.js";
import { buildExactModel, buildExactInitialState, enumerateExactNameTransitions, TIER_PROBS, globalProfileCacheKey, solveGlobal } from "../src/calculator/engine.js";
import { duplicateSafeTierGroupOutcomes } from "../src/calculator/duplicateReroll.js";
const line = (stat, tier, flagged = false, forceKeep = false) => ({ stat, tier, flagged, forceKeep });

test("compiled threshold evaluation matches sorted reference for 20000 weighted actions", () => {
  let seed = 83473;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 20000; i++) {
    const count = 2 + Math.floor(rand() * 60);
    const values = Float64Array.from({ length: count }, () => rand() * 10 ** (Math.floor(rand() * 10) - 3));
    const currentIndex = Math.floor(rand() * count);
    if (i % 19 === 0) values[Math.floor(rand() * count)] = Infinity;
    const transitions = Array.from({ length: count * 2 }, () => ({ index: Math.floor(rand() * count), probability: rand() }));
    const sum = transitions.reduce((s, t) => s + t.probability, 0);
    transitions.forEach(t => { t.probability /= sum; });
    const cost = 1 + Math.floor(rand() * 4);
    const expected = evaluateKeepOrReplaceAction(cost, transitions, values, currentIndex).value;
    const prepared = prepareKeepOrReplaceAction(transitions, currentIndex);
    const actual = evaluatePreparedKeepOrReplaceValue(cost, prepared, values);
    assert.ok(actual === expected || Math.abs(actual - expected) < 1e-10 * Math.max(1, Math.abs(expected)), `case ${i}`);
  }
});

test("threshold edge cases retain reference behavior and observe updated value arrays", () => {
  for (const values of [[0, 5, 5], [0, Infinity, Infinity], [0, NaN, 1], [0, -Infinity, 1]]) {
    for (const cost of [0, -1, 1, Infinity]) {
      const transitions = [{ index: 0, probability: 0.5 }, { index: 1, probability: 0.25 }, { index: 2, probability: 0.25 }];
      const expected = evaluateKeepOrReplaceAction(cost, transitions, values, 0).value;
      assert.equal(evaluatePreparedKeepOrReplaceValue(cost, prepareKeepOrReplaceAction(transitions, 0), values), expected);
    }
  }
  const transitions = [{ index: 0, probability: 0.5 }, { index: 1, probability: 0.5 }];
  const values = [0, 1];
  const prepared = prepareKeepOrReplaceAction(transitions, 0);
  assert.equal(evaluatePreparedKeepOrReplaceValue(1, prepared, values), 3);
  values[1] = 5;
  assert.equal(evaluatePreparedKeepOrReplaceValue(1, prepared, values), 7);
});

// Independent identity-by-identity enumeration, without grouping non-targets.
function referenceNames(state, mask, model, rule) {
  const weights = [10, 10, 12, 10, 12, 10, 12, 12, 12];
  const slots = state.slots.map((s, i) => ({ ...s, locked: Boolean(mask & 1 << i) }));
  const used = new Set(slots.filter(s => s.locked).map(s => s.code.startsWith("T") ? model.targets[Number(s.code.slice(1))].name : s.statName));
  const outcomes = new Map(); const output = [];
  const key = slots => slots.map(s => `${s.code}:${s.tierWeight || 0}:${s.ok ? 1 : 0}:${s.locked ? 1 : 0}:${s.forced ? 1 : 0}:${s.statName || ""}`).join("|");
  const empty = () => ({ code: "X", tierWeight: 0, ok: false, locked: false, forced: false, statName: "" });
  function visit(i, p) {
    if (i === 3) { const k = key(output); outcomes.set(k, (outcomes.get(k) || 0) + p); return; }
    const current = slots[i];
    if (current.locked) { output[i] = current; visit(i + 1, p); return; }
    const appearance = [1, 0.5, 0.3][i];
    if (appearance < 1) { output[i] = empty(); visit(i + 1, p * (1 - appearance)); }
    const available = model.actualStats.map((name, n) => ({ name, weight: weights[n] })).filter(t => !used.has(t.name));
    const sum = available.reduce((s, t) => s + t.weight, 0);
    for (const item of available) {
      used.add(item.name);
      const targetIndex = model.targetByName.get(item.name);
      if (targetIndex !== undefined) {
        const target = model.targets[targetIndex];
        for (const t of duplicateSafeTierGroupOutcomes(TIER_PROBS, target.minimumTier, current.tierWeight, current.ok, rule === "global-current" && current.code === target.code)) {
          output[i] = { ...empty(), code: target.code, tierWeight: t.tierWeight, ok: t.ok };
          visit(i + 1, p * appearance * item.weight / sum * t.probability);
        }
      } else { output[i] = empty(); visit(i + 1, p * appearance * item.weight / sum); }
      used.delete(item.name);
    }
  }
  visit(0, 1); return outcomes;
}

test("grouped name draws preserve without-replacement probabilities and forced non-target slots", () => {
  for (const rule of ["cn-legacy", "global-current"]) for (const tier of [1, 5, 6, 10, 11, 15]) for (const forced of [false, true]) {
    const model = buildExactModel(["优越代码伤害增加", "攻击力增加", "最大装弹数增加"].map(stat => line(stat, tier, true)));
    const state = buildExactInitialState([line("优越代码伤害增加", tier), line("防御力增加", 1, forced, forced), line("攻击力增加", Math.max(1, tier - 1), true)], model);
    for (const mask of forced ? [2, 6] : [0, 4]) {
      const expected = referenceNames(state, mask, model, rule);
      const actual = enumerateExactNameTransitions(state, mask, model, rule);
      assert.equal(actual.size, expected.size);
      let sum = 0;
      for (const [key, p] of expected) { assert.ok(Math.abs(actual.get(key).probability - p) < 1e-12); sum += actual.get(key).probability; }
      assert.ok(Math.abs(sum - 1) < 1e-9);
    }
  }
});

test("profile cache keys distinguish rule, target order, locks and forced identities", () => {
  const targets = [line("攻击力增加", 10, true), line("优越代码伤害增加", 10, true)];
  const state = buildExactInitialState([line("攻击力增加", 15, true), line("空词条", 0), line("防御力增加", 1, true, true)], buildExactModel(targets));
  const key = globalProfileCacheKey("cn-legacy", targets, state);
  assert.equal(key, globalProfileCacheKey("cn-legacy", structuredClone(targets), structuredClone(state)));
  assert.notEqual(key, globalProfileCacheKey("global-current", targets, state));
  assert.notEqual(key, globalProfileCacheKey("cn-legacy", targets.slice().reverse(), state));
  for (const [field, value] of [["locked", false], ["forced", false], ["statName", "暴击伤害增加"]]) {
    const changed = structuredClone(state); changed.slots[2][field] = value;
    assert.notEqual(key, globalProfileCacheKey("cn-legacy", targets, changed));
  }
});

test("partial-cost pruning preserves ties, near ties and the complete beam", () => {
  assert.equal(cannotImproveGlobalBeam(100, [1, 2], 3), false);
  assert.equal(cannotImproveGlobalBeam(3, [1, 2, 3], 3), false);
  assert.equal(cannotImproveGlobalBeam(3 + 1e-9, [1, 2, 3], 3), false);
  assert.equal(cannotImproveGlobalBeam(4, [3, 1, 2], 3), true);
  assert.equal(cannotImproveGlobalBeam(2, [3, 1, 2], 3), false);
});

test("four equipment allocation matches original baseline under both rules and shares profiles", async () => {
  for (const [rule, expectedCost, tiers] of [["cn-legacy", 22.7666176467407, [3, 2, 2, 2]], ["global-current", 22.679632000807693, [2, 2, 2, 3]]]) {
    const result = await solveGlobal({ calculationRule: rule,
      activeEquipments: [0, 1, 2, 3].map(index => ({ index, label: `part-${index}`, initialInput: Array.from({ length: 3 }, () => line("空词条", 0)) })),
      config: { conditions: [{ stat: "攻击力增加", minCount: 4, minTotalBasis: 2200 }], requiredLines: 4 },
    });
    assert.ok(Math.abs(result.bestResult.totalExpectedCost - expectedCost) < 1e-7);
    assert.deepEqual(result.bestResult.plan.targetsByEquipment.map(t => t[0].tier), tiers);
    assert.ok(result.optimizationStats.cacheHits > result.optimizationStats.profileSolves);
    assert.ok(result.bestResult.equipmentResults.every(e => e.exactSolution.policyData && e.exactSolution.policyStagePreview));
  }
});

test("pruned candidates leave the original zero-cost allocation and skip no active slots", async () => {
  for (const rule of ["cn-legacy", "global-current"]) {
    const result = await solveGlobal({ calculationRule: rule,
      activeEquipments: [0, 1, 2, 3].map(index => ({ index, label: `part-${index}`, initialInput: [line(index < 2 ? "攻击力增加" : "空词条", index < 2 ? 15 : 0), line("空词条", 0), line("空词条", 0)] })),
      config: { conditions: [{ stat: "攻击力增加", minCount: 2, minTotalBasis: 2400 }], requiredLines: 2 },
    });
    assert.equal(result.bestResult.totalExpectedCost, 0);
    assert.deepEqual(result.bestResult.plan.targetsByEquipment, [[{ stat: "攻击力增加", tier: 15 }], [{ stat: "攻击力增加", tier: 8 }], [], []]);
    assert.deepEqual(result.bestResult.equipmentResults.map(item => item.index), [0, 1, 2, 3]);
    assert.equal(result.optimizationStats.prunedPlans, 11);
    assert.equal(result.evaluatedCount, 21); // Original completes 32; the same winning plan survives.
  }
});
