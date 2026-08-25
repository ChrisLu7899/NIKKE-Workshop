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
import {
  arrayBufferToDataUrl,
  fetchAsArrayBuffer,
  getNikkeAvatarUrl,
  guessImageExtensionFromUrl,
} from "./nikkeAvatar.js";

export const LOCAL_GALLERY_SHEETS = Object.freeze({
  cards: "角色卡",
  readme: "使用说明",
  characters: "角色",
  equipments: "装备",
  lines: "词条",
});

const CARD_AFFIXES = Object.freeze([
  ["IncElementDmg", "优越代码伤害"],
  ["StatAtk", "攻击力"],
  ["StatAmmoLoad", "最大装弹数"],
  ["StatCritical", "暴击率"],
  ["StatCriticalDamage", "暴击伤害"],
  ["StatChargeTime", "蓄力速度"],
  ["StatChargeDamage", "蓄力伤害"],
  ["StatDef", "防御力"],
  ["StatAccuracyCircle", "命中率"],
]);

const EQUIPMENT_NAMES = Object.freeze(["头部", "身躯", "臂部", "腿部"]);
const EQUIPMENT_CARD_NAMES = EQUIPMENT_NAMES;
const ROLE_CARD_COLUMN_WIDTHS = Object.freeze([
  8.69921875, 8.69921875, 11.5, 11.5, 11.5,
  8.69921875, 8.69921875, 11.5, 11.5, 11.5,
]);
const ROLE_CARD_FIRST_ROW = 3;
const ROLE_CARD_ROW_STRIDE = 18;
const ROLE_CARD_SEPARATOR_HEIGHT = 28;
const EXCEL_EMU_PER_PIXEL = 9525;
const ROLE_CARD_AVATAR_SIZE_PX = 82;
const ROLE_CARD_AVATAR_LEFT_PX = 20;
const ROLE_CARD_AVATAR_TOP_PX = 3;
const ELEMENT_LABELS = Object.freeze({ Electronic: "电击", Fire: "燃烧", Wind: "风压", Water: "水冷", Iron: "铁甲", Utility: "通用" });
const CLASS_LABELS = Object.freeze({ Attacker: "火力型", Defender: "防御型", Supporter: "支援型" });
const BURST_LABELS = Object.freeze({ Step1: "爆裂 I", Step2: "爆裂 II", Step3: "爆裂 III", AllStep: "全爆裂" });
const CORPORATION_LABELS = Object.freeze({
  ELYSION: "极乐净土", Elysion: "极乐净土",
  MISSILIS: "米西利斯", Missilis: "米西利斯",
  TETRA: "泰特拉", Tetra: "泰特拉",
  PILGRIM: "朝圣者", Pilgrim: "朝圣者",
  ABNORMAL: "反常", Abnormal: "反常",
});
const CARD_COLORS = Object.freeze({
  navy: "FF17233C",
  navy2: "FF243352",
  red: "FFB5263E",
  avatar: "FF6F162A",
  canvas: "FFF2F5FA",
  panel: "FFFFFFFF",
  soft: "FFE9EEF6",
  text: "FF202634",
  muted: "FF667085",
  border: "FFD4DBE7",
  blue: "FF00A6E9",
  black: "FF000000",
  white: "FFFFFFFF",
  warning: "FFB76E00",
});

const INVALID_LOCK_STATE = Symbol("invalid-lock-state");

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
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1976D2" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

const solidFill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thinBorder = () => ({ style: "thin", color: { argb: CARD_COLORS.border } });
const allBorders = () => ({ top: thinBorder(), bottom: thinBorder(), left: thinBorder(), right: thinBorder() });
const quoteFormulaText = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const sheetReference = (sheetName, cell) => `'${sheetName}'!${cell}`;

function setFormulaCell(cell, formula, result) {
  cell.value = { formula, result: result ?? "" };
}

function styleCells(sheet, fromRow, fromColumn, toRow, toColumn, style) {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let column = fromColumn; column <= toColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      if (style.fill) cell.fill = style.fill;
      if (style.font) cell.font = style.font;
      if (style.alignment) cell.alignment = style.alignment;
      if (style.border) cell.border = style.border;
      if (style.numFmt) cell.numFmt = style.numFmt;
    }
  }
}

