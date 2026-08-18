// SPDX-License-Identifier: GPL-3.0-or-later
// 抓取任务准入控制。只限制网络抓取，不影响下载已缓存数据。

export const DEFAULT_FULL_CRAWL_COOLDOWN_MS = 60_000;

export const CRAWL_CIRCUIT_STORAGE_KEY = "crawlCircuitBreakerV1";

export const CRAWL_CIRCUIT_DURATIONS_MS = Object.freeze({
  rateLimit: 30 * 60_000,
  forbidden: 60 * 60_000,
  emptyData: 15 * 60_000,
  transient: 10 * 60_000,
});

const TRANSIENT_FAILURE_THRESHOLD = 2;
const HALF_OPEN_LEASE_MS = 5 * 60_000;

const emptyCircuitState = () => ({
  status: "closed",
  blockedUntil: 0,
  reason: "",
  consecutiveTransientFailures: 0,
  updatedAt: 0,
});

const normalizeCircuitState = (value) => ({
  ...emptyCircuitState(),
  ...(value && typeof value === "object" ? value : {}),
  blockedUntil: Number(value?.blockedUntil) || 0,
  consecutiveTransientFailures: Math.max(
    0,
    Number(value?.consecutiveTransientFailures) || 0,
  ),
});

const defaultStorage = {
  get: () => new Promise((resolve) => {
    chrome.storage.local.get(CRAWL_CIRCUIT_STORAGE_KEY, (result) => {
      resolve(result?.[CRAWL_CIRCUIT_STORAGE_KEY]);
    });
  }),
  set: (value) => new Promise((resolve) => {
    chrome.storage.local.set({ [CRAWL_CIRCUIT_STORAGE_KEY]: value }, resolve);
  }),
};

export const formatCircuitReason = (state, now = Date.now()) => {
  const normalized = normalizeCircuitState(state);
  if (
    normalized.status === "half-open"
    && now - normalized.updatedAt < HALF_OPEN_LEASE_MS
  ) {
    return "同步保护正在进行一次恢复测试，请稍后重试";
  }
  const waitMs = Math.max(0, normalized.blockedUntil - now);
  if (normalized.status !== "open" || waitMs <= 0) return "";
  const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
  return `同步保护已暂停请求：${normalized.reason || "服务异常"}，约 ${minutes} 分钟后可重试`;
};

export const classifyCrawlFailure = (failures) => {
  const list = (Array.isArray(failures) ? failures : [failures]).filter(Boolean);
  const messages = list.map((failure) => String(
    failure?.message || failure?.error || failure?.reason || failure || "",
  ));
  const statuses = list.map((failure) => Number(failure?.status || failure?.httpStatus || 0));
  const codes = list.map((failure) => String(failure?.code || failure?.errorCode || ""));
  const combined = `${messages.join(" ")} ${codes.join(" ")}`;
  const retryAfterMs = Math.max(
    0,
    ...list.map((failure) => Number(failure?.retryAfterMs) || 0),
  );

  if (statuses.includes(429) || /\b429\b|too many requests|rate.?limit|请求过于频繁/i.test(combined)) {
    return { kind: "rateLimit", reason: "服务端限流", retryAfterMs };
  }
  if (statuses.includes(403) || /\b403\b|forbidden/i.test(combined)) {
    return { kind: "forbidden", reason: "服务端拒绝访问", retryAfterMs };
  }
  if (codes.includes("EMPTY_CRAWL_DATA") || /玩家持有角色列表为空|没有返回任何详情|没有写入任何配置角色|异常空数据/i.test(combined)) {
    return { kind: "emptyData", reason: "连续取得异常空数据", retryAfterMs };
  }
  if (
    statuses.some((status) => status >= 500)
    || /\b5\d\d\b|timeout|timed out|network|fetch failed|网络异常|连接失败|ERR_/i.test(combined)
  ) {
    return { kind: "transient", reason: "连续网络或服务器异常", retryAfterMs };
  }
  return { kind: "ignored", reason: "", retryAfterMs: 0 };
};

