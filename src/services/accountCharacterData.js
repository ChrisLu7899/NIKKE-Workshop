// SPDX-License-Identifier: GPL-3.0-or-later
// 单账号角色数据采集服务：页面只调用此服务，不感知 API 响应合并细节。

import {
  applyCharacterAccountData,
  collectConfiguredCharacterCodes,
  createCharacterCrawlSummary,
  planOwnedCharacterDetails,
} from "../domain/characterAccountData.js";
import {
  ensureNikkeDirectory,
  getCharacterDetailsWithAccount,
  getUserCharactersWithAccount,
} from "./api.js";
import { getLevelStatsForCalculation } from "./levelStats.js";
import { calculateSimulatedStatsForDict } from "../utils/simulatedStats.js";

export const hydrateAccountCharacterData = async ({
  dict,
  account,
  forceSimulatedStatsLevel400 = false,
}) => {
  const configuredCodes = collectConfiguredCharacterCodes(dict);
  if (configuredCodes.length === 0) {
    return createCharacterCrawlSummary(0);
  }

  const userCharacters = await getUserCharactersWithAccount(
    account,
    account.roleInfo.area_id,
  );
  const requestedCodes = planOwnedCharacterDetails(
    configuredCodes,
    userCharacters,
  );
  const characterDetails = requestedCodes.length > 0
    ? await getCharacterDetailsWithAccount(
      account,
      account.roleInfo.area_id,
      requestedCodes,
    )
    : [];
  const { summary } = applyCharacterAccountData({
    dict,
    configuredCodes,
    userCharacters,
    characterDetails,
  });

  if (requestedCodes.length === 0) return summary;

  try {
    const [nikkeDirectory, levelStats] = await Promise.all([
      ensureNikkeDirectory(),
      getLevelStatsForCalculation(),
    ]);
    const simulated = await calculateSimulatedStatsForDict({
      dict,
      userCharacters,
      characterDetails,
      nikkeDirectory,
      levelStats,
      forceSimulatedStatsLevel400,
    });
    summary.simulatedStatsCount = simulated.calculatedCount;
    summary.simulatedStatsFailures = simulated.failures;
  } catch (error) {
    summary.simulatedStatsFailures = requestedCodes.map((nameCode) => ({
      name_code: String(nameCode),
      reason: String(error?.message || error || "模拟属性计算失败").slice(0, 180),
    }));
  }

  return summary;
};
