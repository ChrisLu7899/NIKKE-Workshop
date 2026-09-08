// SPDX-License-Identifier: GPL-3.0-or-later
import { locateSkillLevels } from "../trainingOcrCore.js";
import { notVisible, recognitionResult } from "../trainingOcrFieldContract.js";

export async function recognizeSkillField(context, field, position) {
  context.cache.skillLevels ||= locateSkillLevels(context);
  const badge = context.cache.skillLevels.group?.[position];
  if (!badge) return notVisible(field, null, "未能可靠确认此技能的物理位置；可补图或手动录入。");
  const recognized = badge.recognition.value !== null || !context.ocrSkillLevel
    ? badge.recognition : await context.ocrSkillLevel(badge.digitRegion);
  return recognitionResult(field, badge, recognized, badge.recognition.value !== null ? "skill-level-badge-layout + constrained-glyphs" : "constrained-skill-level-ocr");
}
