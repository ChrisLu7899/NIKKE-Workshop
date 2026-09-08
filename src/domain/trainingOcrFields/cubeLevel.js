import { recognizeCubeLevel } from "../trainingOcrCore.js";
import { notVisible, recognitionResult } from "../trainingOcrFieldContract.js";

export const field = "cubeLevel";
export async function recognize(context) {
  const located = await context.getCube();
  if (!located?.card) return notVisible(field, null, "截图中未定位到魔方卡片。");
  const structural = recognizeCubeLevel(context, located.card);
  const result = structural.value !== null || !context.ocrCubeLevel
    ? structural
    : await context.ocrCubeLevel(structural.bounds || located.card);
  return recognitionResult(field, structural.bounds || located.card, result, structural.value !== null ? "cube-card-level-glyphs" : "constrained-cube-level-ocr");
}
