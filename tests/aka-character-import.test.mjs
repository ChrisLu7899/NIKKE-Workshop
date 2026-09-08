// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import {
  akaEquipmentInfosToEquipments,
  akaStatValueToPercent,
  buildAkaCharacterImportPreview,
} from "../src/domain/akaCharacterImport.js";
import { saveLocalCharacterRecord } from "../src/domain/localCharacterRoster.js";

const catalog = [{
  id: 1,
  name_code: "c1",
  name_cn: "红莲：暗影",
  name_en: "Scarlet: Black Shadow",
  element: "Wind",
  class: "Attacker",
  use_burst_skill: "Step3",
  corporation: "Pilgrim",
  weapon_type: "RL",
  original_rare: "SSR",
}];

test("Aka stat values and one-based line indexes map to the local equipment model", () => {
  const equipments = akaEquipmentInfosToEquipments([{
    slotNo: 2,
    statInfos: [
      { index: 1, statNo: 3, statValue: 1463, statValueLevel: 15 },
      { index: 3, statNo: 0, statValue: 2496, statValueLevel: 12 },
    ],
  }]);

  assert.equal(akaStatValueToPercent(1463), 14.63);
  assert.equal(equipments[2][0].functionType, "StatAtk");
  assert.equal(equipments[2][0].level, 15);
  assert.equal(equipments[2][1].functionType, "");
  assert.equal(equipments[2][2].functionType, "IncElementDmg");
  assert.equal(equipments[2][2].value, 24.96);
});

test("Aka mapper tolerates the zero-based index shown in the API documentation", () => {
  const equipments = akaEquipmentInfosToEquipments([{
    slotNo: 0,
    statInfos: [
      { index: 0, statNo: 5, statValue: 609, statValueLevel: 15 },
      { index: 2, statNo: 2, statValue: 8537, statValueLevel: 15 },
    ],
  }]);

  assert.equal(equipments[0][0].functionType, "StatChargeTime");
  assert.equal(equipments[0][2].functionType, "StatAmmoLoad");
});

test("Aka preview imports breakthrough and affection, preserves unsupported manual fields, and ignores custom records", () => {
  const manualEquipment = [[{
    position: 1,
    functionType: "StatDef",
    value: 4.77,
    level: 1,
  }], [], [], []];
  const manual = saveLocalCharacterRecord([], {
    catalogCharacter: catalog[0],
    catalog,
    draft: { level: 400, combat: 123456, affectionLevel: 30, equipments: manualEquipment },
    now: 1,
  }).records;
  const custom = saveLocalCharacterRecord(manual, {
    custom: true,
    catalog,
    idFactory: () => "custom",
    draft: {
      base: {
        name: "原创角色",
        element: "Water",
        class: "Supporter",
        burstStage: "Step2",
        corporation: "Tetra",
        weaponType: "SR",
        rarity: "SSR",
      },
      equipments: [[], [], [], []],
    },
  }).records;

  const preview = buildAkaCharacterImportPreview({
    catalog,
    localRecords: custom,
    userInfo: {
      fireType: 202,
      pilgrimCorp: 186,
      characterList: [
        {
          characterName: "红莲：暗影",
          breakthroughLevel: 4,
          attractiveLv: 40,
          equipmentInfos: [{
            slotNo: 0,
            statInfos: [{ index: 1, statNo: 3, statValue: 1463, statValueLevel: 15 }],
          }],
        },
        { characterName: "尚未进入图鉴的角色", breakthroughLevel: 0, equipmentInfos: [] },
      ],
    },
  });

  assert.equal(preview.total, 2);
  assert.equal(preview.items.length, 1);
  assert.deepEqual(preview.unmatched, ["尚未进入图鉴的角色"]);
  assert.equal(preview.items[0].draft.level, 400);
  assert.equal(preview.items[0].draft.combat, 123456);
  assert.equal(preview.items[0].draft.affectionLevel, 40);
  assert.equal(preview.items[0].draft.classLevel, 202);
  assert.equal(preview.items[0].draft.corporationLevel, 186);
  assert.deepEqual(preview.items[0].draft.limitBreak, { grade: 3, core: 1 });
  assert.equal(preview.items[0].draft.equipments[0][0].functionType, "StatAtk");
  assert.equal(custom.find((record) => record.custom).base.name, "原创角色");

  const saved = saveLocalCharacterRecord(custom, {
    ...preview.items[0],
    catalog,
    now: 2,
  });
  assert.deepEqual(saved.record.limitBreak, { grade: 3, core: 1 });
  assert.equal(saved.record.affectionLevel, 40);
  assert.equal(saved.record.classLevel, 202);
  assert.equal(saved.record.corporationLevel, 186);
});

test("Aka preview preserves existing affection when the API omits it", () => {
  const existing = saveLocalCharacterRecord([], {
    catalogCharacter: catalog[0],
    catalog,
    draft: { affectionLevel: 30, equipments: [[], [], [], []] },
    now: 1,
  }).records;
  const preview = buildAkaCharacterImportPreview({
    catalog,
    localRecords: existing,
    userInfo: {
      characterList: [{
        characterName: "红莲：暗影",
        breakthroughLevel: 3,
        equipmentInfos: [],
      }],
    },
  });

  assert.equal(preview.items[0].draft.affectionLevel, 30);
});
