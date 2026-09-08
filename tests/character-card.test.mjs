// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCharacterCardData,
  formatCharacterCardPercent,
  characterCardRarityAsset,
  normalizeCharacterCardRarity,
  collectibleDollAssetForWeapon,
  equipmentFamilyForClass,
  favoriteItemStarCount,
  favoriteItemStarsToLevel,
  formatCoreBreakthroughBadge,
  summarizeCharacterCardAffixes,
} from "../src/domain/characterCard.js";
import { normalizeCharacterCardPreference, resolveCharacterCardPreference } from "../src/services/characterCardPreferences.js";

const catalog = {
  resource_id: 511,
  name_cn: "灰姑娘",
  name_en: "Cinderella",
  original_rare: "SSR",
  class: "Defender",
  element: "Electronic",
  use_burst_skill: "Step3",
  corporation: "Pilgrim",
  weapon_type: "RL",
};

const equipments = [
  [{ position: 1, functionType: "StatAtk", level: 11, value: 11.81, locked: true }],
  [{ position: 1, functionType: "IncElementDmg", level: 10, value: 22.15 }],
  [{ position: 1, functionType: "StatAtk", level: 12, value: 12.52 }],
  [{ position: 1, functionType: "IncElementDmg", level: 15, value: 29.16 }],
];

test("rarity selects R/SR/SSR original sprites instead of a fixed SSR image", () => {
  for (const rarity of ["R", "SR", "SSR"]) {
    assert.equal(buildCharacterCardData({ original_rare: rarity }, {}).rarity, rarity);
    assert.equal(normalizeCharacterCardRarity(` ${rarity.toLowerCase()} `), rarity);
    assert.equal(characterCardRarityAsset(rarity), `/ui-assets/nikke/metadata/rarity/${rarity.toLowerCase()}.png`);
  }
  assert.equal(buildCharacterCardData({ original_rare: "SSR" }, { base: { rarity: "sr" } }).rarity, "SR");
  assert.equal(buildCharacterCardData({ original_rare: "SR" }, { base: { rarity: "invalid" } }).rarity, "SR");
});

test("missing or unsupported rarity never invents SSR, including custom characters", () => {
  for (const value of [undefined, null, "", "  ", "FAV", "UR", 3, {}, "undefined"]) {
    assert.equal(buildCharacterCardData({ original_rare: value }, {}).rarity, "");
    assert.equal(characterCardRarityAsset(value), "");
  }
  assert.equal(buildCharacterCardData(null, null).rarity, "");
  assert.equal(buildCharacterCardData(null, null).favoriteItemRarity, "");
});

test("character card uses class-specific overload equipment family and keeps four physical slots", () => {
  const data = buildCharacterCardData(catalog, {
    level: 613,
    combat: 407263,
    affectionLevel: 40,
    favoriteItemRarity: "SSR",
    favoriteItemLevel: 3,
    classLevel: 202,
    corporationLevel: 186,
    skill1Level: 10,
    skill2Level: 9,
    burstSkillLevel: 8,
    cubeId: 1000304,
    cubeResourceId: 10004,
    cubeNameCn: "战术巨熊魔方",
    cubeLevel: 15,
    limitBreak: { grade: 3, core: 3 },
    equipments,
  });
  assert.equal(data.name, "灰姑娘");
  assert.equal(data.equipmentFamily, "99");
  assert.equal(data.classLevel, 202);
  assert.equal(data.corporationLevel, 186);
  assert.equal(data.skill1Level, 10);
  assert.equal(data.skill2Level, 9);
  assert.equal(data.burstSkillLevel, 8);
  assert.equal(data.favoriteItemRarity, "SSR");
  assert.equal(data.favoriteItemLevel, 2);
  assert.equal(data.cubeId, 1000304);
  assert.equal(data.cubeResourceId, 10004);
  assert.equal(data.cubeNameCn, "战术巨熊魔方");
  assert.equal(data.cubeLevel, 15);
  assert.equal(data.equipments.length, 4);
  assert.equal(data.equipments[0].length, 3);
  assert.equal(data.equipments[0][0].locked, true);
  assert.deepEqual(data.topAffixes.map((item) => [item.functionType, item.totalLevel, item.totalValue]), [
    ["IncElementDmg", 25, 51.31],
    ["StatAtk", 23, 24.33],
  ]);
});

