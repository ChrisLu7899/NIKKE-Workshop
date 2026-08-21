// SPDX-License-Identifier: GPL-3.0-or-later

function clonePlan(plan) {
  return {
    ...plan,
    targetsByEquipment: plan.targetsByEquipment.map(targets => targets.map(target => ({ ...target }))),
  };
}

function planSignature(plan) {
  return plan.targetsByEquipment
    .map(targets => targets.map(target => `${target.stat}:${target.tier}`).sort().join("|"))
    .join("/");
}

function nonZeroTiers(assignment) {
  return assignment.tiers.filter(tier => tier > 0);
}

function assignmentBalanceScore(assignment) {
  const tiers = nonZeroTiers(assignment);
  if (tiers.length < 2) return 0;
  const mean = tiers.reduce((sum, tier) => sum + tier, 0) / tiers.length;
  return tiers.reduce((sum, tier) => sum + (tier - mean) ** 2, 0);
}

function planLoadScore(plan) {
  const loads = plan.targetsByEquipment.map(targets => targets.length);
  const mean = loads.reduce((sum, count) => sum + count, 0) / Math.max(1, loads.length);
  return loads.reduce((sum, count) => sum + (count - mean) ** 2, 0);
}

function planBalanceScore(plan) {
  const stats = new Set(plan.targetsByEquipment.flat().map(target => target.stat));
  return [...stats].reduce((sum, stat) => sum + statBalanceScore(plan, stat), 0);
}

function planExcessScore(plan, conditions, tierBasis) {
  return conditions.reduce((sum, condition) => {
    const totalBasis = plan.targetsByEquipment
      .flat()
      .filter(target => target.stat === condition.stat)
      .reduce((targetSum, target) => targetSum + tierBasis(target.stat, target.tier), 0);
    return sum + Math.max(0, totalBasis - condition.minTotalBasis);
  }, 0);
}

function roundRobinRankings(rankings, signatureOf, limit) {
  const selected = [];
  const signatures = new Set();
  let cursor = 0;
  while (selected.length < limit && rankings.some(ranking => cursor < ranking.length)) {
    for (const ranking of rankings) {
      const candidate = ranking[cursor];
      if (!candidate) continue;
      const signature = signatureOf(candidate);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      selected.push(candidate);
      if (selected.length >= limit) break;
    }
    cursor += 1;
  }
  return selected;
}

export function selectDiversifiedAssignments(assignments, limit) {
  const rankings = [
    [...assignments].sort((left, right) => left.approximateCost - right.approximateCost
      || left.totalBasis - right.totalBasis),
    [...assignments].sort((left, right) => assignmentBalanceScore(left) - assignmentBalanceScore(right)
      || left.approximateCost - right.approximateCost),
    [...assignments].sort((left, right) => left.totalBasis - right.totalBasis
      || left.approximateCost - right.approximateCost),
    [...assignments].sort((left, right) => Math.max(...nonZeroTiers(left)) - Math.max(...nonZeroTiers(right))
      || left.approximateCost - right.approximateCost),
  ];
  return roundRobinRankings(rankings, assignment => assignment.tiers.join(","), limit);
}

export function selectDiversifiedPlans(plans, {
  conditions,
  tierBasis,
  limit,
}) {
  const rankings = [
    [...plans].sort((left, right) => left.approximateCost - right.approximateCost),
    [...plans].sort((left, right) => planBalanceScore(left) - planBalanceScore(right)
      || left.approximateCost - right.approximateCost),
    [...plans].sort((left, right) => planExcessScore(left, conditions, tierBasis)
      - planExcessScore(right, conditions, tierBasis)
      || left.approximateCost - right.approximateCost),
    [...plans].sort((left, right) => planLoadScore(left) - planLoadScore(right)
      || left.approximateCost - right.approximateCost),
  ];
  return roundRobinRankings(rankings, planSignature, limit);
}

function statBalanceScore(plan, stat) {
  const tiers = plan.targetsByEquipment
    .flat()
    .filter(target => target.stat === stat)
    .map(target => target.tier);
  if (tiers.length < 2) return 0;
  const mean = tiers.reduce((sum, tier) => sum + tier, 0) / tiers.length;
  const spread = Math.max(...tiers) - Math.min(...tiers);
  const deviation = tiers.reduce((sum, tier) => sum + (tier - mean) ** 2, 0);
  return spread * 100 + deviation;
}

function conditionSatisfied(plan, condition, tierBasis) {
  const targets = plan.targetsByEquipment
    .flat()
    .filter(target => target.stat === condition.stat);
  if (targets.length < condition.minCount) return false;
  const totalBasis = targets.reduce((sum, target) => sum + tierBasis(target.stat, target.tier), 0);
  return totalBasis >= condition.minTotalBasis;
}

function refreshPlanCost(plan, estimateCost) {
  plan.totalLines = plan.targetsByEquipment.reduce((sum, targets) => sum + targets.length, 0);
  plan.approximateCost = plan.targetsByEquipment.reduce(
    (sum, targets, equipmentIndex) => sum + targets.reduce(
      (targetSum, target) => targetSum + estimateCost(equipmentIndex, target.stat, target.tier),
      0
    ),
    0
  );
  return plan;
}

