// SPDX-License-Identifier: GPL-3.0-or-later
// 固定模板 OCR 的词条名称图片样本。浅色版与深色版分开保存，统一映射到内部词条类型。

export const EQUIPMENT_AFFIX_LABEL_CATALOG_VERSION = 1;

const createRecord = (theme, functionType, label, assetFile) => Object.freeze({
  functionType,
  label,
  theme,
  assetPath: `/ocr/affix-labels/${theme}/${assetFile}`,
});

const createLightRecord = (functionType, label, assetFile) => (
  createRecord("light", functionType, label, assetFile)
);

const createDarkRecord = (functionType, label, assetFile) => (
  createRecord("dark", functionType, label, assetFile)
);

export const LIGHT_EQUIPMENT_AFFIX_LABEL_CATALOG = Object.freeze([
  createLightRecord("IncElementDmg", "优越代码伤害增加", "IncElementDmg.png"),
  createLightRecord("StatAtk", "攻击力增加", "StatAtk.png"),
  createLightRecord("StatAmmoLoad", "最大装弹数增加", "StatAmmoLoad.png"),
  createLightRecord("StatCritical", "暴击率增加", "StatCritical.png"),
  createLightRecord("StatCriticalDamage", "暴击伤害增加", "StatCriticalDamage.png"),
  createLightRecord("StatDef", "防御力增加", "StatDef.png"),
  createLightRecord("StatAccuracyCircle", "命中率增加", "StatAccuracyCircle.png"),
  createLightRecord("StatChargeTime", "蓄力速度增加", "StatChargeTime.png"),
  createLightRecord("StatChargeDamage", "蓄力伤害增加", "StatChargeDamage.png"),
]);

export const LIGHT_EQUIPMENT_AFFIX_LABEL_BY_TYPE = Object.freeze(Object.fromEntries(
  LIGHT_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => [record.functionType, record]),
));

export const DARK_EQUIPMENT_AFFIX_LABEL_CATALOG = Object.freeze([
  createDarkRecord("IncElementDmg", "优越代码伤害增加", "IncElementDmg.png"),
  createDarkRecord("StatAtk", "攻击力增加", "StatAtk.png"),
  createDarkRecord("StatAmmoLoad", "最大装弹数增加", "StatAmmoLoad.png"),
  createDarkRecord("StatCritical", "暴击率增加", "StatCritical.png"),
  createDarkRecord("StatCriticalDamage", "暴击伤害增加", "StatCriticalDamage.png"),
  createDarkRecord("StatDef", "防御力增加", "StatDef.png"),
  createDarkRecord("StatAccuracyCircle", "命中率增加", "StatAccuracyCircle.png"),
  createDarkRecord("StatChargeTime", "蓄力速度增加", "StatChargeTime.png"),
  createDarkRecord("StatChargeDamage", "蓄力伤害增加", "StatChargeDamage.png"),
]);

export const DARK_EQUIPMENT_AFFIX_LABEL_BY_TYPE = Object.freeze(Object.fromEntries(
  DARK_EQUIPMENT_AFFIX_LABEL_CATALOG.map((record) => [record.functionType, record]),
));
