// SPDX-License-Identifier: GPL-3.0-or-later
// 收藏品等级来自账号接口，星级来自游戏截图；在此统一两种语义。

export const FAVORITE_ITEM_STAR_LEVELS = Object.freeze([0, 1, 2, 3]);
export const FAVORITE_ITEM_SSR_STAR_LEVELS = Object.freeze([1, 2, 3]);

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const isFavoriteItemSsr = (rarity) => (
  String(rarity || "").trim().toUpperCase() === "SSR"
);

export function favoriteItemStarCount(rarity, level) {
  const normalizedLevel = Math.max(0, Math.trunc(finiteNumber(level) || 0));
  if (isFavoriteItemSsr(rarity)) return Math.min(3, normalizedLevel + 1);
  return Math.min(3, Math.ceil(normalizedLevel / 5));
}

export function favoriteItemStarsToLevel(rarity, stars) {
  const normalizedStars = Math.max(0, Math.min(3, Math.trunc(finiteNumber(stars) || 0)));
  if (isFavoriteItemSsr(rarity)) return Math.max(0, normalizedStars - 1);
  return normalizedStars * 5;
}

export function normalizeFavoriteItemLevel(rarity, level) {
  const normalizedLevel = Math.max(0, Math.trunc(finiteNumber(level) || 0));
  return isFavoriteItemSsr(rarity) ? Math.min(2, normalizedLevel) : normalizedLevel;
}

export function favoriteItemSelectableStars(rarity) {
  return isFavoriteItemSsr(rarity) ? FAVORITE_ITEM_SSR_STAR_LEVELS : FAVORITE_ITEM_STAR_LEVELS;
}
