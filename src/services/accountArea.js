// SPDX-License-Identifier: GPL-3.0-or-later
// 账号区域识别与批次回填。页面只消费结构化结果，不维护候选区域规则。

import {
  applyManualAreaIdOverride,
  getAreaIdProbeCandidates,
} from "../utils/areaId.js";
import { applyCookieStr, clearSiteCookies } from "./cookie.js";
import { getRoleName, getUserCharacters } from "./api.js";

const emitDiagnostic = (onDiagnostic, message) => {
  if (typeof onDiagnostic !== "function") return;
  try {
    onDiagnostic(message);
  } catch {
    // 诊断日志不能影响区域识别。
  }
};

export const getDistinctAccountAreaIds = (accounts) => [...new Set(
  (Array.isArray(accounts) ? accounts : [])
    .map((account) => String(account?.roleInfo?.area_id || "").trim())
    .filter(Boolean),
)];

export const getSharedAccountAreaId = (accounts) => {
  const areaIds = getDistinctAccountAreaIds(accounts);
  return areaIds.length === 1 ? areaIds[0] : "";
};

export const discoverAccountArea = async ({
  account,
  server,
  onDiagnostic,
  clearCookies = clearSiteCookies,
  applyCookies = applyCookieStr,
  fetchRoleInfo = getRoleName,
  fetchUserCharacters = getUserCharacters,
}) => {
  await clearCookies();
  await applyCookies(account?.cookie || "");
  emitDiagnostic(onDiagnostic, "已应用当前账号 Cookie，开始自动探测昵称和 area_id");

  const discoveredRoleInfo = await fetchRoleInfo(onDiagnostic);
  let areaId = String(discoveredRoleInfo?.area_id || "").trim();
  const probedAreaIds = [];

  if (!areaId) {
    const candidates = getAreaIdProbeCandidates(server);
    emitDiagnostic(
      onDiagnostic,
      `玩家信息未返回 area_id，开始验证候选区域: [${candidates.join(",")}]`,
    );
    for (const candidateAreaId of candidates) {
      try {
        const characters = await fetchUserCharacters(candidateAreaId);
        probedAreaIds.push({
          areaId: candidateAreaId,
          characterCount: characters.length,
          success: true,
        });
        emitDiagnostic(
          onDiagnostic,
          `候选 area_id=${candidateAreaId} 验证结果: characterCount=${characters.length}`,
        );
        if (characters.length > 0) {
          areaId = candidateAreaId;
          break;
        }
      } catch (error) {
        probedAreaIds.push({
          areaId: candidateAreaId,
          characterCount: 0,
          success: false,
          error: String(error?.message || error),
        });
        emitDiagnostic(
          onDiagnostic,
          `候选 area_id=${candidateAreaId} 验证失败: ${error?.message || error}`,
        );
      }
    }
  }

  const accountName = account?.username || account?.name || "";
  return {
    success: Boolean(areaId),
    areaId,
    roleInfo: {
      role_name:
        discoveredRoleInfo?.role_name
        || account?.roleInfo?.role_name
        || accountName,
      area_id: areaId,
    },
    probedAreaIds,
  };
};

export const resolveCrawlableAccounts = ({
  accounts,
  manualAreaId = "",
}) => {
  const source = Array.isArray(accounts) ? accounts : [];
  if (manualAreaId) {
    return {
      accounts: applyManualAreaIdOverride(source, manualAreaId),
      unavailable: [],
      pendingCount: 0,
      distinctAreaIds: [String(manualAreaId)],
      sharedAreaId: String(manualAreaId),
      mode: "manual",
    };
  }

  const distinctAreaIds = getDistinctAccountAreaIds(source);
  const sharedAreaId = distinctAreaIds.length === 1 ? distinctAreaIds[0] : "";
  const pending = source.filter((account) => !account?.roleInfo?.area_id);
  if (sharedAreaId) {
    return {
      accounts: source.map((account) => ({
        ...account,
        roleInfo: {
          ...(account?.roleInfo || {}),
          role_name:
            account?.roleInfo?.role_name
            || account?.username
            || account?.name
            || "",
          area_id: account?.roleInfo?.area_id || sharedAreaId,
        },
      })),
      unavailable: [],
      pendingCount: pending.length,
      distinctAreaIds,
      sharedAreaId,
      mode: "shared",
    };
  }

  const reason = distinctAreaIds.length > 1
    ? "同批次检测到多个 area_id，无法安全回填"
    : "登录成功，但本批次未取得可共享的 area_id";
  return {
    accounts: source.filter((account) => Boolean(account?.roleInfo?.area_id)),
    unavailable: pending.map((account) => ({ account, reason })),
    pendingCount: pending.length,
    distinctAreaIds,
    sharedAreaId: "",
    mode: distinctAreaIds.length > 1 ? "conflict" : "missing",
  };
};

