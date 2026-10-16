// Run the actual browser worker protocol in a separate Node thread for regression tests.
import { parentPort } from "node:worker_threads";
globalThis.self = { postMessage: data => parentPort.postMessage(data) };
await import("../../src/calculator/calculator.worker.js");
parentPort.on("message", data => self.onmessage({ data }));
