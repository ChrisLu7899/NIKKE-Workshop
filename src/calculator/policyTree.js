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

export function createCandidateDecisionStage({
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
      singleCost: 0,
      acceptedProbability: 1,
      retainProbability: 0,
      expectedAttempts: 0,
      stageExpectedCost: 0,
      totalExpectedCost: 0,
      branches: [],
    };
  }

  const action = selectedAction(records, policy, startIndex);
  if (!action?.candidateTransitions || !Array.isArray(action.acceptedStateIndexes)) return null;

  const acceptedStateIndexes = new Set(action.acceptedStateIndexes);
  const branches = [];
  let acceptedProbability = 0;
  let retainProbability = 0;

  action.candidateTransitions.forEach(transition => {
    if (!acceptedStateIndexes.has(transition.index)) {
      retainProbability += transition.probability;
      return;
    }
    acceptedProbability += transition.probability;
    const nextRecord = records[transition.index];
    const nextAction = selectedAction(records, policy, transition.index);
    branches.push({
      stateIndex: transition.index,
      probability: transition.probability,
      terminal: Boolean(nextRecord?.terminal || !nextAction),
      remainingExpectedCost: Number(values[transition.index] || 0),
      nextActionText: nextRecord?.terminal || !nextAction
        ? "目标已经完成"
        : describeAction(nextRecord.state, nextAction),
      state: nextRecord?.state || null,
    });
  });

  const singleCost = Number(action.immediateCost || 0);
  const expectedAttempts = acceptedProbability > 0 ? 1 / acceptedProbability : Infinity;
  return {
    terminal: false,
    startIndex,
    action,
    actionText: describeAction(record.state, action),
    singleCost,
    acceptedProbability,
    retainProbability,
    expectedAttempts,
    stageExpectedCost: acceptedProbability > 0 ? singleCost / acceptedProbability : Infinity,
    totalExpectedCost: Number(values[startIndex] || 0),
    branches: branches.sort((left, right) => right.probability - left.probability),
  };
}