function applyOuterBorder(sheet, fromRow, fromColumn, toRow, toColumn) {
  const edge = { style: "medium", color: { argb: CARD_COLORS.navy } };
  for (let column = fromColumn; column <= toColumn; column += 1) {
    const topCell = sheet.getCell(fromRow, column);
    const bottomCell = sheet.getCell(toRow, column);
    topCell.border = { ...topCell.border, top: edge };
    bottomCell.border = { ...bottomCell.border, bottom: edge };
  }
  for (let row = fromRow; row <= toRow; row += 1) {
    const leftCell = sheet.getCell(row, fromColumn);
    const rightCell = sheet.getCell(row, toColumn);
    leftCell.border = { ...leftCell.border, left: edge };
    rightCell.border = { ...rightCell.border, right: edge };
  }
}

function mergeCardCells(sheet, fromRow, fromColumn, toRow, toColumn) {
  sheet.mergeCells(fromRow, fromColumn, toRow, toColumn);
  return sheet.getCell(fromRow, fromColumn);
}

function mappedLabel(value, labels) {
  const text = String(value ?? "").trim();
  return labels[text] || text || "—";
}

function mappedLabelFormula(reference, labels) {
  const entries = Object.entries(labels);
  return entries.reduceRight(
    (fallback, [value, label]) => `IF(${reference}=${quoteFormulaText(value)},${quoteFormulaText(label)},${fallback})`,
    `IF(${reference}="","—",${reference})`,
  );
}

function lockLabel(value) {
  if (value === true) return "已锁";
  if (value === false) return "未锁";
  return "待确认";
}

function parseLockState(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;
  const normalized = String(value).trim().toLocaleLowerCase("en-US");
  if (["已锁", "锁定", "true", "yes", "y", "1"].includes(normalized)) return true;
  if (["未锁", "未锁定", "false", "no", "n", "0"].includes(normalized)) return false;
  if (["待确认", "未知", "unknown", "null"].includes(normalized)) return null;
  return INVALID_LOCK_STATE;
}

function setCardFormula(sheet, row, column, formula, result, style = {}) {
  const cell = sheet.getCell(row, column);
  setFormulaCell(cell, formula, result);
  if (style.numFmt) cell.numFmt = style.numFmt;
  return cell;
}

function createRoleCardSheet(workbook) {
  const sheet = workbook.addWorksheet(LOCAL_GALLERY_SHEETS.cards, {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    },
  });
  ROLE_CARD_COLUMN_WIDTHS.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.mergeCells("A1:J1");
  sheet.getCell("A1").value = "NIKKE WORKSHOP  ·  本地图鉴角色卡";
  sheet.getCell("A1").fill = solidFill(CARD_COLORS.navy);
  sheet.getCell("A1").font = { name: "Microsoft YaHei", size: 18, bold: true, color: { argb: CARD_COLORS.white } };
  sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 30;
  sheet.mergeCells("A2:J2");
  sheet.getCell("A2").value = "展示页会随数据页更新 · 需要修改或重新导入时，请编辑后方的“角色／装备／词条”工作表";
  sheet.getCell("A2").fill = solidFill(CARD_COLORS.navy2);
  sheet.getCell("A2").font = { name: "Microsoft YaHei", size: 10, color: { argb: "FFDCE5F4" } };
  sheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(2).height = 21;
  return sheet;
}

function cardSummaryValue(record, functionType) {
  let count = 0;
  let total = 0;
  record.equipments.forEach((equipment) => equipment.forEach((line) => {
    if (line.functionType !== functionType || !Number.isFinite(Number(line.value))) return;
    count += 1;
    total += Number(line.value);
  }));
  return count ? total : "—";
}

