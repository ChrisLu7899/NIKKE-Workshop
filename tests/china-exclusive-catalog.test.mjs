// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CHINA_EXCLUSIVE_CHARACTERS,
  withChinaExclusiveCharacters,
} from "../src/data/chinaExclusiveCharacters.js";

test("CN-only characters carry the verified catalog metadata", () => {
  assert.deepEqual(
    CHINA_EXCLUSIVE_CHARACTERS.map((character) => ({
      name: character.name_cn,
      rarity: character.original_rare,
      corporation: character.corporation,
      element: character.element,
      class: character.class,
      weapon: character.weapon_type,
      burst: character.use_burst_skill,
      avatar: character.avatar_url,
    })),
    [
      {
        name: "画皮",
        rarity: "SSR",
        corporation: "MISSILIS",
        element: "Water",
        class: "Attacker",
        weapon: "AR",
        burst: "Step3",
        avatar: "images/characters/cn-exclusive-huapi-thumb.png",
      },
      {
        name: "婴宁",
        rarity: "SSR",
        corporation: "MISSILIS",
        element: "Water",
        class: "Supporter",
        weapon: "RL",
        burst: "Step2",
        avatar: "images/characters/cn-exclusive-yingning-thumb.png",
      },
    ],
  );
});

test("CN-only characters are always appended to the catalog end", () => {
  const remote = [
    { id: 1, name_code: 1001, name_cn: "拉毗" },
    { id: 2, name_code: 1002, name_cn: "阿妮斯" },
  ];
  const merged = withChinaExclusiveCharacters(remote);

  assert.deepEqual(merged.slice(0, 2), remote);
  assert.deepEqual(merged.slice(-2).map((character) => character.name_cn), ["画皮", "婴宁"]);
});

test("CN-only merge is idempotent and replaces stale cached copies", () => {
  const cached = [
    { id: 1, name_code: 1001, name_cn: "拉毗" },
    { id: "old-huapi", name_code: "old-huapi", name_cn: "画皮" },
    ...CHINA_EXCLUSIVE_CHARACTERS,
  ];
  const merged = withChinaExclusiveCharacters(cached);

  assert.equal(merged.filter((character) => character.name_cn === "画皮").length, 1);
  assert.equal(merged.filter((character) => character.name_cn === "婴宁").length, 1);
  assert.deepEqual(merged.slice(-2), CHINA_EXCLUSIVE_CHARACTERS);
});

test("CN-only characters are available even when the remote catalog is empty", () => {
  assert.deepEqual(withChinaExclusiveCharacters(null), CHINA_EXCLUSIVE_CHARACTERS);
});

test("CN-only card thumbnails are pre-scaled to three times the rendered size", async () => {
  for (const character of CHINA_EXCLUSIVE_CHARACTERS) {
    const file = await readFile(new URL(`../public/${character.avatar_url}`, import.meta.url));
    assert.equal(file.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(file.readUInt32BE(16), 216);
    assert.equal(file.readUInt32BE(20), 258);
  }
});
