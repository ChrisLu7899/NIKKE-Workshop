// SPDX-License-Identifier: GPL-3.0-or-later
// Nikke 头像相关工具：管理页与 Excel 导出共用

import { SHOW_NIKKE_IMAGES } from "../config/displayPreferences.js";
import characterArtworkCatalog from "../data/characterArtworkCatalog.json" with { type: "json" };

export const getNikkeResourceId = (nikke, resourceIdMap) => {
  if (!nikke) return undefined;
  const direct = nikke.resource_id ?? nikke.resourceId;
  if (direct !== undefined && direct !== null && direct !== "") return direct;

  const id = nikke.id;
  if (id === undefined || id === null) return undefined;
  return resourceIdMap?.get?.(id);
};

export const getNikkeAvatarUrl = (nikke, resourceIdMap) => {
  if (!SHOW_NIKKE_IMAGES) return "";
  const directUrl = String(nikke?.avatar_url ?? nikke?.avatarUrl ?? "").trim();
  if (directUrl) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(directUrl)) return directUrl;
    if (globalThis.chrome?.runtime?.getURL) return chrome.runtime.getURL(directUrl);
    return `/${directUrl.replace(/^\/+/, "")}`;
  }
  const rid = getNikkeResourceId(nikke, resourceIdMap);
  if (rid === undefined || rid === null || rid === "") return "";
  const ridStr = String(rid).padStart(3, "0");
  return `https://nikke-db.github.io/images/sprite/si_c${ridStr}_00_s.png`;
};

const normalizeNikkeResourceNumber = (value) => {
  const match = String(value ?? "").match(/\d{2,4}/);
  return match ? match[0].padStart(3, "0") : "";
};

const BUNDLED_CHARACTER_ARTWORK = characterArtworkCatalog?.characters || {};

export const getNikkeArtworkCandidates = (nikke, resourceIdMap) => {
  if (!SHOW_NIKKE_IMAGES) return [];
  const directUrl = String(nikke?.artwork_url ?? nikke?.artworkUrl ?? "").trim();
  const resourceNumber = normalizeNikkeResourceNumber(getNikkeResourceId(nikke, resourceIdMap));
  const bundledArtwork = BUNDLED_CHARACTER_ARTWORK[resourceNumber] || [];
  const candidates = [];
  const bundledDefault = bundledArtwork.find((item) => item.id === "default");
  const defaultUrl = directUrl || bundledDefault?.url || "";
  if (defaultUrl) candidates.push({ id: "default", label: "默认", url: defaultUrl });
  (Array.isArray(nikke?.character_costume_list) ? nikke.character_costume_list : [])
    .filter((costume) => !costume?.is_hidden)
    .forEach((costume) => {
      const costumeIndex = Number(costume?.costume_index);
      const costumeResource = normalizeNikkeResourceNumber(costume?.resource_id ?? resourceNumber);
      if (!costumeResource || !Number.isInteger(costumeIndex) || costumeIndex < 1) return;
      const costumeId = `skin-${costumeIndex}`;
      const costumeArtwork = (BUNDLED_CHARACTER_ARTWORK[costumeResource] || [])
        .find((item) => item.id === costumeId);
      if (!costumeArtwork?.url) return;
      candidates.push({
        id: costumeId,
        label: String(costume?.costume_name || costume?.costume_name_locale || `皮肤 ${costumeIndex}`).trim(),
        url: costumeArtwork.url,
      });
    });
  bundledArtwork.forEach((item) => {
    if (item.id === "default" || candidates.some((candidate) => candidate.id === item.id)) return;
    candidates.push({ id: item.id, label: item.label, url: item.url });
  });
  return candidates.filter((candidate, index, array) => (
    candidate.url && array.findIndex((item) => item.id === candidate.id) === index
  ));
};

export const guessImageExtensionFromUrl = (url, fallback = "png") => {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    const pathname = u.pathname || "";
    const lastDot = pathname.lastIndexOf(".");
    if (lastDot < 0) return fallback;
    const ext = pathname.slice(lastDot + 1).toLowerCase();
    if (!ext) return fallback;
    // ExcelJS 常见支持：png/jpeg/gif
    if (ext === "jpg") return "jpeg";
    if (ext === "jpeg" || ext === "png" || ext === "gif") return ext;
    return fallback;
  } catch {
    return fallback;
  }
};

export const fetchAsArrayBuffer = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return await res.arrayBuffer();
};

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

export const arrayBufferToDataUrl = (buffer, extension = "png") => {
  const ext = (extension || "png").toLowerCase();
  const mime = ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : "image/png";
  const b64 = arrayBufferToBase64(buffer);
  return `data:${mime};base64,${b64}`;
};
