// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "react";
import { getRoleName } from "../../../services/api.js";
import {
  deriveBlablalinkLoginState,
  getBlablalinkBrowserCookies,
  openBlablalinkLogin,
} from "../../../services/blablalinkLogin.js";
import { getAccounts } from "../../../services/storage.js";

const INITIAL_STATE = {
  checking: true,
  loggedIn: false,
  username: "",
};

const isRelevantCookieChange = (changeInfo) => {
  const cookie = changeInfo?.cookie;
  return String(cookie?.domain || "").endsWith("blablalink.com")
    && ["game_token", "game_uid", "game_openid"].includes(cookie?.name);
};

export function useBlablalinkLoginStatus() {
  const [status, setStatus] = useState(INITIAL_STATE);
  const refreshSequenceRef = useRef(0);

  const refresh = useCallback(async ({ resolveUsername = true } = {}) => {
    const sequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = sequence;

    try {
      const [cookies, accounts] = await Promise.all([
        getBlablalinkBrowserCookies(),
        getAccounts(),
      ]);
      const snapshot = deriveBlablalinkLoginState(cookies, accounts);

      if (!snapshot.loggedIn) {
        if (sequence === refreshSequenceRef.current) {
          setStatus({ checking: false, loggedIn: false, username: "" });
        }
        return { ...snapshot, username: "" };
      }

      let username = snapshot.username;
      if (!username && resolveUsername) {
        try {
          const roleInfo = await getRoleName();
          username = String(roleInfo?.role_name || "");
        } catch (error) {
          console.warn("读取当前 Blablalink 用户名失败:", error);
        }
      }

      const nextStatus = {
        checking: false,
        loggedIn: true,
        username,
      };
      if (sequence === refreshSequenceRef.current) setStatus(nextStatus);
      return { ...snapshot, username };
    } catch (error) {
      console.warn("检查 Blablalink 登录状态失败:", error);
      if (sequence === refreshSequenceRef.current) {
        setStatus({ checking: false, loggedIn: false, username: "" });
      }
      return { loggedIn: false, username: "", error };
    }
  }, []);

  const openLogin = useCallback(async () => {
    await openBlablalinkLogin();
  }, []);

  useEffect(() => {
    let refreshTimer;
    const scheduleRefresh = (resolveUsername = true) => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => refresh({ resolveUsername }), 300);
    };
    scheduleRefresh(true);
    const cookieHandler = (changeInfo) => {
      if (isRelevantCookieChange(changeInfo)) scheduleRefresh(true);
    };
    const storageHandler = (changes, area) => {
      if (area === "local" && changes.accounts) scheduleRefresh(false);
    };
    const focusHandler = () => scheduleRefresh(true);

    chrome.cookies.onChanged.addListener(cookieHandler);
    chrome.storage.onChanged.addListener(storageHandler);
    window.addEventListener("focus", focusHandler);
    document.addEventListener("visibilitychange", focusHandler);

    return () => {
      clearTimeout(refreshTimer);
      chrome.cookies.onChanged.removeListener(cookieHandler);
      chrome.storage.onChanged.removeListener(storageHandler);
      window.removeEventListener("focus", focusHandler);
      document.removeEventListener("visibilitychange", focusHandler);
    };
  }, [refresh]);

  return {
    ...status,
    openLogin,
    refresh,
  };
}

export default useBlablalinkLoginStatus;
