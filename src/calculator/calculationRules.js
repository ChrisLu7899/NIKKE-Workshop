// SPDX-License-Identifier: GPL-3.0-or-later

export const CALCULATION_RULES = Object.freeze({
  GLOBAL_CURRENT: "global-current",
  CN_LEGACY: "cn-legacy",
});

export function normalizeCalculationRule(value) {
  return value === CALCULATION_RULES.CN_LEGACY
    ? CALCULATION_RULES.CN_LEGACY
    : CALCULATION_RULES.GLOBAL_CURRENT;
}

export function calculationRuleLabel(value) {
  return normalizeCalculationRule(value) === CALCULATION_RULES.CN_LEGACY
    ? "国服（旧规则）"
    : "国际服（新规则）";
}

export function usesDuplicateSafeRerolls(value) {
  return normalizeCalculationRule(value) === CALCULATION_RULES.GLOBAL_CURRENT;
}

export function canKeepRerollCandidate(value) {
  return normalizeCalculationRule(value) === CALCULATION_RULES.GLOBAL_CURRENT;
}

function groupedCandidates(transitions, values, currentIndex) {
  const groups = new Map();
  transitions.forEach(transition => {
    const index = Number(transition.index);
    const probability = Number(transition.probability);
    if (index === currentIndex || probability <= 0) return;
    groups.set(index, (groups.get(index) || 0) + probability);
  });
  return [...groups].map(([index, probability]) => ({
    index,
    probability,
    value: values[index],
  })).sort((left, right) => left.value - right.value || left.index - right.index);
}

/**
 * 新版规则下，每次看到候选结果后都可“覆盖”或“保留原结果”。
 * 对固定动作，最优接受集合必然是按后续价值从小到大排列后的一个前缀。
 */
export function evaluateKeepOrReplaceAction(immediateCost, transitions, values, currentIndex) {
  const candidates = groupedCandidates(transitions, values, currentIndex);
  let acceptedProbability = 0;
  let acceptedFutureValue = 0;
  let bestValue = Number.POSITIVE_INFINITY;
  let bestCount = 0;
  let bestProbability = 0;

  candidates.forEach((candidate, index) => {
    acceptedProbability += candidate.probability;
    acceptedFutureValue += candidate.probability * candidate.value;
    const value = (Number(immediateCost) + acceptedFutureValue) / acceptedProbability;
    if (value < bestValue) {
      bestValue = value;
      bestCount = index + 1;
      bestProbability = acceptedProbability;
    }
  });

  return {
    value: bestValue,
    acceptedProbability: bestProbability,
    acceptedStateIndexes: new Set(candidates.slice(0, bestCount).map(candidate => candidate.index)),
  };
}

export function applyKeepOrReplacePolicy(transitions, currentIndex, acceptedStateIndexes) {
  const probabilities = new Map();
  transitions.forEach(transition => {
    const accepted = transition.index !== currentIndex && acceptedStateIndexes.has(transition.index);
    const index = accepted ? transition.index : currentIndex;
    probabilities.set(index, (probabilities.get(index) || 0) + transition.probability);
  });
  return [...probabilities].map(([index, probability]) => ({ index, probability }));
}
