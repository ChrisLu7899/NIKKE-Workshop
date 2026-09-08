// SPDX-License-Identifier: GPL-3.0-or-later
import assets from '../data/characterObjectAssets.json' with { type: 'json' };
const ROOT = '/ui-assets/nikke/';

/** Display sprites are independent of the OCR templates and recognition thresholds. */
export function cubeDisplayAsset(resourceId) {
  const id = String(resourceId ?? '').trim();
  return /^\d+$/.test(id) && Object.hasOwn(assets.cubes, id) ? ROOT + assets.cubes[id] : '';
}

export function favoriteItemDisplayAsset(resourceNumber) {
  const number = String(resourceNumber ?? '').trim();
  if (!/^\d{1,4}$/.test(number)) return '';
  const key = `c${number.padStart(3, '0')}`;
  return Object.hasOwn(assets.favorites, key) ? ROOT + assets.favorites[key] : '';
}
