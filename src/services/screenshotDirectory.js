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

export function chooseScreenshotDirectory({ fallbackInput } = {}) {
  // 始终使用 webkitdirectory：部分 Chromium 环境通过 showDirectoryPicker
  // 枚举目录句柄时会漏掉名称以“~”开头或含特殊字符的有效截图，而目录
  // 文件控件会完整保留这些文件及其 webkitRelativePath。
  fallbackInput?.click();
  return null;
}
