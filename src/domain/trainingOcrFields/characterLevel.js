import { recognizeColoredLevel } from "../trainingOcrCore.js";
import { hasRegion, notVisible, recognitionResult } from "../trainingOcrFieldContract.js";

export const field = "characterLevel";
export async function recognize(context) {
  if (!hasRegion(context, "level", 40, 20)) return notVisible(field, context.regions?.level);
  const structural = context.layout === "landscape"
    ? recognizeColoredLevel(context.raw, context.width, context.regions.level)
    : null;
  const result = structural?.value ? structural : await context.ocrCharacterLevel(context.regions.level);
  return recognitionResult(field, context.regions.level, result, structural?.value ? "yellow-digit-structure" : "constrained-level-ocr");
}
