import test from "node:test";
import assert from "node:assert/strict";

import {
  acquireCrawlCircuitPermit,
  classifyCrawlFailure,
  createCrawlRunGate,
  recordCrawlCircuitFailure,
  recordCrawlCircuitSuccess,
} from "../src/services/crawlSafety.js";

const createMemoryStorage = (initial = null) => {
  let value = initial;
  return {
    get: async () => value,
    set: async (next) => { value = next; },
    peek: () => value,
  };
};

test("crawl gate blocks overlapping network tasks", () => {
  const gate = createCrawlRunGate({ cooldownMs: 1000, now: () => 100 });
  assert.equal(gate.tryEnter({ fullCrawl: true }).allowed, true);
  const duplicate = gate.tryEnter({ fullCrawl: true });
  assert.equal(duplicate.allowed, false);
  assert.match(duplicate.reason, /正在运行/);
});

test("crawl gate applies cooldown only to full data fetches", () => {
  let timestamp = 1000;
  const gate = createCrawlRunGate({ cooldownMs: 5000, now: () => timestamp });
  assert.equal(gate.tryEnter({ fullCrawl: true }).allowed, true);
  gate.leave({ fullCrawl: true });

  timestamp = 3000;
  const early = gate.tryEnter({ fullCrawl: true });
  assert.equal(early.allowed, false);
  assert.equal(early.waitMs, 3000);

  const auth = gate.tryEnter({ fullCrawl: false });
  assert.equal(auth.allowed, true);
  gate.leave({ fullCrawl: false });

  timestamp = 6000;
  assert.equal(gate.tryEnter({ fullCrawl: true }).allowed, true);
});

test("crawl circuit opens immediately for rate limiting and honors Retry-After", async () => {
  const storage = createMemoryStorage();
  const now = () => 10_000;
  const state = await recordCrawlCircuitFailure([
    { status: 429, message: "Too Many Requests", retryAfterMs: 45 * 60_000 },
  ], { storage, now });
  assert.equal(state.status, "open");
  assert.equal(state.blockedUntil, 10_000 + 45 * 60_000);
  const permit = await acquireCrawlCircuitPermit({ storage, now });
  assert.equal(permit.allowed, false);
  assert.match(permit.reason, /限流/);
});

test("crawl circuit requires two consecutive transient failures", async () => {
  const storage = createMemoryStorage();
  const first = await recordCrawlCircuitFailure(
    [{ message: "network fetch failed" }],
    { storage, now: () => 1000 },
  );
  assert.equal(first.status, "closed");
  assert.equal(first.consecutiveTransientFailures, 1);
  const second = await recordCrawlCircuitFailure(
    [{ status: 503, message: "503 Service Unavailable" }],
    { storage, now: () => 2000 },
  );
  assert.equal(second.status, "open");
  await recordCrawlCircuitSuccess({ storage, now: () => 3000 });
  assert.equal(storage.peek().consecutiveTransientFailures, 0);
});

test("crawl circuit classifies abnormal empty data but ignores login errors", () => {
  assert.equal(classifyCrawlFailure({ code: "EMPTY_CRAWL_DATA" }).kind, "emptyData");
  assert.equal(classifyCrawlFailure({ message: "Cookie 登录态验证失败" }).kind, "ignored");
});

test("stale half-open recovery lease cannot block synchronization forever", async () => {
  const storage = createMemoryStorage({
    status: "half-open",
    blockedUntil: 0,
    reason: "恢复测试",
    consecutiveTransientFailures: 0,
    updatedAt: 1000,
  });
  const permit = await acquireCrawlCircuitPermit({
    storage,
    now: () => 1000 + 5 * 60_000 + 1,
  });
  assert.equal(permit.allowed, true);
  assert.equal(permit.probe, true);
});