test("character card accepts account-dictionary aliases for favorite item data", () => {
  const data = buildCharacterCardData(catalog, { item_rare: "sr", item_level: 0 });
  assert.equal(data.favoriteItemRarity, "SR");
  assert.equal(data.favoriteItemLevel, 0);
});

test("collectibles and favorite items map their distinct source levels to three stars", () => {
  assert.equal(favoriteItemStarCount("R", 0), 0);
  assert.equal(favoriteItemStarCount("SR", 5), 1);
  assert.equal(favoriteItemStarCount("SR", 10), 2);
  assert.equal(favoriteItemStarCount("SR", 15), 3);
  assert.equal(favoriteItemStarCount("SSR", 0), 1);
  assert.equal(favoriteItemStarCount("SSR", 1), 2);
  assert.equal(favoriteItemStarCount("SSR", 2), 3);
});

test("favorite item star selections convert back to source-compatible levels", () => {
  assert.equal(favoriteItemStarsToLevel("R", 0), 0);
  assert.equal(favoriteItemStarsToLevel("R", 1), 5);
  assert.equal(favoriteItemStarsToLevel("SR", 2), 10);
  assert.equal(favoriteItemStarsToLevel("SR", 3), 15);
  assert.equal(favoriteItemStarsToLevel("SSR", 1), 0);
  assert.equal(favoriteItemStarsToLevel("SSR", 2), 1);
  assert.equal(favoriteItemStarsToLevel("SSR", 3), 2);
  assert.equal(favoriteItemStarsToLevel("SSR", 99), 2);
});

test("collectible commander dolls map from every weapon family and common long names", () => {
  assert.equal(collectibleDollAssetForWeapon("AR"), "collectible-ar-cooking.png");
  assert.equal(collectibleDollAssetForWeapon("Submachine Gun"), "collectible-smg-coffee.png");
  assert.equal(collectibleDollAssetForWeapon("Machine_Gun"), "collectible-mg-shopping.png");
  assert.equal(collectibleDollAssetForWeapon("Shotgun"), "collectible-sg-battling.png");
  assert.equal(collectibleDollAssetForWeapon("Sniper Rifle"), "collectible-sr-napping.png");
  assert.equal(collectibleDollAssetForWeapon("Rocket Launcher"), "collectible-rl-exercising.png");
  assert.equal(collectibleDollAssetForWeapon("unknown"), "");
});

test("top affix summary sorts only by total tier and keeps first appearance for ties", () => {
  const result = summarizeCharacterCardAffixes([
    [{ functionType: "StatAtk", level: 10, value: 10.4 }],
    [{ functionType: "IncElementDmg", level: 10, value: 22.15 }],
    [{ functionType: "StatAccuracyCircle", level: 4, value: 6.88 }],
    [],
  ], 2);
  assert.deepEqual(result.map((item) => item.functionType), ["StatAtk", "IncElementDmg"]);
});

test("equipment family mapping covers all three fixed overload sets", () => {
  assert.equal(equipmentFamilyForClass("Attacker"), "vmetal");
  assert.equal(equipmentFamilyForClass("Defender"), "99");
  assert.equal(equipmentFamilyForClass("Supporter"), "code");
});

test("core breakthrough badge shows MAX at level 7 and keeps earlier levels padded", () => {
  assert.equal(formatCoreBreakthroughBadge(0), "");
  assert.equal(formatCoreBreakthroughBadge(1), "01");
  assert.equal(formatCoreBreakthroughBadge(6), "06");
  assert.equal(formatCoreBreakthroughBadge(7), "MAX");
  assert.equal(formatCoreBreakthroughBadge("7"), "MAX");
});

test("artwork preferences clamp persisted crop positions", () => {
  assert.deepEqual(normalizeCharacterCardPreference({ artworkId: "skin-2", objectPositionX: 150, objectPositionY: -80 }), {
    artworkId: "skin-2",
    objectPositionX: 100,
    objectPositionY: -50,
    artworkScale: 100,
    artworkTransforms: {
      "skin-2": { objectPositionX: 100, objectPositionY: -50, artworkScale: 100 },
    },
    visibleModules: {
      favoriteItem: true, rarity: true, levelName: true, affection: true, combat: true,
      metadata: true, skills: true, cube: true, affixSummary: true, equipments: true,
    },
  });
});

