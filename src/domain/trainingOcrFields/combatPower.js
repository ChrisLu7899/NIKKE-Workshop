import { recognizeCombatPower } from "../trainingOcrCore.js";
import { hasRegion, notVisible, recognitionResult } from "../trainingOcrFieldContract.js";

export const field = "combatPower";
export async function recognize(context) {
  if (!hasRegion(context, "combatPower", 60, 30)) return notVisible(field, context.regions?.combatPower);
  const structural = recognizeCombatPower(context.raw, context.width, context.regions.combatPower);
  const result = structural.value ? structural : await context.ocrCombatPower(context.regions.combatPower);
  return recognitionResult(field, context.regions.combatPower, result, structural.value ? "battle-digit-structure" : "numeric-whitelist-ocr");
}
