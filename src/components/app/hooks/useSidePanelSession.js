// SPDX-License-Identifier: GPL-3.0-or-later
// 侧栏只负责当前浏览器会话、Cookie 保存与同步日志展示。

import { useCallback, useEffect, useState } from "react";
import { getAccounts, setAccounts } from "../../../services/storage.js";
import { getRoleName } from "../../../services/api.js";
import {
  parseGameOpenIdFromCookie,
  parseGameUidFromCookie,
  serializeBrowserCookies,
} from "../../../domain/account.js";
import { selectCurrentAccountIndex } from "../../../utils/singleAccount.js";
import { appendLogEntry, createLogState } from "../../../utils/logBuffer.js";

export function useSidePanelSession({ t }) {
  const [logState, setLogState] = useState(createLogState);
  const [cookieLoading, setCookieLoading] = useState(false);

  const addLog = useCallback((message) => {
    setLogState((previous) => appendLogEntry(previous, message));
  }, []);

  useEffect(() => {
    const handler = (message) => {
      if (message?.type !== "NIKKE_WORKSHOP_CRAWLER_LOG_STATE") return;
      const payload = message.payload || {};
      setLogState({
        logs: Array.isArray(payload.logs) ? payload.logs : [],
        fullLogs: Array.isArray(payload.fullLogs) ? payload.fullLogs : [],
      });
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const handleSaveCookie = useCallback(async () => {
    setCookieLoading(true);
    try {
      const allCookies = await chrome.cookies.getAll({});
      const cookies = allCookies.filter((cookie) =>
        String(cookie?.domain || "").endsWith("blablalink.com")
      );
      const token = cookies.find((cookie) => cookie.name === "game_token");
      if (!token) {
        addLog(t("notLogin"));
        return { success: false, reason: "not-logged-in" };
      }

      let autoUsername = "";
      let roleInfo = { role_name: "", area_id: "" };
      try {
        roleInfo = await getRoleName();
        autoUsername = roleInfo.role_name || "";
        if (autoUsername) addLog(`${t("autoGetUsername")}: ${autoUsername}`);
      } catch (error) {
        console.warn("自动获取用户名失败:", error);
        addLog(t("autoGetUsernameFail"));
      }

      const cookie = serializeBrowserCookies(cookies);
      const gameUid = parseGameUidFromCookie(cookie);
      const gameOpenId = parseGameOpenIdFromCookie(cookie);
      const accounts = await getAccounts();

      let existingIndex = gameUid
        ? accounts.findIndex((account) => account.game_uid === gameUid)
        : -1;
      if (existingIndex === -1 && gameOpenId) {
        existingIndex = accounts.findIndex((account) => account.game_openid === gameOpenId);
      }
      if (existingIndex === -1) existingIndex = selectCurrentAccountIndex(accounts);

      const baseAccount = existingIndex >= 0 ? accounts[existingIndex] : {};
      const finalUsername = autoUsername
        || baseAccount?.roleInfo?.role_name
        || baseAccount?.username
        || baseAccount?.name
        || "";
      const currentAccount = {
        ...baseAccount,
        username: finalUsername,
        cookie,
        cookieUpdatedAt: Date.now(),
        game_uid: gameUid,
        game_openid: gameOpenId,
        roleInfo: {
          ...(baseAccount?.roleInfo || {}),
          role_name: finalUsername,
          area_id: roleInfo?.area_id || baseAccount?.roleInfo?.area_id || "",
        },
        enabled: true,
      };
      const nextAccounts = accounts.map((account) => ({ ...account, enabled: false }));

      if (existingIndex !== -1) {
        nextAccounts[existingIndex] = currentAccount;
        addLog(`${t("accountUpdated")}: ${finalUsername || t("loggedIn")}`);
      } else {
        nextAccounts.push(currentAccount);
        addLog(`${t("accountSaved")}: ${finalUsername || t("loggedIn")}`);
      }

      await setAccounts(nextAccounts);
      return {
        success: true,
        updated: existingIndex !== -1,
        username: finalUsername,
        roleInfo: currentAccount.roleInfo,
      };
    } catch (error) {
      console.error("保存当前 Cookie 失败:", error);
      addLog(`${t("cookieSaveFailed")}: ${error?.message || error}`);
      return { success: false, reason: "save-failed", error };
    } finally {
      setCookieLoading(false);
    }
  }, [addLog, t]);

  return {
    logs: logState.logs,
    fullLogs: logState.fullLogs,
    cookieLoading,
    handleSaveCookie,
  };
}

export default useSidePanelSession;
