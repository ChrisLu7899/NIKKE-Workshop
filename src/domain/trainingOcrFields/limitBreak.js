import { countStars, recognizeCoreLevel } from "../trainingOcrCore.js";
import { TRAINING_FIELD_STATUS, hasRegion, notVisible, trainingFieldResult } from "../trainingOcrFieldContract.js";

export const field = "limitBreak";
export async function recognize(context) {
  if (!context.anchors?.coreBadge && context.anchors?.rarityWordmark && hasRegion(context, "stars", 20, 12)) {
    const stars = countStars(context.raw, context.width, context.regions.stars);
    const anchorMethod = context.anchors?.identityBar ? "identity-bar" : "rarity-wordmark";
    if (stars.value === null) return trainingFieldResult(field, {
      status: TRAINING_FIELD_STATUS.UNCERTAIN, region: context.regions.stars,
      warnings: ["未检测到黄色星；可能是零突破或截图缺失，请人工确认。"],
      method: `${anchorMethod} + star-color-components`, debug: { stars },
    });
    const value = { stars: stars.value || 0, core: 0, total: stars.value || 0 };
    return trainingFieldResult(field, {
      status: TRAINING_FIELD_STATUS.RECOGNIZED,
      value,
      confidence: stars.confidence,
      region: context.regions.stars,
      method: `${anchorMethod} + star-color-components + no-core-badge`,
      warnings: [],
      debug: { stars },
    });
  }
  if (!hasRegion(context, "stars", 20, 12) || !hasRegion(context, "core", 12, 12)) return notVisible(field, context.regions?.core, "截图未完整包含星级与核心突破徽章。");
  const stars = countStars(context.raw, context.width, context.regions.stars);
  let core = recognizeCoreLevel(context.raw, context.width, context.regions.core);
  if (core.value === null && context.ocrCoreLevel) core = await context.ocrCoreLevel(context.regions.core);
  if (stars.value === null || core.value === null) return trainingFieldResult(field, { status: TRAINING_FIELD_STATUS.UNCERTAIN, region: context.regions.core, method: "star-color-components + core-glyph", warnings: ["突破区域可见，但星级或核心数字置信不足。"], debug: { stars, core } });
  return trainingFieldResult(field, { status: TRAINING_FIELD_STATUS.RECOGNIZED, value: { stars: stars.value, core: core.value, total: stars.value + core.value }, confidence: Math.min(stars.confidence, core.confidence), region: context.regions.core, method: "star-color-components + core-glyph", debug: { stars, core } });
}
