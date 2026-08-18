// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEquipmentComparisonRows,
  createRunRecordsWorkbook,
  targetIsSatisfied,
} from "../src/calculator/exportWorkbook.js";

const currentLines = [
  { stat: "优越代码伤害增加", tier: 10, valueText: "22.15%", locked: true },
  { stat: "防御力增加", tier: 7, valueText: "9.00%", locked: false },
];

test("export comparison identifies satisfied and missing targets", () => {
  assert.equal(targetIsSatisfied(currentLines, { stat: "优越代码伤害增加", tier: 9 }), true);
  assert.equal(targetIsSatisfied(currentLines, { stat: "优越代码伤害增加", tier: 11 }), false);
  assert.equal(targetIsSatisfied(currentLines, { stat: "攻击力增加", tier: 1 }), false);

  const rows = buildEquipmentComparisonRows({
    currentLines,
    targets: [
      { stat: "优越代码伤害增加", tier: 9 },
      { stat: "攻击力增加", tier: 10 },
    ],
  });
  assert.deepEqual(rows.map(row => row.state), ["satisfied", "neutral", "needs-wash"]);
});

test("export workbook contains total, character blocks, comparisons and advice", () => {
  const workbook = createRunRecordsWorkbook([{
    characterName: "灰姑娘",
    mode: "global",
    savedAt: 100,
    totalExpectedCost: 42.5,
    equipmentResults: [{
      index: 0,
      label: "头部装备",
      skipped: false,
      currentLines,
      targets: [
        { stat: "优越代码伤害增加", tier: 9 },
        { stat: "攻击力增加", tier: 10 },
      ],
      expectedCost: 12.5,
      recommendation: "全不锁，洗词条名称",
    }],
  }], () => "2026/08/16 12:00");
  const sheet = workbook.getWorksheet("洗词条结果");

  assert.equal(sheet.getCell("A2").value, "全部妮姬预计石头总计");
  assert.equal(sheet.getCell("C2").value.result, 42.5);
  assert.match(sheet.getCell("A4").value, /灰姑娘 · 全局/);
  assert.equal(sheet.getCell("B5").value, "当前词条");
  assert.equal(sheet.getCell("C5").value, "算法分配目标");
  assert.equal(sheet.getCell("D8").value, "需要洗");
  assert.equal(sheet.getCell("D8").fill.fgColor.argb, "FFFFEBEE");
  assert.equal(sheet.getCell("A9").value, "最优建议");
  assert.equal(sheet.getCell("B9").value, "全不锁，洗词条名称");
});
