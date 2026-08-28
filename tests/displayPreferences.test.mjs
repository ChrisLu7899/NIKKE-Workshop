// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { SHOW_NIKKE_IMAGES } from "../src/config/displayPreferences.js";
import characterArtworkCatalog from "../src/data/characterArtworkCatalog.json" with { type: "json" };
import { getNikkeArtworkCandidates, getNikkeAvatarUrl } from "../src/utils/nikkeAvatar.js";

test("display mode restores Nikke avatar URLs", () => {
  assert.equal(SHOW_NIKKE_IMAGES, true);
  assert.equal(
    getNikkeAvatarUrl({ resource_id: 101 }),
    "https://nikke-db.github.io/images/sprite/si_c101_00_s.png",
  );
});

test("bundled CN-only avatars resolve without an external resource id", () => {
  assert.equal(
    getNikkeAvatarUrl({ avatar_url: "images/characters/cn-exclusive-huapi-thumb.png" }),
    "/images/characters/cn-exclusive-huapi-thumb.png",
  );
});

test("artwork choices use full-body artwork and bundled renders for supported costumes", () => {
  assert.deepEqual(getNikkeArtworkCandidates({
    resource_id: 511,
    character_costume_list: [
      { resource_id: 511, costume_index: 2, costume_name: "美丽的我" },
      { resource_id: 511, costume_index: 1, costume_name: "水晶公主" },
    ],
  }), [
    { id: "default", label: "默认", url: "/ui-assets/nikke/character-artwork/c511.webp" },
    { id: "skin-2", label: "美丽的我", url: "/ui-assets/nikke/character-artwork/c511_02.webp" },
    { id: "skin-1", label: "水晶公主", url: "/ui-assets/nikke/character-artwork/c511_01.webp" },
  ]);
});

test("new characters can use a bundled full-body render without falling back to the avatar", () => {
  assert.deepEqual(getNikkeArtworkCandidates({ resource_id: 515 }), [
    { id: "default", label: "默认", url: "/ui-assets/nikke/character-artwork/c515.webp" },
  ]);
});

test("bundled skin choices remain visible when the upstream directory omits costume metadata", () => {
  assert.deepEqual(getNikkeArtworkCandidates({ resource_id: 330 }), [
    { id: "default", label: "默认", url: "/ui-assets/nikke/character-artwork/c330.webp" },
    { id: "skin-1", label: "国王的新衣", url: "/ui-assets/nikke/character-artwork/c330_01.webp" },
    { id: "skin-2", label: "荣耀之花", url: "/ui-assets/nikke/character-artwork/c330_02.webp" },
  ]);
  assert.deepEqual(getNikkeArtworkCandidates({ resource_id: 511 }), [
    { id: "default", label: "默认", url: "/ui-assets/nikke/character-artwork/c511.webp" },
    { id: "skin-1", label: "水晶公主", url: "/ui-assets/nikke/character-artwork/c511_01.webp" },
    { id: "skin-2", label: "美丽的我", url: "/ui-assets/nikke/character-artwork/c511_02.webp" },
  ]);
});

test("local artwork catalog covers every current standard character and only exposes local files", () => {
  const entries = Object.values(characterArtworkCatalog.characters).flat();
  assert.equal(characterArtworkCatalog.characterCount, 199);
  assert.equal(characterArtworkCatalog.artworkCount, 377);
  assert.equal(entries.length, characterArtworkCatalog.artworkCount);
  Object.values(characterArtworkCatalog.characters).forEach((artworks) => {
    assert.ok(artworks.some((item) => item.id === "default"));
    assert.equal(new Set(artworks.map((item) => item.id)).size, artworks.length);
  });
  assert.ok(entries.every((item) => item.url.startsWith("/ui-assets/nikke/character-artwork/")));
});
