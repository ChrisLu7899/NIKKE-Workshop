import assert from "node:assert/strict";
import test from "node:test";

import { summarizeTopEquipmentAffixes } from "../src/domain/equipmentAffixSummary.js";

test("selects the four highest aggregate tiers and displays them in fixed label order", () => {
  const equipments = [
    [
      { functionType: "IncElementDmg", value: 22.15, level: 10 },
      { functionType: "StatAtk", value: 10.4, level: 9 },
      { functionType: "StatAmmoLoad", value: 60.71, level: 9 },
    ],
    [
      { functionType: "IncElementDmg", value: 24.96, level: 12 },
      { functionType: "StatAtk", value: 11.11, level: 10 },
      { functionType: "StatCritical", value: 6.73, level: 14 },
    ],
    [
      { functionType: "StatAmmoLoad", value: 64.82, level: 10 },
      { functionType: "StatAtk", value: 14.63, level: 15 },
      { functionType: "IncElementDmg", value: 27.76, level: 14 },
    ],
    [
      { functionType: "StatAtk", value: 14.63, level: 15 },
      { functionType: "IncElementDmg", value: 22.15, level: 10 },
      { functionType: "StatCriticalDamage", value: 18.4, level: 13 },
    ],
  ];

  assert.deepEqual(
    summarizeTopEquipmentAffixes(equipments).map(({ shortLabel, totalLevel, roundedValue }) => ({ shortLabel, totalLevel, roundedValue })),
    [
      { shortLabel: "优越", totalLevel: 46, roundedValue: 97 },
      { shortLabel: "攻击", totalLevel: 49, roundedValue: 51 },
      { shortLabel: "弹容", totalLevel: 19, roundedValue: 126 },
      { shortLabel: "暴击", totalLevel: 14, roundedValue: 7 },
    ],
  );
});

test("ignores empty and unsupported equipment lines", () => {
  assert.deepEqual(summarizeTopEquipmentAffixes([
    [{ functionType: "", value: "", level: "" }],
    [{ functionType: "Unknown", value: 99, level: 15 }],
  ]), []);
});