function renderRoleCard({ sheet, record, cardIndex, characterRow, lineRows, lineLastRow }) {
  const startRow = ROLE_CARD_FIRST_ROW + cardIndex * ROLE_CARD_ROW_STRIDE;
  const endRow = startRow + 16;
  for (let row = startRow; row <= endRow + 1; row += 1) {
    const isSeparator = row === endRow + 1;
    sheet.getRow(row).height = isSeparator ? ROLE_CARD_SEPARATOR_HEIGHT : 22;
    styleCells(sheet, row, 1, row, 10, {
      fill: solidFill(isSeparator ? CARD_COLORS.white : CARD_COLORS.canvas),
      font: { name: "Microsoft YaHei", size: 10, color: { argb: CARD_COLORS.text } },
    });
  }

  const name = record.base.name || "未命名角色";
  const avatar = mergeCardCells(sheet, startRow, 1, startRow + 2, 2);
  const avatarUrl = getNikkeAvatarUrl(record.base);
  const avatarFallback = `${name}\n角色头像`;
  if (avatarUrl) {
    setFormulaCell(
      avatar,
      `IFERROR(_xlfn.IMAGE(${quoteFormulaText(avatarUrl)}),${quoteFormulaText(avatarFallback)})`,
      avatarFallback,
    );
  } else avatar.value = avatarFallback;
  styleCells(sheet, startRow, 1, startRow + 2, 2, {
    fill: solidFill(CARD_COLORS.white),
    font: { name: "Microsoft YaHei", size: 11, color: { argb: CARD_COLORS.muted } },
    alignment: { vertical: "middle", horizontal: "center", wrapText: true },
    border: allBorders(),
  });

  const nameCell = mergeCardCells(sheet, startRow, 3, startRow, 4);
  setFormulaCell(nameCell, sheetReference(LOCAL_GALLERY_SHEETS.characters, `B${characterRow}`), name);
  const levelCell = mergeCardCells(sheet, startRow, 5, startRow, 6);
  setFormulaCell(
    levelCell,
    `"Lv. "&${sheetReference(LOCAL_GALLERY_SHEETS.characters, `L${characterRow}`)}&"  ·  +"&${sheetReference(LOCAL_GALLERY_SHEETS.characters, `M${characterRow}`)}`,
    `Lv. ${record.level ?? "—"}  ·  +${record.limitBreak.grade ?? 0}`,
  );
  styleCells(sheet, startRow, 3, startRow, 6, {
    fill: solidFill(CARD_COLORS.panel),
    font: { name: "Microsoft YaHei", size: 12, bold: true, color: { argb: CARD_COLORS.text } },
    alignment: { vertical: "middle", horizontal: "left" },
  });
  nameCell.font = { name: "Microsoft YaHei", size: 20, bold: true, color: { argb: CARD_COLORS.text } };

  const burstRef = sheetReference(LOCAL_GALLERY_SHEETS.characters, `H${characterRow}`);
  const burstCell = sheet.getCell(startRow + 1, 3);
  setFormulaCell(burstCell, mappedLabelFormula(burstRef, BURST_LABELS), mappedLabel(record.base.burstStage, BURST_LABELS));
  const combatCell = mergeCardCells(sheet, startRow + 1, 4, startRow + 1, 6);
  setFormulaCell(
    combatCell,
    `"战斗力    "&TEXT(${sheetReference(LOCAL_GALLERY_SHEETS.characters, `O${characterRow}`)},"#,##0")`,
    `战斗力    ${Number(record.combat || 0).toLocaleString("en-US")}`,
  );
  styleCells(sheet, startRow + 1, 3, startRow + 1, 6, {
    fill: solidFill(CARD_COLORS.panel),
    font: { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: CARD_COLORS.text } },
    alignment: { vertical: "middle", horizontal: "left" },
  });

  const tagDefinitions = [
    [3, 3, ELEMENT_LABELS, record.base.element, CARD_COLORS.red, CARD_COLORS.white],
    [4, 4, null, record.base.weaponType, CARD_COLORS.soft, CARD_COLORS.text],
    [5, 5, CLASS_LABELS, record.base.class, CARD_COLORS.soft, CARD_COLORS.text],
    [6, 7, CORPORATION_LABELS, record.base.corporation, CARD_COLORS.soft, CARD_COLORS.text],
  ];
  tagDefinitions.forEach(([fromColumn, toColumn, labels, value, fill, color]) => {
    const cell = fromColumn === toColumn
      ? sheet.getCell(startRow + 2, fromColumn)
      : mergeCardCells(sheet, startRow + 2, fromColumn, startRow + 2, toColumn);
    const rawColumn = fromColumn === 3 ? "F" : fromColumn === 4 ? "J" : fromColumn === 5 ? "G" : "I";
    const reference = sheetReference(LOCAL_GALLERY_SHEETS.characters, `${rawColumn}${characterRow}`);
    setFormulaCell(cell, labels ? mappedLabelFormula(reference, labels) : reference, labels ? mappedLabel(value, labels) : String(value || "—"));
    styleCells(sheet, startRow + 2, fromColumn, startRow + 2, toColumn, {
      fill: solidFill(fill),
      font: { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: color } },
      alignment: { vertical: "middle", horizontal: "left" },
      border: allBorders(),
    });
  });
  const affection = mergeCardCells(sheet, startRow + 2, 8, startRow + 2, 10);
  setFormulaCell(
    affection,
    `"好感度  "&${sheetReference(LOCAL_GALLERY_SHEETS.characters, `P${characterRow}`)}`,
    `好感度  ${record.affectionLevel ?? 0}`,
  );
  styleCells(sheet, startRow + 2, 8, startRow + 2, 10, {
    fill: solidFill(CARD_COLORS.soft),
    font: { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: CARD_COLORS.text } },
    alignment: { vertical: "middle", horizontal: "left" },
    border: allBorders(),
  });

  const overviewRow = startRow + 4;
  sheet.mergeCells(overviewRow, 1, overviewRow, 10);
  sheet.getCell(overviewRow, 1).value = "装备效果一览";
  styleCells(sheet, overviewRow, 1, overviewRow, 10, {
    fill: solidFill(CARD_COLORS.panel),
    font: { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: CARD_COLORS.text } },
    alignment: { vertical: "middle", horizontal: "left" },
    border: allBorders(),
  });
  const summaryColumns = [[1, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10]];
  CARD_AFFIXES.forEach(([functionType, label], index) => {
    const [fromColumn, toColumn] = summaryColumns[index];
    const labelCell = fromColumn === toColumn
      ? sheet.getCell(overviewRow + 1, fromColumn)
      : mergeCardCells(sheet, overviewRow + 1, fromColumn, overviewRow + 1, toColumn);
    labelCell.value = label;
    const valueCell = fromColumn === toColumn
      ? sheet.getCell(overviewRow + 2, fromColumn)
      : mergeCardCells(sheet, overviewRow + 2, fromColumn, overviewRow + 2, toColumn);
    const localId = quoteFormulaText(record.localId);
    const type = quoteFormulaText(functionType);
    const countFormula = `COUNTIFS(${sheetReference(LOCAL_GALLERY_SHEETS.lines, `$A$2:$A$${lineLastRow}`)},${localId},${sheetReference(LOCAL_GALLERY_SHEETS.lines, `$E$2:$E$${lineLastRow}`)},${type})`;
    const sumFormula = `SUMIFS(${sheetReference(LOCAL_GALLERY_SHEETS.lines, `$G$2:$G$${lineLastRow}`)},${sheetReference(LOCAL_GALLERY_SHEETS.lines, `$A$2:$A$${lineLastRow}`)},${localId},${sheetReference(LOCAL_GALLERY_SHEETS.lines, `$E$2:$E$${lineLastRow}`)},${type})`;
    setFormulaCell(valueCell, `IF(${countFormula}=0,"—",${sumFormula})`, cardSummaryValue(record, functionType));
    valueCell.numFmt = '0.00"%"';
    styleCells(sheet, overviewRow + 1, fromColumn, overviewRow + 2, toColumn, {
      fill: solidFill(CARD_COLORS.panel),
      font: { name: "Microsoft YaHei", size: 10, color: { argb: CARD_COLORS.text }, bold: false },
      alignment: { vertical: "middle", horizontal: "center" },
      border: allBorders(),
    });
    valueCell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: CARD_COLORS.text } };
  });

  const equipmentBlocks = [
    [0, startRow + 8, 1], [1, startRow + 8, 6],
    [2, startRow + 13, 1], [3, startRow + 13, 6],
  ];
  equipmentBlocks.forEach(([slotIndex, headerRow, startColumn]) => {
    sheet.mergeCells(headerRow, startColumn, headerRow, startColumn + 4);
    const header = sheet.getCell(headerRow, startColumn);
    header.value = EQUIPMENT_CARD_NAMES[slotIndex];
    styleCells(sheet, headerRow, startColumn, headerRow, startColumn + 4, {
      fill: solidFill(CARD_COLORS.panel),
      font: { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: CARD_COLORS.text } },
      alignment: { vertical: "middle", horizontal: "left" },
      border: allBorders(),
    });
    lineRows[slotIndex].forEach((lineRow, lineIndex) => {
      const row = headerRow + lineIndex + 1;
      const line = record.equipments[slotIndex][lineIndex];
      const nameCell = mergeCardCells(sheet, row, startColumn, row, startColumn + 1);
      setCardFormula(
        sheet,
        row,
        startColumn,
        sheetReference(LOCAL_GALLERY_SHEETS.lines, `F${lineRow}`),
        EQUIPMENT_FUNCTION_LABELS[line.functionType] || "",
      );
      const valueCell = setCardFormula(
        sheet,
        row,
        startColumn + 2,
        sheetReference(LOCAL_GALLERY_SHEETS.lines, `G${lineRow}`),
        Number.isFinite(Number(line.value)) ? Number(line.value) : "",
        { numFmt: '0.00"%"' },
      );
      const tierCell = setCardFormula(
        sheet,
        row,
        startColumn + 3,
        `IF(${sheetReference(LOCAL_GALLERY_SHEETS.lines, `H${lineRow}`)}="","",${sheetReference(LOCAL_GALLERY_SHEETS.lines, `H${lineRow}`)}&"档")`,
        line.level ? `${line.level}档` : "",
      );
      const lockedCell = setCardFormula(
        sheet,
        row,
        startColumn + 4,
        sheetReference(LOCAL_GALLERY_SHEETS.lines, `I${lineRow}`),
        line.functionType ? lockLabel(line.locked) : "",
      );
      const isTopTier = Number(line.level) === 15;
      const isBlueTier = Number(line.level) >= 12;
      const rowFill = solidFill(isTopTier ? CARD_COLORS.black : CARD_COLORS.panel);
      const rowColor = isBlueTier ? CARD_COLORS.blue : CARD_COLORS.text;
      styleCells(sheet, row, startColumn, row, startColumn + 4, {
        fill: rowFill,
        font: { name: "Microsoft YaHei", size: 10, color: { argb: rowColor }, bold: isBlueTier },
        alignment: { vertical: "middle", horizontal: "left" },
        border: allBorders(),
      });
      nameCell.alignment = { vertical: "middle", horizontal: "left" };
      valueCell.alignment = { vertical: "middle", horizontal: "right" };
      tierCell.alignment = { vertical: "middle", horizontal: "right" };
      lockedCell.alignment = { vertical: "middle", horizontal: "center" };
      if (line.locked === true) lockedCell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: CARD_COLORS.blue } };
      else if (line.locked === null && line.functionType) lockedCell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: CARD_COLORS.warning } };
    });
  });

  sheet.getRow(overviewRow).height = 22;
  sheet.getRow(overviewRow + 1).height = 21;
  sheet.getRow(overviewRow + 2).height = 22;
  applyOuterBorder(sheet, startRow, 1, endRow, 10);
  return endRow;
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
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  const cards = createRoleCardSheet(workbook);
  const readme = workbook.addWorksheet(LOCAL_GALLERY_SHEETS.readme);
  [
    ["NIKKE Workshop 本地图鉴"],
    ["“角色卡”用于阅读、展示和打印；角色、装备、词条工作表用于备份、编辑和重新导入。"],
    ["文件仅在扩展本地生成和解析，不会上传服务器。请勿修改工作表名称或表头。"],
    ["百分比数值请填写真实数字，例如 22.15；不要填写 22.15%。"],
    ["锁定状态可填写“已锁”“未锁”或“待确认”；旧文件没有该列时按待确认处理。"],
    ["角色卡头像会在导出时下载并嵌入工作簿；隐私模式下不请求头像，图片下载失败时保留文字占位。"],
    ["角色名称采用精确匹配：忽略首尾空格、全半角空格及英文大小写，不做模糊匹配。"],
  ].forEach((values) => readme.addRow(values));
  readme.getColumn(1).width = 95;
  readme.getRow(1).font = { bold: true, size: 16 };
  readme.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];

  const characters = workbook.addWorksheet(LOCAL_GALLERY_SHEETS.characters);
  characters.addRow(CHARACTER_COLUMNS.map(([label]) => label));
  styleHeader(characters.getRow(1));
  characters.columns.forEach((column) => { column.width = 16; });
  characters.views = [{ state: "frozen", xSplit: 2, ySplit: 1, showGridLines: false }];
  characters.autoFilter = "A1:X1";

  const equipments = workbook.addWorksheet(LOCAL_GALLERY_SHEETS.equipments);
  equipments.addRow(["本地ID", "角色名称", "装备序号", "装备名称"]);
  styleHeader(equipments.getRow(1));
  equipments.columns.forEach((column) => { column.width = 22; });
  equipments.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  equipments.autoFilter = "A1:D1";

  const lines = workbook.addWorksheet(LOCAL_GALLERY_SHEETS.lines);
  lines.addRow(["本地ID", "角色名称", "装备序号", "词条位置", "词条类型代码", "词条名称", "数值", "档位", "锁定状态"]);
  styleHeader(lines.getRow(1));
  lines.columns.forEach((column) => { column.width = 20; });
  lines.getColumn(7).numFmt = '0.00"%"';
  lines.getColumn(8).numFmt = "0";
  lines.views = [{ state: "frozen", xSplit: 2, ySplit: 1, showGridLines: false }];
  lines.autoFilter = "A1:I1";

  const normalizedRecords = getRecordedLocalCharacters(records).map((record) => normalizeLocalCharacterRecord(record));
  const characterRows = new Map();
  const lineRowsByRecord = new Map();
  normalizedRecords.forEach((record) => {
    const characterRow = characters.addRow([
      record.localId, record.base.name, record.nameCode, record.source, record.custom,
      record.base.element, record.base.class, record.base.burstStage, record.base.corporation,
      record.base.weaponType, record.base.rarity, record.level, record.limitBreak.grade,
      record.limitBreak.core, record.combat, record.affectionLevel,
      record.base.nameCn, record.base.nameEn, record.base.catalogId, record.base.resourceId,
      record.syncMissing, record.manualSupplementFields.join("|"), record.createdAt, record.updatedAt,
    ]);
    characterRows.set(record.localId, characterRow.number);
    const lineRows = Array.from({ length: 4 }, () => Array(3).fill(null));
    record.equipments.forEach((equipment, slotIndex) => {
      equipments.addRow([record.localId, record.base.name, slotIndex + 1, EQUIPMENT_NAMES[slotIndex]]);
      equipment.forEach((line, lineIndex) => {
        const row = lines.addRow([
          record.localId, record.base.name, slotIndex + 1, line.position,
          line.functionType || null, EQUIPMENT_FUNCTION_LABELS[line.functionType] || null,
          line.value, line.level, line.functionType ? lockLabel(line.locked) : null,
        ]);
        lineRows[slotIndex][lineIndex] = row.number;
        const isTopTier = Number(line.level) === 15;
        const isBlueTier = Number(line.level) >= 12;
        if (isTopTier) {
          for (let column = 1; column <= 9; column += 1) {
            row.getCell(column).fill = solidFill(CARD_COLORS.black);
            row.getCell(column).font = { color: { argb: CARD_COLORS.blue }, bold: true };
          }
        } else if (isBlueTier) {
          for (let column = 1; column <= 9; column += 1) row.getCell(column).font = { color: { argb: CARD_COLORS.blue }, bold: true };
        }
        if (line.locked === true) row.getCell(9).font = { color: { argb: CARD_COLORS.blue }, bold: true };
        else if (line.locked === null && line.functionType) row.getCell(9).font = { color: { argb: CARD_COLORS.warning }, bold: true };
      });
    });
    lineRowsByRecord.set(record.localId, lineRows);
  });

  if (!normalizedRecords.length) {
    cards.mergeCells("A4:J6");
    cards.getCell("A4").value = "暂无已录入角色。角色、装备和词条数据页仍可作为空白导入模板使用。";
    cards.getCell("A4").alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cards.getCell("A4").font = { name: "Microsoft YaHei", size: 12, color: { argb: CARD_COLORS.muted } };
    cards.getCell("A4").fill = solidFill(CARD_COLORS.soft);
    cards.getCell("A4").border = allBorders();
  } else {
    const lineLastRow = Math.max(2, lines.rowCount);
    let finalRow = 2;
    normalizedRecords.forEach((record, cardIndex) => {
      finalRow = renderRoleCard({
        sheet: cards,
        record,
        cardIndex,
        characterRow: characterRows.get(record.localId),
        lineRows: lineRowsByRecord.get(record.localId),
        lineLastRow,
      });
    });
    cards.pageSetup.printArea = `A1:J${finalRow}`;
  }
  return workbook;
}

