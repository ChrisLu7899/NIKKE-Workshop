// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Blablalink 会返回词条所在的 1/2/3 号位置，但不提供游戏内永久锁定状态。
 * 这里只保留 position；“已锁”由用户在计算器中按游戏实际状态手动勾选。
 */
export function parseEquipmentOptionLines(character, slot, effectsMap) {
  const details = [];
  for (let position = 1; position <= 3; position += 1) {
    const optionId = character?.[`${slot}_equip_option${position}_id`];
    if (!optionId || optionId === 0) continue;

    const effect = effectsMap?.[optionId.toString()];
    if (!effect || !Array.isArray(effect.function_details)) continue;
    effect.function_details.forEach((func) => {
      details.push({
        position,
        function_type: func.function_type,
        function_value: Math.abs(func.function_value) / 100,
        level: func.level,
      });
    });
  }
  return details;
}
