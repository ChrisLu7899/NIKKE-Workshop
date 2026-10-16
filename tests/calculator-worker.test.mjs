import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { runCalculatorWorker } from "../src/calculator/workerClient.js";
import { solveEquipment, solveGlobal } from "../src/calculator/engine.js";
import { createPolicyBranchStage } from "../src/calculator/policyTree.js";

const fixtures = JSON.parse(await fs.readFile(new URL("./fixtures/calculator-worker-baseline.json", import.meta.url), "utf8"));
function threadFactory() {
  const thread = new Worker(new URL("./fixtures/calculator-worker-node.mjs", import.meta.url));
  const bridge = {
    postMessage: data => thread.postMessage(data),
    terminate: () => thread.terminate(),
  };
  thread.on("message", data => bridge.onmessage({ data }));
  thread.on("error", error => bridge.onerror({ message: error.message, preventDefault() {} }));
  return bridge;
}

test("worker keeps pre-migration results for both rules, locks, forced slots and completed targets", async () => {
  for (const fixture of fixtures.filter(item => !item.name.startsWith("three targets"))) {
    const result = await runCalculatorWorker("single", fixture, () => {}, threadFactory);
    const { value, firstActionText, stateCount, iterations } = result.exactSolution;
    assert.ok(Math.abs(value - fixture.expected.value) < 1e-7, fixture.name);
    assert.deepEqual({ firstActionText, stateCount, iterations }, {
      firstActionText: fixture.expected.firstActionText,
      stateCount: fixture.expected.stateCount,
      iterations: fixture.expected.iterations,
    }, fixture.name);
    assert.ok(result.exactSolution.model.targetByName instanceof Map);
    assert.ok(result.exactSolution.model.mandatoryCodes instanceof Set);
    const policy = result.exactSolution.policyData;
    assert.ok(ArrayBuffer.isView(policy.values));
    assert.ok(createPolicyBranchStage({ ...policy, describeAction: () => "action" }));
  }
});

test("batch worker preserves equipment identity and complete policy data", async () => {
  const input = fixtures[0];
  const activeEquipments = [0, 2].map(index => ({ ...input, index, label: `equipment-${index}` }));
  const progress = [];
  const results = await runCalculatorWorker("batch", { activeEquipments, calculationRule: input.calculationRule }, p => progress.push(p), threadFactory);
  assert.deepEqual(results.map(item => item.index), [0, 2]);
  assert.ok(progress.length > 0);
  for (const item of results) assert.deepEqual(item.exactSolution, (await solveEquipment(input)).exactSolution);
});

test("global worker retains allocations, skipped equipment indexes and decision trees", async () => {
  const input = {
    calculationRule: "cn-legacy",
    activeEquipments: [0, 3].map(index => ({ ...fixtures[0], index, label: `equipment-${index}` })),
    config: { conditions: [{ stat: "攻击力增加", minCount: 2, minTotal: 10, minTotalBasis: 1000 }], requiredLines: 2 },
  };
  const result = await runCalculatorWorker("global", input, () => {}, threadFactory);
  assert.deepEqual(result, await solveGlobal(input));
  assert.deepEqual(result.bestResult.equipmentResults.map(item => item.index), [0, 3]);
  const targets = result.bestResult.plan.targetsByEquipment.flat();
  assert.equal(targets.length, 2);
  assert.ok(result.bestResult.equipmentResults.every(item => item.exactSolution.policyData));
});

test("worker reports validation failure and a subsequent calculation can succeed", async () => {
  await assert.rejects(runCalculatorWorker("single", { ...fixtures[0], targetInput: [] }, () => {}, threadFactory), /至少设置/);
  await assert.rejects(runCalculatorWorker("unknown", {}, () => {}, threadFactory), /未知计算任务/);
  assert.ok((await runCalculatorWorker("single", fixtures[0], () => {}, threadFactory)).exactSolution.value > 0);
});

test("worker client cleans up on runtime, clone and startup failures", async () => {
  for (const kind of ["runtime", "decode", "send"]) {
    let terminated = 0;
    const fake = {
      terminate() { terminated++; },
      postMessage() {
        if (kind === "send") throw new Error("clone failed");
        queueMicrotask(() => kind === "runtime"
          ? fake.onerror({ message: "runtime failed", preventDefault() {} })
          : fake.onmessageerror());
      },
    };
    await assert.rejects(runCalculatorWorker("single", {}, () => {}, () => fake));
    assert.equal(terminated, 1);
  }
  await assert.rejects(runCalculatorWorker("single", {}, () => {}, () => { throw new Error("startup failed"); }), /startup failed/);
});
