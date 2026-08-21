// SPDX-License-Identifier: GPL-3.0-or-later

import ExcelJS from "exceljs";
import {
  EQUIPMENT_FUNCTION_LABELS,
  EQUIPMENT_FUNCTION_TYPES,
  LOCAL_CHARACTER_SOURCES,
  findCatalogCharacterByName,
  getRecordedLocalCharacters,
  normalizeCharacterName,
  normalizeEquipments,
  normalizeLocalCharacterRecord,
  saveLocalCharacterRecord,
} from "../domain/localCharacterRoster.js";

export const LOCAL_GALLERY_SHEETS = Object.freeze({
  readme: "使用说明",
  characters: "角色",
  equipments: "装备",
  lines: "词条",
});

const CHARACTER_COLUMNS = [
  ["本地ID", "localId"], ["名称", "name"], ["标准name_code", "nameCode"],
  ["来源", "source"], ["自定义", "custom"], ["属性", "element"], ["职业", "class"],
  ["爆裂阶段", "burstStage"], ["企业", "corporation"], ["武器类型", "weaponType"],
  ["稀有度", "rarity"], ["等级", "level"], ["突破", "grade"], ["核心突破", "core"],
  ["战斗力", "combat"], ["好感度", "affectionLevel"],
  ["简中名称", "nameCn"], ["英文名称", "nameEn"], ["图鉴ID", "catalogId"], ["资源ID", "resourceId"],
  ["同步未发现", "syncMissing"], ["手动补充字段", "manualSupplementFields"],
  ["创建时间", "createdAt"], ["更新时间", "updatedAt"],
];

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1976D2" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function worksheetRows(sheet) {
  const headers = new Map();
  sheet.getRow(1).eachCell((cell, column) => headers.set(String(cell.value || "").trim(), column));
  const rows = [];
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    if (!row.hasValues) continue;
    const value = {};
    headers.forEach((column, header) => { value[header] = row.getCell(column).value; });
    value.__row = index;
    rows.push(value);
  }
  return rows;
}

function numeric(value, { integer = false, min = null, max = null } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "string" && value.includes("%")) return NaN;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  const result = integer ? Math.trunc(parsed) : parsed;
  if ((min !== null && result < min) || (max !== null && result > max)) return NaN;
  return result;
}

export function createLocalGalleryWorkbook(records = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NIKKE Workshop";
  const readme = workbook.addWorksheet(LOCAL_GALLERY_SHEETS.readme);
  [
    ["NIKKE Workshop 本地图鉴"],
    ["文件仅在扩展本地解析，不会上传服务器。请勿修改工作表名称或表头。"],
    ["百分比数值请填写真实数字，例如 22.15；不要填写 22.15%。"],
    ["角色名称采用精确匹配：忽略首尾空格、全半角空格及英文大小写，不做模糊匹配。"],
  ].forEach((values) => readme.addRow(values));
  readme.getColumn(1).width = 95;
  readme.getRow(1).font = { bold: true, size: 16 };

  const characters = workbook.addWorksheet(LOCAL_GALLERY_SHEETS.characters);
  characters.addRow(CHARACTER_COLUMNS.map(([label]) => label));
  styleHeader(characters.getRow(1));
  characters.columns.forEach((column) => { column.width = 16; });

  const equipments = workbook.addWorksheet(LOCAL_GALLERY_SHEETS.equipments);
  equipments.addRow(["本地ID", "角色名称", "装备序号", "装备名称"]);
  styleHeader(equipments.getRow(1));
  equipments.columns.forEach((column) => { column.width = 22; });

  const lines = workbook.addWorksheet(LOCAL_GALLERY_SHEETS.lines);
  lines.addRow(["本地ID", "角色名称", "装备序号", "词条位置", "词条类型代码", "词条名称", "数值", "档位"]);
  styleHeader(lines.getRow(1));
  lines.columns.forEach((column) => { column.width = 20; });

  const equipmentNames = ["头部装备", "身体装备", "手部装备", "足部装备"];
  getRecordedLocalCharacters(records).forEach((recordInput) => {
    const record = normalizeLocalCharacterRecord(recordInput);
    characters.addRow([
      record.localId, record.base.name, record.nameCode, record.source, record.custom,
      record.base.element, record.base.class, record.base.burstStage, record.base.corporation,
      record.base.weaponType, record.base.rarity, record.level, record.limitBreak.grade,
      record.limitBreak.core, record.combat, record.affectionLevel,
      record.base.nameCn, record.base.nameEn, record.base.catalogId, record.base.resourceId,
      record.syncMissing, record.manualSupplementFields.join("|"), record.createdAt, record.updatedAt,
    ]);
    record.equipments.forEach((equipment, slotIndex) => {
      equipments.addRow([record.localId, record.base.name, slotIndex + 1, equipmentNames[slotIndex]]);
      equipment.forEach((line) => lines.addRow([
        record.localId, record.base.name, slotIndex + 1, line.position,
        line.functionType || null, EQUIPMENT_FUNCTION_LABELS[line.functionType] || null,
        line.value, line.level,
      ]));
    });
  });
  return workbook;
}

