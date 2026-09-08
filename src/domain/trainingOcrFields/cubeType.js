import { TRAINING_FIELD_STATUS, notVisible, trainingFieldResult } from "../trainingOcrFieldContract.js";

export const field = "cubeType";
export async function recognize(context) {
  const located = await context.getCube();
  if (located?.error) throw new Error(located.error);
  if (!located?.match) return notVisible(field, null, "截图中未定位到带黄色底边的魔方卡片。");
  if (located.match.confidence === "low") return trainingFieldResult(field, { status: TRAINING_FIELD_STATUS.UNCERTAIN, confidence: Math.max(0, 1 - located.match.score), region: located.iconRegion, method: "17-cube-icon-template-match", warnings: ["已找到魔方图标，但候选之间区分度不足。"], debug: located.match });
  return trainingFieldResult(field, { status: TRAINING_FIELD_STATUS.RECOGNIZED, value: { cubeId: located.match.cubeId, resourceId: located.match.resourceId, nameCn: located.match.nameCn, nameEn: located.match.nameEn }, confidence: located.match.confidence === "high" ? 0.9 : 0.8, region: located.iconRegion, method: "17-cube-icon-template-match", debug: located.match });
}
