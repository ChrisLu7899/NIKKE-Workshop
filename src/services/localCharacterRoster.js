// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createEmptyLocalCharacterRoster,
  normalizeLocalCharacterRoster,
} from "../domain/localCharacterRoster.js";

export const LOCAL_CHARACTER_ROSTER_STORAGE_KEY = "localCharacterRosterV1";

function defaultStorageArea() {
  return globalThis.chrome?.storage?.local || null;
}

function runtimeError() {
  return globalThis.chrome?.runtime?.lastError || null;
}

export function getLocalCharacterRoster(storageArea = defaultStorageArea()) {
  if (!storageArea) return Promise.resolve(createEmptyLocalCharacterRoster());
  return new Promise((resolve, reject) => {
    storageArea.get(LOCAL_CHARACTER_ROSTER_STORAGE_KEY, (result) => {
      const error = runtimeError();
      if (error) reject(new Error(error.message));
      else resolve(normalizeLocalCharacterRoster(result?.[LOCAL_CHARACTER_ROSTER_STORAGE_KEY]));
    });
  });
}

export function setLocalCharacterRoster(roster, storageArea = defaultStorageArea()) {
  const normalized = normalizeLocalCharacterRoster(roster);
  if (!storageArea) return Promise.resolve(normalized);
  return new Promise((resolve, reject) => {
    storageArea.set({ [LOCAL_CHARACTER_ROSTER_STORAGE_KEY]: normalized }, () => {
      const error = runtimeError();
      if (error) reject(new Error(error.message));
      else resolve(normalized);
    });
  });
}
