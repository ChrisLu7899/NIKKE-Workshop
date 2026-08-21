// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { saveLocalCharacterRecord } from "../src/domain/localCharacterRoster.js";
import { createLocalGalleryWorkbook, exportLocalGalleryBuffer, importLocalGalleryBuffer } from "../src/utils/localGalleryExcel.js";

const catalog = [{ id: 1, name_code: "c1", name_cn: "标准角色", name_en: "Standard", element: "Fire", class: "Attacker", use_burst_skill: "Step3", corporation: "Elysion", weapon_type: "AR", original_rare: "SSR" }];

test("empty recorded list exports a four-sheet template with headers", () => {
  const workbook = createLocalGalleryWorkbook([]);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["使用说明", "角色", "装备", "词条"]);
  assert.equal(workbook.getWorksheet("角色").rowCount, 1);
});

test("local gallery round-trip preserves numeric percentage values and matches standard characters", async () => {
  const records = saveLocalCharacterRecord([], { catalogCharacter: catalog[0], catalog, draft: { level: 400, equipments: [[{ position: 3, functionType: "IncElementDmg", value: 23.56, level: 11 }], [], [], []] } }).records;
  const buffer = await exportLocalGalleryBuffer(records);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  const numericLine = workbook.getWorksheet("词条").getRows(2, 12).find((row) => row.getCell(5).value === "IncElementDmg");
  assert.equal(typeof numericLine.getCell(7).value, "number");
  const imported = await importLocalGalleryBuffer(buffer, { catalog, existingRecords: [] });
  assert.equal(imported.summary.matched, 1);
  assert.equal(imported.summary.created, 1);
  assert.equal(imported.records[0].nameCode, "c1");
  assert.equal(imported.records[0].equipments[0][2].value, 23.56);
});

test("unmatched complete Excel character creates custom; duplicate and invalid rows are skipped", async () => {
  const workbook = createLocalGalleryWorkbook([]);
  const characters = workbook.getWorksheet("角色");
  const row = ["", "New Hero", "", "custom", true, "Water", "Supporter", "Step2", "Tetra", "SR", "SSR", 100, 0, 0, 123, 10];
  characters.addRow(row); characters.addRow(row);
  characters.addRow(["", "", "", "custom", true]);
  const result = await importLocalGalleryBuffer(await workbook.xlsx.writeBuffer(), { catalog });
  assert.equal(result.summary.created, 1);
  assert.equal(result.summary.skipped, 2);
  assert.equal(result.records[0].custom, true);
  assert.equal(result.records[0].base.name, "New Hero");
});