test("artwork preferences keep independent placement and zoom for each skin", () => {
  assert.deepEqual(normalizeCharacterCardPreference({
    artworkId: "skin-2",
    artworkTransforms: {
      default: { objectPositionX: 44, objectPositionY: 8, artworkScale: 95 },
      "skin-2": { objectPositionX: 62, objectPositionY: 24, artworkScale: 145 },
    },
  }), {
    artworkId: "skin-2",
    objectPositionX: 62,
    objectPositionY: 24,
    artworkScale: 145,
    artworkTransforms: {
      default: { objectPositionX: 44, objectPositionY: 8, artworkScale: 95 },
      "skin-2": { objectPositionX: 62, objectPositionY: 24, artworkScale: 145 },
    },
    visibleModules: {
      favoriteItem: true, rarity: true, levelName: true, affection: true, combat: true,
      metadata: true, skills: true, cube: true, affixSummary: true, equipments: true,
    },
  });
});

test("character card module visibility defaults to on and preserves explicit hidden choices", () => {
  const preference = normalizeCharacterCardPreference({
    visibleModules: { combat: false, cube: false, unknownModule: false },
  });
  assert.equal(preference.visibleModules.rarity, true);
  assert.equal(preference.visibleModules.combat, false);
  assert.equal(preference.visibleModules.cube, false);
  assert.equal(Object.hasOwn(preference.visibleModules, "unknownModule"), false);
});

test("missing card values stay unknown instead of turning into zero or undefined text", () => {
  for (const missing of [null, undefined, "", "  "]) {
    const data = buildCharacterCardData({}, {
      level: missing, combat: missing, affectionLevel: missing,
      classLevel: missing, corporationLevel: missing,
      favoriteItemRarity: "SSR", favoriteItemLevel: missing,
      equipments: [[{ functionType: "StatAtk", level: missing, value: missing }]],
    });
    for (const key of ["level", "combat", "affection", "classLevel", "corporationLevel", "favoriteItemLevel"]) assert.equal(data[key], null, key);
    for (const key of ["className", "element", "weaponType", "corporation", "burstStage", "cubeNameCn", "cubeNameEn"]) assert.equal(data[key], "", key);
    assert.equal(data.equipments[0][0].level, null);
    assert.equal(formatCharacterCardPercent(data.equipments[0][0].value), "—");
  }
});

test("legal zeros are preserved and an incomplete summary never invents a percentage", () => {
  const data = buildCharacterCardData({}, { combat: 0, affectionLevel: 0, classLevel: 0, corporationLevel: 0, favoriteItemRarity: "SSR", favoriteItemLevel: 0 });
  for (const key of ["combat", "affection", "classLevel", "corporationLevel", "favoriteItemLevel"]) assert.equal(data[key], 0);
  assert.equal(formatCharacterCardPercent(0), "0.00%");
  const [summary] = summarizeCharacterCardAffixes([[{ functionType: "StatAtk", level: 10, value: null }], [{ functionType: "StatAtk", level: 1, value: 4.77 }]]);
  assert.equal(summary.totalLevel, 11);
  assert.equal(summary.totalValue, null);
});

test("unavailable artwork resolves the actual default transform and preserves other skins", () => {
  const preference = { artworkId: "removed", artworkTransforms: {
    removed: { objectPositionX: 80, objectPositionY: 20, artworkScale: 180 },
    default: { objectPositionX: 45, objectPositionY: 0, artworkScale: 90 },
  }, visibleModules: { combat: false } };
  const resolved = resolveCharacterCardPreference(preference, [{ id: "default", url: "/default.webp" }]);
  assert.equal(resolved.artworkId, "default");
  assert.equal(resolved.artworkScale, 90);
  assert.equal(resolved.objectPositionX, 45);
  assert.equal(resolved.artworkTransforms.removed.artworkScale, 180);
  assert.equal(resolved.visibleModules.combat, false);
  assert.equal(resolveCharacterCardPreference(preference, []).artworkId, "removed");
  assert.equal(resolveCharacterCardPreference(preference, [{ id: "other", url: "/other.webp" }]).artworkScale, 100);
});

test("malformed preferences and empty transforms recover safely", () => {
  for (const value of [null, false, "invalid", []]) assert.equal(normalizeCharacterCardPreference(value).artworkScale, 100);
  assert.equal(normalizeCharacterCardPreference({ artworkScale: null }).artworkScale, 100);
  assert.equal(normalizeCharacterCardPreference({ objectPositionX: "" }).objectPositionX, 50);
});
