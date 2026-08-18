// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";

import {
  loginAndCollectBlablalinkSession,
  summarizeBlablalinkCookies,
} from "../src/services/blablalinkSession.js";

const createEvent = (onAdd) => {
  const listeners = new Set();
  return {
    addListener(listener) {
      listeners.add(listener);
      onAdd?.(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
  };
};

test("cookie diagnostics expose metadata without exposing values", () => {
  const summary = summarizeBlablalinkCookies([
    {
      domain: ".blablalink.com",
      path: "/",
      name: "game_token",
      value: "top-secret-token",
      sameSite: "lax",
    },
    {
      domain: ".blablalink.com",
      path: "/",
      name: "game_uid",
      value: "secret-uid",
    },
  ]);

  assert.match(summary, /game_token=present/);
  assert.match(summary, /game_uid=present/);
  assert.match(summary, /game_openid=missing/);
  assert.doesNotMatch(summary, /top-secret-token|secret-uid/);
});

test("login session service owns tab login, token wait and cookie collection", async () => {
  const calls = [];
  const cookies = [
    { domain: ".blablalink.com", path: "/game", name: "game_token", value: "nested" },
    { domain: ".blablalink.com", path: "/", name: "game_token", value: "root" },
    { domain: ".blablalink.com", path: "/", name: "game_uid", value: "uid-42" },
    { domain: ".example.com", path: "/", name: "ignored", value: "ignored" },
  ];
  const chromeApi = {
    tabs: {
      create: async (options) => {
        calls.push(["create", options]);
        return { id: 7 };
      },
      remove: async (tabId) => calls.push(["remove", tabId]),
      onUpdated: createEvent((listener) => {
        queueMicrotask(() => listener(7, { status: "complete" }));
      }),
    },
    scripting: {
      executeScript: async (options) => calls.push(["execute", options.args[0]]),
    },
    cookies: {
      getAll: async () => cookies,
      onChanged: createEvent((listener) => {
        queueMicrotask(() => listener({
          removed: false,
          cookie: {
            domain: ".blablalink.com",
            path: "/",
            name: "game_token",
            value: "root",
          },
        }));
      }),
    },
  };

  const result = await loginAndCollectBlablalinkSession({
    account: { email: "user@example.com", password: "password" },
    server: "global",
    activateTab: true,
    chromeApi,
    clearCookies: async () => calls.push(["clear"]),
    timeoutMs: 100,
    maxAttempts: 1,
  });

  assert.equal(result.attempt, 1);
  assert.equal(result.cookie, "game_token=root; game_uid=uid-42");
  assert.equal(result.gameUid, "uid-42");
  assert.deepEqual(calls[0], ["clear"]);
  assert.deepEqual(calls[1], ["create", {
    url: "https://www.blablalink.com/login",
    active: true,
  }]);
  assert.deepEqual(calls.at(-1), ["remove", 7]);
});
