// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";

import {
  discoverAccountArea,
  getDistinctAccountAreaIds,
  getSharedAccountAreaId,
  resolveCrawlableAccounts,
} from "../src/services/accountArea.js";

test("account area discovery accepts area_id returned by player information", async () => {
  const calls = [];
  const result = await discoverAccountArea({
    account: { cookie: "game_token=token", username: "stored" },
    server: "global",
    clearCookies: async () => calls.push("clear"),
    applyCookies: async (cookie) => calls.push(`apply:${cookie}`),
    fetchRoleInfo: async () => ({ role_name: "Commander", area_id: "84" }),
    fetchUserCharacters: async () => {
      throw new Error("candidate probing should not run");
    },
  });

  assert.deepEqual(calls, ["clear", "apply:game_token=token"]);
  assert.deepEqual(result, {
    success: true,
    areaId: "84",
    roleInfo: { role_name: "Commander", area_id: "84" },
    probedAreaIds: [],
  });
});

test("account area discovery probes the selected server family in order", async () => {
  const probed = [];
  const result = await discoverAccountArea({
    account: { cookie: "game_token=token", username: "stored" },
    server: "global",
    clearCookies: async () => {},
    applyCookies: async () => {},
    fetchRoleInfo: async () => ({ role_name: "Commander", area_id: "" }),
    fetchUserCharacters: async (areaId) => {
      probed.push(areaId);
      return areaId === "82" ? [{ id: 1 }] : [];
    },
  });

  assert.deepEqual(probed, ["84", "82"]);
  assert.equal(result.success, true);
  assert.equal(result.areaId, "82");
  assert.deepEqual(result.probedAreaIds, [
    { areaId: "84", characterCount: 0, success: true },
    { areaId: "82", characterCount: 1, success: true },
  ]);
});

test("account area helpers report unique and shared values", () => {
  const accounts = [
    { roleInfo: { area_id: "84" } },
    { roleInfo: { area_id: "84" } },
    { roleInfo: { area_id: "" } },
  ];
  assert.deepEqual(getDistinctAccountAreaIds(accounts), ["84"]);
  assert.equal(getSharedAccountAreaId(accounts), "84");
});

test("crawlable account resolution safely fills one shared area_id", () => {
  const result = resolveCrawlableAccounts({
    accounts: [
      { id: "known", roleInfo: { role_name: "Known", area_id: "84" } },
      { id: "pending", username: "Pending", roleInfo: { area_id: "" } },
    ],
  });

  assert.equal(result.mode, "shared");
  assert.equal(result.pendingCount, 1);
  assert.deepEqual(result.accounts.map((account) => account.roleInfo), [
    { role_name: "Known", area_id: "84" },
    { role_name: "Pending", area_id: "84" },
  ]);
  assert.deepEqual(result.unavailable, []);
});

test("crawlable account resolution does not guess across conflicting areas", () => {
  const pending = { id: "pending", username: "Pending", roleInfo: { area_id: "" } };
  const result = resolveCrawlableAccounts({
    accounts: [
      { id: "global", roleInfo: { area_id: "84" } },
      { id: "north-america", roleInfo: { area_id: "82" } },
      pending,
    ],
  });

  assert.equal(result.mode, "conflict");
  assert.deepEqual(result.accounts.map((account) => account.id), ["global", "north-america"]);
  assert.equal(result.unavailable.length, 1);
  assert.equal(result.unavailable[0].account, pending);
});

test("manual area_id overrides every account", () => {
  const result = resolveCrawlableAccounts({
    accounts: [
      { id: "one", roleInfo: { area_id: "84" } },
      { id: "two" },
    ],
    manualAreaId: "91",
  });

  assert.equal(result.mode, "manual");
  assert.deepEqual(result.accounts.map((account) => account.roleInfo.area_id), ["91", "91"]);
});
