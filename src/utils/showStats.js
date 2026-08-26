// SPDX-License-Identifier: GPL-3.0-or-later

export const BASIC_STAT_KEYS = Object.freeze([
  "limit_break",
  "skill1_level",
  "skill2_level",
  "skill_burst_level",
]);

const SIMULATED_STAT_KEYS = Object.freeze([
  "simulated_hp",
  "simulated_atk",
  "simulated_def",
]);
export const DEFAULT_SIMULATED_STAT_KEYS = Object.freeze(
  SIMULATED_STAT_KEYS.filter((key) => key !== "simulated_def"),
);

export const SHOW_STATS_CONFIG_MARKER = "__showStatsConfigured";
export const SIMULATED_STATS_CONFIG_MARKER = "__simulatedStatsConfigured";
