// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCharacterConfigShowStatsToAccountDicts,
  attachCalculatorCollections,
  buildCalculatorCollections,
  buildCharactersConfig,
  characterCodeSet,
  filterAccountDictsToOwned,
  mergeNikkesIntoCharacters,
} from "../src/utils/characterCollections.js";

const catalog = [
  { id: 1, name_code: "c1", name_cn: "角色1", element: "Fire" },
  { id: 2, name_code: "c2", name_cn: "角色2", element: "Electronic" },
];

test("owned filtering does not treat a zero-grade catalog placeholder as owned", () => {
  const filtered = filterAccountDictsToOwned([{
    name: "测试账号",
    elements: {
      Fire: [
        { name_code: "placeholder", limit_break: { grade: 0, core: 0 } },
        { name_code: "owned-zero-star", is_owned: true, limit_break: { grade: 0, core: 0 } },
      ],
    },
  }]);

  assert.deepEqual(
    filtered[0].elements.Fire.map((character) => character.name_code),
    ["owned-zero-star"],
  );
});

test("catalog characters are grouped and custom lists merge without duplicates", () => {
  const full = buildCharactersConfig(catalog);
  assert.equal(full.elements.Fire[0].name_code, "c1");
  assert.equal(full.elements.Electronic[0].name_code, "c2");

  const merged = mergeNikkesIntoCharacters(buildCharactersConfig([catalog[0]]), catalog);
  assert.deepEqual([...characterCodeSet(merged)].sort(), ["c1", "c2"]);
});

test("owned account filtering removes empty catalog placeholders and supports list scope", () => {
  const accountDicts = [{
    name: "账号",
    elements: {
      Fire: [
        { name_code: "c1", skill1_level: 10, equipments: {} },
        { name_code: "c3", equipments: {} },
      ],
      Electronic: [{ name_code: "c2", skill1_level: 5, equipments: {} }],
    },
  }];

  const owned = filterAccountDictsToOwned(accountDicts);
  assert.equal(owned[0].elements.Fire.length, 1);
  assert.equal(owned[0].elements.Electronic.length, 1);

  const scoped = filterAccountDictsToOwned(accountDicts, new Set(["c2"]));
  assert.equal(scoped[0].elements.Fire.length, 0);
  assert.equal(scoped[0].elements.Electronic[0].name_code, "c2");
});

test("custom list output fields are applied per character", () => {
  const accountDicts = [{
    name: "账号",
    elements: {
      Fire: [{ name_code: "c1", equipments: {} }],
      Electronic: [{ name_code: "c2", equipments: {} }],
    },
  }];
  const characters = buildCharactersConfig(catalog);
  characters.elements.Fire[0].showStats = ["skill_level", "equipments"];
  characters.elements.Electronic[0].showStats = ["limit_break"];

  const result = applyCharacterConfigShowStatsToAccountDicts(accountDicts, characters);
  assert.deepEqual(result[0].elements.Fire[0].showStats, ["skill_level", "equipments"]);
  assert.deepEqual(result[0].elements.Electronic[0].showStats, ["limit_break"]);
  assert.equal(accountDicts[0].elements.Fire[0].showStats, undefined);
});

test("calculator snapshot receives owned and non-empty custom collections", () => {
  const snapshot = attachCalculatorCollections({
    version: 1,
    accounts: [{
      accountName: "账号",
      characters: [
        { nameCode: "c1", nameCn: "角色1", equipments: [] },
        { nameCode: "c2", nameCn: "角色2", equipments: [] },
      ],
    }],
  }, [
    { id: "1", name: "主力", data: buildCharactersConfig([catalog[0]]) },
    { id: "2", name: "空列表", data: buildCharactersConfig([]) },
  ]);

  assert.equal(snapshot.defaultCollectionId, "owned");
  assert.deepEqual(snapshot.collections.map((item) => item.id), ["owned", "template:1"]);
  assert.deepEqual(snapshot.collections[1].characterCodes, ["c1"]);

  const preferred = attachCalculatorCollections(snapshot, [{
    id: "1",
    name: "主力",
    data: buildCharactersConfig([catalog[0]]),
  }], "template:1");
  assert.equal(preferred.defaultCollectionId, "template:1");
});

test("calculator recommendation collections preserve preset entry order", () => {
  const collections = buildCalculatorCollections({
    accounts: [{
      characters: [
        { nameCode: "5110" },
        { nameCode: "5129" },
        { nameCode: "5137" },
        { nameCode: "5169" },
        { nameCode: "5011" },
      ],
    }],
  }, []);
  const recommendation = collections.find((collection) => collection.id === "recommendation:stage-one-cooldown");
  assert.deepEqual(recommendation.characterCodes, ["5169", "5137", "5011", "5129", "5110"]);
});
