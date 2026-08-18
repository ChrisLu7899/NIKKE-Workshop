import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyAccountImportHeader,
  isEmptyAccountPlaceholder,
  normalizeImportedCookieTimestamp,
  normalizeStoredAccounts,
  parseGameUidFromCookie,
  parseGameOpenIdFromCookie,
} from "../src/components/management/utils.js";

test("账号 Excel 导入会区分 Cookie 和 Cookie 更新时间", () => {
  assert.equal(classifyAccountImportHeader("Cookie"), "cookie");
  assert.equal(classifyAccountImportHeader("Cookie 更新时间"), "cookieUpdatedAt");
  assert.equal(classifyAccountImportHeader("Cookie Updated At"), "cookieUpdatedAt");
});

test("账号 Cookie 更新时间兼容数字、日期和空值", () => {
  assert.equal(normalizeImportedCookieTimestamp(""), null);
  assert.equal(normalizeImportedCookieTimestamp("1720000000000"), 1720000000000);
  assert.equal(
    normalizeImportedCookieTimestamp(new Date("2026-08-16T00:00:00Z")),
    Date.parse("2026-08-16T00:00:00Z"),
  );
});

test("账号导入会移除默认空白占位行但保留任何已填写账号", () => {
  assert.equal(isEmptyAccountPlaceholder(null), true);
  assert.equal(isEmptyAccountPlaceholder({ enabled: true, cookieUpdatedAt: 123 }), true);
  assert.equal(isEmptyAccountPlaceholder({ username: "  ", email: "", password: "", cookie: "" }), true);
  assert.equal(isEmptyAccountPlaceholder({ username: "alice" }), false);
  assert.equal(isEmptyAccountPlaceholder({ email: "alice@example.com" }), false);
  assert.equal(isEmptyAccountPlaceholder({ password: "secret" }), false);
  assert.equal(isEmptyAccountPlaceholder({ cookie: "game_uid=123" }), false);
  assert.equal(isEmptyAccountPlaceholder({ game_uid: "123" }), false);
});

test("normalizeStoredAccounts returns an empty array for malformed storage payloads", () => {
  assert.deepEqual(normalizeStoredAccounts(null), []);
  assert.deepEqual(normalizeStoredAccounts({ broken: true }), []);
  assert.deepEqual(normalizeStoredAccounts("oops"), []);
});

test("normalizeStoredAccounts backfills account identifiers from cookie fields", () => {
  const [account] = normalizeStoredAccounts([
    {
      username: "alice",
      cookie: "foo=1; game_uid=12345; game_openid=openid-9; bar=2",
    },
  ]);

  assert.equal(account.username, "alice");
  assert.equal(account.email, "");
  assert.equal(account.password, "");
  assert.equal(account.game_uid, "12345");
  assert.equal(account.game_openid, "openid-9");
  assert.equal(account.cookieUpdatedAt, null);
});

test("cookie parsers ignore unrelated fields", () => {
  const cookie = "foo=1; bar=2";
  assert.equal(parseGameUidFromCookie(cookie), "");
  assert.equal(parseGameOpenIdFromCookie(cookie), "");
});
