// SPDX-License-Identifier: GPL-3.0-or-later

export function unavailableStatsForRow(selectedStats, rowIndex, emptyStat = "空词条") {
  return new Set(
    (selectedStats || [])
      .filter((stat, index) => index !== rowIndex && stat && stat !== emptyStat),
  );
}
