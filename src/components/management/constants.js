// SPDX-License-Identifier: GPL-3.0-or-later
// ========== 管理页面常量定义 ==========
import {
  BASIC_STAT_KEYS,
  SHOW_STATS_CONFIG_MARKER,
  SIMULATED_STATS_CONFIG_MARKER,
} from "../../utils/showStats.js";

// 装备统计键名列表
export const equipStatKeys = [
  "IncElementDmg",    // 属性伤害
  "StatAtk",          // 攻击力
  "StatAmmoLoad",     // 弹药装载
  "StatChargeTime",   // 充能时间
  "StatChargeDamage", // 充能伤害
  "StatCritical",     // 暴击率
  "StatCriticalDamage", // 暴击伤害
  "StatAccuracyCircle", // 精准度
  "StatDef"           // 防御力
];

// 基础列（突破/技能）键名：用于控制 Excel 导出列是否隐藏
export const basicStatKeys = [
  ...BASIC_STAT_KEYS,
];

// showStats 配置标记：用于区分"旧数据默认基础列全开"与"用户已手动配置"。
// 注意：该标记不代表任何列的显示，导出端会忽略它。
export { SHOW_STATS_CONFIG_MARKER, SIMULATED_STATS_CONFIG_MARKER };

// 元素翻译键
export const elementTranslationKeys = {
  Electronic: "electronic",
  Fire: "fire",
  Wind: "wind",
  Water: "water",
  Iron: "iron",
  Utility: "utility"
};

// 职业翻译键
export const classTranslationKeys = {
  Attacker: "attacker",
  Defender: "defender",
  Supporter: "supporter"
};

// 企业翻译键
export const corporationTranslationKeys = {
  ELYSION: "elysion",
  MISSILIS: "missilis",
  TETRA: "tetra",
  PILGRIM: "pilgrim",
  ABNORMAL: "abnormal"
};
