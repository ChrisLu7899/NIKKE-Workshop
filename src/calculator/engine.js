// SPDX-License-Identifier: GPL-3.0-or-later
import {
  effectiveTargetGoal,
  forcedRetentionMask,
  includesForcedRetention,
  lockTransitionCost,
  rerollStoneCost,
  validateForcedRetention,
} from "./forcedRetention.js";
import { createPolicyStageSummary } from "./policySummary.js";
import {
  expandGlobalPlanNeighbors,
  selectDiversifiedAssignments,
  selectDiversifiedPlans,
  cannotImproveGlobalBeam,
} from "./globalPlanSearch.js";
import {
  duplicateSafeTierGroupOutcomes,
} from "./duplicateReroll.js";
import {
  applyKeepOrReplacePolicy,
  CALCULATION_RULES,
  canKeepRerollCandidate,
  evaluateKeepOrReplaceAction,
  prepareKeepOrReplaceAction,
  evaluatePreparedKeepOrReplaceValue,
  normalizeCalculationRule,
  usesDuplicateSafeRerolls,
} from "./calculationRules.js";

const STAT_PROBS_BASE = {
  "优越代码伤害增加": 10,
  "攻击力增加": 10,
  "最大装弹数增加": 12,
  "暴击伤害增加": 10,
  "暴击率增加": 12,
  "防御力增加": 10,
  "命中率增加": 12,
  "蓄力速度增加": 12,
  "蓄力伤害增加": 12
};

const STAT_NAMES = ["空词条", ...Object.keys(STAT_PROBS_BASE)];
const COMMON_TIERS = ["4.77%", "5.47%", "6.18%", "6.88%", "7.59%", "8.29%", "9.00%", "9.70%", "10.40%", "11.11%", "11.81%", "12.52%", "13.22%", "13.93%", "14.63%"];
const STAT_TIER_VALUES = {
  "优越代码伤害增加": ["9.54%", "10.94%", "12.34%", "13.75%", "15.15%", "16.55%", "17.95%", "19.35%", "20.75%", "22.15%", "23.56%", "24.96%", "26.36%", "27.76%", "29.16%"],
  "蓄力伤害增加": COMMON_TIERS,
  "最大装弹数增加": ["27.84%", "31.95%", "36.06%", "40.17%", "44.28%", "48.39%", "52.50%", "56.60%", "60.71%", "64.82%", "68.93%", "73.04%", "77.15%", "81.26%", "85.37%"],
  "蓄力速度增加": ["1.98%", "2.28%", "2.57%", "2.86%", "3.16%", "3.45%", "3.75%", "4.04%", "4.33%", "4.63%", "4.92%", "5.21%", "5.51%", "5.80%", "6.09%"],
  "暴击率增加": ["2.30%", "2.64%", "2.98%", "3.32%", "3.66%", "4.00%", "4.35%", "4.69%", "5.03%", "5.37%", "5.71%", "6.05%", "6.39%", "6.73%", "7.07%"],
  "暴击伤害增加": ["6.64%", "7.62%", "8.60%", "9.58%", "10.56%", "11.54%", "12.52%", "13.50%", "14.48%", "15.46%", "16.44%", "17.42%", "18.40%", "19.38%", "20.36%"],
  "攻击力增加": COMMON_TIERS,
  "命中率增加": COMMON_TIERS,
  "防御力增加": COMMON_TIERS
};

const GLOBAL_ASSIGNMENTS_PER_MASK = 12;
const GLOBAL_PLAN_BEAM_PER_LINE_COUNT = 64;
const GLOBAL_EXACT_PLAN_LIMIT = 10;
const GLOBAL_EXACT_SEARCH_ROUNDS = 4;
const GLOBAL_EXACT_SEARCH_BEAM = 3;
const GLOBAL_EXACT_NEIGHBOR_LIMIT = 12;
const GLOBAL_EXACT_SEARCH_PATIENCE = 2;
const SLOT_PROBS = [1, 0.5, 0.3];
const TIER_PROBS = [...Array(5).fill(12), ...Array(5).fill(7), ...Array(5).fill(1)];

function tierSuccessProbability(minimumTier) {
  if (minimumTier <= 1) return 1;
  return TIER_PROBS.slice(minimumTier - 1).reduce((sum, probability) => sum + probability, 0) / 100;
}

function buildExactModel(targetInput) {
  const targets = targetInput
    .filter(item => item.stat !== "空词条")
    .map((item, index) => ({
      code: `T${index}`,
      name: item.stat,
      mandatory: item.flagged,
      minimumTier: item.tier,
      successProbability: tierSuccessProbability(item.tier),
      weight: STAT_PROBS_BASE[item.stat]
    }));
  const targetByName = new Map(targets.map((target, index) => [target.name, index]));
  return {
    targets,
    targetByName,
    mandatoryCodes: new Set(targets.filter(target => target.mandatory).map(target => target.code)),
    goal: Math.min(3, targets.length),
    actualStats: Object.keys(STAT_PROBS_BASE)
  };
}

function isTargetCode(code) {
  return code.startsWith("T");
}

function targetIndexFromCode(code) {
  return Number(code.slice(1));
}

function exactCodeForStat(stat, model) {
  if (stat === "空词条") return "X";
  if (model.targetByName.has(stat)) return `T${model.targetByName.get(stat)}`;
  return "X";
}

