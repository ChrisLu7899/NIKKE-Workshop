// SPDX-License-Identifier: GPL-3.0-or-later
// 账号与 Cookie 的领域模型。该模块不依赖 React、Chrome API 或任何页面组件。

export const parseCookieValue = (cookieStr, name) => {
  if (!cookieStr || !name) return "";
  const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(cookieStr).match(
    new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`),
  );
  return match ? match[1] : "";
};

export const parseGameUidFromCookie = (cookieStr) =>
  parseCookieValue(cookieStr, "game_uid");

export const parseGameOpenIdFromCookie = (cookieStr) =>
  parseCookieValue(cookieStr, "game_openid");

/**
 * 将 Chrome Cookie 记录序列化为账号存储使用的字符串。
 * 同名 Cookie 优先保留根路径，避免页面组件各自实现覆盖规则。
 */
export const serializeBrowserCookies = (cookies) => {
  const values = new Map();
  (Array.isArray(cookies) ? cookies : []).forEach((cookie) => {
    const name = String(cookie?.name || "");
    if (!name) return;
    if (!values.has(name) || cookie?.path === "/") {
      values.set(name, String(cookie?.value ?? ""));
    }
  });
  return [...values.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
};

/**
 * enabled 和 Cookie 更新时间不是账号内容，不能单独让空行变成有效账号。
 */
export const isEmptyAccountPlaceholder = (account) => {
  if (!account || typeof account !== "object") return true;
  const meaningfulFields = [
    "username",
    "name",
    "email",
    "password",
    "cookie",
    "game_uid",
    "gameUid",
    "game_openid",
    "gameOpenId",
  ];
  return meaningfulFields.every(
    (field) => String(account[field] ?? "").trim() === "",
  );
};

/**
 * 统一历史账号字段，作为存储层、侧栏和抓取层之间的内部数据契约。
 */
export const normalizeStoredAccounts = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((account) => {
    const nextAccount = account && typeof account === "object" ? account : {};
    const cookie = nextAccount.cookie || "";
    return {
      ...nextAccount,
      username: nextAccount.username || "",
      email: nextAccount.email || "",
      password: nextAccount.password || "",
      cookie,
      game_uid:
        nextAccount.game_uid
        || nextAccount.gameUid
        || parseGameUidFromCookie(cookie),
      game_openid:
        nextAccount.game_openid
        || nextAccount.gameOpenId
        || parseGameOpenIdFromCookie(cookie),
      cookieUpdatedAt:
        nextAccount.cookieUpdatedAt
        ?? nextAccount.cookie_updated_at
        ?? null,
    };
  });
};
