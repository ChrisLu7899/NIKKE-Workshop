// SPDX-License-Identifier: GPL-3.0-or-later
// BlaBlaLink 浏览器登录与 Cookie 会话获取。该服务不依赖 React 或页面状态。

import { serializeBrowserCookies } from "../domain/account.js";
import { clearSiteCookies } from "./cookie.js";

export const LOGIN_COOKIE_TIMEOUT_MS = 20_000;
export const LOGIN_COOKIE_MAX_ATTEMPTS = 2;
export const REQUIRED_LOGIN_COOKIE_NAMES = Object.freeze([
  "game_token",
  "game_uid",
  "game_openid",
]);

const emitDiagnostic = (onDiagnostic, message) => {
  if (typeof onDiagnostic !== "function") return;
  try {
    onDiagnostic(message);
  } catch {
    // 诊断输出不能影响登录结果。
  }
};

const sanitizeCookieName = (name) => {
  const text = String(name || "");
  if (/^__ss_storage_cookie_cache_/.test(text)) return "__ss_storage_cookie_cache_*";
  return text.length > 48 ? `${text.slice(0, 40)}…` : text;
};

export const summarizeBlablalinkCookies = (cookies) => {
  const relevantCookies = (Array.isArray(cookies) ? cookies : []).filter((cookie) =>
    String(cookie?.domain || "").endsWith("blablalink.com")
  );
  const requiredSummary = REQUIRED_LOGIN_COOKIE_NAMES.map((name) => {
    const matches = relevantCookies.filter((cookie) => cookie.name === name);
    if (matches.length === 0) return `${name}=missing`;
    const metadata = matches
      .map((cookie) => `${cookie.domain}${cookie.path};sameSite=${cookie.sameSite || "unspecified"}`)
      .join("|");
    return `${name}=present(${metadata})`;
  });
  const cookieNames = [...new Set(
    relevantCookies.map((cookie) => sanitizeCookieName(cookie.name)),
  )].sort();
  return `Cookie快照: total=${relevantCookies.length}; ${requiredSummary.join("; ")}; names=[${cookieNames.join(",")}]`;
};

// 该函数会被 chrome.scripting 序列化后放到 BlaBlaLink 登录页执行，不能引用外部变量。
export const fillBlablalinkLoginForm = (loginInfo) => {
  const { email, password, server } = loginInfo;
  const click = (selector) => document.querySelector(selector)?.click();
  const clickXPath = (xpath) => {
    const node = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (node) node.click();
  };
  click("#onetrust-accept-btn-handler");
  const waitFor = (selector, timeout = 5000) => new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (document.querySelector(selector)) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - startedAt > timeout) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
  (async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const targetXPath = server === "hmt"
      ? '//li[.//div[contains(text(), "HK/MC/TW")]]'
      : '//li[.//div[contains(text(), "JP/KR/NA/SEA/Global")]]';
    const dropdownXPath = '//div[contains(@class, "common-btns") and .//span[text()="Select Region"]]';
    const isVisible = (xpath) => {
      const node = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      return node && Boolean(node.offsetParent);
    };
    if (!isVisible(targetXPath)) {
      clickXPath(dropdownXPath);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    clickXPath(targetXPath);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    let ready = await waitFor("#loginPwdForm_account", 2000);
    if (!ready) click(".pass-switchLogin__oper");
    ready = await waitFor("#loginPwdForm_account", 5000);
    if (!ready) return;
    const setValue = (selector, value) => {
      const element = document.querySelector(selector);
      if (!element) return;
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setValue("#loginPwdForm_account", email);
    setValue("#loginPwdForm_password", password);
    click('#loginPwdForm button[type="submit"]');
  })();
};

const waitForTabComplete = (chromeApi, tabId) => new Promise((resolve) => {
  const listener = (id, info) => {
    if (id !== tabId || info.status !== "complete") return;
    chromeApi.tabs.onUpdated.removeListener(listener);
    resolve();
  };
  chromeApi.tabs.onUpdated.addListener(listener);
});

