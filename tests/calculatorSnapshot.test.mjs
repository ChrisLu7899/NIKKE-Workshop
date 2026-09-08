// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { buildCalculatorSnapshot } from "../src/utils/calculatorSnapshot.js";
import { buildCharactersConfig } from "../src/utils/characterCollections.js";
import { adaptCalculatorSnapshot } from "../src/calculator/snapshotAdapter.js";

test("calculator snapshot auto-matches research levels from generated catalog config", () => {
  const config = buildCharactersConfig([{
    id: 1,
    name_code: "c-auto",
    name_cn: "自动匹配",
    element: "Fire",
    class: "Supporter",
    corporation: "Tetra",
  }]);
  config.name = "自动匹配账号";
  config.researchLevels = { supporter: 207, tetra: 191 };
  config.elements.Fire[0].is_owned = true;

  const character = buildCalculatorSnapshot([config]).accounts[0].characters[0];
  assert.equal(character.classLevel, 207);
  assert.equal(character.corporationLevel, 191);
});

test("calculator snapshot keeps owned equipment data and removes account credentials", () => {
  const snapshot = buildCalculatorSnapshot([{
    name: "测试账号",
    email: "secret@example.com",
    password: "do-not-store",
    cookie: "game_token=secret",
    game_uid: "private-user-id",
    researchLevels: { attacker: 202, elysion: 186 },
    elements: {
      Electronic: [{
        id: 1,
        name_code: "c1001",
        name_cn: "测试妮姬",
        name_en: "Test Nikke",
        class: "Attacker",
        corporation: "Elysion",
        level: 400,
        combat: 123456,
        affection_level: 30,
        item_rare: "SSR",
        item_level: 2,
        limit_break: { grade: 3, core: 2 },
        skill1_level: 1,
        skill2_level: 7,
        skill_burst_level: 10,
        equipments: {
          0: [{ position: 1, function_type: "StatAtk", function_value: 11.81, level: 11 }],
        },
      }],
      Fire: [{ name_code: "unowned", name_cn: "未拥有" }],
    },
  }]);

  assert.equal(snapshot.version, 7);
  assert.equal(snapshot.ownershipSource, "GetUserCharacters");
  assert.equal(snapshot.accounts.length, 1);
  assert.equal(snapshot.accounts[0].accountName, "测试账号");
  assert.equal(snapshot.accounts[0].characters.length, 1);
  assert.equal(snapshot.accounts[0].characters[0].level, 400);
  assert.equal(snapshot.accounts[0].characters[0].combat, 123456);
  assert.equal(snapshot.accounts[0].characters[0].affectionLevel, 30);
  assert.equal(snapshot.accounts[0].characters[0].favoriteItemRarity, "SSR");
  assert.equal(snapshot.accounts[0].characters[0].favoriteItemLevel, 2);
  assert.equal(snapshot.accounts[0].characters[0].classLevel, 202);
  assert.equal(snapshot.accounts[0].characters[0].corporationLevel, 186);
  assert.equal(snapshot.accounts[0].characters[0].skill1Level, 1);
  assert.equal(snapshot.accounts[0].characters[0].skill2Level, 7);
  assert.equal(snapshot.accounts[0].characters[0].burstSkillLevel, 10);
  assert.equal(snapshot.accounts[0].researchLevels.attacker, 202);
  assert.deepEqual(snapshot.accounts[0].characters[0].limitBreak, { grade: 3, core: 2 });
  assert.deepEqual(snapshot.accounts[0].characters[0].equipments[0], [{
    position: 1,
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

test("calculator snapshot adapter preserves equipment line positions and leaves locks manual", () => {
  const characters = adaptCalculatorSnapshot({
    version: 3,
    ownershipSource: "GetUserCharacters",
    accounts: [{
      accountName: "账号A",
      characters: [{
        nameCode: "cinderella",
        nameCn: "灰姑娘",
        equipments: [
          [
            { position: 1, functionType: "StatAmmoLoad", value: 68.93, level: 11, locked: false },
            { position: 3, functionType: "IncElementDmg", value: 23.56, level: 11 },
          ],
          [],
          [],
          [],
        ],
      }],
    }],
  }, {
    equipmentSlotNames: ["头部", "身躯", "臂部", "腿部"],
    findTierForPercent: () => 0,
  });

  assert.equal(characters.length, 1);
  assert.equal(characters[0].nameCode, "cinderella");
  assert.equal(characters[0].name, "灰姑娘");
  assert.deepEqual(characters[0].equipments[0].lines[0], {
    stat: "最大装弹数增加",
    tier: 11,
    percent: 68.93,
    locked: false,
  });
  assert.equal(characters[0].equipments[0].lines[1], null);
  assert.deepEqual(characters[0].equipments[0].lines[2], {
    stat: "优越代码伤害增加",
    tier: 11,
    percent: 23.56,
    locked: false,
  });
});

test("calculator ignores legacy snapshots whose ownership was inferred incorrectly", () => {
  const characters = adaptCalculatorSnapshot({
    version: 1,
    accounts: [{ accountName: "旧缓存", characters: [{ nameCode: "legacy" }] }],
  }, {
    equipmentSlotNames: ["头部", "身躯", "臂部", "腿部"],
    findTierForPercent: () => 0,
  });

  assert.deepEqual(characters, []);
});
