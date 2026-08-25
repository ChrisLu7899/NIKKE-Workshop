// SPDX-License-Identifier: GPL-3.0-or-later
// 固定装备图标目录：12 个可出现改造词条的装备，以及名称、部位和本地图标样本。

export const EQUIPMENT_ICON_CATALOG_VERSION = 1;

export const EQUIPMENT_ICON_COMPARISON_MASK = Object.freeze({
  // 样本左侧依次叠加企业、类型和等级标识；图标匹配时不纳入相似度计算。
  ignoredNormalizedRegions: Object.freeze([
    Object.freeze({ left: 0, top: 0, width: 0.32, height: 0.48, reason: "企业与类型标识" }),
    Object.freeze({ left: 0, top: 0.42, width: 0.3, height: 0.58, reason: "等级标识" }),
  ]),
  subjectNormalizedRegion: Object.freeze({ left: 0.26, top: 0.04, width: 0.7, height: 0.9 }),
});

const createRecord = (id, family, name, slot, assetFile) => Object.freeze({
  id,
  family,
  name,
  slot,
  assetPath: `/ocr/equipment-icons/${assetFile}`,
  comparisonMask: EQUIPMENT_ICON_COMPARISON_MASK,
});

export const EQUIPMENT_ICON_CATALOG = Object.freeze([
  createRecord("99-head", "99型", "99型头盔", "头部", "99-head.png"),
  createRecord("99-body", "99型", "99型防护服", "身躯", "99-body.png"),
  createRecord("99-arms", "99型", "99型臂铠", "臂部", "99-arms.png"),
  createRecord("99-legs", "99型", "99型护腿", "腿部", "99-legs.png"),
  createRecord("vmetal-head", "V金属", "v金属面罩", "头部", "vmetal-head.png"),
  createRecord("vmetal-body", "V金属", "v金属背心", "身躯", "vmetal-body.png"),
  createRecord("vmetal-arms", "V金属", "v金属护臂", "臂部", "vmetal-arms.png"),
  createRecord("vmetal-legs", "V金属", "v金属靴子", "腿部", "vmetal-legs.png"),
  createRecord("code-head", "代码XXX", "代码XXX护目镜", "头部", "code-head.png"),
  createRecord("code-body", "代码XXX", "代码XXX夹克", "身躯", "code-body.png"),
  createRecord("code-arms", "代码XXX", "代码XXX手套", "臂部", "code-arms.png"),
  createRecord("code-legs", "代码XXX", "代码XXX鞋", "腿部", "code-legs.png"),
]);

export const EQUIPMENT_ICON_BY_ID = Object.freeze(Object.fromEntries(
  EQUIPMENT_ICON_CATALOG.map((record) => [record.id, record]),
));

export const EQUIPMENT_ICON_BY_NAME = Object.freeze(Object.fromEntries(
  EQUIPMENT_ICON_CATALOG.map((record) => [record.name.normalize("NFKC").toLowerCase(), record]),
));

export function findEquipmentIconByName(rawName) {
  const key = String(rawName ?? "").normalize("NFKC").trim().toLowerCase();
  return EQUIPMENT_ICON_BY_NAME[key] || null;
}

export function equipmentNamesBySlot(slot) {
  return EQUIPMENT_ICON_CATALOG
    .filter((record) => record.slot === slot)
    .map((record) => record.name);
}
