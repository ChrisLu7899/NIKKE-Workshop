// SPDX-License-Identifier: GPL-3.0-or-later

export function forcedRetentionMask(slots = []) {
  return slots.reduce((mask, slot, index) => (
    mask | (slot?.forced ? 1 << index : 0)
  ), 0);
}

export function includesForcedRetention(lockMask, slots = []) {
  const requiredMask = forcedRetentionMask(slots);
  return (lockMask & requiredMask) === requiredMask;
}

export function countLockedSlots(mask) {
  let count = 0;
  for (let value = Number(mask || 0); value; value >>>= 1) count += value & 1;
  return count;
}

export function lockTransitionCost(oldMask, newMask) {
  const retainedLocks = countLockedSlots(oldMask & newMask);
  const newLockCount = countLockedSlots(newMask);
  let cost = 0;
  for (let activeLocks = retainedLocks + 1; activeLocks <= newLockCount; activeLocks += 1) {
    cost += activeLocks + 1;
  }
  return cost;
}

export function rerollStoneCost(lockMask) {
  return countLockedSlots(lockMask) + 1;
}

export function effectiveTargetGoal(slots = [], configuredGoal = 0, isTargetCode = () => false) {
  const occupiedByNonTargets = slots.filter(slot => slot?.forced && !isTargetCode(slot.code)).length;
  return Math.max(0, Math.min(Number(configuredGoal || 0), slots.length - occupiedByNonTargets));
}

export function validateForcedRetention(initial = [], targets = [], emptyStat = "空词条") {
  const targetByStat = new Map(
    targets
      .filter(target => target?.stat && target.stat !== emptyStat)
      .map(target => [target.stat, target]),
  );
  const forcedLines = initial.filter(line => line?.forceKeep);

  if (forcedLines.some(line => !line.stat || line.stat === emptyStat)) {
    return "空词条不能设为强制保留。";
  }

  for (const line of forcedLines) {
    const target = targetByStat.get(line.stat);
    if (target && Number(line.tier || 0) < Number(target.tier || 0)) {
      return `${line.stat}当前档位低于目标最低档位，无法在强制保留的同时达成该目标。`;
    }
  }

  const forcedNonTargetCount = forcedLines.filter(line => !targetByStat.has(line.stat)).length;
  const targetCount = targetByStat.size;
  const effectiveGoal = Math.max(0, Math.min(3 - forcedNonTargetCount, targetCount));
  const mandatoryCount = [...targetByStat.values()].filter(target => target.flagged).length;
  if (mandatoryCount > effectiveGoal) {
    return `强制保留占用了 ${forcedNonTargetCount} 个非目标词条位，剩余位置无法容纳全部必选目标。`;
  }

  return "";
}
