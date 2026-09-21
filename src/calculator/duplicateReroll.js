// SPDX-License-Identifier: GPL-3.0-or-later

function normalizedTierWeights(tierWeights) {
  const weights = tierWeights.map(weight => Number(weight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!weights.length || weights.some(weight => !Number.isFinite(weight) || weight < 0) || total <= 0) {
    throw new Error("档位概率必须是总和大于 0 的非负数列");
  }
  return { weights, total };
}

/**
 * 新版重复结果规则：同一词条若抽到与当前完全相同的档位，该档位会被重新抽取。
 * 洗名称时仅在新旧词条名称相同的情况下应用；洗数值时名称天然相同。
 */
export function duplicateSafeTierOutcomes(tierWeights, previousTier = null, sameEffect = true) {
  const { weights, total } = normalizedTierWeights(tierWeights);
  const excludedIndex = sameEffect && Number.isInteger(previousTier)
    && previousTier >= 1 && previousTier <= weights.length
    ? previousTier - 1
    : -1;
  const denominator = total - (excludedIndex >= 0 ? weights[excludedIndex] : 0);
  if (denominator <= 0) throw new Error("排除重复档位后没有可用结果");

  return weights.flatMap((weight, index) => {
    if (index === excludedIndex || weight <= 0) return [];
    return [{ tier: index + 1, probability: weight / denominator }];
  });
}

/**
 * 将具体档位按“单档概率权重 × 是否达标”合并。相同权重组中的任一当前档位
 * 被排除后，组间转移完全一致，因此该压缩仍保持 Markov 转移精确。
 */
export function duplicateSafeTierGroups(
  tierWeights,
  minimumTier,
  previousTierWeight = null,
  sameEffect = true,
) {
  const { weights, total } = normalizedTierWeights(tierWeights);
  const excludedWeight = sameEffect && Number.isFinite(previousTierWeight)
    ? Number(previousTierWeight)
    : 0;
  const denominator = total - excludedWeight;
  if (denominator <= 0) throw new Error("排除重复档位后没有可用结果");

  const threshold = Math.max(1, Math.min(weights.length + 1, Number(minimumTier) || 1));
  const groups = new Map();
  weights.forEach((weight, index) => {
    const ok = index + 1 >= threshold;
    const key = `${weight}:${ok ? 1 : 0}`;
    const current = groups.get(key) ?? { tierWeight: weight, ok, weight: 0 };
    current.weight += weight;
    groups.set(key, current);
  });

  if (excludedWeight > 0) {
    const previousOkGroups = [...groups.values()].filter(group => group.tierWeight === excludedWeight);
    if (!previousOkGroups.length) throw new Error("当前档位概率不属于合法档位表");
    // 调用方的当前状态同时携带 ok；当阈值恰好切开同一权重组时，需由调用方指定。
  }

  return {
    denominator,
    groups,
  };
}

export function duplicateSafeTierGroupOutcomes(
  tierWeights,
  minimumTier,
  previousTierWeight = null,
  previousOk = false,
  sameEffect = true,
) {
  const { denominator, groups } = duplicateSafeTierGroups(
    tierWeights,
    minimumTier,
    previousTierWeight,
    sameEffect,
  );
  const excludedWeight = sameEffect && Number.isFinite(previousTierWeight)
    ? Number(previousTierWeight)
    : 0;
  if (excludedWeight > 0) {
    const key = `${excludedWeight}:${previousOk ? 1 : 0}`;
    const group = groups.get(key);
    if (!group || group.weight < excludedWeight) throw new Error("当前档位分组与达标状态不一致");
    group.weight -= excludedWeight;
  }
  return [...groups.values()].flatMap(group => group.weight > 0
    ? [{ tierWeight: group.tierWeight, ok: group.ok, probability: group.weight / denominator }]
    : []);
}

/**
 * 初次获得目标词条后，若未达标，继续按“不得与当前档位相同”规则洗数值时，
 * 到达最低档位所需的额外洗数值次数期望（已按初次普通抽档结果加权）。
 */
export function expectedDuplicateSafeValueRerolls(tierWeights, minimumTier) {
  const { weights, total } = normalizedTierWeights(tierWeights);
  const threshold = Math.max(1, Math.min(weights.length + 1, Number(minimumTier) || 1));
  const probabilities = weights.map(weight => weight / total);
  const failed = probabilities.slice(0, threshold - 1);
  const failureMass = failed.reduce((sum, probability) => sum + probability, 0);
  const successMass = 1 - failureMass;
  if (failureMass <= 0) return 0;
  if (successMass <= 0) return Number.POSITIVE_INFINITY;
  const repeatedFailureMass = failed.reduce((sum, probability) => sum + probability * probability, 0);
  return (failureMass - repeatedFailureMass) / successMass;
}
