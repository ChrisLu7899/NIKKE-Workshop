// SPDX-License-Identifier: GPL-3.0-or-later

import ExcelJS from "exceljs";

const COLORS = {
  primary: "FF1976D2",
  primaryDark: "FF0D47A1",
  primarySoft: "FFE3F2FD",
  section: "FFE8EEF6",
  header: "FFF3F6F9",
  line: "FFD6DEE6",
  ink: "FF1F2933",
  successFill: "FFE8F5E9",
  successText: "FF2E7D32",
  washFill: "FFFFEBEE",
  washText: "FFC62828",
  skippedFill: "FFF1F3F5",
  skippedText: "FF6B7280",
  white: "FFFFFFFF",
};

function normalizedLines(lines) {
  return (lines || []).filter(line => line?.stat && line.stat !== "空词条");
}

function lineText(line) {
  if (!line?.stat) return "—";
  const tier = Number(line.tier || 0);
  const valueText = line.valueText ? ` ${line.valueText}` : "";
  const lockText = line.locked ? "（已锁）" : "";
  return `${line.stat}${tier > 0 ? ` [${tier}档]` : ""}${valueText}${lockText}`;
}

export function targetIsSatisfied(currentLines, target) {
  const current = normalizedLines(currentLines).find(line => line.stat === target?.stat);
  if (!current) return false;
  const targetTier = Number(target?.tier || 0);
  return targetTier <= 0 || Number(current.tier || 0) >= targetTier;
}

export function buildEquipmentComparisonRows(equipment) {
  const currentLines = normalizedLines(equipment?.currentLines);
  const targets = normalizedLines(equipment?.targets);
  if (equipment?.skipped) {
    return (currentLines.length ? currentLines : [null]).map((current, index) => ({
      current,
      target: null,
      status: index === 0 ? "不跑" : "",
      state: "skipped",
    }));
  }

  const remainingTargets = [...targets];
  const rows = currentLines.map(current => {
    const targetIndex = remainingTargets.findIndex(target => target.stat === current.stat);
    const target = targetIndex >= 0 ? remainingTargets.splice(targetIndex, 1)[0] : null;
    if (!target) return { current, target: null, status: "", state: "neutral" };
    const satisfied = targetIsSatisfied([current], target);
    return {
      current,
      target,
      status: satisfied ? "已满足" : "需要洗",
      state: satisfied ? "satisfied" : "needs-wash",
    };
  });

  remainingTargets.forEach(target => {
    rows.push({ current: null, target, status: "需要洗", state: "needs-wash" });
  });
  return rows.length ? rows : [{ current: null, target: null, status: "无目标", state: "neutral" }];
}

function setFillAndFont(cell, fillColor, fontColor, bold = false) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
  cell.font = { name: "Microsoft YaHei", size: 10, color: { argb: fontColor }, bold };
}

function applyThinBottomBorder(row) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = { bottom: { style: "thin", color: { argb: COLORS.line } } };
  });
}

