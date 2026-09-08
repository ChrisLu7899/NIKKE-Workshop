import { recognizeCondensedLevel, recognizePortraitCondensedLevel } from "../trainingOcrCore.js";
import { hasRegion, notVisible, recognitionResult } from "../trainingOcrFieldContract.js";

export const field = "enterpriseLevel";
export async function recognize(context) {
  if (!hasRegion(context, field, 8, 8)) return notVisible(field, context.regions?.[field]);
  const ocr = context.ocrResearchLevel ? await context.ocrResearchLevel(context.regions[field]) : null;
  const structural = context.layout === "landscape"
    ? recognizeCondensedLevel(context.raw, context.width, context.regions[field])
    : recognizePortraitCondensedLevel(context.raw, context.width, context.regions[field]);
  const result = ocr?.value ? ocr : structural;
  return recognitionResult(field, context.regions[field], result, ocr?.value ? "constrained-research-level-ocr" : "enterprise-icon-relative-condensed-digits");
}
