// SPDX-License-Identifier: GPL-3.0-or-later

export const MANUAL_FOUR_EQUIPMENT_COLLECTION_ID = "manual-four-equipment";
export const SINGLE_EQUIPMENT_COLLECTION_ID = "single-equipment";

export function isStandaloneCalculatorCollection(collectionId) {
  return collectionId === SINGLE_EQUIPMENT_COLLECTION_ID
    || collectionId === MANUAL_FOUR_EQUIPMENT_COLLECTION_ID;
}

export function shouldShowRecommendationSelector({
  collectionId,
  hasCharacterData,
  hasRecommendations,
}) {
  return Boolean(hasCharacterData)
    && Boolean(hasRecommendations)
    && !isStandaloneCalculatorCollection(collectionId);
}

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
