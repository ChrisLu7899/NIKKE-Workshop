import test from "node:test";
import assert from "node:assert/strict";

import {
  isEmptyAccountPlaceholder,
  normalizeStoredAccounts,
  parseGameOpenIdFromCookie,
  parseGameUidFromCookie,
  serializeBrowserCookies,
} from "../src/domain/account.js";

test("account domain parses cookie identity without UI dependencies", () => {
  const cookie = "foo=1; game_uid=uid-9; game_openid=open-9";
  assert.equal(parseGameUidFromCookie(cookie), "uid-9");
  assert.equal(parseGameOpenIdFromCookie(cookie), "open-9");
});

test("stored accounts are normalized through the domain contract", () => {
  const [account] = normalizeStoredAccounts([{
    name: "legacy",
    cookie: "game_uid=42; game_openid=84",
    cookie_updated_at: 123,
  }]);
  assert.equal(account.username, "");
  assert.equal(account.game_uid, "42");
  assert.equal(account.game_openid, "84");
  assert.equal(account.cookieUpdatedAt, 123);
});

test("generated blank rows remain placeholders", () => {
  assert.equal(isEmptyAccountPlaceholder({ enabled: true, cookieUpdatedAt: 1 }), true);
  assert.equal(isEmptyAccountPlaceholder({ email: "user@example.com" }), false);
});

test("browser cookie serialization prefers the root-path value", () => {
  assert.equal(serializeBrowserCookies([
    { name: "game_token", value: "nested", path: "/game" },
    { name: "game_uid", value: "42", path: "/" },
    { name: "game_token", value: "root", path: "/" },
    { name: "", value: "ignored", path: "/" },
  ]), "game_token=root; game_uid=42");
});
