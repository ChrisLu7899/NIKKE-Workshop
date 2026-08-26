// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { saveLocalCharacterRecord } from "../src/domain/localCharacterRoster.js";
import { createLocalGalleryWorkbook, exportLocalGalleryBuffer, importLocalGalleryBuffer } from "../src/utils/localGalleryExcel.js";

const catalog = [{ id: 1, resource_id: 101, name_code: "c1", name_cn: "标准角色", name_en: "Standard", element: "Fire", class: "Attacker", use_burst_skill: "Step3", corporation: "Elysion", weapon_type: "AR", original_rare: "SSR" }];
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const tinyPngBuffer = () => Uint8Array.from(Buffer.from(TINY_PNG, "base64")).buffer;

test("empty recorded list exports a role-card view and four import sheets", () => {
  const workbook = createLocalGalleryWorkbook([]);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["角色卡", "使用说明", "角色", "装备", "词条"]);
  assert.match(String(workbook.getWorksheet("角色卡").getCell("A4").value), /暂无已录入角色/);
  assert.equal(workbook.getWorksheet("角色").rowCount, 1);
});

test("current-list export can include synced records", () => {
  const synced = saveLocalCharacterRecord([], {
    catalogCharacter: catalog[0],
    draft: { level: 500 },
    source: "sync",
    catalog,
  }).records;
  const defaultWorkbook = createLocalGalleryWorkbook(synced);
  const currentListWorkbook = createLocalGalleryWorkbook(synced, { includeSynced: true });

  assert.equal(defaultWorkbook.getWorksheet("角色").rowCount, 1);
  assert.equal(currentListWorkbook.getWorksheet("角色").rowCount, 2);
});

test("local gallery round-trip preserves numeric values, physical slots, and lock state", async () => {
  const records = saveLocalCharacterRecord([], { catalogCharacter: catalog[0], catalog, draft: { level: 400, equipments: [[{ position: 3, functionType: "IncElementDmg", value: 23.56, level: 11, locked: true }], [], [], []] } }).records;
  let avatarFetches = 0;
  const buffer = await exportLocalGalleryBuffer(records, {
    fetchImage: async (url) => {
      avatarFetches += 1;
      assert.match(url, /si_c101_00_s\.png$/);
      return tinyPngBuffer();
    },
  });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  const cardSheet = workbook.getWorksheet("角色卡");
  const [avatarImage] = cardSheet.getImages();
  assert.equal(avatarFetches, 1);
  assert.equal(cardSheet.getImages().length, 1);
  assert.equal(avatarImage.range.tl.nativeColOff, 20 * 9525);
  assert.equal(avatarImage.range.tl.nativeRowOff, 3 * 9525);
  assert.equal(avatarImage.range.ext.width, 82);
  assert.equal(cardSheet.getCell("A3").value, null);
  assert.equal(cardSheet.getCell("A3").fill.fgColor.argb, "FFFFFFFF");
  assert.equal(workbook.getWorksheet("装备").getCell("D2").value, "头部");
  const numericLine = workbook.getWorksheet("词条").getRows(2, 12).find((row) => row.getCell(5).value === "IncElementDmg");
  assert.equal(typeof numericLine.getCell(7).value, "number");
  assert.equal(numericLine.getCell(9).value, "已锁");
  const imported = await importLocalGalleryBuffer(buffer, { catalog, existingRecords: [] });
  assert.equal(imported.summary.matched, 1);
  assert.equal(imported.summary.created, 1);
  assert.equal(imported.records[0].nameCode, "c1");
  assert.equal(imported.records[0].equipments[0][2].value, 23.56);
  assert.equal(imported.records[0].equipments[0][2].locked, true);
});

