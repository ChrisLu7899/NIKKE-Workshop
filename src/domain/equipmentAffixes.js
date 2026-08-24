// SPDX-License-Identifier: GPL-3.0-or-later
// 装备词条的统一档位表，同时供计算器和本地截图 OCR 使用。

const COMMON_TIERS = [4.77, 5.47, 6.18, 6.88, 7.59, 8.29, 9.00, 9.70, 10.40, 11.11, 11.81, 12.52, 13.22, 13.93, 14.63];

export const EQUIPMENT_TIER_VALUES = Object.freeze({
  IncElementDmg: [9.54, 10.94, 12.34, 13.75, 15.15, 16.55, 17.95, 19.35, 20.75, 22.15, 23.56, 24.96, 26.36, 27.76, 29.16],
  StatAtk: COMMON_TIERS,
  StatAmmoLoad: [27.84, 31.95, 36.06, 40.17, 44.28, 48.39, 52.50, 56.60, 60.71, 64.82, 68.93, 73.04, 77.15, 81.26, 85.37],
  StatChargeTime: [1.98, 2.28, 2.57, 2.86, 3.16, 3.45, 3.75, 4.04, 4.33, 4.63, 4.92, 5.21, 5.51, 5.80, 6.09],
  StatChargeDamage: COMMON_TIERS,
  StatCritical: [2.30, 2.64, 2.98, 3.32, 3.66, 4.00, 4.35, 4.69, 5.03, 5.37, 5.71, 6.05, 6.39, 6.73, 7.07],
  StatCriticalDamage: [6.64, 7.62, 8.60, 9.58, 10.56, 11.54, 12.52, 13.50, 14.48, 15.46, 16.44, 17.42, 18.40, 19.38, 20.36],
  StatAccuracyCircle: COMMON_TIERS,
  StatDef: COMMON_TIERS,
});

export function tierValue(functionType, level) {
  const index = Number(level) - 1;
  return EQUIPMENT_TIER_VALUES[functionType]?.[index] ?? null;
}

export function nearestEquipmentTier(functionType, value, { tolerance = 0.45 } = {}) {
  const number = Number(value);
  const values = EQUIPMENT_TIER_VALUES[functionType] || [];
  if (!Number.isFinite(number) || !values.length) return null;
  const candidates = values
    .map((expected, index) => ({ level: index + 1, value: expected, difference: Math.abs(expected - number) }))
    .sort((left, right) => left.difference - right.difference);
  const best = candidates[0];
  return best && best.difference <= tolerance ? best : null;
}

export function formatTierPercent(functionType, level) {
  const value = tierValue(functionType, level);
  return value === null ? "" : `${value.toFixed(2)}%`;
}
