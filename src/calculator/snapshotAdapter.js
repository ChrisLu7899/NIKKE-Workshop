// SPDX-License-Identifier: GPL-3.0-or-later

import { isVerifiedCalculatorSnapshot } from "../utils/calculatorSnapshot.js";

const FUNCTION_TYPE_NAMES = {
  IncElementDmg: "优越代码伤害增加",
  StatAtk: "攻击力增加",
  StatAmmoLoad: "最大装弹数增加",
  StatChargeTime: "蓄力速度增加",
  StatChargeDamage: "蓄力伤害增加",
  StatCritical: "暴击率增加",
  StatCriticalDamage: "暴击伤害增加",
  StatAccuracyCircle: "命中率增加",
  StatDef: "防御力增加",
};

export function adaptCalculatorSnapshot(snapshot, { equipmentSlotNames, findTierForPercent }) {
  if (!isVerifiedCalculatorSnapshot(snapshot)) return [];
  const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
  const showAccountName = accounts.length > 1;
  const characters = [];

  accounts.forEach((account, accountIndex) => {
    const accountCharacters = Array.isArray(account?.characters) ? account.characters : [];
    accountCharacters.forEach((character) => {
      const baseName = String(character?.nameCn || character?.nameEn || character?.nameCode || "未知妮姬");
      const accountName = String(account?.accountName || "未命名账号");
      const equipments = equipmentSlotNames.map((label, slotIndex) => {
        const sourceLines = Array.isArray(character?.equipments?.[slotIndex])
          ? character.equipments[slotIndex]
          : [];
        const lines = sourceLines.flatMap((line) => {
          const stat = FUNCTION_TYPE_NAMES[line?.functionType];
          if (!stat) return [];
          const percent = Number(line?.value || 0);
          const sourceTier = Number(line?.level || 0);
          const tier = Number.isInteger(sourceTier) && sourceTier >= 1 && sourceTier <= 15
            ? sourceTier
            : findTierForPercent(stat, percent);
          return [{ stat, tier, percent, locked: false }];
        });
        return { slotIndex, label, excelLabel: label, lines };
      });
      characters.push({
        key: `${accountIndex}::${accountName}::${String(character?.nameCode || baseName)}`,
        nameCode: String(character?.nameCode || ""),
        name: showAccountName ? `${baseName} · ${accountName}` : baseName,
        column: characters.length + 1,
        equipments,
      });
    });
  });

  return characters;
}
