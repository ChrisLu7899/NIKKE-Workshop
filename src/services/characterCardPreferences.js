// SPDX-License-Identifier: GPL-3.0-or-later

export const CHARACTER_CARD_PREFERENCES_KEY = "characterCardPreferences";
import { DEFAULT_CHARACTER_CARD_MODULES, DEFAULT_ARTWORK_TRANSFORM, CHARACTER_CARD_SCALE_RANGE } from "../domain/characterCardLayout.js";
export { DEFAULT_CHARACTER_CARD_MODULES } from "../domain/characterCardLayout.js";

// Per-character keys avoid read/modify/write races between different windows.
export const characterCardPreferenceKey = (code) => `${CHARACTER_CARD_PREFERENCES_KEY}:${encodeURIComponent(String(code).trim())}`;
const objectOrEmpty = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const clamp = (value, fallback, minimum = 0, maximum = 100) => {
  const number = value === null || value === undefined || String(value).trim() === "" ? NaN : Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
};

const normalizeArtworkTransform = (transform = {}, fallback = {}) => ({
  objectPositionX: clamp(transform.objectPositionX, clamp(fallback.objectPositionX, DEFAULT_ARTWORK_TRANSFORM.objectPositionX)),
  objectPositionY: clamp(transform.objectPositionY, clamp(fallback.objectPositionY, DEFAULT_ARTWORK_TRANSFORM.objectPositionY, -50, 50), -50, 50),
  artworkScale: clamp(transform.artworkScale, clamp(fallback.artworkScale, DEFAULT_ARTWORK_TRANSFORM.artworkScale, CHARACTER_CARD_SCALE_RANGE.min, CHARACTER_CARD_SCALE_RANGE.max), CHARACTER_CARD_SCALE_RANGE.min, CHARACTER_CARD_SCALE_RANGE.max),
});

const normalizeVisibleModules = (visibleModules = {}) => Object.fromEntries(
  Object.keys(DEFAULT_CHARACTER_CARD_MODULES)
    .map((key) => [key, visibleModules?.[key] !== false]),
);

export const normalizeCharacterCardPreference = (preference = {}) => {
  preference = objectOrEmpty(preference);
  const legacyId = String(preference.artworkId || "default");
  const replacements = { "skill-default": "lobby-burst-default", "skill-skin-1": "lobby-burst-skin-1" };
  const artworkId = replacements[legacyId] || legacyId;
  const artworkTransforms = Object.fromEntries(
    Object.entries(objectOrEmpty(preference.artworkTransforms))
      .filter(([id, transform]) => id && transform && typeof transform === "object")
      .map(([id, transform]) => [String(id), normalizeArtworkTransform(transform)]),
  );
  // Keep existing native framing if present. Legacy square-image transforms
  // remain archived in preferences but do not crop the new portrait scene.
  const migrated = artworkId !== legacyId;
  const activeTransform = normalizeArtworkTransform(
    artworkTransforms[artworkId],
    migrated ? {} : preference,
  );
  artworkTransforms[artworkId] = activeTransform;
  return {
    artworkId,
    ...activeTransform,
    artworkTransforms,
    visibleModules: normalizeVisibleModules(preference.visibleModules),
  };
};

export function resolveCharacterCardPreference(preference, candidates) {
  const normalized = normalizeCharacterCardPreference(preference);
  const available = (Array.isArray(candidates) ? candidates : []).filter((item) => item?.id && item?.url);
  const selected = available.find((item) => item.id === normalized.artworkId)
    || available.find((item) => item.id === "default") || available[0];
  if (!selected || selected.id === normalized.artworkId) return normalized;
  const transform = normalized.artworkTransforms[selected.id] || DEFAULT_ARTWORK_TRANSFORM;
  return normalizeCharacterCardPreference({
    ...normalized, artworkId: selected.id, ...transform,
    artworkTransforms: { ...normalized.artworkTransforms, [selected.id]: transform },
  });
}

const storageCall = (method, payload) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("角色卡偏好存储超时，请重试。")), 5000);
  try {
    chrome.storage.local[method](payload, (result) => {
      clearTimeout(timer);
      const error = chrome.runtime?.lastError;
      if (error) reject(new Error("无法读写角色卡偏好，请重试。"));
      else resolve(result);
    });
  } catch {
    clearTimeout(timer);
    reject(new Error("无法读写角色卡偏好，请重试。"));
  }
});

export async function getCharacterCardPreference(characterCode) {
  const code = String(characterCode || "").trim();
  if (!code) return normalizeCharacterCardPreference();
  if (!globalThis.chrome?.storage?.local) return normalizeCharacterCardPreference();
  const key = characterCardPreferenceKey(code);
  await pendingWrites.get(key)?.catch(() => undefined);
  const result = objectOrEmpty(await storageCall("get", [key, CHARACTER_CARD_PREFERENCES_KEY]));
  const legacy = objectOrEmpty(result[CHARACTER_CARD_PREFERENCES_KEY]);
  return normalizeCharacterCardPreference(Object.hasOwn(result, key) ? result[key] : Object.hasOwn(legacy, code) ? legacy[code] : undefined);
}

const pendingWrites = new Map();
export async function setCharacterCardPreference(characterCode, preference) {
  const code = String(characterCode || "").trim();
  const normalized = normalizeCharacterCardPreference(preference);
  if (!code || !globalThis.chrome?.storage?.local) return normalized;
  const key = characterCardPreferenceKey(code);
  const pending = (pendingWrites.get(key) || Promise.resolve()).catch(() => undefined)
    .then(() => storageCall("set", { [key]: normalized }));
  pendingWrites.set(key, pending);
  try {
    await pending;
    return normalized;
  } finally {
    if (pendingWrites.get(key) === pending) pendingWrites.delete(key);
  }
}
