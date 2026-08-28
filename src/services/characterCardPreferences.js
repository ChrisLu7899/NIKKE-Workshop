// SPDX-License-Identifier: GPL-3.0-or-later

export const CHARACTER_CARD_PREFERENCES_KEY = "characterCardPreferences";

const clamp = (value, fallback, minimum = 0, maximum = 100) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
};

const normalizeArtworkTransform = (transform = {}, fallback = {}) => ({
  objectPositionX: clamp(transform.objectPositionX, clamp(fallback.objectPositionX, 50)),
  objectPositionY: clamp(transform.objectPositionY, clamp(fallback.objectPositionY, 0, -50, 50), -50, 50),
  artworkScale: clamp(transform.artworkScale, clamp(fallback.artworkScale, 100, 70, 180), 70, 180),
});

export const normalizeCharacterCardPreference = (preference = {}) => {
  const artworkId = String(preference.artworkId || "default");
  const artworkTransforms = Object.fromEntries(
    Object.entries(preference.artworkTransforms || {})
      .filter(([id, transform]) => id && transform && typeof transform === "object")
      .map(([id, transform]) => [String(id), normalizeArtworkTransform(transform)]),
  );
  const activeTransform = normalizeArtworkTransform(
    artworkTransforms[artworkId],
    preference,
  );
  artworkTransforms[artworkId] = activeTransform;
  return {
    artworkId,
    ...activeTransform,
    artworkTransforms,
  };
};

const readAll = () => new Promise((resolve) => {
  if (!globalThis.chrome?.storage?.local) {
    resolve({});
    return;
  }
  chrome.storage.local.get(CHARACTER_CARD_PREFERENCES_KEY, (result) => {
    resolve(result?.[CHARACTER_CARD_PREFERENCES_KEY] || {});
  });
});

export async function getCharacterCardPreference(characterCode) {
  const code = String(characterCode || "").trim();
  if (!code) return normalizeCharacterCardPreference();
  const all = await readAll();
  return normalizeCharacterCardPreference(all?.[code]);
}

export async function setCharacterCardPreference(characterCode, preference) {
  const code = String(characterCode || "").trim();
  const normalized = normalizeCharacterCardPreference(preference);
  if (!code || !globalThis.chrome?.storage?.local) return normalized;
  const all = await readAll();
  await new Promise((resolve) => {
    chrome.storage.local.set({
      [CHARACTER_CARD_PREFERENCES_KEY]: {
        ...all,
        [code]: normalized,
      },
    }, resolve);
  });
  return normalized;
}
