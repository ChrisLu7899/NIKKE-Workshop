import { recognizeCollectible } from "../trainingOcrCore.js";
import { notVisible, recognitionResult } from "../trainingOcrFieldContract.js";

export const field = "collectible";
export async function recognize(context) {
  const result = recognizeCollectible(context);
  return result.status === "not_visible"
    ? notVisible(field, null, "左上区域没有找到带白色星形的珍藏品颜色条。")
    : recognitionResult(field, result.bounds, result, "self-located-color-strip + white-star-components");
}
