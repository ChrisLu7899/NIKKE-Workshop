// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import {
  listRunRecords,
  normalizeRunRecordStore,
  sortRunRecords,
  upsertRunRecord,
} from "../src/calculator/resultRecords.js";

test("each character keeps only its latest successful run", () => {
  let store = normalizeRunRecordStore(null);
  store = upsertRunRecord(store, {
    characterKey: "account::cinderella",
    characterName: "灰姑娘",
    savedAt: 100,
    totalExpectedCost: 120,
  });
  store = upsertRunRecord(store, {
    characterKey: "account::alice",
    characterName: "爱丽丝",
    savedAt: 150,
    totalExpectedCost: 80,
  });
  store = upsertRunRecord(store, {
    characterKey: "account::cinderella",
    characterName: "灰姑娘",
    savedAt: 200,
    totalExpectedCost: 42,
  });

  assert.equal(Object.keys(store.entries).length, 2);
  assert.equal(store.entries["account::cinderella"].totalExpectedCost, 42);
  assert.deepEqual(listRunRecords(store).map(record => record.characterName), ["灰姑娘", "爱丽丝"]);
});

test("malformed saved entries are ignored", () => {
  const store = normalizeRunRecordStore({
    entries: {
      valid: { characterKey: "valid", characterName: "有效" },
      mismatched: { characterKey: "other" },
      empty: null,
    },
  });

  assert.deepEqual(Object.keys(store.entries), ["valid"]);
});

test("run records support time and stone-count ordering", () => {
  const records = [
    { characterName: "灰姑娘", savedAt: 300, totalExpectedCost: 42 },
    { characterName: "拉毗", savedAt: 100, totalExpectedCost: 110 },
    { characterName: "爱丽丝", savedAt: 200, totalExpectedCost: 80 },
  ];

  assert.deepEqual(sortRunRecords(records).map(record => record.characterName), ["拉毗", "爱丽丝", "灰姑娘"]);
  assert.deepEqual(sortRunRecords(records, "time-desc").map(record => record.characterName), ["灰姑娘", "爱丽丝", "拉毗"]);
  assert.deepEqual(sortRunRecords(records, "cost-asc").map(record => record.characterName), ["灰姑娘", "爱丽丝", "拉毗"]);
  assert.deepEqual(sortRunRecords(records, "cost-desc").map(record => record.characterName), ["拉毗", "爱丽丝", "灰姑娘"]);
  assert.deepEqual(records.map(record => record.characterName), ["灰姑娘", "拉毗", "爱丽丝"]);
});
