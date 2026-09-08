// SPDX-License-Identifier: GPL-3.0-or-later
import { RELEASE_API, UPDATE_KEY, CHECK_INTERVAL, parseRelease } from './update-policy.js';
let checkPending;
const read = async () => (await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY] || {};
async function performCheck(force) {
  const old = await read(), now = Date.now();
  if (now < (old.retryAt || 0) || now - (old.checkedAt || 0) < (force ? 60000 : CHECK_INTERVAL)) return old;
  const next = { ...old, checkedAt: now, error: null, retryAt: 0 };
  try {
    const response = await fetch(RELEASE_API, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      const limited = response.status === 403 || response.status === 429;
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      const retry = Number(response.headers.get('retry-after')) * 1000 + now;
      next.retryAt = limited ? Math.max(now + 3600000, Math.min(Math.max(reset || 0, retry || 0), now + CHECK_INTERVAL)) : now + 300000;
      throw new Error(limited ? 'GitHub 请求受限，请在冷却结束后重试。' : `GitHub 返回 ${response.status}，请稍后重试。`);
    }
    next.release = parseRelease(await response.json());
    next.successAt = now;
  } catch (error) {
    next.error = error.name === 'TimeoutError' ? '检测超时，请检查网络后重试。' : error.message || '无法连接 GitHub，请检查网络后重试。';
  }
  // Only release metadata, never account details or credentials.
  await chrome.storage.local.set({ [UPDATE_KEY]: next });
  return next;
}
export function checkUpdate(force = false) {
  if (!checkPending) checkPending = performCheck(force).finally(() => { checkPending = null; });
  return checkPending;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) || message?.type !== 'workshop.update.check') return;
  checkUpdate(Boolean(message.force)).then(respond, () => respond({ error: '更新状态保存失败，请重试。' }));
  return true;
});
const schedule = () => {
  chrome.alarms.create('workshop.update.check', { periodInMinutes: 60 });
  checkUpdate().catch(() => undefined);
};
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'workshop.update.check') checkUpdate().catch(() => undefined);
});
