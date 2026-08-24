// SPDX-License-Identifier: GPL-3.0-or-later

const IMAGE_PATTERN = /\.(?:png|jpe?g|webp|bmp)$/i;

export function groupScreenshotFiles(files) {
  const groups = new Map();
  (files || []).forEach((file) => {
    if (!IMAGE_PATTERN.test(file?.name || "")) return;
    const relativePath = String(file.webkitRelativePath || file.relativePath || file.name || "").replace(/\\/g, "/");
    const parts = relativePath.split("/").filter(Boolean);
    const characterName = parts.length >= 2 ? parts[parts.length - 2].trim() : "";
    if (!characterName) return;
    if (!groups.has(characterName)) groups.set(characterName, []);
    groups.get(characterName).push(file);
  });
  return [...groups.entries()].map(([characterName, images]) => ({ characterName, images }));
}

export async function readScreenshotDirectoryHandle(rootHandle) {
  const files = [];
  for await (const [characterName, handle] of rootHandle.entries()) {
    if (handle.kind !== "directory") continue;
    for await (const [, fileHandle] of handle.entries()) {
      if (fileHandle.kind !== "file" || !IMAGE_PATTERN.test(fileHandle.name)) continue;
      const file = await fileHandle.getFile();
      Object.defineProperty(file, "relativePath", { value: `${rootHandle.name}/${characterName}/${file.name}` });
      files.push(file);
    }
  }
  return groupScreenshotFiles(files);
}

export async function chooseScreenshotDirectory({ fallbackInput } = {}) {
  if (typeof window.showDirectoryPicker === "function") {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    return readScreenshotDirectoryHandle(handle);
  }
  fallbackInput?.click();
  return null;
}
