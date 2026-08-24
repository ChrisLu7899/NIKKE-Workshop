import assert from "node:assert/strict";
import test from "node:test";

import {
  DARK_EQUIPMENT_AFFIX_LABEL_BY_TYPE,
  DARK_EQUIPMENT_AFFIX_LABEL_CATALOG,
  LIGHT_EQUIPMENT_AFFIX_LABEL_BY_TYPE,
  LIGHT_EQUIPMENT_AFFIX_LABEL_CATALOG,
} from "../src/domain/equipmentAffixLabelCatalog.js";

test("浅色词条图片样本完整覆盖全部九种改造词条", () => {
  assert.equal(LIGHT_EQUIPMENT_AFFIX_LABEL_CATALOG.length, 9);
  assert.equal(new Set(LIGHT_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => record.functionType)).size, 9);
  assert.equal(new Set(LIGHT_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => record.label)).size, 9);
  assert.equal(new Set(LIGHT_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => record.assetPath)).size, 9);
});

test("浅色词条样本使用标准内部类型和本地资源路径", () => {
  assert.equal(LIGHT_EQUIPMENT_AFFIX_LABEL_BY_TYPE.IncElementDmg.label, "优越代码伤害增加");
  assert.equal(LIGHT_EQUIPMENT_AFFIX_LABEL_BY_TYPE.StatChargeDamage.label, "蓄力伤害增加");
  LIGHT_EQUIPMENT_AFFIX_LABEL_CATALOG.forEach((record) => {
    assert.equal(record.theme, "light");
    assert.match(record.assetPath, /^\/ocr\/affix-labels\/light\/.+\.png$/);
  });
});

test("深色词条图片样本完整覆盖全部九种改造词条", () => {
  assert.equal(DARK_EQUIPMENT_AFFIX_LABEL_CATALOG.length, 9);
  assert.equal(new Set(DARK_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => record.functionType)).size, 9);
  assert.equal(new Set(DARK_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => record.label)).size, 9);
  assert.equal(new Set(DARK_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => record.assetPath)).size, 9);
});

test("深色词条样本与浅色词条使用相同内部类型", () => {
  assert.deepEqual(
    DARK_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => record.functionType),
    LIGHT_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => record.functionType),
  );
  assert.equal(DARK_EQUIPMENT_AFFIX_LABEL_BY_TYPE.IncElementDmg.label, "优越代码伤害增加");
  assert.equal(DARK_EQUIPMENT_AFFIX_LABEL_BY_TYPE.StatChargeDamage.label, "蓄力伤害增加");
  DARK_EQUIPMENT_AFFIX_LABEL_CATALOG.forEach((record) => {
    assert.equal(record.theme, "dark");
    assert.match(record.assetPath, /^\/ocr\/affix-labels\/dark\/.+\.png$/);
  });
});
