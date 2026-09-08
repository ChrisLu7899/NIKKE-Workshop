// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  CHARACTER_CARD_PREFERENCES_KEY, characterCardPreferenceKey,
  getCharacterCardPreference, setCharacterCardPreference,
} from "../src/services/characterCardPreferences.js";

function mockStorage(initial = {}) {
  let stored = structuredClone(initial);
  let fail = false;
  globalThis.chrome = { runtime: {}, storage: { local: {
    get(keys, callback) {
      const result = Object.fromEntries(keys.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, structuredClone(stored[key])]));
      setTimeout(() => {
        chrome.runtime.lastError = fail ? { message: "test storage failure" } : undefined;
        callback(result);
        delete chrome.runtime.lastError;
      }, 0);
    },
    set(value, callback) {
      setTimeout(() => {
        chrome.runtime.lastError = fail ? { message: "test storage failure" } : undefined;
        if (!fail) stored = { ...stored, ...structuredClone(value) };
        callback();
        delete chrome.runtime.lastError;
      }, 0);
    },
  } } };
  return { snapshot: () => structuredClone(stored), fail: (value) => { fail = value; } };
}

test("different characters never overwrite each other's preferences; same-character writes stay ordered", async () => {
  const storage = mockStorage();
  try {
    await Promise.all([
      setCharacterCardPreference("one", { artworkScale: 110 }),
      setCharacterCardPreference("two", { artworkScale: 120 }),
      setCharacterCardPreference("one", { artworkScale: 130 }),
    ]);
    assert.equal((await getCharacterCardPreference("one")).artworkScale, 130);
    assert.equal((await getCharacterCardPreference("two")).artworkScale, 120);
    assert.equal(Object.keys(storage.snapshot()).length, 2);
  } finally { delete globalThis.chrome; }
});

test("legacy preferences migrate lazily without deleting other characters or legacy data", async () => {
  const legacy = { one: { artworkId: "skin-1", artworkScale: 145, visibleModules: { cube: false } }, two: { artworkScale: 90 } };
  const storage = mockStorage({ [CHARACTER_CARD_PREFERENCES_KEY]: legacy });
  try {
    const value = await getCharacterCardPreference("one");
    assert.equal(value.artworkScale, 145);
    assert.equal(value.visibleModules.cube, false);
    await setCharacterCardPreference("one", { ...value, visibleModules: { ...value.visibleModules, combat: false } });
    assert.ok(storage.snapshot()[characterCardPreferenceKey("one")]);
    assert.deepEqual(storage.snapshot()[CHARACTER_CARD_PREFERENCES_KEY], legacy);
    assert.equal((await getCharacterCardPreference("two")).artworkScale, 90);
    assert.equal((await getCharacterCardPreference("one")).visibleModules.combat, false);
  } finally { delete globalThis.chrome; }
});

test("storage failures reject and do not poison later retries", async () => {
  const storage = mockStorage();
  try {
    storage.fail(true);
    await assert.rejects(getCharacterCardPreference("one"), /无法读写/);
    await assert.rejects(setCharacterCardPreference("one", { artworkScale: 120 }), /无法读写/);
    storage.fail(false);
    await setCharacterCardPreference("one", { artworkScale: 120 });
    assert.equal((await getCharacterCardPreference("one")).artworkScale, 120);
  } finally { delete globalThis.chrome; }
});
