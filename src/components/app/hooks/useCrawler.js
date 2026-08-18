// SPDX-License-Identifier: GPL-3.0-or-later
// ========== 数据爬取 Hook ==========

import { useState, useCallback, useEffect, useRef } from "react";
import JSZip from "jszip";
import saveDictToExcel from "../../../utils/excel.js";
import { computeAELForDict } from "../../../utils/ael.js";
import {
  parseManualAreaId,
} from "../../../utils/areaId.js";
import { createUniqueExportFileName } from "../../../utils/exportFilenames.js";
import { getAccounts, setAccounts, getCharacters, setCalculatorData } from "../../../services/storage.js";
import { applyCookieStr, clearSiteCookies, getCurrentCookies } from "../../../services/cookie.js";
import { loadBaseAccountDict, getRoleName, prefetchMainlineCatalog, validateCookieWithAccount, getOutpostInfoWithAccount, getCampaignProgressWithAccount } from "../../../services/api.js";
import { registerCookieRules, unregisterAllRules } from "../../../services/requestInterceptor.js";
import { parseGameUidFromCookie } from "../../../domain/account.js";
import { BATCH_SIZE, STAGGER_DELAY } from "../constants.js";
import { crawlWithEmptyDataRetry } from "../../../utils/crawlValidation.js";
import { hydrateAccountCharacterData } from "../../../services/accountCharacterData.js";
import {
  CRAWL_CIRCUIT_STORAGE_KEY,
  acquireCrawlCircuitPermit,
  createCrawlRunGate,
  formatCircuitReason,
  getCrawlCircuitState,
  recordCrawlCircuitFailure,
  recordCrawlCircuitSuccess,
} from "../../../services/crawlSafety.js";
import { appendLogEntry, createLogState } from "../../../utils/logBuffer.js";
import { buildCalculatorSnapshot } from "../../../utils/calculatorSnapshot.js";
import {
  resolveCrawlerOutputMode,
  shouldOpenStandaloneCalculator,
} from "../../../utils/crawlerMode.js";
import { loginAndCollectBlablalinkSession } from "../../../services/blablalinkSession.js";
import {
  discoverAccountArea,
  getSharedAccountAreaId,
  resolveCrawlableAccounts,
} from "../../../services/accountArea.js";

const AUTO_SAVE_DATA = true;

const maskDiagnosticText = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 2) return `${text.slice(0, 1)}*`;
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
};

const getAccountDiagnosticLabel = (account) => {
  const gameUid = String(account?.game_uid || account?.gameUid || "").trim();
  if (gameUid) return `uid:***${gameUid.slice(-4)}`;

  const email = String(account?.email || "").trim();
  if (email) {
    const [localPart, domain] = email.split("@");
    return `email:${localPart?.slice(0, 1) || "*"}***${domain ? `@${domain}` : ""}`;
  }

  const displayName = account?.username || account?.name;
  return displayName ? `name:${maskDiagnosticText(displayName)}` : "unknown-account";
};

const createAccountDiagnosticLogger = (addFullLog, account, scope) => {
  const accountLabel = getAccountDiagnosticLabel(account);
  return (message) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    const line = `[诊断 ${timestamp}][${accountLabel}][${scope}] ${message}`;
    addFullLog(line);
  };
};

const serializeCrawlFailure = (error) => ({
  message: String(error?.message || error || "未知错误"),
  code: String(error?.code || ""),
  status: Number(error?.status || 0),
  retryAfterMs: Number(error?.retryAfterMs || 0),
});

/**
 * 数据爬取 Hook
 * @param {Object} options
 * @param {Function} options.t - 翻译函数
 * @param {string} options.lang - 语言
 * @param {boolean} options.saveAsZip - 是否保存为 ZIP
 * @param {boolean} options.exportJson - 是否导出 JSON
 * @param {boolean} options.activateTab - 是否激活标签页
 * @param {string} options.server - 服务器
 * @param {boolean} options.forceSimulatedStatsLevel400 - 是否强制按400级计算模拟属性
 * @param {boolean} options.broadcastLogs - 是否把本实例日志广播给侧栏
 * @param {boolean} options.listenForExternalLogs - 是否接收其它扩展页广播的抓取日志
 */
