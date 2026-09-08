import { recognizeAffection } from "../trainingOcrCore.js";
import { hasRegion, notVisible, recognitionResult } from "../trainingOcrFieldContract.js";

export const field = "affection";
export async function recognize(context) {
  if (!hasRegion(context, "affection", 18, 12)) return notVisible(field, context.regions?.affection);
  return recognitionResult(field, context.regions.affection, recognizeAffection(context.raw, context.width, context.regions.affection), "heart-outline-digit-structure");
}
