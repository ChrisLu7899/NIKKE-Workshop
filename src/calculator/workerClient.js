// SPDX-License-Identifier: GPL-3.0-or-later
export function runCalculatorWorker(type, input, onProgress = () => {}, createWorker = () =>
  new Worker(new URL("./calculator.worker.js", import.meta.url), { type: "module" })
) {
  return new Promise((resolve, reject) => {
    let worker;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    try {
      worker = createWorker();
      worker.onmessage = ({ data }) => {
        if (settled) return;
        if (data.type === "progress") {
          try { onProgress(data.progress); } catch (error) { finish(error); }
        } else if (data.type === "result") {
          finish(null, data.result);
        } else if (data.type === "error") {
          finish(new Error(data.message || "计算线程执行失败"));
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        finish(new Error(event.message || "计算线程启动或运行失败，请重新加载插件后重试"));
      };
      worker.onmessageerror = () => finish(new Error("计算线程结果读取失败，请重新计算"));
      worker.postMessage({ type, input });
    } catch (error) {
      finish(error);
    }
  });
}
