// SPDX-License-Identifier: GPL-3.0-or-later
// 账号角色数据的纯领域转换，不直接访问网络、存储或 UI。

const toCode = (value) => String(value ?? "").trim();

export const collectConfiguredCharacterCodes = (dict) => {
  const codes = [];
  Object.values(dict?.elements || {}).forEach((characters) => {
    if (!Array.isArray(characters)) return;
    characters.forEach((character) => {
      const code = toCode(character?.name_code);
      if (code) codes.push(code);
    });
  });
  return [...new Set(codes)];
};

export const createCharacterCrawlSummary = (configuredCharacterCount = 0) => ({
  configuredCharacterCount,
  ownedCharacterCount: 0,
  requestedCharacterCount: 0,
  receivedDetailCount: 0,
  populatedCharacterCount: 0,
  simulatedStatsCount: 0,
  simulatedStatsFailures: [],
});

export const planOwnedCharacterDetails = (configuredCodes, userCharacters) => {
  const roster = Array.isArray(userCharacters) ? userCharacters : [];
  const ownedCodes = new Set(
    roster.map((character) => toCode(character?.name_code)).filter(Boolean),
  );
  return (Array.isArray(configuredCodes) ? configuredCodes : [])
    .map(toCode)
    .filter((code) => code && ownedCodes.has(code));
};

export const getFavoriteItemRarity = (favoriteItemTid) => {
  if (!favoriteItemTid) return "";
  const tid = String(favoriteItemTid);
  const firstDigit = Number.parseInt(tid.charAt(0), 10);
  const lastDigit = Number.parseInt(tid.charAt(tid.length - 1), 10);
  if (firstDigit === 2) return "SSR";
  if (firstDigit === 1) {
    if (lastDigit === 1) return "R";
    if (lastDigit === 2) return "SR";
  }
  return "";
};

/**
 * 把持有列表和详情响应合并到导出字典。GetUserCharacters 是持有状态、
 * 等级和突破信息的权威来源；详情接口负责技能、好感度、装备和魔方。
 */
export const applyCharacterAccountData = ({
  dict,
  configuredCodes,
  userCharacters,
  characterDetails,
}) => {
  const roster = Array.isArray(userCharacters) ? userCharacters : [];
  const detailsList = Array.isArray(characterDetails) ? characterDetails : [];
  const normalizedConfiguredCodes = Array.isArray(configuredCodes)
    ? [...new Set(configuredCodes.map(toCode).filter(Boolean))]
    : collectConfiguredCharacterCodes(dict);
  const requestedCodes = planOwnedCharacterDetails(
    normalizedConfiguredCodes,
    roster,
  );
  const summary = createCharacterCrawlSummary(normalizedConfiguredCodes.length);
  summary.ownedCharacterCount = new Set(
    roster.map((character) => toCode(character?.name_code)).filter(Boolean),
  ).size;
  summary.requestedCharacterCount = requestedCodes.length;

  const rosterByCode = new Map(
    roster
      .map((character) => [toCode(character?.name_code), character])
      .filter(([code]) => code),
  );
  const detailsByCode = new Map(
    detailsList
      .map((detail) => [toCode(detail?.name_code), detail])
      .filter(([code]) => code),
  );
  summary.receivedDetailCount = detailsByCode.size;
  const populatedCodes = new Set();

  Object.values(dict?.elements || {}).forEach((characters) => {
    if (!Array.isArray(characters)) return;
    characters.forEach((target) => {
      const code = toCode(target?.name_code);
      if (!code) return;
      const rosterEntry = rosterByCode.get(code);
      const detail = detailsByCode.get(code);

      target.is_owned = Boolean(rosterEntry);
      if (rosterEntry) {
        target.level = rosterEntry.lv ?? 0;
        target.combat = rosterEntry.combat ?? 0;
        target.limit_break = {
          grade: rosterEntry.grade ?? 0,
          core: rosterEntry.core ?? 0,
        };
      }

      if (!detail) return;
      populatedCodes.add(code);
      target.skill1_level = detail.skill1_lv;
      target.skill2_level = detail.skill2_lv;
      target.skill_burst_level = detail.ulti_skill_lv;
      target.level = rosterEntry?.lv ?? detail.lv ?? 0;
      target.combat = rosterEntry?.combat ?? detail.combat ?? 0;
      target.affection_level = detail.attractive_lv ?? 0;
      target.item_level = detail.favorite_item_lv >= 0
        ? detail.favorite_item_lv
        : "";
      target.item_rare = getFavoriteItemRarity(detail.favorite_item_tid);
      if (!rosterEntry) {
        target.limit_break = {
          grade: detail.limitBreak?.grade || 0,
          core: detail.limitBreak?.core || 0,
        };
      }
      target.equipments = detail.equipments;

      if (detail.cube_id && detail.cube_level) {
        const cube = (dict?.cubes || []).find(
          (entry) => entry.cube_id === detail.cube_id,
        );
        if (cube && detail.cube_level > cube.cube_level) {
          cube.cube_level = detail.cube_level;
        }
      }
    });
  });

  summary.populatedCharacterCount = populatedCodes.size;
  return { summary, requestedCodes };
};
