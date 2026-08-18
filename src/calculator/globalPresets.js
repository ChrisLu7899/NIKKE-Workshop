// SPDX-License-Identifier: GPL-3.0-or-later

export const GLOBAL_TARGET_PRESETS = {
  top: [
    { stat: "优越代码伤害增加", minCount: 4, minTotal: 110 },
    { stat: "攻击力增加", minCount: 4, minTotal: 50 },
  ],
  graduation: [
    { stat: "优越代码伤害增加", minCount: 4, minTotal: 100 },
    { stat: "攻击力增加", minCount: 4, minTotal: 45 },
  ],
  excellent: [
    { stat: "优越代码伤害增加", minCount: 4, minTotal: 90 },
    { stat: "攻击力增加", minCount: 4, minTotal: 40 },
  ],
  starter: [
    { stat: "优越代码伤害增加", minCount: 4, minTotal: 80 },
    { stat: "攻击力增加", minCount: 4, minTotal: 30 },
  ],
};

export const GLOBAL_STAT_DEFAULTS = {
  "优越代码伤害增加": { minCount: 4, minTotal: 80 },
  "攻击力增加": { minCount: 4, minTotal: 40 },
  "最大装弹数增加": { minCount: 1, minTotal: 60 },
  "暴击伤害增加": { minCount: 1, minTotal: 15 },
  "暴击率增加": { minCount: 1, minTotal: 5 },
  "防御力增加": { minCount: 1, minTotal: 10 },
  "命中率增加": { minCount: 1, minTotal: 10 },
  "蓄力速度增加": { minCount: 1, minTotal: 4 },
  "蓄力伤害增加": { minCount: 1, minTotal: 10 },
};

export function chooseAvailableGlobalStat(statNames, usedStats, preferred = "") {
  const used = new Set(usedStats || []);
  if (preferred && statNames.includes(preferred) && !used.has(preferred)) return preferred;
  return statNames.find(stat => !used.has(stat)) || "";
}