const waitForGameToken = ({
  chromeApi,
  attemptStartedAt,
  timeoutMs,
  now,
  onDiagnostic,
}) => new Promise((resolve, reject) => {
  let timeoutId;
  const cleanup = () => {
    chromeApi.cookies.onChanged.removeListener(onChanged);
    if (timeoutId) clearTimeout(timeoutId);
  };
  const onChanged = (change) => {
    const cookie = change.cookie;
    if (
      change.removed
      || !String(cookie?.domain || "").endsWith("blablalink.com")
      || cookie?.name !== "game_token"
    ) return;
    cleanup();
    const event = {
      domain: cookie.domain,
      path: cookie.path,
      sameSite: cookie.sameSite || "unspecified",
      elapsedMs: now() - attemptStartedAt,
    };
    emitDiagnostic(
      onDiagnostic,
      `检测到 game_token 写入事件: domain=${event.domain}; path=${event.path}; sameSite=${event.sameSite}; attemptElapsed=${event.elapsedMs}ms`,
    );
    resolve(event);
  };
  timeoutId = setTimeout(() => {
    cleanup();
    emitDiagnostic(onDiagnostic, `等待 game_token 超时: timeout=${timeoutMs}ms`);
    reject(new Error("COOKIE_TIMEOUT"));
  }, timeoutMs);
  chromeApi.cookies.onChanged.addListener(onChanged);
});

const closeTab = async (chromeApi, tabId) => {
  if (!tabId) return;
  try {
    await chromeApi.tabs.remove(tabId);
  } catch {
    // 用户可能已经手动关闭登录页。
  }
};

export const loginAndCollectBlablalinkSession = async ({
  account,
  server,
  activateTab = false,
  forceActivateTab = false,
  onDiagnostic,
  onAttempt,
  chromeApi = chrome,
  clearCookies = clearSiteCookies,
  now = () => Date.now(),
  timeoutMs = LOGIN_COOKIE_TIMEOUT_MS,
  maxAttempts = LOGIN_COOKIE_MAX_ATTEMPTS,
}) => {
  const loginStartedAt = now();
  await clearCookies();
  emitDiagnostic(onDiagnostic, "BlaBlaLink Cookie 清理完成");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = now();
    if (typeof onAttempt === "function") {
      onAttempt({ phase: "start", attempt, maxAttempts });
    }
    emitDiagnostic(
      onDiagnostic,
      `登录尝试开始: attempt=${attempt}/${maxAttempts}; server=${server}; activateTab=${Boolean(forceActivateTab || activateTab)}`,
    );
    let tab;
    try {
      tab = await chromeApi.tabs.create({
        url: "https://www.blablalink.com/login",
        active: Boolean(forceActivateTab || activateTab),
      });
      emitDiagnostic(onDiagnostic, `登录标签页已创建: tabId=${tab.id}`);
      await waitForTabComplete(chromeApi, tab.id);
      emitDiagnostic(
        onDiagnostic,
        `登录页加载完成: attemptElapsed=${now() - attemptStartedAt}ms`,
      );
      await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillBlablalinkLoginForm,
        args: [{
          email: account?.email || "",
          password: account?.password || "",
          server,
        }],
      });
      emitDiagnostic(
        onDiagnostic,
        `登录脚本已注入，等待 game_token: attemptElapsed=${now() - attemptStartedAt}ms`,
      );
      const tokenEvent = await waitForGameToken({
        chromeApi,
        attemptStartedAt,
        timeoutMs,
        now,
        onDiagnostic,
      });
      await closeTab(chromeApi, tab?.id);

      const cookies = (await chromeApi.cookies.getAll({}))
        .filter((cookie) => String(cookie?.domain || "").endsWith("blablalink.com"));
      emitDiagnostic(onDiagnostic, summarizeBlablalinkCookies(cookies));
      const cookie = serializeBrowserCookies(cookies);
      const gameToken = cookies.find((item) => item.name === "game_token")?.value || "";
      if (!cookie || !gameToken) throw new Error("登录后未取得 game_token Cookie");
      const gameUid = cookies.find((item) => item.name === "game_uid")?.value || "";
      emitDiagnostic(
        onDiagnostic,
        `Cookie收集完成: serializedCookie=present; serializedCookieCount=${cookie.split(/;\s*/).filter(Boolean).length}; game_uid写回=${gameUid ? "yes" : "no"}`,
      );
      emitDiagnostic(
        onDiagnostic,
        `登录会话返回: attempt=${attempt}; totalElapsed=${now() - loginStartedAt}ms`,
      );
      return {
        attempt,
        tokenEvent,
        totalElapsedMs: now() - loginStartedAt,
        cookies,
        cookie,
        gameUid,
      };
    } catch (error) {
      await closeTab(chromeApi, tab?.id);
      emitDiagnostic(
        onDiagnostic,
        `登录尝试异常: attempt=${attempt}; error=${error?.message || error}; attemptElapsed=${now() - attemptStartedAt}ms`,
      );
      if (attempt < maxAttempts) {
        if (typeof onAttempt === "function") {
          onAttempt({ phase: "retry", attempt, nextAttempt: attempt + 1, maxAttempts, error });
        }
        continue;
      }
      throw error;
    }
  }
  throw new Error("COOKIE_TIMEOUT");
};

