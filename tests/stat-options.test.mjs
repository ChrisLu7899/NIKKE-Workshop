// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { unavailableStatsForRow } from "../src/calculator/statOptions.js";

test("equipment rows disable non-empty stats selected by another row", () => {
  const selected = ["优越代码伤害增加", "攻击力增加", "空词条"];

  assert.deepEqual(
    [...unavailableStatsForRow(selected, 0)],
    ["攻击力增加"],
  );
  assert.deepEqual(
    [...unavailableStatsForRow(selected, 2)],
    ["优越代码伤害增加", "攻击力增加"],
  );
});

test("empty stat remains repeatable and the current row does not block itself", () => {
  const selected = ["空词条", "优越代码伤害增加", "空词条"];

  const unavailable = unavailableStatsForRow(selected, 1);
  assert.equal(unavailable.has("空词条"), false);
  assert.equal(unavailable.has("优越代码伤害增加"), false);
  assert.equal(unavailable.size, 0);
});
