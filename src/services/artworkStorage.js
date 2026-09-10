// SPDX-License-Identifier: GPL-3.0-or-later
import { ARTWORK_CACHE, ARTWORK_HOST_PERMISSION, validateArtworkManifest, artworkDownloadUrl, verifyArtwork } from '../domain/artworkPackage.js';

const localUrl = (path) => globalThis.chrome?.runtime?.getURL?.(path) || `/${path}`;
let manifestPromise;
export function getArtworkManifest() {
  if (!manifestPromise) manifestPromise = fetch(localUrl('artwork-manifest.json'), { cache: 'no-store' }).then(async (r) => {
    if (!r.ok) throw new Error('无法读取立绘清单。');
    const value = await r.json();
    return validateArtworkManifest(value, globalThis.chrome?.runtime?.getManifest?.().version || value.appVersion);
  }).catch((e) => { manifestPromise = null; throw e; });
  return manifestPromise;
}
// Cache keys are synthetic HTTPS URLs; Cache.put rejects chrome-extension schemes.
// These keys are never fetched from the network.
const cacheUrl = (file) => `https://workshop-artwork.invalid/${file.sha256}.webp`;
const localMissing = new Set();
let installedPromise;
async function installedFiles() {
  if (!installedPromise) installedPromise = fetch(localUrl('artwork-installed.json'), { cache: 'no-store' }).then(async (r) => {
    if (!r.ok) return null;
    const data = await r.json();
    return data.schemaVersion === 1 && Array.isArray(data.files) ? new Map(data.files.map((f) => [f.path, f.sha256])) : null;
  }).catch(() => null);
  return installedPromise;
}

/** Never fetch remote images here: rendering and inspection are local-only. */
export async function readArtwork(file, { signal } = {}) {
  signal?.throwIfAborted();
  const cache = await caches.open(ARTWORK_CACHE);
  const cached = await cache.match(cacheUrl(file));
  if (cached) {
    try { return await verifyArtwork(await cached.arrayBuffer(), file); } catch { /* Corrupt entry stays unused until an explicit download repairs it. */ }
  }
  if (localMissing.has(file.sha256)) return null;
  const installed = await installedFiles();
  if (installed && installed.get(file.path) !== file.sha256) return null;
  try {
    const response = await fetch(localUrl(file.path), { signal, cache: 'no-store' });
    if (!response.ok) { localMissing.add(file.sha256); return null; }
    return await verifyArtwork(await response.arrayBuffer(), file);
  } catch (error) {
    if (signal?.aborted) throw error;
    localMissing.add(file.sha256); return null;
  }
}
export async function resolveArtwork(url) {
  if (!url) return null;
  const manifest = await getArtworkManifest();
  const path = url.replace(/^\//, '');
  const file = manifest.files.find((entry) => entry.path === path);
  // Custom character URLs are not part of the optional managed artwork package.
  if (!file) return { url, revoke: false };
  const blob = await readArtwork(file);
  if (!blob) return null;
  // A self-contained URL keeps an in-flight PNG export valid after skin changes.
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  return { url: dataUrl, revoke: false };
}
export async function inspectArtwork(onProgress = () => {}, signal) {
  const manifest = await getArtworkManifest();
  let available = 0, availableBytes = 0, checked = 0;
  for (const file of manifest.files) {
    signal?.throwIfAborted();
    if (await readArtwork(file, { signal })) { available++; availableBytes += file.bytes; }
    checked++;
    if (checked % 20 === 0 || checked === manifest.files.length) onProgress({ available, availableBytes, checked, total: manifest.files.length, totalBytes: manifest.totalBytes });
  }
  return { available, availableBytes, checked, total: manifest.files.length, totalBytes: manifest.totalBytes, sourceRef: manifest.sourceRef };
}
export function requestArtworkPermission() {
  if (!globalThis.chrome?.permissions?.request) return Promise.resolve(true);
  return chrome.permissions.request({ origins: [ARTWORK_HOST_PERMISSION], permissions: ['unlimitedStorage'] });
}
async function fetchImage(url, file, signal) {
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? '当前立绘文件尚未发布，请稍后重试。' : `立绘下载失败（${response.status}），请重试。`);
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > file.bytes) throw new Error('立绘下载大小异常。');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return verifyArtwork(data.buffer, file);
}
export function subscribeArtwork(listener) {
  const channel = new BroadcastChannel('workshop-artwork');
  channel.onmessage = listener;
  window.addEventListener('workshop-artwork', listener);
  return () => { channel.close(); window.removeEventListener('workshop-artwork', listener); };
}
function changed() {
  window.dispatchEvent(new Event('workshop-artwork'));
  const channel = new BroadcastChannel('workshop-artwork'); channel.postMessage('changed'); channel.close();
}
export async function downloadArtwork({ signal, onProgress = () => {} } = {}) {
  if (!navigator.locks) throw new Error('当前浏览器不支持安全的素材下载，请升级浏览器。');
  return navigator.locks.request('workshop-artwork-download', { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error('另一个标签页正在下载立绘，请稍后重试。');
    const manifest = await getArtworkManifest();
    if (!manifest.sourceRef) throw new Error('这批立绘尚未发布，请使用完整安装包。');
    const cache = await caches.open(ARTWORK_CACHE);
    let next = 0, completed = 0, bytes = 0, downloaded = 0;
    const failures = [];
    const jobs = Array.from({ length: 4 }, async () => {
      while (next < manifest.files.length && !signal?.aborted && failures.length < 8) {
        const file = manifest.files[next++];
        try {
          if (!await readArtwork(file, { signal })) {
            const timeout = AbortSignal.timeout(45000);
            const blob = await fetchImage(artworkDownloadUrl(manifest, file), file, signal ? AbortSignal.any([signal, timeout]) : timeout);
            signal?.throwIfAborted();
            await cache.put(cacheUrl(file), new Response(blob, { headers: { 'Content-Type': 'image/webp' } }));
            downloaded++; localMissing.delete(file.sha256);
          }
          completed++; bytes += file.bytes;
        } catch (error) { if (!signal?.aborted) failures.push({ path: file.path, message: error.message }); }
        onProgress({ completed, total: manifest.files.length, bytes, totalBytes: manifest.totalBytes, downloaded, failed: failures.length });
      }
    });
    await Promise.all(jobs); changed();
    signal?.throwIfAborted();
    if (failures.length) throw new Error(`${manifest.files.length - completed} 张未完成，已成功的立绘会保留。${failures[0].message}`);
    return { completed, total: manifest.files.length, downloaded };
  });
}
