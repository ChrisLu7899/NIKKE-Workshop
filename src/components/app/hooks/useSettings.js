// SPDX-License-Identifier: GPL-3.0-or-later
// ========== 设置 Hook ==========

import { useCallback, useEffect, useState } from "react";
import { getSettings, setSettings } from "../../../services/storage.js";

/**
 * 设置管理 Hook
 */
export function useSettings() {
  const [server, setServer] = useState("global");
  const [manualAreaId, setManualAreaIdState] = useState("");

  // 初始化设置加载
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setServer(s.server || "global");
      // 手动 area_id 只在当前侧栏会话中有效；重新打开侧栏时恢复自动探测。
      setManualAreaIdState("");
      if (s.manualAreaId) {
        await setSettings({ manualAreaId: "" });
      }
    })();
  }, []);

  // 监听存储变化
  useEffect(() => {
    const handler = (changes, area) => {
      if (area === "local" && changes.settings) {
        const nextSettings = changes.settings.newValue || {};
        setServer(nextSettings.server || "global");
        setManualAreaIdState(String(nextSettings.manualAreaId || ""));
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // 持久化设置
  const persistSettings = useCallback((update) => setSettings(update), []);

  // 更改服务器
  const changeServer = useCallback((e) => {
    const v = e.target.value;
    setServer(v);
    persistSettings({ server: v });
  }, [persistSettings]);

  const changeManualAreaId = useCallback((event) => {
    const value = event?.target?.value ?? event ?? "";
    setManualAreaIdState(String(value));
    persistSettings({ manualAreaId: String(value) });
  }, [persistSettings]);

  return {
    server,
    manualAreaId,
    changeServer,
    changeManualAreaId,
  };
}

export default useSettings;
