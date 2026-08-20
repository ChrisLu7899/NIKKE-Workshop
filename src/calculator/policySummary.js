// SPDX-License-Identifier: GPL-3.0-or-later

function policyAction(recordList, policy, stateIndex) {
  const record = recordList[stateIndex];
  const actionIndex = policy[stateIndex];
  return actionIndex >= 0 ? record?.actions[actionIndex] || null : null;
}

function addProbability(distribution, stateIndex, probability) {
  if (probability <= 0) return;
  distribution.set(stateIndex, (distribution.get(stateIndex) || 0) + probability);
}

function normalizedDistribution(distribution) {
  const total = [...distribution.values()].reduce((sum, probability) => sum + probability, 0);
  if (total <= 0) return new Map();
  return new Map([...distribution].map(([stateIndex, probability]) => [stateIndex, probability / total]));
}

export function createPolicyStageSummary({
  recordList,
  policy,
  values,
  startIndex,
  describeAction,
  maxStages = 8,
  tolerance = 1e-12,
  maxIterations = 100000,
}) {
  const stages = [];
  let stageStart = new Map([[startIndex, 1]]);

  for (let stageIndex = 0; stageIndex < maxStages; stageIndex += 1) {
    stageStart = normalizedDistribution(new Map(
      [...stageStart].filter(([stateIndex]) => !recordList[stateIndex]?.terminal),
    ));
    if (!stageStart.size) break;

    const actionGroups = new Map();
    stageStart.forEach((probability, stateIndex) => {
      const record = recordList[stateIndex];
      const action = policyAction(recordList, policy, stateIndex);
      if (!record || !action) return;
      const text = describeAction(record.state, action);
      actionGroups.set(text, (actionGroups.get(text) || 0) + probability);
    });
    if (actionGroups.size !== 1) return { stages, branched: true };

    const [actionText] = actionGroups.keys();
    const representativeStateIndex = stageStart.keys().next().value;
    const representativeAction = policyAction(recordList, policy, representativeStateIndex);
    const totalExpectedCost = [...stageStart].reduce(
      (sum, [stateIndex, probability]) => sum + probability * Number(values[stateIndex] || 0),
      0,
    );

    let active = new Map(stageStart);
    const exits = new Map();
    let stageExpectedCost = 0;
    let converged = false;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const nextActive = new Map();
      active.forEach((stateProbability, stateIndex) => {
        const record = recordList[stateIndex];
        const action = policyAction(recordList, policy, stateIndex);
        if (!record || !action) {
          addProbability(exits, stateIndex, stateProbability);
          return;
        }

        stageExpectedCost += stateProbability * action.immediateCost;
        action.transitions.forEach(transition => {
          const probability = stateProbability * transition.probability;
          const nextRecord = recordList[transition.index];
          const nextAction = policyAction(recordList, policy, transition.index);
          const nextActionText = nextRecord?.terminal || !nextAction
            ? null
            : describeAction(nextRecord.state, nextAction);
          if (nextActionText === actionText) {
            addProbability(nextActive, transition.index, probability);
          } else {
            addProbability(exits, transition.index, probability);
          }
        });
      });

      const remainingProbability = [...nextActive.values()].reduce((sum, probability) => sum + probability, 0);
      if (remainingProbability < tolerance) {
        converged = true;
        break;
      }
      active = nextActive;
    }

    if (!converged) return { stages, branched: true };
    const exitProbability = [...exits.values()].reduce((sum, probability) => sum + probability, 0);
    const continuationProbability = [...exits].reduce((sum, [stateIndex, probability]) => {
      return sum + (recordList[stateIndex]?.terminal ? 0 : probability);
    }, 0) / exitProbability;
    const exitDistribution = normalizedDistribution(exits);
    stages.push({
      actionText,
      actionMode: representativeAction?.mode || "",
      stageExpectedCost,
      totalExpectedCost,
      continuationProbability,
      startDistribution: [...stageStart].map(([stateIndex, probability]) => ({ stateIndex, probability })),
      exitDistribution: [...exitDistribution].map(([stateIndex, probability]) => ({ stateIndex, probability })),
    });
    stageStart = exitDistribution;
  }

  return {
    stages,
    branched: [...stageStart].some(([stateIndex]) => !recordList[stateIndex]?.terminal),
  };
}
