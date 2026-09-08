// SPDX-License-Identifier: GPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { buildCharacterCardFilename, withCardExportDeadline } from "../src/utils/characterCardDownload.js";

test("character card download uses a stable readable filename", () => {
  assert.equal(buildCharacterCardFilename("灰姑娘"), "灰姑娘-角色卡.png");
  assert.equal(buildCharacterCardFilename("拉毗：赤焰/代码"), "拉毗：赤焰-代码-角色卡.png");
});

test("character card download filename has a safe fallback", () => {
  assert.equal(buildCharacterCardFilename("<>:\"/\\|?*"), "妮姬-角色卡.png");
  assert.equal(buildCharacterCardFilename("   "), "妮姬-角色卡.png");
});

test("export deadline cancels stalled resources and allows a later retry", async () => {
  let aborted = false;
  await assert.rejects(withCardExportDeadline((signal) => new Promise(() => {
    signal.addEventListener("abort", () => { aborted = true; }, { once: true });
  }), { timeoutMs: 10 }), /超时/);
  assert.equal(aborted, true);
  assert.equal(await withCardExportDeadline(async () => "retry-success"), "retry-success");
});

test("export can be cancelled before work or during rendering", async () => {
  const before = new AbortController();
  before.abort(new Error("cancelled-before"));
  let called = false;
  await assert.rejects(withCardExportDeadline(() => { called = true; }, { signal: before.signal }), /cancelled-before/);
  assert.equal(called, false);
  const during = new AbortController();
  const promise = withCardExportDeadline(() => new Promise(() => {}), { signal: during.signal });
  during.abort(new Error("cancelled-during"));
  await assert.rejects(promise, /cancelled-during/);
});
