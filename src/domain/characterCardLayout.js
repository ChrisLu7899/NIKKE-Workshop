// SPDX-License-Identifier: GPL-3.0-or-later

export const CHARACTER_CARD_WIDTH = 736;
export const CHARACTER_CARD_HEIGHT = 1096;
export const CHARACTER_CARD_TOOLBAR_HEIGHT = 58;
export const CHARACTER_CARD_COMPACT_TOOLBAR_HEIGHT = 106;
export const CHARACTER_CARD_COMPACT_TOOLBAR_QUERY = `(max-width:599.95px), (max-height:${Math.ceil(CHARACTER_CARD_TOOLBAR_HEIGHT + 480 * CHARACTER_CARD_HEIGHT / CHARACTER_CARD_WIDTH)}px)`;
export const CHARACTER_CARD_POSITION_STEP = 3;
export const CHARACTER_CARD_SCALE_RANGE = Object.freeze({ min: 70, max: 180 });
export const DEFAULT_ARTWORK_TRANSFORM = Object.freeze({ objectPositionX: 50, objectPositionY: 0, artworkScale: 100 });
export const CHARACTER_CARD_MODULE_OPTIONS = Object.freeze([
  { key: "favoriteItem", label: "收藏品" },
  { key: "rarity", label: "稀有度/突破" },
  { key: "levelName", label: "等级/名称" },
  { key: "affection", label: "好感度" },
  { key: "combat", label: "战斗力" },
  { key: "metadata", label: "属性图标" },
  { key: "skills", label: "技能等级" },
  { key: "cube", label: "魔方" },
  { key: "affixSummary", label: "词条合计" },
  { key: "equipments", label: "四件装备" },
].map(Object.freeze));
export const DEFAULT_CHARACTER_CARD_MODULES = Object.freeze(Object.fromEntries(
  CHARACTER_CARD_MODULE_OPTIONS.map(({ key }) => [key, true]),
));