function buildExactInitialState(initialInput, model) {
  return {
    slots: initialInput.map(item => {
      const code = exactCodeForStat(item.stat, model);
      const targetIndex = isTargetCode(code) ? targetIndexFromCode(code) : -1;
      const forced = Boolean(item.forceKeep);
      return {
        code,
        ok: targetIndex >= 0 ? item.tier >= model.targets[targetIndex].minimumTier : false,
        tierWeight: targetIndex >= 0 ? TIER_PROBS[Number(item.tier) - 1] : 0,
        displayTier: targetIndex >= 0 ? Number(item.tier) : 0,
        locked: Boolean(item.flagged) && (targetIndex >= 0 || forced),
        forced,
        statName: forced && targetIndex < 0 ? item.stat : "",
      };
    })
  };
}

function exactStateKey(state) {
  return state.slots.map(slot => `${slot.code}:${slot.tierWeight || 0}:${slot.ok ? 1 : 0}:${slot.locked ? 1 : 0}:${slot.forced ? 1 : 0}:${slot.statName || ""}`).join("|");
}

function exactBaseKey(state) {
  return state.slots.map(slot => `${slot.code}:${slot.tierWeight || 0}:${slot.ok ? 1 : 0}:${slot.forced ? 1 : 0}:${slot.statName || ""}`).join("|");
}

function exactLockMask(state) {
  return state.slots.reduce((mask, slot, index) => mask | (slot.locked ? 1 << index : 0), 0);
}

function bitCount(mask) {
  let count = 0;
  for (let value = mask; value; value >>>= 1) count += value & 1;
  return count;
}

function exactNamesReady(state, model) {
  const present = new Set(state.slots.filter(slot => isTargetCode(slot.code)).map(slot => slot.code));
  const goal = effectiveTargetGoal(state.slots, model.goal, isTargetCode);
  return [...model.mandatoryCodes].every(code => present.has(code)) && present.size >= goal;
}

function exactTerminal(state, model) {
  const qualified = new Set(state.slots.filter(slot => isTargetCode(slot.code) && slot.ok).map(slot => slot.code));
  const goal = effectiveTargetGoal(state.slots, model.goal, isTargetCode);
  return [...model.mandatoryCodes].every(code => qualified.has(code)) && qualified.size >= goal;
}

function applyExactLocks(state, lockMask) {
  return {
    slots: state.slots.map((slot, index) => ({
      ...slot,
      locked: (isTargetCode(slot.code) || slot.forced) && Boolean(lockMask & 1 << index)
    }))
  };
}

function exactLockChangeCost(state, newMask) {
  return lockTransitionCost(exactLockMask(state), newMask);
}

function exactMasksForEligible(state, model, eligibleMask) {
  const masks = [];
  const requiredMask = forcedRetentionMask(state.slots);
  const optionalLockQuota = effectiveTargetGoal(state.slots, model.goal, isTargetCode) - model.mandatoryCodes.size;
  eligibleMask |= requiredMask;
  for (let mask = 0; mask < 8; mask += 1) {
    if ((mask & ~eligibleMask) !== 0 || bitCount(mask) >= 3) continue;
    if (!includesForcedRetention(mask, state.slots)) continue;
    const optionalLocks = state.slots.filter((slot, index) => {
      return Boolean(mask & 1 << index) && isTargetCode(slot.code) && !model.mandatoryCodes.has(slot.code);
    }).length;
    if (optionalLocks <= optionalLockQuota) masks.push(mask);
  }
  return masks;
}

function exactActionChoices(state, model) {
  let targetMask = 0;
  let qualifiedMask = 0;
  let hasUnqualifiedTarget = false;
  state.slots.forEach((slot, index) => {
    if (!isTargetCode(slot.code)) return;
    targetMask |= 1 << index;
    if (slot.ok) {
      qualifiedMask |= 1 << index;
    } else {
      hasUnqualifiedTarget = true;
    }
  });

  const choices = exactMasksForEligible(state, model, targetMask).map(lockMask => ({ mode: "name", lockMask }));
  if (hasUnqualifiedTarget) {
    exactMasksForEligible(state, model, qualifiedMask).forEach(lockMask => {
      choices.push({ mode: "value", lockMask });
    });
  }
  return choices;
}

function addExactOutcome(outcomes, state, probability) {
  if (probability <= 0) return;
  const key = exactStateKey(state);
  const existing = outcomes.get(key);
  if (existing) {
    existing.probability += probability;
  } else {
    outcomes.set(key, { state, probability });
  }
}

// Bound to each model, so completed jobs do not retain probability caches.
const modelTierOutcomes = new WeakMap();
function tierOutcomes(model, minimumTier, currentWeight, currentOK, excludeCurrent) {
  let cache = modelTierOutcomes.get(model);
  if (!cache) { cache = new Map(); modelTierOutcomes.set(model, cache); }
  const key = excludeCurrent ? `${minimumTier}|${currentWeight}|${currentOK}` : `${minimumTier}|ordinary`;
  if (!cache.has(key)) cache.set(key, duplicateSafeTierGroupOutcomes(
    TIER_PROBS, minimumTier, currentWeight, currentOK, excludeCurrent,
  ));
  return cache.get(key);
}