async function embedRoleCardAvatars(workbook, records, fetchImage) {
  const sheet = workbook.getWorksheet(LOCAL_GALLERY_SHEETS.cards);
  if (!sheet) return;
  const imageIds = new Map();
  const normalizedRecords = getRecordedLocalCharacters(records).map((record) => normalizeLocalCharacterRecord(record));
  await Promise.all(normalizedRecords.map(async (record, cardIndex) => {
    const avatarUrl = getNikkeAvatarUrl(record.base);
    if (!avatarUrl) return;
    try {
      let imageIdPromise = imageIds.get(avatarUrl);
      if (!imageIdPromise) {
        imageIdPromise = Promise.resolve(fetchImage(avatarUrl)).then((buffer) => {
          const extension = guessImageExtensionFromUrl(avatarUrl);
          return workbook.addImage({ base64: arrayBufferToDataUrl(buffer, extension), extension });
        });
        imageIds.set(avatarUrl, imageIdPromise);
      }
      const imageId = await imageIdPromise;
      const startRow = ROLE_CARD_FIRST_ROW + cardIndex * ROLE_CARD_ROW_STRIDE;
      sheet.addImage(imageId, {
        tl: {
          nativeCol: 0,
          nativeColOff: ROLE_CARD_AVATAR_LEFT_PX * EXCEL_EMU_PER_PIXEL,
          nativeRow: startRow - 1,
          nativeRowOff: ROLE_CARD_AVATAR_TOP_PX * EXCEL_EMU_PER_PIXEL,
        },
        ext: { width: ROLE_CARD_AVATAR_SIZE_PX, height: ROLE_CARD_AVATAR_SIZE_PX },
        editAs: "oneCell",
      });
      sheet.getCell(startRow, 1).value = null;
    } catch {
      // 图片请求或解码失败时保留下层 IMAGE 公式及文字占位，不中断整份图鉴导出。
    }
  }));
}

export async function exportLocalGalleryBuffer(records = [], { fetchImage = fetchAsArrayBuffer } = {}) {
  const workbook = createLocalGalleryWorkbook(records);
  await embedRoleCardAvatars(workbook, records, fetchImage);
  return workbook.xlsx.writeBuffer();
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
      const locked = parseLockState(lineRow["锁定状态"]);
      if (Number.isNaN(slot) || Number.isNaN(position) || (type && !EQUIPMENT_FUNCTION_TYPES.includes(type))
        || Number.isNaN(value) || Number.isNaN(level) || locked === INVALID_LOCK_STATE) invalid = true;
      else if (slot && position) equipments[slot - 1].push({ position, functionType: type, value, level, locked });
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
