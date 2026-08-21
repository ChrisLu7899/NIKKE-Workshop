// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  createManualFourEquipmentCharacter,
  isStandaloneCalculatorCollection,
  MANUAL_FOUR_EQUIPMENT_COLLECTION_ID,
  shouldShowRecommendationSelector,
  SINGLE_EQUIPMENT_COLLECTION_ID,
} from "../src/calculator/manualEquipment.js";

test("manual global mode creates four editable blank equipment panels", () => {
  const slots = ["头部装备", "身体装备", "手部装备", "足部装备"];
  const character = createManualFourEquipmentCharacter(slots);
  assert.equal(MANUAL_FOUR_EQUIPMENT_COLLECTION_ID, "manual-four-equipment");
  assert.equal(character.name, "四装备全局模拟");
  assert.equal(character.transient, true);
  assert.deepEqual(character.equipments, slots.map(label => ({ label, lines: [] })));
});

test("standalone calculator modes hide account-only recommendation controls", () => {
  assert.equal(isStandaloneCalculatorCollection(SINGLE_EQUIPMENT_COLLECTION_ID), true);
  assert.equal(isStandaloneCalculatorCollection(MANUAL_FOUR_EQUIPMENT_COLLECTION_ID), true);
  assert.equal(isStandaloneCalculatorCollection("owned"), false);

  assert.equal(shouldShowRecommendationSelector({
    collectionId: "owned",
    hasCharacterData: false,
    hasRecommendations: true,
  }), false);
  assert.equal(shouldShowRecommendationSelector({
    collectionId: SINGLE_EQUIPMENT_COLLECTION_ID,
    hasCharacterData: true,
    hasRecommendations: true,
  }), false);
  assert.equal(shouldShowRecommendationSelector({
    collectionId: MANUAL_FOUR_EQUIPMENT_COLLECTION_ID,
    hasCharacterData: true,
    hasRecommendations: true,
  }), false);
  assert.equal(shouldShowRecommendationSelector({
    collectionId: "owned",
    hasCharacterData: true,
    hasRecommendations: true,
  }), true);
});