function enumerateExactNameTransitions(state, lockMask, model, calculationRule) {
  const prepared = applyExactLocks(state, lockMask);
  const outcomes = new Map();
  const outputSlots = Array(3);
  const usedActualStats = new Set(prepared.slots.filter(slot => slot.locked).map(slot =>
    isTargetCode(slot.code) ? model.targets[targetIndexFromCode(slot.code)].name : slot.statName,
  ));
  // Non-target identities have identical futures. Keep one group per weight,
  // decrementing its count for each draw to preserve sampling without replacement.
  const groups = [];
  const nonTargetsByWeight = new Map();
  for (const name of model.actualStats) {
    if (usedActualStats.has(name)) continue;
    const weight = STAT_PROBS_BASE[name];
    if (model.targetByName.has(name)) {
      groups.push({ targetIndex: model.targetByName.get(name), weight, count: 1 });
    } else if (nonTargetsByWeight.has(weight)) {
      nonTargetsByWeight.get(weight).count += 1;
    } else {
      const group = { targetIndex: -1, weight, count: 1 };
      nonTargetsByWeight.set(weight, group);
      groups.push(group);
    }
  }
  const emptySlot = () => ({ code: "X", tierWeight: 0, ok: false, locked: false, forced: false, statName: "" });
  function visit(slotIndex, probability) {
    if (slotIndex === 3) {
      addExactOutcome(outcomes, { slots: outputSlots.map(slot => ({ ...slot })) }, probability);
      return;
    }
    const currentSlot = prepared.slots[slotIndex];
    if (currentSlot.locked) {
      outputSlots[slotIndex] = { ...currentSlot };
      visit(slotIndex + 1, probability);
      return;
    }
    const appearanceProbability = SLOT_PROBS[slotIndex];
    if (appearanceProbability < 1) {
      outputSlots[slotIndex] = emptySlot();
      visit(slotIndex + 1, probability * (1 - appearanceProbability));
    }
    const remainingWeight = groups.reduce((sum, group) => sum + group.weight * group.count, 0);
    for (const group of groups) {
      if (!group.count) continue;
      const statProbability = appearanceProbability * group.weight * group.count / remainingWeight;
      group.count -= 1;
      if (group.targetIndex >= 0) {
        const target = model.targets[group.targetIndex];
        const sameEffect = usesDuplicateSafeRerolls(calculationRule) && currentSlot.code === target.code;
        for (const outcome of tierOutcomes(model, target.minimumTier, currentSlot.tierWeight, currentSlot.ok, sameEffect)) {
          outputSlots[slotIndex] = { ...emptySlot(), code: target.code, tierWeight: outcome.tierWeight, ok: outcome.ok };
          visit(slotIndex + 1, probability * statProbability * outcome.probability);
        }
      } else {
        outputSlots[slotIndex] = emptySlot();
        visit(slotIndex + 1, probability * statProbability);
      }
      group.count += 1;
    }
  }
  visit(0, 1);
  return outcomes;
}

function enumerateExactValueTransitions(state, lockMask, model, calculationRule) {
  const prepared = applyExactLocks(state, lockMask);
  const outcomes = new Map();
  const outputSlots = Array(3);

  function visit(slotIndex, probability) {
    if (slotIndex === 3) {
      addExactOutcome(outcomes, { slots: outputSlots.map(slot => ({ ...slot })) }, probability);
      return;
    }

    const slot = prepared.slots[slotIndex];
    if (slot.locked || !isTargetCode(slot.code)) {
      outputSlots[slotIndex] = { ...slot };
      visit(slotIndex + 1, probability);
      return;
    }

    const target = model.targets[targetIndexFromCode(slot.code)];
    tierOutcomes(
      model,
      target.minimumTier,
      slot.tierWeight,
      slot.ok,
      usesDuplicateSafeRerolls(calculationRule),
    ).forEach(tierOutcome => {
      outputSlots[slotIndex] = {
        ...slot,
        tierWeight: tierOutcome.tierWeight,
        ok: tierOutcome.ok,
        locked: false,
      };
      visit(slotIndex + 1, probability * tierOutcome.probability);
    });
  }

  visit(0, 1);
  return outcomes;
}

function exactActionDescription(state, action) {
  const forcedSlots = state.slots
    .map((slot, index) => slot.forced && action.lockMask & 1 << index ? `${index + 1}号位` : "")
    .filter(Boolean);
  const lockedSlots = state.slots
    .map((slot, index) => !slot.forced && action.lockMask & 1 << index ? `${index + 1}号位` : "")
    .filter(Boolean);
  const lockParts = [];
  if (forcedSlots.length) lockParts.push(`强制保留 ${forcedSlots.join("、")}`);
  if (lockedSlots.length) lockParts.push(`锁定 ${lockedSlots.join("、")}`);
  const lockText = lockParts.length ? lockParts.join("，") : "全不锁";
  return `${lockText}，${action.mode === "name" ? "洗词条名称" : "洗数值"}`;
}

function exactStageMilestoneText(stage, recordList, model) {
  function statusProbability(distribution, targetCode, predicate) {
    return distribution.reduce((sum, item) => {
      const state = recordList[item.stateIndex]?.state;
      const matches = state?.slots.some(slot => slot.code === targetCode && predicate(slot));
      return sum + (matches ? item.probability : 0);
    }, 0);
  }

  const completedTargets = model.targets.filter(target => {
    const before = statusProbability(stage.startDistribution, target.code, slot => slot.ok);
    const after = statusProbability(stage.exitDistribution, target.code, slot => slot.ok);
    return before < 1 - 1e-9 && after >= 1 - 1e-9;
  });
  if (completedTargets.length) {
    return `直到达标（${completedTargets.map(target => target.name).join("、")}）`;
  }

  const acquiredTargets = model.targets.filter(target => {
    const before = statusProbability(stage.startDistribution, target.code, () => true);
    const after = statusProbability(stage.exitDistribution, target.code, () => true);
    return before < 1 - 1e-9 && after >= 1 - 1e-9;
  });
  return acquiredTargets.length
    ? `直到获得（${acquiredTargets.map(target => target.name).join("、")}）`
    : "";
}

