// SPDX-License-Identifier: GPL-3.0-or-later
import { createPolicyStageSummary } from "./policySummary.js";

function selectedAction(records, policy, stateIndex) {
  const record = records[stateIndex];
  const actionIndex = policy[stateIndex];
  return actionIndex >= 0 ? record?.actions[actionIndex] || null : null;
}

export function createPolicyBranchStage({
  records,
  policy,
  values,
  startIndex,
  describeAction,
}) {
  const record = records[startIndex];
  if (!record || record.terminal) {
    return {
      terminal: true,
      startIndex,
      actionText: "目标已经完成",
      stageExpectedCost: 0,
      totalExpectedCost: 0,
      branches: [],
    };
  }

  const summary = createPolicyStageSummary({
    recordList: records,
    policy,
    values,
    startIndex,
    describeAction,
    maxStages: 1,
  });
  const stage = summary.stages[0];
  if (!stage) return null;

  return {
    terminal: false,
    startIndex,
    actionText: stage.actionText,
    actionMode: stage.actionMode,
    stageExpectedCost: stage.stageExpectedCost,
    totalExpectedCost: stage.totalExpectedCost,
    branches: stage.exitDistribution.map(({ stateIndex, probability }) => {
      const nextRecord = records[stateIndex];
      const nextAction = selectedAction(records, policy, stateIndex);
      return {
        stateIndex,
        probability,
        terminal: Boolean(nextRecord?.terminal || !nextAction),
        remainingExpectedCost: Number(values[stateIndex] || 0),
        nextActionText: nextRecord?.terminal || !nextAction
          ? "目标已经完成"
          : describeAction(nextRecord.state, nextAction),
        state: nextRecord?.state || null,
      };
    }).sort((left, right) => right.probability - left.probability),
  };
}