export function createRunRecordsWorkbook(records, formatSavedAt = value => String(value || "")) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NIKKE Workshop";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("洗词条结果", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    },
  });
  sheet.columns = [
    { key: "equipment", width: 15 },
    { key: "current", width: 38 },
    { key: "target", width: 38 },
    { key: "status", width: 13 },
    { key: "cost", width: 16 },
  ];

  sheet.mergeCells("A1:E1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "NIKKE 洗词条计算结果";
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  setFillAndFont(titleCell, COLORS.primary, COLORS.white, true);
  titleCell.font = { ...titleCell.font, size: 16 };
  sheet.getRow(1).height = 30;

  sheet.mergeCells("A2:B2");
  sheet.getCell("A2").value = "全部妮姬预计石头总计";
  sheet.mergeCells("C2:E2");
  const totalCell = sheet.getCell("C2");
  const subtotalCells = [];
  const totalExpectedCost = records.reduce((sum, record) => sum + Number(record.totalExpectedCost || 0), 0);
  setFillAndFont(sheet.getCell("A2"), COLORS.primarySoft, COLORS.primaryDark, true);
  setFillAndFont(totalCell, COLORS.primarySoft, COLORS.primaryDark, true);
  totalCell.font = { ...totalCell.font, size: 14 };
  totalCell.alignment = { vertical: "middle", horizontal: "right" };
  totalCell.numFmt = '#,##0.0 "颗石头"';
  sheet.getRow(2).height = 27;

  let rowNumber = 4;
  records.forEach(record => {
    const characterHeaderRow = rowNumber;
    sheet.mergeCells(characterHeaderRow, 1, characterHeaderRow, 3);
    sheet.getCell(characterHeaderRow, 1).value = `${record.characterName || "未知妮姬"} · ${record.mode === "global" ? "全局" : "独立"} · ${formatSavedAt(record.savedAt)}`;
    sheet.getCell(characterHeaderRow, 4).value = "妮姬小计";
    sheet.getCell(characterHeaderRow, 5).value = Number(record.totalExpectedCost || 0);
    sheet.getCell(characterHeaderRow, 5).numFmt = '#,##0.0 "颗"';
    subtotalCells.push(`E${characterHeaderRow}`);
    sheet.getRow(characterHeaderRow).height = 25;
    sheet.getRow(characterHeaderRow).eachCell({ includeEmpty: true }, cell => {
      setFillAndFont(cell, COLORS.section, COLORS.primaryDark, true);
      cell.alignment = { vertical: "middle", horizontal: cell.column === 5 ? "right" : "left" };
    });
    rowNumber += 1;

    const headerRow = sheet.getRow(rowNumber);
    headerRow.values = ["装备", "当前词条", "算法分配目标", "状态", "预计石头"];
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      setFillAndFont(cell, COLORS.header, COLORS.ink, true);
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = { bottom: { style: "medium", color: { argb: COLORS.line } } };
    });
    rowNumber += 1;

    (record.equipmentResults || []).forEach(equipment => {
      const comparisonRows = buildEquipmentComparisonRows(equipment);
      const equipmentStartRow = rowNumber;
      comparisonRows.forEach(comparison => {
        const row = sheet.getRow(rowNumber);
        row.getCell(2).value = lineText(comparison.current);
        row.getCell(3).value = lineText(comparison.target);
        row.getCell(4).value = comparison.status;
        row.height = 23;
        row.eachCell({ includeEmpty: true }, cell => {
          cell.font = { name: "Microsoft YaHei", size: 10, color: { argb: COLORS.ink } };
          cell.alignment = { vertical: "middle", horizontal: cell.column >= 4 ? "center" : "left", wrapText: true };
        });
        if (comparison.state === "needs-wash") {
          setFillAndFont(row.getCell(3), COLORS.washFill, COLORS.washText, true);
          setFillAndFont(row.getCell(4), COLORS.washFill, COLORS.washText, true);
        } else if (comparison.state === "satisfied") {
          setFillAndFont(row.getCell(3), COLORS.successFill, COLORS.successText, true);
          setFillAndFont(row.getCell(4), COLORS.successFill, COLORS.successText, true);
        } else if (comparison.state === "skipped") {
          setFillAndFont(row.getCell(2), COLORS.skippedFill, COLORS.skippedText);
          setFillAndFont(row.getCell(3), COLORS.skippedFill, COLORS.skippedText);
          setFillAndFont(row.getCell(4), COLORS.skippedFill, COLORS.skippedText, true);
        }
        applyThinBottomBorder(row);
        rowNumber += 1;
      });

      const equipmentEndRow = rowNumber - 1;
      if (equipmentEndRow > equipmentStartRow) {
        sheet.mergeCells(equipmentStartRow, 1, equipmentEndRow, 1);
        sheet.mergeCells(equipmentStartRow, 5, equipmentEndRow, 5);
      }
      const equipmentCell = sheet.getCell(equipmentStartRow, 1);
      equipmentCell.value = equipment.label || `装备 ${Number(equipment.index || 0) + 1}`;
      equipmentCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      equipmentCell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: COLORS.ink } };
      const costCell = sheet.getCell(equipmentStartRow, 5);
      costCell.value = Number(equipment.expectedCost || 0);
      costCell.numFmt = '#,##0.0 "颗"';
      costCell.alignment = { vertical: "middle", horizontal: "right" };
      costCell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: COLORS.primaryDark } };

      const adviceRow = sheet.getRow(rowNumber);
      adviceRow.getCell(1).value = "最优建议";
      sheet.mergeCells(rowNumber, 2, rowNumber, 5);
      adviceRow.getCell(2).value = equipment.recommendation || "—";
      adviceRow.height = 30;
      setFillAndFont(adviceRow.getCell(1), COLORS.primarySoft, COLORS.primaryDark, true);
      setFillAndFont(adviceRow.getCell(2), COLORS.primarySoft, COLORS.ink);
      adviceRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
      adviceRow.getCell(2).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      applyThinBottomBorder(adviceRow);
      rowNumber += 1;
    });

    rowNumber += 1;
  });

  totalCell.value = subtotalCells.length
    ? { formula: `SUM(${subtotalCells.join(",")})`, result: totalExpectedCost }
    : 0;
  sheet.properties.defaultRowHeight = 20;
  return workbook;
}
