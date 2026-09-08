// SPDX-License-Identifier: GPL-3.0-or-later
export const ocrAbortError = () => new DOMException("识别已取消，已完成结果仍可保留。", "AbortError");
export function checkOcrSignal(signal) { if (signal?.aborted) throw signal.reason || ocrAbortError(); }

export async function runOcrTask(task, { signal, timeoutMs = 60000, onStop } = {}) {
  checkOcrSignal(signal);
  const controller = new AbortController();
  let timer, stop;
  const cancelled = new Promise((_, reject) => {
    stop = () => {
      const reason = signal?.aborted ? signal.reason || ocrAbortError() : new Error("单张截图识别超时，请重试或缩小截图范围。");
      controller.abort(reason);
      onStop?.();
      reject(reason);
    };
    signal?.addEventListener("abort", stop, { once: true });
    timer = setTimeout(stop, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => task(controller.signal)), cancelled]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", stop); }
}

export function screenshotFileId(characterName, file) {
  return `${characterName}:${file.webkitRelativePath || file.relativePath || file.name}:${file.size || 0}:${file.lastModified || 0}`;
}

export async function runScreenshotBatch(groups, recognize, { signal, onResult, onProgress } = {}) {
  const files = (groups || []).flatMap((group) => group.images.map((file) => ({ characterName: group.characterName, file })));
  const results = [];
  for (let index = 0; index < files.length; index++) {
    if (signal?.aborted) break;
    const item = files[index], started = performance.now();
    onProgress?.({ phase: "image", current: index + 1, total: files.length, fileName: item.file.name });
    let result;
    try { result = await recognize(item, signal); }
    catch (error) {
      if (signal?.aborted) break;
      result = { type: "error", characterName: item.characterName, fileName: item.file.name,
        excluded: true, error: error?.message || String(error) };
    }
    result = { ...result, id: screenshotFileId(item.characterName, item.file), sourceFile: item.file, elapsedMs: Math.round(performance.now() - started) };
    results.push(result);
    onResult?.(result);
    // Let the UI paint progress and receive cancellation between images.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return results;
}

export function createOcrWorkerPool(factory) {
  const pending = new Map();
  let generation = 0;
  return {
    get(language) {
      if (!pending.has(language)) {
        const currentGeneration = generation;
        const promise = Promise.resolve().then(() => factory(language)).then((worker) => {
          if (generation !== currentGeneration) { void worker.terminate(); throw ocrAbortError(); }
          return worker;
        }).catch((error) => { if (pending.get(language) === promise) pending.delete(language); throw error; });
        pending.set(language, promise);
      }
      return pending.get(language);
    },
    reset() {
      generation++;
      for (const promise of pending.values()) void promise.then((worker) => worker.terminate()).catch(() => {});
      pending.clear();
    },
  };
}