function exactStageConditionText(stage, recordList, model) {
  const unqualifiedTargets = model.targets.filter(target => {
    return stage.startDistribution.every(item => {
      const state = recordList[item.stateIndex]?.state;
      return state?.slots.some(slot => slot.code === target.code && !slot.ok);
    });
  });
  return unqualifiedTargets.length
    ? `若${unqualifiedTargets.map(target => target.name).join("、")}数值未达标，`
    : "";
}

async function solveExactOptimal(
  initialState,
  model,
  calculationRule,
  onProgress = () => {},
  retainPolicy = false,
) {
  const normalizedRule = normalizeCalculationRule(calculationRule);
  const allowKeep = canKeepRerollCandidate(normalizedRule);
  const startKey = exactStateKey(initialState);
  const records = new Map();
  const indexByKey = new Map();
  const queue = [];
  const transitionCache = new Map();

  function registerState(state) {
    const key = exactStateKey(state);
    if (!records.has(key)) {
      const record = { key, state, actions: [], terminal: exactTerminal(state, model) };
      records.set(key, record);
      indexByKey.set(key, queue.length);
      queue.push(record);
    }
    return indexByKey.get(key);
  }

  registerState(initialState);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const record = queue[cursor];
    if (!record.terminal) {
      const choices = exactActionChoices(record.state, model);
      if (!choices.length) {
        throw new Error("强制保留占满了可锁位置，当前目标没有可执行的洗练动作");
      }
      for (const { mode, lockMask } of choices) {
        const cacheKey = `${normalizedRule}|${mode}|${exactBaseKey(record.state)}|${lockMask}`;
        let transitions = transitionCache.get(cacheKey);
        if (!transitions) {
          const outcomes = mode === "name"
            ? enumerateExactNameTransitions(record.state, lockMask, model, normalizedRule)
            : enumerateExactValueTransitions(record.state, lockMask, model, normalizedRule);
          transitions = [];
          let probabilitySum = 0;
          for (const outcome of outcomes.values()) {
            probabilitySum += outcome.probability;
            transitions.push({ index: registerState(outcome.state), probability: outcome.probability });
          }
          if (Math.abs(probabilitySum - 1) > 1e-9) throw new Error(`状态转移概率未归一：${probabilitySum}`);
          transitionCache.set(cacheKey, transitions);
        }

        record.actions.push({
          mode,
          lockMask,
          allowKeep,
          immediateCost: exactLockChangeCost(record.state, lockMask) + rerollStoneCost(lockMask),
          transitions
        });
      }
    }

    if (records.size > 24000) throw new Error("有限状态 MDP 超过 24,000 个状态，请减少目标候选后重试");
    if (cursor % 32 === 0) {
      onProgress("graph", cursor + 1, queue.length);
    }
  }

  const recordList = queue;
  transitionCache.clear();
  records.clear();
  const values = new Float64Array(recordList.length);
  const policy = new Int16Array(recordList.length);
  policy.fill(-1);
  if (allowKeep) recordList.forEach((record, stateIndex) => {
    record.actions.forEach(action => {
      action.prepared = prepareKeepOrReplaceAction(action.transitions, stateIndex);
    });
  });

  const tolerance = 1e-9;
  const maxIterations = 20000;
  let residual = Infinity;
  let completedIterations = 0;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    residual = 0;
    for (let stateIndex = recordList.length - 1; stateIndex >= 0; stateIndex -= 1) {
      const record = recordList[stateIndex];
      if (record.terminal) continue;
      let bestValue = Infinity;
      let bestActionIndex = -1;

      record.actions.forEach((action, actionIndex) => {
        let candidate = Number.POSITIVE_INFINITY;
        if (allowKeep) {
          candidate = evaluatePreparedKeepOrReplaceValue(action.immediateCost, action.prepared, values);
        } else {
          let selfProbability = 0;
          let futureValue = 0;
          action.transitions.forEach(transition => {
            if (transition.index === stateIndex) {
              selfProbability += transition.probability;
            } else {
              futureValue += transition.probability * values[transition.index];
            }
          });
          const denominator = 1 - selfProbability;
          if (denominator > 1e-14) {
            candidate = (action.immediateCost + futureValue) / denominator;
          }
        }
        if (candidate < bestValue) {
          bestValue = candidate;
          bestActionIndex = actionIndex;
        }
      });

      const difference = Math.abs(bestValue - values[stateIndex]);
      if (difference > residual) residual = difference;
      values[stateIndex] = bestValue;
      policy[stateIndex] = bestActionIndex;
    }

    completedIterations = iteration;
    if (residual < tolerance) break;
    if (iteration % 20 === 0) {
      onProgress("solve", iteration, residual);
    }
  }

  if (!Number.isFinite(values[indexByKey.get(startKey)])) throw new Error("有限状态 MDP 未得到有限期望");
  if (residual >= tolerance) throw new Error(`有限状态 MDP 未收敛，剩余误差 ${residual}`);
  const startIndex = indexByKey.get(startKey);
  recordList.forEach(record => record.actions.forEach(action => { delete action.prepared; }));
  if (allowKeep && retainPolicy) {
    recordList.forEach((record, stateIndex) => {
      const actionIndex = policy[stateIndex];
      if (actionIndex < 0) return;
      const action = record.actions[actionIndex];
      const decision = evaluateKeepOrReplaceAction(
        action.immediateCost,
        action.transitions,
        values,
        stateIndex,
      );
      const acceptedStateIndexes = new Set(
        [...decision.acceptedStateIndexes].filter(index => {
          return values[index] < values[stateIndex] - 1e-7;
        }),
      );
      action.candidateTransitions = action.transitions;
      action.acceptedStateIndexes = [...acceptedStateIndexes];
      action.acceptedProbability = action.transitions.reduce((sum, transition) => {
        return sum + (acceptedStateIndexes.has(transition.index) ? transition.probability : 0);
      }, 0);
      action.transitions = applyKeepOrReplacePolicy(
        action.transitions,
        stateIndex,
        acceptedStateIndexes,
      );
    });
  }
  const firstActionIndex = policy[startIndex];
  const firstAction = firstActionIndex >= 0 ? recordList[startIndex].actions[firstActionIndex] : null;
  const policyStagePreview = retainPolicy ? createPolicyStageSummary({
    recordList,
    policy,
    values,
    startIndex,
    describeAction: exactActionDescription,
  }) : null;
  policyStagePreview?.stages.forEach(stage => {
    stage.milestoneText = exactStageMilestoneText(stage, recordList, model);
    stage.conditionText = exactStageConditionText(stage, recordList, model);
  });
  return {
    value: values[startIndex],
    firstAction,
    firstActionText: firstAction ? exactActionDescription(initialState, firstAction) : "目标已经完成",
    policyStagePreview,
    calculationRule: normalizedRule,
    model,
    stateCount: recordList.length,
    iterations: completedIterations,
    residual,
    policyData: retainPolicy ? { records: recordList, policy, values, startIndex } : null
  };
}

