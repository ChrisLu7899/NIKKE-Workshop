import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  EQUIPMENT_ICON_CATALOG,
  EQUIPMENT_ICON_COMPARISON_MASK,
  equipmentNamesBySlot,
  findEquipmentIconByName,
} from "../src/domain/equipmentIconCatalog.js";

test("装备图标目录固定包含 12 件装备且每个部位各 3 件", () => {
  assert.equal(EQUIPMENT_ICON_CATALOG.length, 12);
  assert.equal(new Set(EQUIPMENT_ICON_CATALOG.map((entry) => entry.id)).size, 12);
  assert.equal(new Set(EQUIPMENT_ICON_CATALOG.map((entry) => entry.name)).size, 12);
  ["头部装备", "身体装备", "手部装备", "足部装备"].forEach((slot) => {
    assert.equal(equipmentNamesBySlot(slot).length, 3);
  });
});

test("装备名称映射到固定部位与本地图标样本", () => {
  assert.equal(findEquipmentIconByName(" 99型头盔 ")?.slot, "头部装备");
  assert.equal(findEquipmentIconByName("Ｖ金属背心")?.slot, "身体装备");
  assert.equal(findEquipmentIconByName("代码XXX手套")?.slot, "手部装备");
  assert.equal(findEquipmentIconByName("代码xxx鞋")?.slot, "足部装备");
  EQUIPMENT_ICON_CATALOG.forEach((entry) => {
    assert.ok(existsSync(resolve("public", entry.assetPath.replace(/^\//, ""))), entry.assetPath);
  });
});

test("图标比较掩码明确排除左侧三个叠加标识", () => {
  assert.equal(EQUIPMENT_ICON_COMPARISON_MASK.ignoredNormalizedRegions.length, 2);
  assert.ok(EQUIPMENT_ICON_COMPARISON_MASK.subjectNormalizedRegion.left >= 0.25);
});
