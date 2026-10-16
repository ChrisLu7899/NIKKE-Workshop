// SPDX-License-Identifier: GPL-3.0-or-later
import { solveEquipment, solveEquipmentBatch, solveGlobal } from "./engine.js";

const solvers = { single: solveEquipment, batch: solveEquipmentBatch, global: solveGlobal };

self.onmessage = async ({ data: { type, input } }) => {
  let lastProgressAt = -Infinity;
  const onProgress = progress => {
    const now = performance.now();
    // Progress is presentation only; throttling never blocks the solver.
    if (now - lastProgressAt < 80 && !progress.status && progress.percent !== 100) return;
    lastProgressAt = now;
    self.postMessage({ type: "progress", progress });
  };
  try {
    if (!Object.hasOwn(solvers, type)) throw new Error("未知计算任务");
    const result = await solvers[type](input, onProgress);
    // Structured clone preserves Maps, Sets and typed arrays in the decision tree.
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
