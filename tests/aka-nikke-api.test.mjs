// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import {
  AkaNikkeApiError,
  AKA_NIKKE_HOST_PERMISSION,
  fetchAkaUserInfo,
  requestAkaHostPermission,
} from "../src/services/akaNikkeApi.js";

const jsonResponse = (payload, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => payload,
});

test("Aka user info request uses the API key header and external-server query parameter", async () => {
  let request = null;
  const data = await fetchAkaUserInfo({
    apiKey: "  test-key  ",
    serverType: 1,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        success: true,
        message: "操作成功",
        data: { playerName: "测试", characterList: [] },
      });
    },
  });

  assert.equal(new URL(request.url).searchParams.get("serverType"), "1");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.headers["X-API-KEY"], "test-key");
  assert.equal(data.playerName, "测试");
});

test("Aka API errors never include the submitted key", async () => {
  const secret = "should-not-leak";
  await assert.rejects(
    fetchAkaUserInfo({
      apiKey: secret,
      fetchImpl: async () => jsonResponse({}, { ok: false, status: 403 }),
    }),
    (error) => {
      assert.ok(error instanceof AkaNikkeApiError);
      assert.equal(error.code, "INVALID_API_KEY");
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

test("Aka API rejects a successful HTTP response with an invalid schema", async () => {
  const secret = "reflected-secret";
  await assert.rejects(
    fetchAkaUserInfo({
      apiKey: secret,
      fetchImpl: async () => jsonResponse({ success: true, message: secret, data: {} }),
    }),
    (error) => {
      assert.ok(error instanceof AkaNikkeApiError);
      assert.equal(error.code, "INVALID_RESPONSE");
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

test("Aka host access is requested as an optional permission", async () => {
  const previousChrome = globalThis.chrome;
  let requestedOrigins = [];
  globalThis.chrome = {
    permissions: {
      request: async ({ origins }) => {
        requestedOrigins = origins;
        return true;
      },
    },
  };
  try {
    assert.equal(await requestAkaHostPermission(), true);
    assert.deepEqual(requestedOrigins, [AKA_NIKKE_HOST_PERMISSION]);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});
