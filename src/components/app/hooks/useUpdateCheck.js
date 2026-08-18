// SPDX-License-Identifier: GPL-3.0-or-later
// ========== 自动更新检查 Hook ==========

export function useUpdateCheck() {
  return {
    updateAvailable: false,
    latestVersion: null,
    releaseUrl: null,
  };
}
