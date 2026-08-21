// SPDX-License-Identifier: GPL-3.0-or-later

export const MANUAL_FOUR_EQUIPMENT_COLLECTION_ID = "manual-four-equipment";

export function createManualFourEquipmentCharacter(slotNames) {
  return {
    key: "manual-four-equipment::temporary",
    name: "四装备全局模拟",
    transient: true,
    equipments: slotNames.map(label => ({
      label,
      lines: [],
    })),
  };
}
