// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCharacterCardData,
  equipmentFamilyForClass,
  summarizeCharacterCardAffixes,
} from "../src/domain/characterCard.js";
import { normalizeCharacterCardPreference } from "../src/services/characterCardPreferences.js";

const catalog = {
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

test("character card uses class-specific overload equipment family and keeps four physical slots", () => {
  const data = buildCharacterCardData(catalog, {
    level: 613,
    combat: 407263,
    affectionLevel: 40,
    limitBreak: { grade: 3, core: 3 },
    equipments,
  });
  assert.equal(data.name, "灰姑娘");
  assert.equal(data.equipmentFamily, "99");
  assert.equal(data.equipments.length, 4);
  assert.equal(data.equipments[0].length, 3);
  assert.equal(data.equipments[0][0].locked, true);
  assert.deepEqual(data.topAffixes.map((item) => [item.functionType, item.totalLevel, item.totalValue]), [
    ["IncElementDmg", 25, 51.31],
    ["StatAtk", 23, 24.33],
  ]);
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

test("artwork preferences clamp persisted crop positions", () => {
  assert.deepEqual(normalizeCharacterCardPreference({ artworkId: "skin-2", objectPositionX: 150, objectPositionY: -80 }), {
    artworkId: "skin-2",
    objectPositionX: 100,
    objectPositionY: -50,
    artworkScale: 100,
    artworkTransforms: {
      "skin-2": { objectPositionX: 100, objectPositionY: -50, artworkScale: 100 },
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
  });
});