function formulaFastPath(initialState, model, firstAction, calculationRule) {
  if (normalizeCalculationRule(calculationRule) !== CALCULATION_RULES.CN_LEGACY) return null;
  if (forcedRetentionMask(initialState.slots)) return null;
  if (!firstAction || firstAction.mode !== "name" || model.targets.length !== 3 || model.goal !== 3) return null;
  if (exactNamesReady(initialState, model)) return null;
  if (bitCount(firstAction.lockMask) !== 2) return null;
  const lockedSlots = initialState.slots.filter((slot, index) => firstAction.lockMask & 1 << index);
  if (lockedSlots.some(slot => !isTargetCode(slot.code) || !slot.ok)) return null;
  const lockedCodes = new Set(lockedSlots.map(slot => slot.code));
  const missingTarget = model.targets.find(target => !lockedCodes.has(target.code));
  const openIndex = [0, 1, 2].find(index => !(firstAction.lockMask & 1 << index));
  if (!missingTarget || openIndex === undefined || missingTarget.successProbability <= 0) return null;

  const remainingWeight = 100 - lockedSlots.reduce((sum, slot) => {
    return sum + model.targets[targetIndexFromCode(slot.code)].weight;
  }, 0);
  const nameProbability = SLOT_PROBS[openIndex] * missingTarget.weight / remainingWeight;
  if (nameProbability <= 0) return null;
  const rerollCost = rerollStoneCost(firstAction.lockMask);
  const lockCost = exactLockChangeCost(initialState, firstAction.lockMask);
  const nameCost = rerollCost / nameProbability;
  const expectedValueRerolls = (1 - missingTarget.successProbability) / missingTarget.successProbability;
  const valueCost = rerollCost * expectedValueRerolls;
  return {
    value: lockCost + nameCost + valueCost,
    lockCost,
    nameCost,
    valueCost,
    nameProbability,
    tierProbability: missingTarget.successProbability,
    targetName: missingTarget.name,
    slot: openIndex + 1
  };
}

function findFormulaFastPath(initialState, model, calculationRule) {
  const candidates = [];
  for (let lockMask = 0; lockMask < 8; lockMask += 1) {
    if (bitCount(lockMask) !== 2) continue;
    const result = formulaFastPath(
      initialState,
      model,
      { mode: "name", lockMask },
      calculationRule,
    );
    if (result) candidates.push({ ...result, lockMask });
  }
  candidates.sort((left, right) => left.value - right.value);
  return candidates[0] ?? null;
}
function runExactSelfChecks() {
  const statWeight = Object.values(STAT_PROBS_BASE).reduce((sum, value) => sum + value, 0);
  const tierWeight = TIER_PROBS.reduce((sum, value) => sum + value, 0);
  if (statWeight !== 100 || tierWeight !== 100) throw new Error("基础概率总和不是 100%");
  if (Math.abs(tierSuccessProbability(10) - 0.12) > 1e-12) throw new Error("第 10 档累计概率校验失败");

  const targetInput = [
    { stat: "攻击力增加", tier: 10, flagged: false },
    { stat: "优越代码伤害增加", tier: 10, flagged: false },
    { stat: "最大装弹数增加", tier: 10, flagged: false }
  ];
  const initialInput = [
    { stat: "攻击力增加", tier: 10, flagged: true },
    { stat: "优越代码伤害增加", tier: 10, flagged: false },
    { stat: "空词条", tier: 0, flagged: false }
  ];
  const model = buildExactModel(targetInput);
  const state = buildExactInitialState(initialInput, model);
  const formula = findFormulaFastPath(state, model, CALCULATION_RULES.CN_LEGACY);
  if (!formula || Math.abs(formula.value - 91.66666666666667) > 1e-9) {
    throw new Error("旧规则理论基准校验失败");
  }
  return true;
}
function statTierBasisPoints(stat, tier) {
  if (!stat || tier <= 0) return 0;
  const text = STAT_TIER_VALUES[stat]?.[tier - 1];
  return Math.round(Number.parseFloat(text || "0") * 100);
}

