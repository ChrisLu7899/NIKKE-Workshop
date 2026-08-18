// SPDX-License-Identifier: GPL-3.0-or-later
// 侧栏单账号编辑工具

import {
  isEmptyAccountPlaceholder,
  parseGameOpenIdFromCookie,
  parseGameUidFromCookie,
} from "../domain/account.js";

export const selectCurrentAccountIndex = (accounts) => {
  if (!Array.isArray(accounts) || accounts.length === 0) return -1;
  const enabledIndex = accounts.findIndex(
    (account) => account?.enabled !== false && !isEmptyAccountPlaceholder(account),
  );
  if (enabledIndex >= 0) return enabledIndex;
  return accounts.findIndex((account) => !isEmptyAccountPlaceholder(account));
};

export const buildSingleEnabledAccountList = (
  accounts,
  preferredIndex,
  draft,
  now = Date.now(),
) => {
  const list = Array.isArray(accounts) ? accounts : [];
  const selectedIndex = Number.isInteger(preferredIndex)
    && preferredIndex >= 0
    && preferredIndex < list.length
    ? preferredIndex
    : selectCurrentAccountIndex(list);
  const base = selectedIndex >= 0 ? list[selectedIndex] || {} : {};
  const cookie = String(draft?.cookie ?? "").trim();
  const cookieChanged = cookie !== String(base.cookie || "").trim();

  const currentAccount = {
    ...base,
    username: String(draft?.username ?? "").trim(),
    email: String(draft?.email ?? "").trim(),
    password: String(draft?.password ?? ""),
    cookie,
    game_uid: cookieChanged
      ? parseGameUidFromCookie(cookie)
      : base.game_uid || parseGameUidFromCookie(cookie),
    game_openid: cookieChanged
      ? parseGameOpenIdFromCookie(cookie)
      : base.game_openid || parseGameOpenIdFromCookie(cookie),
    cookieUpdatedAt: cookie
      ? (cookieChanged ? now : base.cookieUpdatedAt ?? base.cookie_updated_at ?? now)
      : null,
    enabled: true,
  };

  const next = list.map((account) => ({ ...account, enabled: false }));
  if (selectedIndex >= 0) next[selectedIndex] = currentAccount;
  else next.push(currentAccount);
  return next;
};
