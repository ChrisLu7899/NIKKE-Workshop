// SPDX-License-Identifier: GPL-3.0-or-later
export const ARTWORK_CACHE = 'workshop-artwork-sha256-v1';
export const ARTWORK_HOST_PERMISSION = 'https://raw.githubusercontent.com/*';
export const ARTWORK_RAW_ROOT = 'https://raw.githubusercontent.com/ChrisLu7899/NIKKE-Workshop/';
export const artworkPath = (path) => typeof path === 'string' && /^ui-assets\/nikke\/character-artwork\/[a-z0-9_-]+\.webp$/.test(path);

export function validateArtworkManifest(value, appVersion) {
  if (value?.schemaVersion !== 1 || value.appVersion !== appVersion || !/^[a-f0-9]{64}$/.test(value.revision || '') || !Array.isArray(value.files) || !value.files.length || value.files.length > 10000) throw new Error('立绘清单与插件版本不匹配，请更新插件。');
  if (value.sourceRef !== null && !/^[a-f0-9]{40}$/.test(value.sourceRef || '')) throw new Error('立绘来源无效。');
  const seen = new Set(); let total = 0;
  for (const file of value.files) {
    if (!artworkPath(file.path) || seen.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || !Number.isSafeInteger(file.bytes) || file.bytes < 12 || file.bytes > 32 * 1024 ** 2) throw new Error('立绘清单包含无效文件。');
    seen.add(file.path); total += file.bytes;
  }
  if (total > 2 * 1024 ** 3) throw new Error('立绘素材包过大。');
  return { ...value, totalBytes: total };
}
export function artworkDownloadUrl(manifest, file) {
  if (!manifest.sourceRef || !manifest.files.some((entry) => entry.path === file.path && entry.sha256 === file.sha256)) throw new Error('这批立绘尚未发布，请使用完整安装包。');
  return `${ARTWORK_RAW_ROOT}${manifest.sourceRef}/public/${file.path}`;
}
export async function verifyArtwork(bytes, file) {
  if (bytes.byteLength !== file.bytes) throw new Error('立绘文件不完整，请重试。');
  const data = new Uint8Array(bytes);
  if (String.fromCharCode(...data.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...data.slice(8, 12)) !== 'WEBP') throw new Error('立绘文件格式错误。');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) => n.toString(16).padStart(2, '0')).join('');
  if (digest !== file.sha256) throw new Error('立绘校验失败，请重试。');
  return new Blob([bytes], { type: 'image/webp' });
}
