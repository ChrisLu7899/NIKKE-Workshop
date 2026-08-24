// SPDX-License-Identifier: GPL-3.0-or-later

const AFFIX_DISPLAY_ORDER = Object.freeze([
  { functionType: "IncElementDmg", shortLabel: "优越" },
  { functionType: "StatAtk", shortLabel: "攻击" },
  { functionType: "StatAmmoLoad", shortLabel: "弹容" },
  { functionType: "StatCritical", shortLabel: "暴击" },
  { functionType: "StatCriticalDamage", shortLabel: "暴伤" },
  { functionType: "StatChargeTime", shortLabel: "蓄速" },
  { functionType: "StatChargeDamage", shortLabel: "蓄伤" },
  { functionType: "StatDef", shortLabel: "防御" },
  { functionType: "StatAccuracyCircle", shortLabel: "命中" },
]);

const AFFIX_META = new Map(AFFIX_DISPLAY_ORDER.map((item, order) => [item.functionType, { ...item, order }]));

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * 按四件装备的累计档位选出最高的词条，再按产品固定顺序展示累计数值。
 * 数值在领域层保留原始合计，交给视图按需要四舍五入。
 */
export const summarizeTopEquipmentAffixes = (equipments, limit = 4) => {
  const totals = new Map();

  (Array.isArray(equipments) ? equipments : []).forEach((equipment) => {
    (Array.isArray(equipment) ? equipment : []).forEach((line) => {
      const meta = AFFIX_META.get(line?.functionType);
      const value = finiteNumber(line?.value);
      if (!meta || value === null) return;

      const level = finiteNumber(line?.level) ?? 0;
      const current = totals.get(meta.functionType) || {
        ...meta,
        totalLevel: 0,
        totalValue: 0,
      };
      current.totalLevel += level;
      current.totalValue += value;
      totals.set(meta.functionType, current);
    });
  });

  return [...totals.values()]
    .sort((left, right) => (
      right.totalLevel - left.totalLevel
      || right.totalValue - left.totalValue
      || left.order - right.order
    ))
    .slice(0, Math.max(0, Number(limit) || 0))
    .sort((left, right) => left.order - right.order)
    .map((item) => ({
      ...item,
      roundedValue: Math.round(item.totalValue),
    }));
};

