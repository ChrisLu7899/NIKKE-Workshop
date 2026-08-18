// SPDX-License-Identifier: GPL-3.0-or-later

const INTEGER_PATTERN = /^\d+$/;

const KNOWN_AREA_ID_CANDIDATES = Object.freeze({
  hmt: Object.freeze(["91"]),
  global: Object.freeze(["84", "82"]),
});

/**
 * Return conservative fallback candidates for the selected login server family.
 * A candidate must still be verified against the authenticated character-list API
 * before it can be used.
 */
export const getAreaIdProbeCandidates = (server) =>
  [...(KNOWN_AREA_ID_CANDIDATES[String(server || "").toLowerCase()] || [])];

/**
 * Parse an optional manual area_id value.
 * Empty input disables the override; non-empty input must be a positive safe integer.
 */
export const parseManualAreaId = (value) => {
  const input = String(value ?? "").trim();

  if (!input) {
    return {
      empty: true,
      valid: true,
      value: "",
    };
  }

  if (!INTEGER_PATTERN.test(input)) {
    return {
      empty: false,
      valid: false,
      value: "",
    };
  }

  const numericValue = Number(input);
  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    return {
      empty: false,
      valid: false,
      value: "",
    };
  }

  return {
    empty: false,
    valid: true,
    value: String(numericValue),
  };
};

/**
 * Return a new account list with one manual area_id forced onto every account.
 */
export const applyManualAreaIdOverride = (accounts, manualAreaId) => {
  const parsed = parseManualAreaId(manualAreaId);
  if (!parsed.valid || parsed.empty) {
    throw new TypeError("A valid manual area_id is required");
  }

  return (Array.isArray(accounts) ? accounts : []).map((account) => ({
    ...account,
    roleInfo: {
      ...(account?.roleInfo || {}),
      role_name:
        account?.roleInfo?.role_name || account?.username || account?.name || "",
      area_id: parsed.value,
    },
  }));
};
