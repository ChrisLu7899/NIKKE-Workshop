// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { parseEquipmentOptionLines } from "../src/utils/equipmentOptions.js";

const effectsMap = {
  101: { function_details: [{ function_type: "StatAmmoLoad", function_value: 6893, level: 11 }] },
  103: { function_details: [{ function_type: "IncElementDmg", function_value: 2356, level: 11 }] },
};

test("equipment parser preserves a gap between option 1 and option 3", () => {
  const lines = parseEquipmentOptionLines({
    leg_equip_option1_id: 101,
    leg_equip_option2_id: 0,
    leg_equip_option3_id: 103,
  }, "leg", effectsMap);

  assert.deepEqual(lines.map((line) => line.position), [1, 3]);
  assert.deepEqual(lines.map((line) => line.function_type), ["StatAmmoLoad", "IncElementDmg"]);
  assert.equal("locked" in lines[0], false);
});

test("equipment parser keeps all three physical line positions", () => {
  const lines = parseEquipmentOptionLines({
    torso_equip_option1_id: 101,
    torso_equip_option2_id: 103,
    torso_equip_option3_id: 101,
  }, "torso", effectsMap);

  assert.deepEqual(lines.map((line) => line.position), [1, 2, 3]);
});
