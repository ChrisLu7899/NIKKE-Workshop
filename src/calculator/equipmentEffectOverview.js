// SPDX-License-Identifier: GPL-3.0-or-later

export const EQUIPMENT_EFFECT_DISPLAY_ORDER = Object.freeze([
  "优越代码伤害增加",
  "攻击力增加",
  "最大装弹数增加",
  "暴击率增加",
  "暴击伤害增加",
  "蓄力速度增加",
  "蓄力伤害增加",
  "防御力增加",
  "命中率增加",
]);

const percentageBasisPoints = value => {
  const parsed = Number.parseFloat(String(value ?? "").replace("%", ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export function summarizeEquipmentEffects(lines, tierValuesByStat) {
  const totals = new Map(EQUIPMENT_EFFECT_DISPLAY_ORDER.map(stat => [stat, 0]));

  for (const line of lines || []) {
    const stat = String(line?.stat || "");
    const tier = Number(line?.tier || 0);
    if (!totals.has(stat) || tier < 1) continue;

    const tierValue = tierValuesByStat?.[stat]?.[tier - 1];
    totals.set(stat, totals.get(stat) + percentageBasisPoints(tierValue));
  }

  return EQUIPMENT_EFFECT_DISPLAY_ORDER.map(stat => {
    const basisPoints = totals.get(stat) || 0;
    return {
      stat,
      basisPoints,
      value: basisPoints / 100,
      formattedValue: `${(basisPoints / 100).toFixed(2)}%`,
    };
  });
}
