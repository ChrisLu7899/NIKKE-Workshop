// SPDX-License-Identifier: GPL-3.0-or-later

export const TRAINING_FIELD_STATUS = Object.freeze({
  RECOGNIZED: "recognized",
  NOT_VISIBLE: "not_visible",
  UNCERTAIN: "uncertain",
  ERROR: "error",
});

export function trainingFieldResult(field, {
  status,
  value = null,
  confidence = 0,
  region = null,
  method = "",
  warnings = [],
  debug = null,
} = {}) {
  return { field, status, value, confidence, evidence: { region, method }, warnings, ...(debug ? { debug } : {}) };
}

export function recognitionResult(field, region, recognition, method) {
  if (recognition?.value === null || recognition?.value === undefined || !Number.isFinite(recognition.confidence) || recognition.confidence < 0.7) {
    return trainingFieldResult(field, {
      status: TRAINING_FIELD_STATUS.UNCERTAIN,
      region,
      method,
      warnings: [recognition?.note || "字段可见，但没有得到可靠结果。"],
      debug: recognition || null,
    });
  }
  return trainingFieldResult(field, {
    status: TRAINING_FIELD_STATUS.RECOGNIZED,
    value: recognition.value,
    confidence: recognition.confidence || 0,
    region,
    method,
    warnings: recognition.note ? [recognition.note] : [],
    debug: recognition,
  });
}

export function constrainedNumericResult(text, confidence, { min = 1, max, minConfidence = 0.75 } = {}) {
  const normalized = String(text ?? "").trim().replace(/\s+/g, "");
  const number = /^\d+$/.test(normalized) ? Number(normalized) : NaN;
  const valid = Number.isInteger(number) && number >= min && number <= max
    && Number.isFinite(confidence) && confidence >= minConfidence;
  return { value: valid ? number : null, confidence: Number.isFinite(confidence) ? confidence : 0, evidenceText: String(text ?? "") };
}

export function notVisible(field, region = null, warning = "截图中未找到该字段区域。") {
  return trainingFieldResult(field, { status: TRAINING_FIELD_STATUS.NOT_VISIBLE, region, warnings: [warning] });
}

export function hasRegion(context, key, minimumWidth = 2, minimumHeight = 2) {
  const region = context.regions?.[key];
  return Boolean(region && region.width >= minimumWidth && region.height >= minimumHeight);
}