function statTierText(stat, tier) {
  return STAT_TIER_VALUES[stat]?.[tier - 1] || "0%";
}

function currentTierForStat(initialInput, stat) {
  return initialInput.find(item => item.stat === stat)?.tier || 0;
}

function estimateGlobalTargetCost(equipment, stat, tier) {
  const currentTier = currentTierForStat(equipment.initialInput, stat);
  if (currentTier >= tier) return 0;
  const tierProbability = Math.max(tierSuccessProbability(tier), 0.000001);
  if (currentTier > 0) return 1 / tierProbability;
  const totalWeight = Object.values(STAT_PROBS_BASE).reduce((sum, value) => sum + value, 0);
  const statProbability = STAT_PROBS_BASE[stat] / totalWeight;
  return 1 / Math.max(statProbability * tierProbability, 0.000001);
}

function enumerateGlobalStatAssignments(condition, activeEquipments) {
  const equipmentCount = activeEquipments.length;
  const assignmentCount = 16 ** equipmentCount;
  const groupedByMask = new Map();

  for (let code = 0; code < assignmentCount; code += 1) {
    let remainder = code;
    const tiers = [];
    let count = 0;
    let totalBasis = 0;
    let mask = 0;
    let approximateCost = 0;

    for (let index = 0; index < equipmentCount; index += 1) {
      const tier = remainder % 16;
      remainder = Math.floor(remainder / 16);
      tiers.push(tier);
      if (tier <= 0) continue;
      count += 1;
      mask |= 1 << index;
      totalBasis += statTierBasisPoints(condition.stat, tier);
      approximateCost += estimateGlobalTargetCost(activeEquipments[index], condition.stat, tier);
    }

    if (count < condition.minCount || totalBasis < condition.minTotalBasis) continue;
    approximateCost += Math.max(0, totalBasis - condition.minTotalBasis) * 0.00001;
    const assignment = { tiers, count, totalBasis, mask, approximateCost };
    const group = groupedByMask.get(mask) || [];
    group.push(assignment);
    groupedByMask.set(mask, group);
  }

  return [...groupedByMask.values()]
    .flatMap(group => selectDiversifiedAssignments(group, GLOBAL_ASSIGNMENTS_PER_MASK))
    .sort((left, right) => left.approximateCost - right.approximateCost || left.totalBasis - right.totalBasis);
}

function globalPlanSignature(plan) {
  return plan.targetsByEquipment
    .map(targets => targets.map(target => `${target.stat}:${target.tier}`).sort().join("|"))
    .join("/");
}

function pruneGlobalPlans(plans, requiredLines, conditions) {
  const bestBySignature = new Map();
  plans.forEach(plan => {
    const signature = globalPlanSignature(plan);
    const previous = bestBySignature.get(signature);
    if (!previous || plan.approximateCost < previous.approximateCost) bestBySignature.set(signature, plan);
  });

  const grouped = new Map();
  [...bestBySignature.values()].forEach(plan => {
    const key = Math.min(plan.totalLines, requiredLines);
    const group = grouped.get(key) || [];
    group.push(plan);
    grouped.set(key, group);
  });
  return [...grouped.values()].flatMap(group => selectDiversifiedPlans(group, {
    conditions,
    tierBasis: statTierBasisPoints,
    limit: GLOBAL_PLAN_BEAM_PER_LINE_COUNT,
  }));
}

function combineGlobalAssignments(conditions, assignmentLists, activeEquipments, requiredLines) {
  let plans = [{
    targetsByEquipment: Array.from({ length: activeEquipments.length }, () => []),
    approximateCost: 0,
    totalLines: 0
  }];

  for (let conditionIndex = 0; conditionIndex < conditions.length; conditionIndex += 1) {
    const condition = conditions[conditionIndex];
    const nextPlans = [];
    for (const plan of plans) {
      for (const assignment of assignmentLists[conditionIndex]) {
        const targetsByEquipment = plan.targetsByEquipment.map(targets => targets.slice());
        let valid = true;
        for (let equipmentIndex = 0; equipmentIndex < assignment.tiers.length; equipmentIndex += 1) {
          const tier = assignment.tiers[equipmentIndex];
          if (tier <= 0) continue;
          if (targetsByEquipment[equipmentIndex].length >= 3) {
            valid = false;
            break;
          }
          targetsByEquipment[equipmentIndex].push({ stat: condition.stat, tier });
        }
        if (!valid) continue;
        nextPlans.push({
          targetsByEquipment,
          approximateCost: plan.approximateCost + assignment.approximateCost,
          totalLines: plan.totalLines + assignment.count
        });
      }
    }
    plans = pruneGlobalPlans(nextPlans, requiredLines, conditions.slice(0, conditionIndex + 1));
    if (!plans.length) break;
  }

  return plans
    .filter(plan => plan.totalLines >= requiredLines)
    .sort((left, right) => left.approximateCost - right.approximateCost);
}

function globalTargetInput(targets) {
  return targets.map(target => ({ stat: target.stat, tier: target.tier, flagged: true }));
}

