import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSingleEnabledAccountList,
  selectCurrentAccountIndex,
} from "../src/utils/singleAccount.js";

test("side panel selects the first enabled non-empty account", () => {
  const accounts = [
    { enabled: true },
    { username: "disabled", enabled: false },
    { username: "current", enabled: true },
  ];
  assert.equal(selectCurrentAccountIndex(accounts), 2);
});

test("saving side-panel account keeps other records but enables only the current one", () => {
  const accounts = [
    { username: "old", cookie: "game_uid=1", enabled: true },
    { username: "backup", cookie: "game_uid=2", enabled: true },
  ];
  const next = buildSingleEnabledAccountList(
    accounts,
    0,
    {
      username: " current ",
      email: " user@example.com ",
      password: "secret",
      cookie: "game_uid=9; game_openid=open-9",
    },
    123456,
  );

  assert.equal(next.length, 2);
  assert.deepEqual(next[0], {
    username: "current",
    email: "user@example.com",
    password: "secret",
    cookie: "game_uid=9; game_openid=open-9",
    game_uid: "9",
    game_openid: "open-9",
    cookieUpdatedAt: 123456,
    enabled: true,
  });
  assert.equal(next[1].username, "backup");
  assert.equal(next[1].enabled, false);
});

test("saving an empty store creates one enabled account", () => {
  const next = buildSingleEnabledAccountList([], -1, {
    username: "new",
    email: "",
    password: "",
    cookie: "",
  });
  assert.equal(next.length, 1);
  assert.equal(next[0].username, "new");
  assert.equal(next[0].enabled, true);
  assert.equal(next[0].cookieUpdatedAt, null);
});
