// SPDX-License-Identifier: GPL-3.0-or-later

import { toBlob } from "html-to-image";
import { CHARACTER_CARD_WIDTH, CHARACTER_CARD_HEIGHT } from "../domain/characterCardLayout.js";

export const CHARACTER_CARD_EXPORT_WIDTH = CHARACTER_CARD_WIDTH;
export const CHARACTER_CARD_EXPORT_HEIGHT = CHARACTER_CARD_HEIGHT;
export const CHARACTER_CARD_EXPORT_TIMEOUT_MS = 15000;

const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*]/g;

export function buildCharacterCardFilename(characterName) {
  const withoutControlCharacters = [...String(characterName || "")]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("");
  const safeName = withoutControlCharacters
    .replace(INVALID_FILENAME_CHARACTERS, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  const readableName = /^-+$/.test(safeName) ? "" : safeName;
  return `${readableName || "妮姬"}-角色卡.png`;
}

export async function withCardExportDeadline(task, { timeoutMs = CHARACTER_CARD_EXPORT_TIMEOUT_MS, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason || new Error("角色卡下载已取消。"));
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("角色卡生成超时，请检查图片加载后重试。")), timeoutMs);
  let onAbort;
  try {
    controller.signal.throwIfAborted();
    const cancelled = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([task(controller.signal), cancelled]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
}

function replaceFailedSnapshotImage(image) {
  const parent = image.parentElement;
  if (parent?.classList.contains("nikke-card-decoration")) parent.classList.add("is-unavailable");
  if (image.classList.contains("nikke-card-character-art")) {
    const placeholder = document.createElement("div");
    placeholder.className = "nikke-card-art-placeholder";
    const text = document.createElement("span");
    text.textContent = "暂无可用全身立绘";
    placeholder.append(text);
    image.replaceWith(placeholder);
  } else if (image.classList.contains("nikke-card-rarity")) {
    const fallback = document.createElement("span");
    fallback.className = "nikke-card-rarity nikke-card-rarity-fallback";
    fallback.textContent = image.alt.replace(/^稀有度\s*/, "") || "—";
    image.replaceWith(fallback);
  } else {
    if (parent?.classList.contains("nikke-card-meta")) {
      const fallback = document.createElement("span");
      fallback.textContent = "—";
      parent.append(fallback);
    }
    image.remove();
  }
}

function waitForImage(image, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener("load", complete);
      image.removeEventListener("error", complete);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => { cleanup(); reject(signal.reason); };
    const complete = async () => {
      cleanup();
      if (typeof image.decode === "function" && image.naturalWidth) await image.decode().catch(() => undefined);
      if (!image.naturalWidth) replaceFailedSnapshotImage(image);
      resolve();
    };
    if (signal.aborted) { abort(); return; }
    if (image.complete) { void complete(); return; }
    image.addEventListener("load", complete, { once: true });
    image.addEventListener("error", complete, { once: true });
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Clone synchronously before the first await: later edits cannot change the export. */
export async function renderCharacterCardPng(cardElement, options = {}) {
  if (!(cardElement instanceof HTMLElement)) throw new Error("角色卡画布尚未准备完成");
  const snapshot = cardElement.cloneNode(true);
  const font = getComputedStyle(cardElement).font;
  snapshot.style.font = font;
  // Inline transform contains the intended final position, not its animated matrix.
  for (const node of [snapshot, ...snapshot.querySelectorAll("*")]) {
    node.style.setProperty("transition", "none", "important");
    node.style.setProperty("animation", "none", "important");
    node.removeAttribute("id");
  }
  const host = document.createElement("div");
  host.dataset.characterCardExport = "";
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${CHARACTER_CARD_WIDTH}px;height:${CHARACTER_CARD_HEIGHT}px;pointer-events:none;`;
  host.append(snapshot);
  document.body.append(host);
  try {
    return await withCardExportDeadline(async (signal) => {
      await Promise.all([
        document.fonts?.ready,
        ...[...snapshot.querySelectorAll("img")].map((image) => waitForImage(image, signal)),
      ]);
      signal.throwIfAborted();
      const blob = await toBlob(snapshot, {
        width: CHARACTER_CARD_WIDTH, height: CHARACTER_CARD_HEIGHT,
        canvasWidth: CHARACTER_CARD_WIDTH, canvasHeight: CHARACTER_CARD_HEIGHT,
        pixelRatio: 1, backgroundColor: "#f8fafb", fetchRequestInit: { signal },
      });
      signal.throwIfAborted();
      if (!blob) throw new Error("无法生成角色卡图片");
      return blob;
    }, options);
  } finally {
    host.remove();
  }
}

export async function downloadCharacterCardPng(cardElement, characterName, options = {}) {
  const blob = await renderCharacterCardPng(cardElement, options);
  options.signal?.throwIfAborted();

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildCharacterCardFilename(characterName);
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
