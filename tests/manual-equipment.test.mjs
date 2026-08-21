// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  createManualFourEquipmentCharacter,
  MANUAL_FOUR_EQUIPMENT_COLLECTION_ID,
} from "../src/calculator/manualEquipment.js";

test("manual global mode creates four editable blank equipment panels", () => {
  const slots = ["头部装备", "身体装备", "手部装备", "足部装备"];
  const character = createManualFourEquipmentCharacter(slots);
  assert.equal(MANUAL_FOUR_EQUIPMENT_COLLECTION_ID, "manual-four-equipment");
  assert.equal(character.name, "四装备全局模拟");
  assert.equal(character.transient, true);
  assert.deepEqual(character.equipments, slots.map(label => ({ label, lines: [] })));
});
