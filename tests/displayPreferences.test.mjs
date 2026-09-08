// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { SHOW_NIKKE_IMAGES } from "../src/config/displayPreferences.js";
import characterArtworkCatalog from "../src/data/characterArtworkCatalog.json" with { type: "json" };
import {
  getNikkeArtworkCandidates,
  getNikkeAvatarUrl,
  getNikkeFavoriteItemArtworkUrl,
  getNikkeFavoriteItemIconUrl,
} from "../src/utils/nikkeAvatar.js";

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
    { id: "lobby-burst-default", label: "技能动画 · 默认", url: "/ui-assets/nikke/character-artwork/lobby_burst_c511_00.webp" },
    { id: "lobby-burst-skin-1", label: "技能动画 · 水晶公主", url: "/ui-assets/nikke/character-artwork/lobby_burst_c511_01.webp" },
  ]);
});

test("new characters can use a bundled full-body render without falling back to the avatar", () => {
  assert.deepEqual(getNikkeArtworkCandidates({ resource_id: 515 }), [
    { id: "default", label: "默认", url: "/ui-assets/nikke/character-artwork/c515.webp" },
    { id: "lobby-burst-default", label: "技能动画 · 默认", url: "/ui-assets/nikke/character-artwork/lobby_burst_c515_00.webp" },
  ]);
});

test("bundled skin choices remain visible when the upstream directory omits costume metadata", () => {
  assert.deepEqual(getNikkeArtworkCandidates({ resource_id: 330 }), [
    { id: "default", label: "默认", url: "/ui-assets/nikke/character-artwork/c330.webp" },
    { id: "skin-1", label: "国王的新衣", url: "/ui-assets/nikke/character-artwork/c330_01.webp" },
    { id: "skin-2", label: "荣耀之花", url: "/ui-assets/nikke/character-artwork/c330_02.webp" },
    { id: "lobby-burst-default", label: "技能动画 · 默认", url: "/ui-assets/nikke/character-artwork/lobby_burst_c330_00.webp" },
    { id: "lobby-burst-skin-1", label: "技能动画 · 国王的新衣", url: "/ui-assets/nikke/character-artwork/lobby_burst_c330_01.webp" },
  ]);
  assert.deepEqual(getNikkeArtworkCandidates({ resource_id: 511 }), [
    { id: "default", label: "默认", url: "/ui-assets/nikke/character-artwork/c511.webp" },
    { id: "skin-1", label: "水晶公主", url: "/ui-assets/nikke/character-artwork/c511_01.webp" },
    { id: "skin-2", label: "美丽的我", url: "/ui-assets/nikke/character-artwork/c511_02.webp" },
    { id: "lobby-burst-default", label: "技能动画 · 默认", url: "/ui-assets/nikke/character-artwork/lobby_burst_c511_00.webp" },
    { id: "lobby-burst-skin-1", label: "技能动画 · 水晶公主", url: "/ui-assets/nikke/character-artwork/lobby_burst_c511_01.webp" },
  ]);
});

test("Helm exposes the bundled favorite item background after regular skins", () => {
  assert.deepEqual(getNikkeArtworkCandidates({ resource_id: 352 }), [
    { id: "default", label: "默认", url: "/ui-assets/nikke/character-artwork/c352.webp" },
    { id: "skin-1", label: "水晶派对", url: "/ui-assets/nikke/character-artwork/c352_01.webp" },
    { id: "skin-2", label: "浴后", url: "/ui-assets/nikke/character-artwork/c352_02.webp" },
    { id: "favorite-item", label: "珍藏品背景", url: "/ui-assets/nikke/character-artwork/favorite_c352.webp" },
    { id: "lobby-burst-default", label: "技能动画 · 默认", url: "/ui-assets/nikke/character-artwork/lobby_burst_c352_00.webp" },
    { id: "lobby-burst-skin-2", label: "技能动画 · 浴后", url: "/ui-assets/nikke/character-artwork/lobby_burst_c352_02.webp" },
  ]);
});