export function globalProfileCacheKey(calculationRule, targets, initialState) {
  return `${normalizeCalculationRule(calculationRule)}|${targets.map(target => `${target.stat}:${target.tier}`).join("|")}|${exactStateKey(initialState)}`;
}

async function solveGlobalEquipmentProfile(equipment, targets, cache, calculationRule, progressCallback, stats) {
  if (!targets.length) {
    return {
      value: 0,
      firstActionText: "当前装备无需承担全局目标",
      stateCount: 1,
      iterations: 0,
      residual: 0
    };
  }
  const targetInput = globalTargetInput(targets);
  const model = buildExactModel(targetInput);
  const initialState = buildExactInitialState(equipment.initialInput, model);
  // Target order defines T0/T1 codes. Equipment identity does not affect probability.
  const profileKey = globalProfileCacheKey(calculationRule, targets, initialState);
  if (cache.has(profileKey)) { stats.cacheHits += 1; return cache.get(profileKey); }
  stats.profileSolves += 1;
  const solution = await solveExactOptimal(initialState, model, calculationRule, progressCallback);
  cache.set(profileKey, solution);
  return solution;
}


export async function solveGlobal({ activeEquipments, config, calculationRule }, onProgress = () => {}) {
  const setBatchProgress = (percent, text) => onProgress({ percent, text });
  const setStatus = status => onProgress({ status });
  runExactSelfChecks();
  const assignmentLists = [];
  for (let index = 0; index < config.conditions.length; index += 1) {
    const condition = config.conditions[index];
    setBatchProgress((index / config.conditions.length) * 12, `枚举 ${condition.stat} 的档位组合…`);
    const assignments = enumerateGlobalStatAssignments(condition, activeEquipments);
    if (!assignments.length) throw new Error(`${condition.stat} 没有可行的档位分配。`);
    assignmentLists.push(assignments);
  }

  const candidatePlans = combineGlobalAssignments(
    config.conditions,
    assignmentLists,
    activeEquipments,
    config.requiredLines
  );
  if (!candidatePlans.length) {
    throw new Error("这些全局条件无法在每件装备最多 3 条词条的限制下同时满足。请减少条数、合计数值或跳过条件。 ");
  }

  const initialPlans = selectDiversifiedPlans(candidatePlans, {
    conditions: config.conditions,
    tierBasis: statTierBasisPoints,
    limit: GLOBAL_EXACT_PLAN_LIMIT,
  });
  setStatus(`找到 ${candidatePlans.length} 个初筛候选，正在使用有限状态 MDP 精算 ${initialPlans.length} 个多样化方案。`);
  const cache = new Map();
  const optimizationStats = { profileSolves: 0, cacheHits: 0, prunedPlans: 0 };
  const evaluatedResults = [];
  const failedPlans = [];
  const evaluatedSignatures = new Set();
  const evaluatePlanBatch = async (plans, progressStart, progressEnd, phaseLabel) => {
    const pendingPlans = plans.filter(plan => !evaluatedSignatures.has(globalPlanSignature(plan)));
    for (let planIndex = 0; planIndex < pendingPlans.length; planIndex += 1) {
      const plan = pendingPlans[planIndex];
      const equipmentResults = [];
      let totalExpectedCost = 0;
      let planFailed = false;
      let planPruned = false;
      evaluatedSignatures.add(globalPlanSignature(plan));
      for (let equipmentIndex = 0; equipmentIndex < activeEquipments.length; equipmentIndex += 1) {
        const equipment = activeEquipments[equipmentIndex];
        const targets = plan.targetsByEquipment[equipmentIndex];
        const completedProfiles = planIndex * activeEquipments.length + equipmentIndex;
        const totalProfiles = Math.max(1, pendingPlans.length * activeEquipments.length);
        const percent = progressStart + completedProfiles / totalProfiles * (progressEnd - progressStart);
        setBatchProgress(percent, `${phaseLabel} ${planIndex + 1}/${pendingPlans.length} · ${equipment.label} · 有限状态 MDP…`);
        try {
          const exactSolution = await solveGlobalEquipmentProfile(
            equipment,
            targets,
            cache,
            calculationRule,
            () => {},
            optimizationStats,
          );
          equipmentResults.push({ ...equipment, targets, exactSolution });
          totalExpectedCost += exactSolution.value;
          if (equipmentIndex < activeEquipments.length - 1 && cannotImproveGlobalBeam(
            totalExpectedCost, evaluatedResults.map(result => result.totalExpectedCost), GLOBAL_EXACT_SEARCH_BEAM,
          )) {
            optimizationStats.prunedPlans += 1;
            planPruned = true;
            break;
          }
        } catch (error) {
          failedPlans.push(error instanceof Error ? error.message : String(error));
          planFailed = true;
          break;
        }
      }
      if (!planFailed && !planPruned) evaluatedResults.push({ plan, equipmentResults, totalExpectedCost });
    }
  };

  await evaluatePlanBatch(initialPlans, 15, 45, "初筛候选");

  if (!evaluatedResults.length) {
    throw new Error(failedPlans[0] || "候选分配均未能完成有限状态 MDP 求解。请降低目标或减少条件后重试。");
  }
  let neighborhoodCandidateCount = 0;
  let roundsWithoutImprovement = 0;
  let previousBestCost = evaluatedResults.reduce(
    (best, result) => Math.min(best, result.totalExpectedCost),
    Number.POSITIVE_INFINITY
  );
  for (let round = 0; round < GLOBAL_EXACT_SEARCH_ROUNDS; round += 1) {
    evaluatedResults.sort((left, right) => left.totalExpectedCost - right.totalExpectedCost);
    const searchSeeds = evaluatedResults.slice(0, GLOBAL_EXACT_SEARCH_BEAM);
    const rawNeighborhoodPlans = searchSeeds.flatMap(result => expandGlobalPlanNeighbors(result.plan, {
      conditions: config.conditions,
      tierBasis: statTierBasisPoints,
      estimateCost: (equipmentIndex, stat, tier) => estimateGlobalTargetCost(
        activeEquipments[equipmentIndex],
        stat,
        tier
      ),
      perConditionLimit: GLOBAL_EXACT_NEIGHBOR_LIMIT,
    })).filter(plan => !evaluatedSignatures.has(globalPlanSignature(plan)));
    const neighborhoodPlans = selectDiversifiedPlans(rawNeighborhoodPlans, {
      conditions: config.conditions,
      tierBasis: statTierBasisPoints,
      limit: GLOBAL_EXACT_NEIGHBOR_LIMIT,
    });
    if (!neighborhoodPlans.length) break;
    neighborhoodCandidateCount += neighborhoodPlans.length;
    setStatus(`全局搜索第 ${round + 1} 轮：正在精算 ${neighborhoodPlans.length} 个通用邻域方案。`);
    const roundSpan = 53 / GLOBAL_EXACT_SEARCH_ROUNDS;
    const progressStart = 45 + round * roundSpan;
    await evaluatePlanBatch(neighborhoodPlans, progressStart, progressStart + roundSpan, `全局搜索 ${round + 1}`);

    const currentBestCost = evaluatedResults.reduce(
      (best, result) => Math.min(best, result.totalExpectedCost),
      Number.POSITIVE_INFINITY
    );
    if (currentBestCost < previousBestCost - 0.0001) {
      previousBestCost = currentBestCost;
      roundsWithoutImprovement = 0;
    } else {
      roundsWithoutImprovement += 1;
      if (roundsWithoutImprovement >= GLOBAL_EXACT_SEARCH_PATIENCE) break;
    }
  }

  evaluatedResults.sort((left, right) => left.totalExpectedCost - right.totalExpectedCost);
  const bestResult = evaluatedResults[0];

  for (let index = 0; index < bestResult.equipmentResults.length; index += 1) {
    const item = bestResult.equipmentResults[index];
    if (!item.targets.length) continue;
    setBatchProgress(98 + (index / bestResult.equipmentResults.length) * 2, `${item.label} · 生成可展开决策树…`);
    const targetInput = globalTargetInput(item.targets);
    const model = buildExactModel(targetInput);
    const initialState = buildExactInitialState(item.initialInput, model);
    item.exactSolution = await solveExactOptimal(
      initialState,
      model,
      calculationRule,
      () => {},
      true,
    );
  }

  return { bestResult, candidateCount: candidatePlans.length + neighborhoodCandidateCount, evaluatedCount: evaluatedResults.length, optimizationStats };
}