test("role card follows the compact template and keeps formulas cached", () => {
  const records = saveLocalCharacterRecord([], {
    catalogCharacter: catalog[0],
    catalog,
    draft: {
      level: 611,
      combat: 423181,
      affectionLevel: 40,
      equipments: [
        [{ position: 1, functionType: "StatAtk", value: 14.63, level: 15, locked: true }],
        [{ position: 1, functionType: "IncElementDmg", value: 24.96, level: 12, locked: false }],
        [],
        [],
      ],
    },
  }).records;
  const workbook = createLocalGalleryWorkbook(records);
  const cards = workbook.getWorksheet("角色卡");
  assert.equal(cards.getCell("A1").value, "NIKKE WORKSHOP  ·  本地图鉴角色卡");
  assert.deepEqual(
    Array.from({ length: 10 }, (_, index) => cards.getColumn(index + 1).width),
    [8.69921875, 8.69921875, 11.5, 11.5, 11.5, 8.69921875, 8.69921875, 11.5, 11.5, 11.5],
  );
  assert.match(cards.getCell("A3").value.formula, /IFERROR\(_xlfn\.IMAGE/);
  assert.equal(cards.getCell("A3").value.result, "标准角色\n角色头像");
  assert.equal(cards.getCell("A3").fill.fgColor.argb, "FFFFFFFF");
  assert.equal(cards.getCell("C3").value.formula, "'角色'!B2");
  assert.equal(cards.getCell("C3").value.result, "标准角色");
  assert.match(cards.getCell("A9").value.formula, /COUNTIFS\('词条'!/);
  assert.equal(cards.getCell("A9").value.result, 24.96);
  assert.equal(cards.getCell("A12").value.result, "攻击力增加");
  assert.equal(cards.getCell("E12").value.result, "已锁");
  assert.deepEqual([cards.getCell("A11").value, cards.getCell("F11").value, cards.getCell("A16").value, cards.getCell("F16").value], ["头部", "身躯", "臂部", "腿部"]);
  assert.equal(cards.getCell("A12").fill.fgColor.argb, "FF000000");
  assert.equal(cards.getCell("F12").font.color.argb, "FF00A6E9");
  assert.equal(cards.getCell("A3").border.top.style, "medium");
  assert.equal(cards.getCell("A3").border.left.style, "medium");
  assert.equal(cards.getCell("J3").border.top.style, "medium");
  assert.equal(cards.getCell("J3").border.right.style, "medium");
  assert.equal(cards.getCell("A19").border.bottom.style, "medium");
  assert.equal(cards.getCell("J19").border.bottom.style, "medium");
  const firstLineRow = workbook.getWorksheet("词条").getRow(2);
  assert.equal(firstLineRow.getCell(9).fill.fgColor.argb, "FF000000");
  assert.equal(firstLineRow.getCell(10).fill?.fgColor, undefined);

  const secondRecord = {
    ...records[0],
    localId: "standard:c2",
    nameCode: "c2",
    base: { ...records[0].base, name: "第二角色", nameCn: "第二角色" },
  };
  const stackedCards = createLocalGalleryWorkbook([records[0], secondRecord]).getWorksheet("角色卡");
  assert.equal(stackedCards.getRow(20).height, 28);
  assert.equal(stackedCards.getCell("A20").fill.fgColor.argb, "FFFFFFFF");
  assert.equal(stackedCards.getCell("A20").border?.top?.style, undefined);
  assert.equal(stackedCards.getCell("A21").border.top.style, "medium");
  assert.equal(stackedCards.getCell("C21").value.formula, "'角色'!B3");
  assert.equal(stackedCards.getCell("C21").value.result, "第二角色");
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

test("invalid lock labels are rejected instead of being silently treated as unlocked", async () => {
  const workbook = createLocalGalleryWorkbook([]);
  workbook.getWorksheet("角色").addRow(["local-lock", "标准角色", "c1", "excel", false, "Fire", "Attacker", "Step3", "Elysion", "AR", "SSR", 400, 0, 0, 0, 0]);
  workbook.getWorksheet("词条").addRow(["local-lock", "标准角色", 1, 1, "StatAtk", "攻击力增加", 11.11, 10, "大概锁了"]);
  const result = await importLocalGalleryBuffer(await workbook.xlsx.writeBuffer(), { catalog });
  assert.equal(result.summary.created, 0);
  assert.equal(result.summary.skipped, 1);
  assert.match(result.summary.errors[0], /包含无效字段/);
});
