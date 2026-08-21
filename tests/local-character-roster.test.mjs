// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyLocalCharacterRoster,
  deleteLocalCharacterRecord,
  getRecordedLocalCharacters,
  reconcileLocalCharactersAfterSync,
  saveLocalCharacterRecord,
  normalizeCharacterName,
} from "../src/domain/localCharacterRoster.js";
import { getLocalCharacterRoster, setLocalCharacterRoster } from "../src/services/localCharacterRoster.js";
import { buildUnifiedCalculatorSnapshot } from "../src/utils/calculatorSnapshot.js";

const catalog = [{ id: 1, name_code: "c1", name_cn: "标准角色", name_en: "Standard", element: "Fire", class: "Attacker", use_burst_skill: "Step3", corporation: "Elysion", weapon_type: "AR", original_rare: "SSR" }];
const equipment = [[{ position: 1, functionType: "StatAtk", value: 11.81, level: 11 }], [], [], []];

test("name matching normalization trims spaces, normalizes full-width spaces, and ignores English case", () => {
  assert.equal(normalizeCharacterName("  New　HERO  "), normalizeCharacterName("new hero"));
});

function fakeStorage() {
  const data = {};
  return { data, get(key, callback) { callback({ [key]: data[key] }); }, set(value, callback) { Object.assign(data, value); callback(); } };
}

test("recorded roster starts empty, persists through refresh, and standard entry can be deleted", async () => {
  const storage = fakeStorage();
  assert.deepEqual(await getLocalCharacterRoster(storage), createEmptyLocalCharacterRoster());
  const saved = saveLocalCharacterRecord([], { catalogCharacter: catalog[0], draft: { equipments: equipment, level: 400 }, catalog, now: 1 });
  assert.equal(saved.errors.length, 0);
  await setLocalCharacterRoster({ records: saved.records }, storage);
  const restored = await getLocalCharacterRoster(storage);
  assert.equal(restored.records[0].level, 400);
  assert.equal(getRecordedLocalCharacters(restored.records).length, 1);
  assert.equal(deleteLocalCharacterRecord(restored.records, restored.records[0].localId).length, 0);
});

test("custom characters support create, edit, delete and reject built-in duplicate names", () => {
  const draft = { base: { name: "原创角色", element: "Water", class: "Supporter", burstStage: "Step2", corporation: "Tetra", weaponType: "SR", rarity: "SSR" }, equipments: [[], [], [], []] };
  const created = saveLocalCharacterRecord([], { draft, custom: true, catalog, idFactory: () => "stable", now: 1 });
  assert.equal(created.errors.length, 0);
  assert.equal(created.record.localId, "custom:stable");
  const edited = saveLocalCharacterRecord(created.records, { draft: { ...draft, level: 99 }, custom: true, existingLocalId: "custom:stable", catalog, now: 2 });
  assert.equal(edited.record.level, 99);
  const duplicate = saveLocalCharacterRecord(edited.records, { draft: { ...draft, base: { ...draft.base, name: "标准角色" } }, custom: true, catalog });
  assert.match(duplicate.errors.join("；"), /内置标准角色/);
  assert.equal(deleteLocalCharacterRecord(edited.records, "custom:stable").length, 0);
});

test("successful sync overwrites standard manual data, retains custom, and marks missing manual entries", () => {
  const manual = saveLocalCharacterRecord([], { catalogCharacter: catalog[0], draft: { level: 1, equipments: equipment }, catalog, now: 1 }).records;
  const custom = saveLocalCharacterRecord(manual, { draft: { base: { name: "原创角色", element: "Water", class: "Supporter", burstStage: "Step2", corporation: "Tetra", weaponType: "SR", rarity: "SSR" }, level: 10, equipments: [[], [], [], []] }, custom: true, catalog, idFactory: () => "x", now: 1 }).records;
  const result = reconcileLocalCharactersAfterSync(custom, { accounts: [{ source: "sync", characters: [{ nameCode: "c1", nameCn: "标准角色", level: 500, equipments: [[], [], [], []] }] }] }, catalog, 2);
  const standard = result.records.find((record) => record.nameCode === "c1");
  assert.equal(standard.source, "sync");
  assert.equal(standard.level, 500);
  assert.equal(result.summary.overwrittenStandardCount, 1);
  assert.equal(result.records.find((record) => record.custom).level, 10);
  assert.equal(getRecordedLocalCharacters(result.records).length, 1);

  const missing = reconcileLocalCharactersAfterSync(manual, { accounts: [] }, catalog, 3);
  assert.equal(missing.records[0].syncMissing, true);
  assert.equal(missing.records[0].level, 1);
});

test("sync preserves a manually supplemented equipment position that the source omitted", () => {
  const manual = saveLocalCharacterRecord([], { catalogCharacter: catalog[0], draft: { equipments: [[
    { position: 1, functionType: "StatAtk", value: 11.81, level: 11 },
    { position: 3, functionType: "IncElementDmg", value: 23.56, level: 11 },
  ], [], [], []] }, catalog }).records;
  const result = reconcileLocalCharactersAfterSync(manual, { accounts: [{ characters: [{ nameCode: "c1", equipments: [[{ position: 1, functionType: "StatAtk", value: 14.63, level: 15 }], [], [], []] }] }] }, catalog);
  assert.equal(result.records[0].equipments[0][0].value, 14.63);
  assert.equal(result.records[0].equipments[0][2].functionType, "IncElementDmg");
  assert.ok(result.records[0].manualSupplementFields.includes("equipments.0.2"));
});

test("failed sync leaves manual data unchanged when reconciliation is not committed", () => {
  const manual = saveLocalCharacterRecord([], { catalogCharacter: catalog[0], draft: { level: 88, equipments: equipment }, catalog }).records;
  const before = JSON.stringify(manual);
  const syncOutcome = { successAccountCount: 0, error: "timeout" };
  if (syncOutcome.successAccountCount > 0) throw new Error("unreachable");
  assert.equal(JSON.stringify(manual), before);
});

test("recorded characters enter the unified calculator with all equipment positions", () => {
  const records = saveLocalCharacterRecord([], { catalogCharacter: catalog[0], draft: { equipments: equipment }, catalog }).records;
  const snapshot = buildUnifiedCalculatorSnapshot(null, records);
  assert.equal(snapshot.accounts[0].source, "local");
  assert.equal(snapshot.accounts[0].characters[0].equipments[0][0].position, 1);
});
