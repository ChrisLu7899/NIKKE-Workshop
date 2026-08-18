// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { buildCalculatorSnapshot } from "../src/utils/calculatorSnapshot.js";
import { adaptCalculatorSnapshot } from "../src/calculator/snapshotAdapter.js";

test("calculator snapshot keeps owned equipment data and removes account credentials", () => {
  const snapshot = buildCalculatorSnapshot([{
    name: "测试账号",
    email: "secret@example.com",
    password: "do-not-store",
    cookie: "game_token=secret",
    game_uid: "private-user-id",
    elements: {
      Electronic: [{
        id: 1,
        name_code: "c1001",
        name_cn: "测试妮姬",
        name_en: "Test Nikke",
        level: 400,
        combat: 123456,
        affection_level: 30,
        limit_break: { grade: 3, core: 2 },
        skill1_level: 1,
        equipments: {
          0: [{ function_type: "StatAtk", function_value: 11.81, level: 11 }],
        },
      }],
      Fire: [{ name_code: "unowned", name_cn: "未拥有" }],
    },
  }]);

  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.ownershipSource, "GetUserCharacters");
  assert.equal(snapshot.accounts.length, 1);
  assert.equal(snapshot.accounts[0].accountName, "测试账号");
  assert.equal(snapshot.accounts[0].characters.length, 1);
  assert.equal(snapshot.accounts[0].characters[0].level, 400);
  assert.equal(snapshot.accounts[0].characters[0].combat, 123456);
  assert.equal(snapshot.accounts[0].characters[0].affectionLevel, 30);
  assert.deepEqual(snapshot.accounts[0].characters[0].limitBreak, { grade: 3, core: 2 });
  assert.deepEqual(snapshot.accounts[0].characters[0].equipments[0], [{
    functionType: "StatAtk",
    value: 11.81,
    level: 11,
  }]);

  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("secret@example.com"), false);
  assert.equal(serialized.includes("do-not-store"), false);
  assert.equal(serialized.includes("game_token"), false);
  assert.equal(serialized.includes("private-user-id"), false);
});

test("calculator snapshot adapter maps Exia equipment lines into calculator roles", () => {
  const characters = adaptCalculatorSnapshot({
    version: 2,
    ownershipSource: "GetUserCharacters",
    accounts: [{
      accountName: "账号A",
      characters: [{
        nameCode: "cinderella",
        nameCn: "灰姑娘",
        equipments: [
          [{ functionType: "IncElementDmg", value: 20.75, level: 9 }],
          [],
          [],
          [],
        ],
      }],
    }],
  }, {
    equipmentSlotNames: ["头部装备", "身体装备", "手部装备", "足部装备"],
    findTierForPercent: () => 0,
  });

  assert.equal(characters.length, 1);
  assert.equal(characters[0].nameCode, "cinderella");
  assert.equal(characters[0].name, "灰姑娘");
  assert.deepEqual(characters[0].equipments[0].lines[0], {
    stat: "优越代码伤害增加",
    tier: 9,
    percent: 20.75,
    locked: false,
  });
});

test("calculator ignores legacy snapshots whose ownership was inferred incorrectly", () => {
  const characters = adaptCalculatorSnapshot({
    version: 1,
    accounts: [{ accountName: "旧缓存", characters: [{ nameCode: "legacy" }] }],
  }, {
    equipmentSlotNames: ["头部装备", "身体装备", "手部装备", "足部装备"],
    findTierForPercent: () => 0,
  });

  assert.deepEqual(characters, []);
});