function selectDiversified(candidates, stat, limit) {
  const selected = [];
  const signatures = new Set();
  const rankings = [
    [...candidates].sort((left, right) => statBalanceScore(left, stat) - statBalanceScore(right, stat)
      || left.approximateCost - right.approximateCost),
    [...candidates].sort((left, right) => left.approximateCost - right.approximateCost
      || statBalanceScore(left, stat) - statBalanceScore(right, stat)),
  ];
  let cursor = 0;
  while (selected.length < limit && rankings.some(ranking => cursor < ranking.length)) {
    for (const ranking of rankings) {
      const candidate = ranking[cursor];
      if (!candidate) continue;
      const signature = planSignature(candidate);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      selected.push(candidate);
      if (selected.length >= limit) break;
    }
    cursor += 1;
  }
  return selected;
}

export function expandGlobalPlanNeighbors(seedPlan, {
  conditions,
  tierBasis,
  estimateCost,
  maxTier = 15,
  perConditionLimit = 6,
}) {
  const seedSignature = planSignature(seedPlan);
  const selected = [];
  const selectedSignatures = new Set([seedSignature]);

  for (const condition of conditions) {
    const stat = condition.stat;
    const holders = [];
    seedPlan.targetsByEquipment.forEach((targets, equipmentIndex) => {
      const targetIndex = targets.findIndex(target => target.stat === stat);
      if (targetIndex >= 0) holders.push({ equipmentIndex, targetIndex });
    });
    const candidates = [];
    const candidateSignatures = new Set();
    const addCandidate = plan => {
      if (!conditionSatisfied(plan, condition, tierBasis)) return;
      const signature = planSignature(plan);
      if (signature === seedSignature || candidateSignatures.has(signature)) return;
      candidateSignatures.add(signature);
      candidates.push(refreshPlanCost(plan, estimateCost));
    };

    for (const donor of holders) {
      const donorTier = seedPlan.targetsByEquipment[donor.equipmentIndex][donor.targetIndex].tier;
      if (donorTier > 1) {
        const lowered = clonePlan(seedPlan);
        lowered.targetsByEquipment[donor.equipmentIndex][donor.targetIndex].tier -= 1;
        addCandidate(lowered);
      }
      for (const receiver of holders) {
        if (receiver.equipmentIndex === donor.equipmentIndex || donorTier <= 1) continue;
        const receiverTier = seedPlan.targetsByEquipment[receiver.equipmentIndex][receiver.targetIndex].tier;
        if (receiverTier >= maxTier) continue;
        const rebalanced = clonePlan(seedPlan);
        rebalanced.targetsByEquipment[donor.equipmentIndex][donor.targetIndex].tier -= 1;
        rebalanced.targetsByEquipment[receiver.equipmentIndex][receiver.targetIndex].tier += 1;
        addCandidate(rebalanced);
      }
    }

    for (const holder of holders) {
      const removed = clonePlan(seedPlan);
      removed.targetsByEquipment[holder.equipmentIndex].splice(holder.targetIndex, 1);
      addCandidate(removed);
    }

    seedPlan.targetsByEquipment.forEach((receiverTargets, receiverIndex) => {
      if (receiverTargets.length >= 3 || receiverTargets.some(item => item.stat === stat)) return;
      const added = clonePlan(seedPlan);
      added.targetsByEquipment[receiverIndex].push({ stat, tier: 1 });
      addCandidate(added);
    });

    for (const holder of holders) {
      const target = seedPlan.targetsByEquipment[holder.equipmentIndex][holder.targetIndex];
      seedPlan.targetsByEquipment.forEach((receiverTargets, receiverIndex) => {
        if (receiverIndex === holder.equipmentIndex
          || receiverTargets.length >= 3
          || receiverTargets.some(item => item.stat === stat)) return;
        const moved = clonePlan(seedPlan);
        moved.targetsByEquipment[holder.equipmentIndex].splice(holder.targetIndex, 1);
        moved.targetsByEquipment[receiverIndex].push({ ...target });
        addCandidate(moved);
      });
    }

    selectDiversified(candidates, stat, perConditionLimit).forEach(candidate => {
      const signature = planSignature(candidate);
      if (selectedSignatures.has(signature)) return;
      selectedSignatures.add(signature);
      selected.push(candidate);
    });
  }


  for (let leftEquipment = 0; leftEquipment < seedPlan.targetsByEquipment.length; leftEquipment += 1) {
    for (let rightEquipment = leftEquipment + 1; rightEquipment < seedPlan.targetsByEquipment.length; rightEquipment += 1) {
      const leftTargets = seedPlan.targetsByEquipment[leftEquipment];
      const rightTargets = seedPlan.targetsByEquipment[rightEquipment];
      for (let leftIndex = 0; leftIndex < leftTargets.length; leftIndex += 1) {
        for (let rightIndex = 0; rightIndex < rightTargets.length; rightIndex += 1) {
          const leftTarget = leftTargets[leftIndex];
          const rightTarget = rightTargets[rightIndex];
          if (leftTarget.stat === rightTarget.stat
            || leftTargets.some((target, index) => index !== leftIndex && target.stat === rightTarget.stat)
            || rightTargets.some((target, index) => index !== rightIndex && target.stat === leftTarget.stat)) continue;
          const swapped = clonePlan(seedPlan);
          swapped.targetsByEquipment[leftEquipment][leftIndex] = { ...rightTarget };
          swapped.targetsByEquipment[rightEquipment][rightIndex] = { ...leftTarget };
          if (!conditions.every(condition => conditionSatisfied(swapped, condition, tierBasis))) continue;
          refreshPlanCost(swapped, estimateCost);
          const signature = planSignature(swapped);
          if (selectedSignatures.has(signature)) continue;
          selectedSignatures.add(signature);
          selected.push(swapped);
        }
      }
    }
  }

  return selected;
}
