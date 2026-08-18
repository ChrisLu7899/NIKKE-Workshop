// SPDX-License-Identifier: GPL-3.0-or-later
// BlaBlaLink 手动登录入口与浏览器登录态识别。

import {
  parseCookieValue,
  parseGameOpenIdFromCookie,
  parseGameUidFromCookie,
} from "../domain/account.js";

export const BLABLALINK_LOGIN_URL = "https://www.blablalink.com/login";

const isBlablalinkCookie = (cookie) =>
  String(cookie?.domain || "").endsWith("blablalink.com");

export const getBlablalinkBrowserCookies = async (chromeApi = chrome) => {
  const cookies = await chromeApi.cookies.getAll({});
  return cookies.filter(isBlablalinkCookie);
};

const findMatchingAccount = (accounts, { gameUid, gameOpenId, gameToken }) => {
  const source = Array.isArray(accounts) ? accounts : [];
  return source.find((account) => {
    const storedCookie = String(account?.cookie || "");
    const storedGameUid = String(
      account?.game_uid || account?.gameUid || parseGameUidFromCookie(storedCookie),
    );
    const storedGameOpenId = String(
      account?.game_openid
      || account?.gameOpenId
      || parseGameOpenIdFromCookie(storedCookie),
    );
    const storedGameToken = parseCookieValue(storedCookie, "game_token");

    if (gameUid && storedGameUid) return gameUid === storedGameUid;
    if (gameOpenId && storedGameOpenId) return gameOpenId === storedGameOpenId;
    return Boolean(gameToken && storedGameToken && gameToken === storedGameToken);
  });
};

export const deriveBlablalinkLoginState = (cookies, accounts = []) => {
  const source = Array.isArray(cookies) ? cookies.filter(isBlablalinkCookie) : [];
  const readCookie = (name) =>
    String(source.find((cookie) => cookie?.name === name)?.value || "");
  const gameToken = readCookie("game_token");
  const gameUid = readCookie("game_uid");
  const gameOpenId = readCookie("game_openid");

  if (!gameToken) {
    return {
      loggedIn: false,
      username: "",
      gameUid,
      gameOpenId,
    };
  }

  const account = findMatchingAccount(accounts, { gameUid, gameOpenId, gameToken });
  return {
    loggedIn: true,
    username: String(account?.roleInfo?.role_name || account?.username || account?.name || ""),
    gameUid,
    gameOpenId,
  };
};

export const openBlablalinkLogin = (chromeApi = chrome) =>
  chromeApi.tabs.create({
    url: BLABLALINK_LOGIN_URL,
    active: true,
  });