export async function exportLocalGalleryBuffer(records = []) {
  return createLocalGalleryWorkbook(records).xlsx.writeBuffer();
}

export async function importLocalGalleryBuffer(buffer, { catalog = [], existingRecords = [], now = Date.now() } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const characterSheet = workbook.getWorksheet(LOCAL_GALLERY_SHEETS.characters);
  const lineSheet = workbook.getWorksheet(LOCAL_GALLERY_SHEETS.lines);
  if (!characterSheet || !lineSheet) throw new Error("缺少“角色”或“词条”工作表");
  const characterRows = worksheetRows(characterSheet);
  const lineRows = worksheetRows(lineSheet);
  const groupedLines = new Map();
  lineRows.forEach((row) => {
    const id = String(row["本地ID"] || "").trim();
    const name = normalizeCharacterName(row["角色名称"]);
    const key = id || name;
    if (!key) return;
    if (!groupedLines.has(key)) groupedLines.set(key, []);
    groupedLines.get(key).push(row);
  });

  const seenNames = new Set();
  let records = [...existingRecords];
  const summary = { matched: 0, updated: 0, created: 0, skipped: 0, errors: [] };
  for (const row of characterRows) {
    const displayName = String(row["名称"] || "").trim();
    const normalizedName = normalizeCharacterName(displayName);
    if (!normalizedName) {
      summary.skipped += 1; summary.errors.push(`角色表第 ${row.__row} 行：名称不能为空`); continue;
    }
    if (seenNames.has(normalizedName)) {
      summary.skipped += 1; summary.errors.push(`角色表第 ${row.__row} 行：名称重复“${displayName}”`); continue;
    }
    seenNames.add(normalizedName);
    const standard = findCatalogCharacterByName(catalog, displayName);
    const existingCustom = records.find((record) => record.custom && normalizeCharacterName(record.base?.name) === normalizedName);
    const localId = String(row["本地ID"] || "").trim();
    const key = localId || normalizedName;
    const equipments = Array.from({ length: 4 }, () => []);
    let invalid = false;
    (groupedLines.get(key) || groupedLines.get(normalizedName) || []).forEach((lineRow) => {
      const slot = numeric(lineRow["装备序号"], { integer: true, min: 1, max: 4 });
      const position = numeric(lineRow["词条位置"], { integer: true, min: 1, max: 3 });
      const type = String(lineRow["词条类型代码"] || "").trim();
      const value = numeric(lineRow["数值"], { min: 0 });
      const level = numeric(lineRow["档位"], { integer: true, min: 1, max: 15 });
      if (Number.isNaN(slot) || Number.isNaN(position) || (type && !EQUIPMENT_FUNCTION_TYPES.includes(type))
        || Number.isNaN(value) || Number.isNaN(level)) invalid = true;
      else if (slot && position) equipments[slot - 1].push({ position, functionType: type, value, level });
    });
    const draft = {
      base: {
        name: displayName, nameCn: row["简中名称"] || displayName, nameEn: row["英文名称"] || displayName,
        element: row["属性"], class: row["职业"], burstStage: row["爆裂阶段"],
        corporation: row["企业"], weaponType: row["武器类型"], rarity: row["稀有度"],
        catalogId: row["图鉴ID"] ?? null, resourceId: row["资源ID"] ?? null,
      },
      level: numeric(row["等级"], { integer: true, min: 1 }),
      limitBreak: { grade: numeric(row["突破"], { integer: true, min: 0 }), core: numeric(row["核心突破"], { integer: true, min: 0 }) },
      combat: numeric(row["战斗力"], { integer: true, min: 0 }),
      affectionLevel: numeric(row["好感度"], { integer: true, min: 0 }),
      equipments: normalizeEquipments(equipments),
      syncMissing: Boolean(row["同步未发现"]),
      manualSupplementFields: String(row["手动补充字段"] || "").split("|").map((value) => value.trim()).filter(Boolean),
      createdAt: numeric(row["创建时间"], { min: 0 }), updatedAt: numeric(row["更新时间"], { min: 0 }),
    };
    if ([draft.level, draft.limitBreak.grade, draft.limitBreak.core, draft.combat, draft.affectionLevel, draft.createdAt, draft.updatedAt].some(Number.isNaN)) invalid = true;
    if (invalid) {
      summary.skipped += 1; summary.errors.push(`角色表第 ${row.__row} 行：包含无效字段`); continue;
    }
    const existingStandard = standard ? records.find((record) => record.nameCode === String(standard.name_code)) : null;
    const result = saveLocalCharacterRecord(records, {
      catalogCharacter: standard,
      draft,
      custom: !standard,
      existingLocalId: existingStandard?.localId || existingCustom?.localId || "",
      source: LOCAL_CHARACTER_SOURCES.excel,
      catalog,
      now,
      preserveStatus: true,
    });
    if (result.errors.length) {
      summary.skipped += 1; summary.errors.push(`角色表第 ${row.__row} 行：${result.errors.join("；")}`); continue;
    }
    records = result.records;
    if (standard) summary.matched += 1;
    if (existingStandard || existingCustom) summary.updated += 1;
    else summary.created += 1;
  }
  return { records, summary };
}
