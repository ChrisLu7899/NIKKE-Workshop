import test from "node:test";
import assert from "node:assert/strict";

import {
  BLABLALINK_LOGIN_URL,
  deriveBlablalinkLoginState,
  getBlablalinkBrowserCookies,
  openBlablalinkLogin,
} from "../src/services/blablalinkLogin.js";

test("login state is logged out without a game token", () => {
  const state = deriveBlablalinkLoginState([
    { domain: ".blablalink.com", name: "game_uid", value: "uid-1" },
  ]);

  assert.equal(state.loggedIn, false);
  assert.equal(state.username, "");
});

test("login state matches the stored account by game uid", () => {
  const state = deriveBlablalinkLoginState(
    [
      { domain: ".blablalink.com", name: "game_token", value: "token-1" },
      { domain: ".blablalink.com", name: "game_uid", value: "uid-1" },
    ],
    [
      { username: "旧账号", game_uid: "uid-old", cookie: "game_token=old" },
      { username: "皇冠", game_uid: "uid-1", cookie: "game_token=token-1" },
    ],
  );

  assert.equal(state.loggedIn, true);
  assert.equal(state.username, "皇冠");
  assert.equal(state.gameUid, "uid-1");
});

test("login state does not show an unrelated enabled account", () => {
  const state = deriveBlablalinkLoginState(
    [{ domain: ".blablalink.com", name: "game_token", value: "new-token" }],
    [{ username: "旧账号", enabled: true, cookie: "game_token=old-token" }],
  );

  assert.equal(state.loggedIn, true);
  assert.equal(state.username, "");
});

test("browser cookie reader keeps only Blablalink cookies", async () => {
  const chromeApi = {
    cookies: {
      getAll: async () => [
        { domain: ".blablalink.com", name: "game_token", value: "token" },
        { domain: ".example.com", name: "unrelated", value: "value" },
      ],
    },
  };

  const cookies = await getBlablalinkBrowserCookies(chromeApi);
  assert.deepEqual(cookies.map((cookie) => cookie.name), ["game_token"]);
});

test("manual sign-in opens the Blablalink login page in an active tab", async () => {
  let createOptions;
  const chromeApi = {
    tabs: {
      create: async (options) => {
        createOptions = options;
        return { id: 7, ...options };
      },
    },
  };

  await openBlablalinkLogin(chromeApi);
  assert.deepEqual(createOptions, {
    url: BLABLALINK_LOGIN_URL,
    active: true,
  });
});