export async function solveEquipment({ initialInput, targetInput, calculationRule }, onProgress = () => {}) {
  const validationError = validateInputs(initialInput, targetInput);
  if (validationError) throw new Error(validationError);
  runExactSelfChecks();
  const model = buildExactModel(targetInput);
  const state = buildExactInitialState(initialInput, model);
  const exactSolution = await solveExactOptimal(state, model, calculationRule, (stage, current, detail) => onProgress({ stage, current, detail }), true);
  return { exactSolution, formulaResult: findFormulaFastPath(state, model, calculationRule) };
}
function validateInputs(initial, targets) {
  const initialStats = initial.filter(item => item.stat !== "空词条").map(item => item.stat);
  const targetStats = targets.filter(item => item.stat !== "空词条").map(item => item.stat);

  if (new Set(initialStats).size !== initialStats.length) return "当前装备存在重复词条。";
  if (new Set(targetStats).size !== targetStats.length) return "目标池存在重复词条。";
  if (targetStats.length === 0) return "请至少设置 1 个目标词条。";
  if (targets.filter(item => item.stat !== "空词条" && item.flagged).length > 3) return "必选词条不能超过 3 个。";
  const forcedRetentionError = validateForcedRetention(initial, targets);
  if (forcedRetentionError) return forcedRetentionError;
  return "";
}

export async function solveEquipmentBatch({ activeEquipments, calculationRule }, onProgress = () => {}) {
  const results = [];
  for (const [index, equipment] of activeEquipments.entries()) {
    const solved = await solveEquipment({ ...equipment, calculationRule }, ({ stage, current, detail }) => {
      const percent = (index + (stage === "graph" ? 0.36 : 0.72)) / activeEquipments.length * 100;
      const text = stage === "graph" ? `${equipment.label} · 已检查 ${current} 个状态，发现 ${detail} 个状态…` : `${equipment.label} · 第 ${current} 轮求解，残差 ${Number(detail).toExponential(2)}…`;
      onProgress({ percent, text });
    });
    results.push({ ...equipment, ...solved });
    onProgress({ percent: (index + 1) / activeEquipments.length * 100, text: `${equipment.label} · 计算完成` });
  }
  return results;
}

export { validateInputs, TIER_PROBS, STAT_NAMES, STAT_TIER_VALUES, isTargetCode, targetIndexFromCode, exactActionDescription, statTierBasisPoints, statTierText };

export { buildExactModel, buildExactInitialState, enumerateExactNameTransitions, enumerateExactValueTransitions };