export function useCrawler({
  t,
  lang,
  saveAsZip,
  exportJson,
  activateTab,
  server,
  forceSimulatedStatsLevel400,
  broadcastLogs = false,
  listenForExternalLogs = false,
}) {
  const [logState, setLogState] = useState(createLogState);
  const [loading, setLoading] = useState(false);
  const [calculatorLoading, setCalculatorLoading] = useState(false);
  const [cookieLoading, setCookieLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [crawlCircuitState, setCrawlCircuitState] = useState(null);
  const crawlRunGateRef = useRef(createCrawlRunGate());

  const refreshCrawlCircuitState = useCallback(async () => {
    try {
      const next = await getCrawlCircuitState();
      setCrawlCircuitState(next);
      return next;
    } catch (error) {
      console.warn("读取同步保护状态失败:", error);
      return null;
    }
  }, []);

  const addLog = useCallback((msg) => {
    setLogState((prev) => appendLogEntry(prev, msg));
  }, []);
  const addDiagnosticLog = useCallback((msg) => {
    console.debug(msg);
    setLogState((prev) => appendLogEntry(prev, msg, { diagnostic: true }));
  }, []);
  const clearLogs = useCallback(() => setLogState(createLogState()), []);

  useEffect(() => {
    refreshCrawlCircuitState();
    const handler = (changes, area) => {
      if (area !== "local" || !changes[CRAWL_CIRCUIT_STORAGE_KEY]) return;
      refreshCrawlCircuitState();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [refreshCrawlCircuitState]);

  useEffect(() => {
    if (!crawlCircuitState || crawlCircuitState.status === "closed") return undefined;
    const waitMs = crawlCircuitState.status === "open"
      ? Math.max(1000, crawlCircuitState.blockedUntil - Date.now())
      : 60_000;
    const timer = setTimeout(refreshCrawlCircuitState, Math.min(waitMs, 60_000));
    return () => clearTimeout(timer);
  }, [crawlCircuitState, refreshCrawlCircuitState]);

  // 管理页和侧栏属于两个独立 React 页面。管理页负责抓取时，把日志广播给
  // 侧栏的日志框，避免真实接口错误被管理页的通用提示隐藏。
  useEffect(() => {
    if (!broadcastLogs) return;
    chrome.runtime.sendMessage(
      {
      type: "NIKKE_WORKSHOP_CRAWLER_LOG_STATE",
        payload: logState,
      },
      () => void chrome.runtime.lastError,
    );
  }, [broadcastLogs, logState]);

  useEffect(() => {
    if (!listenForExternalLogs) return undefined;
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
  }, [listenForExternalLogs]);

  // ========== Cookie 保存功能 ==========
  const handleSaveCookie = useCallback(async () => {
    chrome.cookies.getAll({ url: "https://www.blablalink.com" }, async (cookies) => {
      console.log(cookies);
      const token = cookies.find((c) => c.name === "game_token");
      if (!token) {
        addLog(t("notLogin"));
        return;
      }
      
      // 自动获取用户名
      let autoUsername = "";
      try {
        const roleInfo = await getRoleName();
        autoUsername = roleInfo.role_name || "";
        addLog(`${t("autoGetUsername")}: ${autoUsername}`);
      } catch (error) {
        console.warn("自动获取用户名失败:", error);
        addLog(t("autoGetUsernameFail"));
        autoUsername = t("noName");
      }
      
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      
      // 提取game_uid
      const gameUidCookie = cookies.find(c => c.name === "game_uid");
      const gameUid = gameUidCookie ? gameUidCookie.value : "";
      
      const accounts = await getAccounts();
      
      // 检查是否已存在相同email/game_uid或cookie的账号
      let existingIndex = -1;
      const emailLike = autoUsername && autoUsername.includes("@") ? autoUsername : "";
      if (emailLike) {
        existingIndex = accounts.findIndex(acc => acc.email === emailLike);
      }
      if (gameUid) {
        // 优先按game_uid查找
        if (existingIndex === -1) {
          existingIndex = accounts.findIndex(acc => acc.game_uid === gameUid);
        }
      }
      if (existingIndex === -1) {
        // 如果没有game_uid或找不到，则按cookie查找
        existingIndex = accounts.findIndex(acc => acc.cookie === cookieStr);
      }
      
      const now = Date.now();
      if (existingIndex !== -1) {
        // 更新现有账号
        accounts[existingIndex].cookie = cookieStr;
        accounts[existingIndex].cookieUpdatedAt = now;
        if (autoUsername) accounts[existingIndex].username = autoUsername;
        if (gameUid) accounts[existingIndex].game_uid = gameUid;
        addLog(`${t("accountUpdated")}: ${autoUsername}`);
      } else {
        // 添加新账号
        accounts.push({
          username: autoUsername,
          email: "",
          password: "",
          cookie: cookieStr,
          cookieUpdatedAt: now,
          game_uid: gameUid,
          enabled: true,
        });
        addLog(`${t("accountSaved")}: ${autoUsername}`);
      }
      
      await setAccounts(accounts);
    });
  }, [t, addLog]);

  // 页面 Hook 只编排流程，角色数据的请求与合并由独立服务负责。
  const addCharacterDetailsToDictWithAccount = useCallback(
    (dict, account) => hydrateAccountCharacterData({
      dict,
      account,
      forceSimulatedStatsLevel400,
    }),
    [forceSimulatedStatsLevel400],
  );

  // ========== 数据爬取主流程 ==========
  const handleStart = useCallback(async ({
    onlyCookie = false,
    loginTest = false,
    calculatorMode = false,
    deferExport = false,
    openCalculator = true,
    manualAreaId = "",
    forceActivateLoginTab = false,
    charactersOverride = null,
  } = {}) => {
    const authenticationOnly = Boolean(onlyCookie || loginTest);

    const parsedManualAreaId = parseManualAreaId(manualAreaId);
    if (!authenticationOnly && !parsedManualAreaId.valid) {
      clearLogs();
      addLog(t("manualAreaIdInvalid"));
      return {
        calculatorCharacterCount: 0,
        successAccountCount: 0,
        accountDicts: [],
        error: t("manualAreaIdInvalid"),
      };
    }
    const manualAreaIdOverride =
      !authenticationOnly && !parsedManualAreaId.empty
        ? parsedManualAreaId.value
        : "";

    const fullCrawl = !authenticationOnly;
    const admission = crawlRunGateRef.current.tryEnter({ fullCrawl });
    if (!admission.allowed) {
      addLog(`⚠ ${admission.reason}`);
      return {
        calculatorCharacterCount: 0,
        successAccountCount: 0,
        accountDicts: [],
        error: admission.reason,
      };
    }
    let circuitPermit = null;
    let circuitSettled = false;
    if (fullCrawl) {
      try {
        circuitPermit = await acquireCrawlCircuitPermit();
        setCrawlCircuitState(circuitPermit.state);
      } catch (error) {
        console.warn("同步保护准入检查失败，按可用优先继续:", error);
      }
      if (circuitPermit && !circuitPermit.allowed) {
        crawlRunGateRef.current.leave({ fullCrawl: false });
        addLog(`⚠ ${circuitPermit.reason}`);
        return {
          calculatorCharacterCount: 0,
          successAccountCount: 0,
          accountDicts: [],
          error: circuitPermit.reason,
        };
      }
    }
    clearLogs();

    if (authenticationOnly) {
      setCookieLoading(true);
    } else if (calculatorMode) {
      setCalculatorLoading(true);
    } else {
      setLoading(true);
    }

    const {
      shouldExportExcel,
      shouldExportJson,
      shouldZip,
    } = resolveCrawlerOutputMode({ calculatorMode, deferExport, exportJson, saveAsZip });
    
    // 保存当前的cookie，以便运行完成后恢复
    let originalCookies = "";
    let calculatorCharacterCount = 0;
    
    try {
      // 保存原始cookie
      originalCookies = await getCurrentCookies();
      
      // ========== 步骤0: 检查妮姬列表配置 ==========
      if (!authenticationOnly) {
        const characters = charactersOverride || await getCharacters();
        const allElementsEmpty = Object.values(characters.elements || {}).every(
          elementArray => !elementArray || elementArray.length === 0
        );
        
        if (allElementsEmpty) {
          addLog(t("emptyNikkeList"));
          addLog(t("pleaseAddNikkes"));
          return {
            calculatorCharacterCount: 0,
            successAccountCount: 0,
            accountDicts: [],
            error: t("pleaseAddNikkes"),
          };
        }
      }
      
      // ========== 步骤1: 读取账号列表 ==========
      const accountsAll = await getAccounts();
      const normalizedAccounts = accountsAll.map((acc) => ({
        ...acc,
        game_uid: acc.game_uid || parseGameUidFromCookie(acc.cookie) || "",
      }));
      if (JSON.stringify(normalizedAccounts) !== JSON.stringify(accountsAll)) {
        await setAccounts(normalizedAccounts);
      }
      let accounts = normalizedAccounts.filter((a) => a.enabled !== false);
      if (onlyCookie) {
        accounts = accounts.filter((a) => a.enabled !== false);
      }
      if (!accounts.length) {
        addLog(t("emptyAccounts"));
        return {
          calculatorCharacterCount: 0,
          successAccountCount: 0,
          accountDicts: [],
          error: t("emptyAccounts"),
        };
      }
      
      addLog(t("starting"));
      if (calculatorMode) {
        addLog(t("calculatorDirectFetch"));
      }
      addLog(`共 ${accounts.length} 个账号，开始并发验证...`);
      if (manualAreaIdOverride) {
        addLog(
          `⚠ 手动 area_id 模式已启用：本批次将强制使用 ${manualAreaIdOverride}，并跳过自动区域和昵称探测`
        );
      }
      
      // 预抓取主线目录（仅执行一次）
      let catalogMap = {};
      try {
        catalogMap = await prefetchMainlineCatalog();
      } catch (e) {
        console.warn("预抓取主线目录失败", e);
      }

      const zip = new JSZip();
      let zipHasFiles = false;
      const usedExportNames = new Set();
      const excelMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      
      // ========== 阶段1: 账号验证 ==========
      const authenticatedAccounts = [];
      const reloginAccounts = [];
      const unavailableAccounts = [];

      if (!onlyCookie) {
        addLog(`----------------------------`);
        addLog(`[阶段1] 并发验证 Cookie...`);
        
        // 注册拦截规则
        addDiagnosticLog(
          `[诊断] Cookie注入规则准备: accounts=${accounts.length}; eligible=${accounts.filter((account) => account.game_uid && account.cookie).length}; missingGameUid=${accounts.filter((account) => !account.game_uid).length}; missingCookie=${accounts.filter((account) => !account.cookie).length}`
        );
        await registerCookieRules(accounts);
        
        // 分批并发验证
        for (let batchStart = 0; batchStart < accounts.length; batchStart += BATCH_SIZE) {
          const batch = accounts.slice(batchStart, batchStart + BATCH_SIZE);
          
          const batchPromises = batch.map((acc, idx) => {
            const delay = idx * STAGGER_DELAY;
            return (async () => {
              await new Promise(r => setTimeout(r, delay));
              const diagnosticLog = createAccountDiagnosticLogger(addDiagnosticLog, acc, "保存Cookie验证");
              const result = await validateCookieWithAccount(
                acc,
                diagnosticLog,
                { skipRoleLookup: Boolean(manualAreaIdOverride) }
              );
              return { acc, result };
            })();
          });
          
          const batchResults = await Promise.all(batchPromises);
          
          for (const { acc, result } of batchResults) {
            if (result.valid) {
              authenticatedAccounts.push({
                ...acc,
                roleInfo: {
                  role_name: result.roleInfo?.role_name || acc.username || acc.name || "",
                  area_id: manualAreaIdOverride || result.roleInfo?.area_id || "",
                },
              });
              if (manualAreaIdOverride) {
                addLog(
                  `✓ ${acc.username || acc.name || t("noName")} - Cookie 有效，已强制使用手动 area_id`
                );
              } else if (result.roleReady) {
                addLog(`✓ ${acc.username || acc.name || t("noName")} - Cookie 有效`);
              } else {
                addLog(`✓ ${acc.username || acc.name || t("noName")} - Cookie 有效，area_id 待批次回填`);
              }
            } else {
              if (acc.password) {
                reloginAccounts.push(acc);
                addLog(`✗ ${acc.username || acc.name || t("noName")} - Cookie 失效，待重登`);
              } else {
                unavailableAccounts.push({ acc, reason: result.error || "Cookie 失效且无密码" });
                addLog(`✗ ${acc.username || acc.name || t("noName")} - ${result.error || "Cookie 失效"}，无密码跳过`);
              }
            }
          }
        }

        const pendingAreaCount = authenticatedAccounts.filter(
          (account) => !account.roleInfo?.area_id
        ).length;
        addLog(
          `验证完成: ${authenticatedAccounts.length} 登录态有效 (${pendingAreaCount} 待回填 area_id), ${reloginAccounts.length} 待重登, ${unavailableAccounts.length} 无法处理`
        );
      } else {
        // 仅更新 Cookie：跳过验证，直接按启用开关强制重登更新
        accounts.forEach((acc) => {
          if (acc.password) {
            reloginAccounts.push(acc);
          } else {
            unavailableAccounts.push({ acc, reason: "无密码，无法更新 Cookie" });
            addLog(`✗ ${acc.username || acc.name || t("noName")} - 无密码跳过`);
          }
        });
      }
      
      // ========== 阶段2: 串行重新登录失效账号 ==========
      if (reloginAccounts.length > 0) {
        addLog(`----------------------------`);
        addLog(
          onlyCookie
            ? `串行更新 ${reloginAccounts.length} 个账号 Cookie...`
            : loginTest
              ? `串行测试 ${reloginAccounts.length} 个账号登录...`
              : `[阶段2] 串行重新登录 ${reloginAccounts.length} 个账号...`,
        );
        
        for (const acc of reloginAccounts) {
          addLog(`正在登录: ${acc.username || acc.name || acc.email || t("noName")}`);
          const diagnosticLog = createAccountDiagnosticLogger(addDiagnosticLog, acc, "重新登录");
          diagnosticLog(
            `开始: server=${server}; storedCookie=${acc.cookie ? "present" : "empty"}; storedGameUid=${acc.game_uid ? "present" : "empty"}`
          );
          
          try {
            const loginResult = await loginAndCollectBlablalinkSession({
              account: acc,
              server,
              activateTab,
              forceActivateTab: Boolean(
                forceActivateLoginTab && !String(acc.cookie || "").trim()
              ),
              onDiagnostic: diagnosticLog,
              onAttempt: ({ phase, nextAttempt, maxAttempts }) => {
                if (phase === "start") addLog(t("getCookie"));
                if (phase === "retry") {
                  addLog(`登录超时，重试 ${nextAttempt}/${maxAttempts}`);
                }
              },
            });
            diagnosticLog(
              `登录函数完成: attempt=${loginResult?.attempt ?? "unknown"}; totalElapsed=${loginResult?.totalElapsedMs ?? "unknown"}ms`
            );

            const newCookieStr = loginResult.cookie;
            acc.cookie = newCookieStr;
            acc.cookieUpdatedAt = Date.now();
            if (loginResult.gameUid) acc.game_uid = loginResult.gameUid;

            let roleInfo = {
              role_name: acc.username || acc.name || "",
              area_id: "",
            };
            let areaSource = "pending";

            if (authenticationOnly) {
              diagnosticLog("已取得 game_token，按账号验证模式判定登录成功，跳过 area_id 验证");
            } else if (manualAreaIdOverride) {
              roleInfo.area_id = manualAreaIdOverride;
              areaSource = "manual";
              diagnosticLog(
                `已取得 game_token，强制采用手动 area_id=${manualAreaIdOverride}，跳过玩家信息探测`
              );
            } else {
              const existingBatchAreaId = getSharedAccountAreaId(authenticatedAccounts);
              if (existingBatchAreaId) {
                roleInfo.area_id = existingBatchAreaId;
                areaSource = "batch";
                diagnosticLog("已取得 game_token，直接采用本批次已确认的 area_id");
              } else {
                await applyCookieStr(newCookieStr);
                diagnosticLog("Cookie 重新应用完成；本批次尚无 area_id，尝试从当前账号发现");
                try {
                  const discoveredRoleInfo = await getRoleName(diagnosticLog);
                  roleInfo = {
                    role_name: discoveredRoleInfo.role_name || roleInfo.role_name,
                    area_id: discoveredRoleInfo.area_id || "",
                  };
                  areaSource = roleInfo.area_id ? "account" : "pending";
                  diagnosticLog(
                    `玩家信息探测结果: area_id=${roleInfo.area_id ? "present" : "empty"}; role_name=${roleInfo.role_name ? "present" : "empty"}`
                  );
                } catch (error) {
                  diagnosticLog(
                    `玩家信息探测异常但不影响重登成功: ${error?.message || error}`
                  );
                }
              }
            }

            authenticatedAccounts.push({ ...acc, roleInfo });

            if (onlyCookie) {
              addLog(`✓ ${acc.username || acc.name || t("noName")} - Cookie 更新成功`);
            } else if (loginTest) {
              addLog(`✓ ${acc.username || acc.name || t("noName")} - ${t("loginTestSuccess")}`);
            } else if (areaSource === "manual") {
              addLog(
                `✓ ${acc.username || roleInfo.role_name || t("noName")} - 登录成功，已强制使用手动 area_id`
              );
            } else if (areaSource === "batch") {
              addLog(`✓ ${acc.username || roleInfo.role_name || t("noName")} - 登录成功，已使用批次 area_id`);
            } else if (roleInfo.area_id) {
              addLog(`✓ ${acc.username || roleInfo.role_name || t("noName")} - 登录成功`);
            } else {
              addLog(`✓ ${acc.username || acc.name || t("noName")} - 登录成功，area_id 待批次回填`);
            }

            // Cookie 获取成功后立即回写账号，不再依赖 area_id。
            if (AUTO_SAVE_DATA) {
              if (roleInfo.role_name) acc.username = roleInfo.role_name;

              try {
                const all = await getAccounts();
                const now = Date.now();
                let existingIndex = -1;
                if (acc.email) {
                  existingIndex = all.findIndex((a) => a.email === acc.email);
                }
                if (existingIndex === -1 && acc.game_uid) {
                  existingIndex = all.findIndex((a) => a.game_uid === acc.game_uid);
                }
                if (existingIndex === -1) {
                  existingIndex = all.findIndex((a) => a.cookie === acc.cookie);
                }
                if (existingIndex !== -1) {
                  all[existingIndex] = {
                    ...all[existingIndex],
                    cookie: acc.cookie,
                    cookieUpdatedAt: now,
                    username: acc.username || all[existingIndex].username,
                    game_uid: acc.game_uid || all[existingIndex].game_uid,
                  };
                } else {
                  all.push({
                    ...acc,
                    cookieUpdatedAt: now,
                    enabled: acc.enabled !== false,
                  });
                }
                await setAccounts(all);
                diagnosticLog("新 Cookie 已回写账号存储");
              } catch (error) {
                diagnosticLog(
                  `新 Cookie 回写账号存储失败，但当前重登结果仍有效: ${error?.message || error}`
                );
              }
            }
          } catch (err) {
            unavailableAccounts.push({ acc, reason: `登录失败: ${err.message}` });
            diagnosticLog(`异常归类: ${err?.message || err}`);
            addLog(`✗ ${acc.username || acc.name || t("noName")} - ${err.message}`);
          }
        }
      }

      if (authenticationOnly) {
        await unregisterAllRules();
        addLog(`----------------------------`);
        if (onlyCookie) {
          addLog(
            `Cookie 更新结果: ${authenticatedAccounts.length} 成功, ${unavailableAccounts.length} 失败`
          );
          addLog(t("cookieOnlyDone"));
        } else {
          addLog(
            `${t("loginTestResult")}: ${authenticatedAccounts.length} ${t("successCount")}, ${unavailableAccounts.length} ${t("failedCount")}`
          );
        }

        return {
          loginSuccessCount: authenticatedAccounts.length,
          loginFailedCount: unavailableAccounts.length,
          calculatorCharacterCount: 0,
          successAccountCount: 0,
          accountDicts: [],
        };
      }

      // Cookie 登录态有效不代表玩家信息接口一定已经返回 area_id。
      // 登录测试会刻意跳过角色探测，因此正式抓取前要为仍缺少 area_id 的账号
      // 恢复一次旧版的“应用 Cookie -> 自动探测昵称和区域”流程。手动 area_id
      // 仍然只作为用户明确填写后的本次会话覆盖值。
      if (!manualAreaIdOverride) {
        const pendingAreaAccounts = authenticatedAccounts.filter(
          (account) => !account.roleInfo?.area_id
        );

        if (pendingAreaAccounts.length > 0) {
          addLog(
            `[区域探测] ${pendingAreaAccounts.length} 个账号尚未取得 area_id，开始自动获取...`
          );
          await unregisterAllRules();

          for (const account of pendingAreaAccounts) {
            const accountName = account.username || account.name || t("noName");
            const diagnosticLog = createAccountDiagnosticLogger(
              addDiagnosticLog,
              account,
              "自动区域探测"
            );

            try {
              const discovery = await discoverAccountArea({
                account,
                server,
                onDiagnostic: diagnosticLog,
              });
              if (discovery.success) {
                account.roleInfo = discovery.roleInfo;
                addLog(`✓ ${accountName} - 已自动确认 area_id=${discovery.areaId}`);
              } else {
                addLog(`✗ ${accountName} - 自动获取 area_id 失败，可在侧栏手动指定后重试`);
              }
            } catch (error) {
              diagnosticLog(`自动区域探测异常: ${error?.message || error}`);
              addLog(`✗ ${accountName} - 自动获取 area_id 失败，可在侧栏手动指定后重试`);
            }
          }
        }
      }

      const areaResolution = resolveCrawlableAccounts({
        accounts: authenticatedAccounts,
        manualAreaId: manualAreaIdOverride,
      });
      const crawlableAccounts = areaResolution.accounts;
      if (areaResolution.mode === "manual") {
        addLog(
          `⚠ 手动 area_id=${manualAreaIdOverride} 已强制应用到 ${crawlableAccounts.length} 个已登录账号`
        );
      } else {
        if (areaResolution.mode === "shared") {
          addLog(
            `批次 area_id 已确认：${areaResolution.pendingCount} 个账号完成共享回填，${crawlableAccounts.length} 个账号可爬取`
          );
        } else if (areaResolution.pendingCount > 0) {
          areaResolution.unavailable.forEach(({ account, reason }) => {
            unavailableAccounts.push({ acc: account, reason });
          });
          addLog(
            areaResolution.mode === "conflict"
              ? `⚠ 同批次检测到 ${areaResolution.distinctAreaIds.length} 个不同的 area_id，未对 ${areaResolution.pendingCount} 个账号执行回填`
              : `✗ 本批次所有已登录账号均未取得 area_id，暂时无法开始角色数据爬取`
          );
        }
      }

      // 只为最终可爬取账号注册 Cookie 隔离规则。
      await registerCookieRules(crawlableAccounts);

      if (crawlableAccounts.length === 0) {
        addLog(`----------------------------`);
        addLog(`没有可用账号，流程结束`);
        const failureReasons = [...new Set(
          unavailableAccounts.map(({ reason }) => reason).filter(Boolean)
        )];
        return {
          calculatorCharacterCount: 0,
          successAccountCount: 0,
          accountDicts: [],
          error:
            failureReasons.join("；")
            || "自动获取 area_id 失败，请在侧栏手动指定后重试",
        };
      }
      
      // ========== 阶段3: 并发爬取数据 ==========
      addLog(`----------------------------`);
      addLog(`[阶段3] 并发爬取 ${crawlableAccounts.length} 个账号数据...`);
      
      const successAccounts = [];
      const calculatorAccountDicts = [];
      const failedAccounts = [...unavailableAccounts.map(({ acc, reason }) => ({ name: acc.username || acc.name || t("noName"), reason }))];
      
      // 单个账号的数据爬取函数
      const crawlAccountData = async (acc) => {
        const accountName = acc.roleInfo?.role_name || acc.username || acc.name || t("noName");
        
        try {
          const { dict } = await crawlWithEmptyDataRetry({
            crawlOnce: async () => {
              // 每次重试都重新构建字典并重新爬取该玩家的全部数据。
              const nextDict = await loadBaseAccountDict(charactersOverride);
              nextDict.name = acc.roleInfo.role_name || acc.username || acc.name || "";
              nextDict.area_id = acc.roleInfo.area_id;
              nextDict.cookie = acc.cookie || "";

              // 解析 game_uid
              const gameUidMatch = acc.cookie?.match(/game_uid=([^;]*)/);
              nextDict.game_uid = acc.game_uid || (gameUidMatch ? gameUidMatch[1] : "");

              // 获取前哨信息
              const {
                synchroLevel,
                outpostLevel,
                researchLevels,
              } = await getOutpostInfoWithAccount(
                acc,
                acc.roleInfo.area_id,
              );
              nextDict.synchroLevel = synchroLevel;
              nextDict.outpostLevel = outpostLevel;
              nextDict.researchLevels = researchLevels;

              // 获取主线进度
              const prog = await getCampaignProgressWithAccount(acc, acc.roleInfo.area_id, catalogMap);
              nextDict.normalProgress = prog.normal || "";
              nextDict.hardProgress = prog.hard || "";

              // 获取角色详情，并保留足够的信息区分合法空结果和异常空响应。
              const characterCrawlSummary =
                await addCharacterDetailsToDictWithAccount(nextDict, acc);
              if (characterCrawlSummary.simulatedStatsFailures?.length) {
                const examples = characterCrawlSummary.simulatedStatsFailures
                  .slice(0, 3)
                  .map(({ name_code, reason }) => `${name_code}: ${reason}`)
                  .join("；");
                addLog(
                  `⚠ ${accountName} - ${characterCrawlSummary.simulatedStatsFailures.length} 个角色模拟属性留空：${examples}`,
                );
              }

              return {
                dict: nextDict,
                characterCrawlSummary,
              };
            },
            onRetry: ({ nextAttempt, maxAttempts, delayMs, reason }) => {
              addLog(
                `⚠ ${accountName} - 检测到异常空数据：${reason}，${delayMs}ms 后重新爬取（${nextAttempt}/${maxAttempts}）`
              );
            },
          });
          
          // 计算 AEL 分
          computeAELForDict(dict);
          
          // 生成 Excel
          const excelBuffer = shouldExportExcel ? await saveDictToExcel(dict, lang) : null;
          
          return { success: true, accountName, dict, excelBuffer, account: acc };
        } catch (err) {
          const failure = serializeCrawlFailure(err);
          return {
            success: false,
            accountName,
            error: failure.message,
            failure,
          };
        }
      };
      
      // 分批并发爬取
      for (let batchStart = 0; batchStart < crawlableAccounts.length; batchStart += BATCH_SIZE) {
        const batch = crawlableAccounts.slice(batchStart, batchStart + BATCH_SIZE);
        
        const batchPromises = batch.map((acc, idx) => {
          const delay = idx * STAGGER_DELAY;
          return (async () => {
            await new Promise(r => setTimeout(r, delay));
            return await crawlAccountData(acc);
          })();
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          if (result.success) {
            successAccounts.push(result.accountName);
            calculatorAccountDicts.push(result.dict);
            addLog(`✓ ${result.accountName} - 数据爬取完成`);

            // 导出文件
            const exportGameUid = result.account?.game_uid
              || result.account?.gameUid
              || parseGameUidFromCookie(result.account?.cookie || "");

            if (shouldExportJson) {
              const jsonName = createUniqueExportFileName({
                accountName: result.accountName,
                gameUid: exportGameUid,
                extension: "json",
                usedNames: usedExportNames,
              });
              if (shouldZip) {
                zip.file(jsonName, JSON.stringify(result.dict, null, 4));
                zipHasFiles = true;
              } else {
                const blob = new Blob([JSON.stringify(result.dict, null, 4)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                chrome.downloads.download({ url, filename: jsonName }, () => URL.revokeObjectURL(url));
              }
            }
            
            if (shouldExportExcel && result.excelBuffer) {
              if (shouldZip) {
                const excelName = createUniqueExportFileName({
                  accountName: result.accountName,
                  gameUid: exportGameUid,
                  extension: "xlsx",
                  usedNames: usedExportNames,
                });
                zip.file(excelName, result.excelBuffer);
                zipHasFiles = true;
              } else {
                const excelName = createUniqueExportFileName({
                  accountName: result.accountName,
                  gameUid: exportGameUid,
                  extension: "xlsx",
                  usedNames: usedExportNames,
                });
                const url = URL.createObjectURL(new Blob([result.excelBuffer], { type: excelMime }));
                chrome.downloads.download({ url, filename: excelName }, () => URL.revokeObjectURL(url));
              }
            }
          } else {
            failedAccounts.push({
              name: result.accountName,
              reason: result.error,
              failure: result.failure,
            });
            addLog(`✗ ${result.accountName} - ${result.error}`);
          }
        }
      }

      if (calculatorAccountDicts.length > 0) {
        const calculatorSnapshot = buildCalculatorSnapshot(calculatorAccountDicts);
        await setCalculatorData(calculatorSnapshot);
        calculatorCharacterCount = calculatorSnapshot.accounts.reduce(
          (sum, account) => sum + account.characters.length,
          0,
        );
        addLog(
          t("calculatorDataUpdated")
            .replace("{accounts}", String(calculatorSnapshot.accounts.length))
            .replace("{characters}", String(calculatorCharacterCount)),
        );
      }

      if (calculatorMode) {
        if (calculatorCharacterCount > 0) {
          if (shouldOpenStandaloneCalculator({
            calculatorMode,
            openCalculator,
            calculatorCharacterCount,
          })) {
            await chrome.tabs.create({ url: chrome.runtime.getURL("calculator.html") });
          }
        } else {
          addLog(t("calculatorNoData"));
        }
      }
      
      // 清理拦截规则
      await unregisterAllRules();
      
      // 导出 ZIP
      if (shouldZip && zipHasFiles) {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        chrome.downloads.download({ url, filename: "accounts.zip" }, () => URL.revokeObjectURL(url));
      }
      
      // 输出统计信息
      addLog(`----------------------------`);
      addLog(`${t("processComplete")}`);
      addLog(`${t("successCount")}: ${successAccounts.length}`);
      if (failedAccounts.length > 0) {
        addLog(`${t("failedCount")}: ${failedAccounts.length}`);
        addLog(`${t("failedAccounts")}:`);
        failedAccounts.forEach(({ name, reason }) => {
          addLog(`  - ${name} (${reason})`);
        });
      }
      
      addLog(t("done"));
      const failureMessage = successAccounts.length === 0
        ? failedAccounts
          .map(({ name, reason }) => `${name}: ${reason}`)
          .filter(Boolean)
          .join("；")
        : "";
      if (successAccounts.length > 0) {
        const nextCircuitState = await recordCrawlCircuitSuccess();
        setCrawlCircuitState(nextCircuitState);
        circuitSettled = true;
      } else {
        const circuitFailures = failedAccounts.map((item) => item.failure).filter(Boolean);
        if (circuitFailures.length > 0) {
          const nextCircuitState = await recordCrawlCircuitFailure(circuitFailures);
          setCrawlCircuitState(nextCircuitState);
          circuitSettled = true;
          const circuitReason = formatCircuitReason(nextCircuitState);
          if (circuitReason) addLog(`⚠ ${circuitReason}`);
        }
      }
      return {
        calculatorCharacterCount,
        successAccountCount: successAccounts.length,
        accountDicts: calculatorAccountDicts,
        error: failureMessage,
      };
    } catch (e) {
      addLog(`[异常] ${e}`);
      addLog(`${t("fail")}${e}`);
      if (fullCrawl) {
        try {
          const nextCircuitState = await recordCrawlCircuitFailure([
            serializeCrawlFailure(e),
          ]);
          setCrawlCircuitState(nextCircuitState);
          circuitSettled = true;
          const circuitReason = formatCircuitReason(nextCircuitState);
          if (circuitReason) addLog(`⚠ ${circuitReason}`);
        } catch (circuitError) {
          console.warn("写入同步保护状态失败:", circuitError);
        }
      }
      // 确保清理规则
      await unregisterAllRules().catch(() => {});
      return {
        calculatorCharacterCount: 0,
        successAccountCount: 0,
        accountDicts: [],
        error: String(e),
      };
    } finally {
      try {
        // 恢复原始cookie
        if (originalCookies) {
          await clearSiteCookies();
          await applyCookieStr(originalCookies);
        }
      } finally {
        if (fullCrawl && circuitPermit?.probe && !circuitSettled) {
          try {
            const nextCircuitState = await recordCrawlCircuitSuccess();
            setCrawlCircuitState(nextCircuitState);
          } catch (error) {
            console.warn("释放同步保护恢复测试失败:", error);
          }
        }
        if (authenticationOnly) {
          setCookieLoading(false);
        } else if (calculatorMode) {
          setCalculatorLoading(false);
        } else {
          setLoading(false);
        }
        crawlRunGateRef.current.leave({ fullCrawl });
      }
    }
  }, [t, lang, saveAsZip, exportJson, server, activateTab, clearLogs, addLog, addDiagnosticLog, addCharacterDetailsToDictWithAccount]);

  const handleDownloadAccountData = useCallback(async (accountDicts) => {
    const dicts = Array.isArray(accountDicts) ? accountDicts.filter(Boolean) : [];
    if (!dicts.length) return { downloadCount: 0 };

    setDownloadLoading(true);
    const usedNames = new Set();
    let downloadCount = 0;
    try {
      for (const dict of dicts) {
        const buffer = await saveDictToExcel(dict, lang);
        const filename = createUniqueExportFileName({
          accountName: dict.name || t("noName"),
          gameUid: dict.game_uid || parseGameUidFromCookie(dict.cookie || ""),
          extension: "xlsx",
          usedNames,
        });
        const url = URL.createObjectURL(new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }));
        await new Promise((resolve, reject) => {
          chrome.downloads.download({ url, filename }, (downloadId) => {
            const error = chrome.runtime.lastError;
            URL.revokeObjectURL(url);
            if (error || downloadId === undefined) {
              reject(new Error(error?.message || "DOWNLOAD_FAILED"));
              return;
            }
            resolve(downloadId);
          });
        });
        downloadCount += 1;
      }
      return { downloadCount };
    } catch (error) {
      addLog(`${t("excelFail")}${error?.message || error}`);
      return { downloadCount, error: String(error?.message || error) };
    } finally {
      setDownloadLoading(false);
    }
  }, [addLog, lang, t]);

  return {
    logs: logState.logs,
    fullLogs: logState.fullLogs,
    loading,
    calculatorLoading,
    cookieLoading,
    downloadLoading,
    crawlCircuitState,
    crawlBlockedReason: formatCircuitReason(crawlCircuitState),
    addLog,
    handleSaveCookie,
    handleStart,
    handleDownloadAccountData,
  };
}

export default useCrawler;
