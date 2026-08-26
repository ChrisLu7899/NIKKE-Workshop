// SPDX-License-Identifier: GPL-3.0-or-later

export const AKA_NIKKE_API_ORIGIN = "https://pinkuro.top:9984";
export const AKA_NIKKE_USER_INFO_PATH = "/third/bot/nikke/v1/getUserInfo";
export const AKA_NIKKE_HOST_PERMISSION = "https://pinkuro.top/*";

export class AkaNikkeApiError extends Error {
  constructor(message, { code = "AKA_API_ERROR", status = 0 } = {}) {
    super(message);
    this.name = "AkaNikkeApiError";
    this.code = code;
    this.status = status;
  }
}

function requestErrorMessage(status) {
  if (status === 401 || status === 403) return "API Key 无效或已过期，请在阿卡中使用 #ApiKey 重新获取";
  if (status === 429) return "阿卡接口请求过于频繁，请稍后再试";
  if (status >= 500) return "阿卡服务暂时不可用，请稍后再试";
  return `读取阿卡数据失败（HTTP ${status}）`;
}

export async function requestAkaHostPermission() {
  if (!globalThis.chrome?.permissions?.request) return true;
  const granted = await globalThis.chrome.permissions.request({
    origins: [AKA_NIKKE_HOST_PERMISSION],
  });
  if (!granted) {
    throw new AkaNikkeApiError("需要允许访问阿卡接口后才能读取角色数据", {
      code: "HOST_PERMISSION_DENIED",
    });
  }
  return true;
}

export async function fetchAkaUserInfo({
  apiKey,
  serverType = 0,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedKey = String(apiKey || "").trim();
  if (!normalizedKey) {
    throw new AkaNikkeApiError("请先填写阿卡 API Key", { code: "MISSING_API_KEY" });
  }
  if (typeof fetchImpl !== "function") {
    throw new AkaNikkeApiError("当前环境不支持网络请求", { code: "FETCH_UNAVAILABLE" });
  }

  const url = new URL(AKA_NIKKE_USER_INFO_PATH, AKA_NIKKE_API_ORIGIN);
  if (Number(serverType) === 1) url.searchParams.set("serverType", "1");

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-KEY": normalizedKey,
      },
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new AkaNikkeApiError("无法连接阿卡服务，请检查网络后重试", {
      code: "NETWORK_ERROR",
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // 非 JSON 错误页按 HTTP 状态统一处理，避免把远端内容直接显示给用户。
  }

  if (!response.ok) {
    throw new AkaNikkeApiError(requestErrorMessage(response.status), {
      code: response.status === 401 || response.status === 403 ? "INVALID_API_KEY" : "HTTP_ERROR",
      status: response.status,
    });
  }
  if (payload?.success !== true || !payload?.data || !Array.isArray(payload.data.characterList)) {
    throw new AkaNikkeApiError(
      "阿卡返回的数据格式异常",
      { code: "INVALID_RESPONSE" },
    );
  }

  return payload.data;
}