export const getCrawlCircuitState = async ({ storage = defaultStorage } = {}) => (
  normalizeCircuitState(await storage.get())
);

export const acquireCrawlCircuitPermit = async ({
  storage = defaultStorage,
  now = () => Date.now(),
} = {}) => {
  const timestamp = now();
  const state = await getCrawlCircuitState({ storage });
  if (state.status === "open" && state.blockedUntil > timestamp) {
    return {
      allowed: false,
      state,
      waitMs: state.blockedUntil - timestamp,
      reason: formatCircuitReason(state, timestamp),
    };
  }
  if (
    state.status === "half-open"
    && timestamp - state.updatedAt < HALF_OPEN_LEASE_MS
  ) {
    return {
      allowed: false,
      state,
      waitMs: 0,
      reason: "同步保护正在进行一次恢复测试，请稍后重试",
    };
  }
  if (state.status === "open" || state.status === "half-open") {
    const halfOpen = { ...state, status: "half-open", blockedUntil: 0, updatedAt: timestamp };
    await storage.set(halfOpen);
    return { allowed: true, state: halfOpen, probe: true, waitMs: 0, reason: "" };
  }
  return { allowed: true, state, probe: false, waitMs: 0, reason: "" };
};

export const recordCrawlCircuitSuccess = async ({
  storage = defaultStorage,
  now = () => Date.now(),
} = {}) => {
  const next = { ...emptyCircuitState(), updatedAt: now() };
  await storage.set(next);
  return next;
};

export const recordCrawlCircuitFailure = async (failures, {
  storage = defaultStorage,
  now = () => Date.now(),
} = {}) => {
  const timestamp = now();
  const state = await getCrawlCircuitState({ storage });
  const classification = classifyCrawlFailure(failures);
  if (classification.kind === "ignored") {
    if (state.status !== "half-open") return state;
    const next = { ...emptyCircuitState(), updatedAt: timestamp };
    await storage.set(next);
    return next;
  }

  const transientCount = classification.kind === "transient"
    ? state.consecutiveTransientFailures + 1
    : 0;
  const shouldOpen = classification.kind !== "transient"
    || transientCount >= TRANSIENT_FAILURE_THRESHOLD
    || state.status === "half-open";

  if (!shouldOpen) {
    const next = {
      ...emptyCircuitState(),
      consecutiveTransientFailures: transientCount,
      updatedAt: timestamp,
    };
    await storage.set(next);
    return next;
  }

  const configuredDuration = CRAWL_CIRCUIT_DURATIONS_MS[classification.kind]
    || CRAWL_CIRCUIT_DURATIONS_MS.transient;
  const durationMs = Math.max(configuredDuration, classification.retryAfterMs || 0);
  const next = {
    status: "open",
    blockedUntil: timestamp + durationMs,
    reason: classification.reason,
    consecutiveTransientFailures: transientCount,
    updatedAt: timestamp,
  };
  await storage.set(next);
  return next;
};

export const createCrawlRunGate = ({
  cooldownMs = DEFAULT_FULL_CRAWL_COOLDOWN_MS,
  now = () => Date.now(),
} = {}) => {
  let active = false;
  let lastFullCrawlFinishedAt = 0;

  return {
    tryEnter({ fullCrawl = true } = {}) {
      if (active) {
        return { allowed: false, reason: "已有数据任务正在运行", waitMs: 0 };
      }
      const currentTime = now();
      const elapsed = currentTime - lastFullCrawlFinishedAt;
      const waitMs = fullCrawl && lastFullCrawlFinishedAt > 0
        ? Math.max(0, cooldownMs - elapsed)
        : 0;
      if (waitMs > 0) {
        return {
          allowed: false,
          reason: `请求过于频繁，请 ${Math.ceil(waitMs / 1000)} 秒后重试`,
          waitMs,
        };
      }
      active = true;
      return { allowed: true, reason: "", waitMs: 0 };
    },

    leave({ fullCrawl = true } = {}) {
      if (!active) return;
      active = false;
      if (fullCrawl) lastFullCrawlFinishedAt = now();
    },

    isActive() {
      return active;
    },
  };
};
