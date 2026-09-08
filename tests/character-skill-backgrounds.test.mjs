// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CHARACTER_SKILL_BACKGROUNDS } from "../scripts/character-skill-backgrounds.mjs";
import { getNikkeArtworkCandidates } from "../src/utils/nikkeAvatar.js";
import { normalizeCharacterCardPreference } from "../src/services/characterCardPreferences.js";

test("Crown exposes one native skill scene per costume and no retired file", () => {
  const choices = getNikkeArtworkCandidates({ resource_id: 330 });
  const manifest = JSON.parse(readFileSync(new URL("../public/ui-assets/nikke/manifest.json", import.meta.url), "utf8"));
  assert.equal(CHARACTER_SKILL_BACKGROUNDS.length, 0);
  assert.deepEqual(choices.map(item => item.id), ["default", "skin-1", "skin-2", "lobby-burst-default", "lobby-burst-skin-1"]);
  assert.equal(manifest.assets.characterArtwork.skillBackgrounds, undefined);
  for (const id of ["skill_c330_00", "skill_c330_01"]) {
    assert.equal(existsSync(new URL(`../public/ui-assets/nikke/character-artwork/${id}.webp`, import.meta.url)), false);
  }
  assert.ok(!getNikkeArtworkCandidates({ resource_id: 331 }).some((choice) => choice.id.startsWith("skill-")));
  const upstream = getNikkeArtworkCandidates({ resource_id: 330, character_costume_list: [{ resource_id: 330, costume_index: 1, costume_name: "国王的新衣" }] });
  assert.equal(upstream.filter((choice) => choice.id.startsWith("skill-")).length, 0);
  assert.equal(upstream.filter((choice) => choice.id.startsWith("lobby-burst-")).length, 2);
});

test("native skill framing remains independent of regular costumes and each other", () => {
  const transforms = {
    default: { objectPositionX: 50, objectPositionY: 0, artworkScale: 100 },
    "lobby-burst-default": { objectPositionX: 44, objectPositionY: 6, artworkScale: 110 },
    "lobby-burst-skin-1": { objectPositionX: 56, objectPositionY: -3, artworkScale: 90 },
  };
  for (const artworkId of Object.keys(transforms)) {
    const normalized = normalizeCharacterCardPreference({ artworkId, artworkTransforms: transforms });
    assert.deepEqual(normalized.artworkTransforms, transforms);
    assert.equal(normalized.artworkScale, transforms[artworkId].artworkScale);
    assert.equal(normalized.objectPositionX, transforms[artworkId].objectPositionX);
    assert.equal(normalized.objectPositionY, transforms[artworkId].objectPositionY);
  }
});

test("retired selections migrate without reusing square-image crop parameters", () => {
  const old = { objectPositionX: 44, objectPositionY: 6, artworkScale: 110 };
  for (const [legacy, target] of [["skill-default", "lobby-burst-default"], ["skill-skin-1", "lobby-burst-skin-1"]]) {
    const input = { artworkId: legacy, ...old, artworkTransforms: { [legacy]: old }, visibleModules: { combat: false } };
    const result = normalizeCharacterCardPreference(input);
    assert.equal(result.artworkId, target);
    assert.equal(result.artworkScale, 100);
    assert.equal(result.objectPositionX, 50);
    assert.equal(result.objectPositionY, 0);
    assert.equal(result.visibleModules.combat, false);
    assert.deepEqual(result.artworkTransforms[legacy], old);
    assert.deepEqual(normalizeCharacterCardPreference(result), result);
    assert.equal(input.artworkId, legacy);
  }
});

test("migration preserves existing native and regular costume framing", () => {
  const native = { objectPositionX: 56, objectPositionY: -3, artworkScale: 90 };
  const regular = { objectPositionX: 50, objectPositionY: 10, artworkScale: 120 };
  const result = normalizeCharacterCardPreference({ artworkId: "skill-skin-1",
    artworkTransforms: { "lobby-burst-skin-1": native, "skin-1": regular } });
  assert.equal(result.artworkScale, 90);
  assert.deepEqual(result.artworkTransforms["skin-1"], regular);
  assert.deepEqual(result.artworkTransforms["lobby-burst-skin-1"], native);
});