test("favorite item artwork resolves only when the character has a dedicated local background", () => {
  assert.equal(
    getNikkeFavoriteItemArtworkUrl({ resource_id: 352 }),
    "/ui-assets/nikke/character-artwork/favorite_c352.webp",
  );
  assert.equal(getNikkeFavoriteItemArtworkUrl({ resource_id: 511 }), "");
});

test("favorite item icons are separate character-specific objects rather than artwork thumbnails", () => {
  assert.equal(
    getNikkeFavoriteItemIconUrl({ resource_id: 352 }),
    "/ui-assets/nikke/character-card/favorite-items/c352.png",
  );
  assert.equal(getNikkeFavoriteItemIconUrl({ resource_id: 511 }), "");
});

test("new favorite item seasons expose bundled backgrounds after regular skins", () => {
  assert.deepEqual(getNikkeArtworkCandidates({ resource_id: 580 }), [
    { id: "default", label: "默认", url: "/ui-assets/nikke/character-artwork/c580.webp" },
    { id: "skin-1", label: "圣洁怪盗", url: "/ui-assets/nikke/character-artwork/c580_01.webp" },
    { id: "favorite-item", label: "珍藏品背景", url: "/ui-assets/nikke/character-artwork/favorite_c580.webp" },
    { id: "lobby-burst-default", label: "技能动画 · 默认", url: "/ui-assets/nikke/character-artwork/lobby_burst_c580_00.webp" },
    { id: "lobby-burst-skin-1", label: "技能动画 · 圣洁怪盗", url: "/ui-assets/nikke/character-artwork/lobby_burst_c580_01.webp" },
  ]);
});

test("approved CN regional costumes are available without upstream costume metadata", () => {
  for (const resource of [82, 233, 260]) {
    const expectedUrl = `/ui-assets/nikke/character-artwork/c${String(resource).padStart(3, "0")}_80.webp`;
    const choices = getNikkeArtworkCandidates({ resource_id: resource });
    assert.deepEqual(choices.filter((item) => item.id === "skin-80"), [
      { id: "skin-80", label: "国服特供立绘", url: expectedUrl },
    ]);
    assert.ok(choices.some((item) => item.id === "default"));
    assert.ok(existsSync(new URL(`../public${expectedUrl}`, import.meta.url)));
    const upstreamChoices = getNikkeArtworkCandidates({
      resource_id: resource,
      character_costume_list: [{ resource_id: resource, costume_index: 80, costume_name: "国服特供立绘" }],
    });
    assert.equal(upstreamChoices.filter((item) => item.id === "skin-80").length, 1);
  }
});

test("excluded old and extra models remain absent even when upstream lists them", () => {
  for (const [resource, costume] of [[10, 1], [600, 2], [601, 2]]) {
    const choices = getNikkeArtworkCandidates({
      resource_id: resource,
      character_costume_list: [{ resource_id: resource, costume_index: costume, costume_name: "未收录变体" }],
    });
    assert.ok(!choices.some((item) => item.id === `skin-${costume}`));
  }
});

test("published and runtime artwork catalogs remain identical", () => {
  const published = JSON.parse(readFileSync(new URL("../public/ui-assets/nikke/character-artwork/catalog.json", import.meta.url), "utf8"));
  assert.deepEqual(published, characterArtworkCatalog);
});

test("local artwork catalog covers every current standard character and only exposes local files", () => {
  const entries = Object.values(characterArtworkCatalog.characters).flat();
  assert.equal(characterArtworkCatalog.characterCount, 200);
  assert.equal(characterArtworkCatalog.artworkCount, 621);
  assert.equal(entries.length, characterArtworkCatalog.artworkCount);
  Object.values(characterArtworkCatalog.characters).forEach((artworks) => {
    assert.ok(artworks.some((item) => item.id === "default"));
    assert.equal(new Set(artworks.map((item) => item.id)).size, artworks.length);
  });
  assert.ok(entries.every((item) => item.url.startsWith("/ui-assets/nikke/character-artwork/")));
});
