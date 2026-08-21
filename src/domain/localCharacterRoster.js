// SPDX-License-Identifier: GPL-3.0-or-later
// 手动录入、自定义角色与本地图鉴导入共用的纯领域模型。

import { resolveSimplifiedChineseCharacterName } from "../data/characterNameOverrides.js";

export const LOCAL_CHARACTER_SCHEMA_VERSION = 1;
export const LOCAL_CHARACTER_SOURCES = Object.freeze({
  manual: "manual",
  excel: "excel",
  sync: "sync",
  custom: "custom",
});

export const EQUIPMENT_SLOT_COUNT = 4;
export const EQUIPMENT_LINE_COUNT = 3;
export const EQUIPMENT_FUNCTION_LABELS = Object.freeze({
  IncElementDmg: "优越代码伤害增加",
  StatAtk: "攻击力增加",
  StatAmmoLoad: "最大装弹数增加",
  StatChargeTime: "蓄力速度增加",
  StatChargeDamage: "蓄力伤害增加",
  StatCritical: "暴击率增加",
  StatCriticalDamage: "暴击伤害增加",
  StatAccuracyCircle: "命中率增加",
  StatDef: "防御力增加",
});
export const EQUIPMENT_FUNCTION_TYPES = Object.freeze(Object.keys(EQUIPMENT_FUNCTION_LABELS));

const SOURCE_VALUES = new Set(Object.values(LOCAL_CHARACTER_SOURCES));

const optionalNumber = (value, { integer = false, min = null, max = null } = {}) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const normalized = integer ? Math.trunc(number) : number;
  if (min !== null && normalized < min) return null;
  if (max !== null && normalized > max) return null;
  return normalized;
};

const codeOf = (value) => String(value ?? "").trim();

export function normalizeCharacterName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function createEmptyEquipments() {
  return Array.from({ length: EQUIPMENT_SLOT_COUNT }, () => (
    Array.from({ length: EQUIPMENT_LINE_COUNT }, (_, index) => ({
      position: index + 1,
      functionType: "",
      value: null,
      level: null,
    }))
  ));
}

function normalizeEquipmentLine(line, position) {
  const functionType = codeOf(line?.functionType ?? line?.function_type);
  return {
    position,
    functionType: EQUIPMENT_FUNCTION_TYPES.includes(functionType) ? functionType : "",
    value: optionalNumber(line?.value ?? line?.function_value, { min: 0 }),
    level: optionalNumber(line?.level, { integer: true, min: 1, max: 15 }),
  };
}

export function normalizeEquipments(equipments) {
  return Array.from({ length: EQUIPMENT_SLOT_COUNT }, (_, slotIndex) => {
    const source = Array.isArray(equipments?.[slotIndex])
      ? equipments[slotIndex]
      : Array.isArray(equipments?.[String(slotIndex)])
        ? equipments[String(slotIndex)]
        : [];
    const positioned = new Map();
    source.forEach((line, sourceIndex) => {
      const position = optionalNumber(line?.position, { integer: true, min: 1, max: 3 })
        || sourceIndex + 1;
      if (position >= 1 && position <= EQUIPMENT_LINE_COUNT && !positioned.has(position)) {
        positioned.set(position, normalizeEquipmentLine(line, position));
      }
    });
    return Array.from({ length: EQUIPMENT_LINE_COUNT }, (_, lineIndex) => (
      positioned.get(lineIndex + 1) || normalizeEquipmentLine(null, lineIndex + 1)
    ));
  });
}

export function normalizeBaseProfile(profile = {}) {
  return {
    name: String(profile.name ?? profile.nameCn ?? profile.name_cn ?? "").trim(),
    nameCn: String(profile.nameCn ?? profile.name_cn ?? profile.name ?? "").trim(),
    nameEn: String(profile.nameEn ?? profile.name_en ?? profile.name ?? "").trim(),
    element: codeOf(profile.element),
    class: codeOf(profile.class),
    burstStage: codeOf(profile.burstStage ?? profile.use_burst_skill),
    corporation: codeOf(profile.corporation),
    weaponType: codeOf(profile.weaponType ?? profile.weapon_type),
    rarity: codeOf(profile.rarity ?? profile.original_rare).toUpperCase(),
    catalogId: profile.catalogId ?? profile.id ?? null,
    resourceId: profile.resourceId ?? profile.resource_id ?? null,
  };
}

export function catalogCharacterToBaseProfile(character) {
  return normalizeBaseProfile({
    name: resolveSimplifiedChineseCharacterName(character),
    nameCn: resolveSimplifiedChineseCharacterName(character),
    nameEn: character?.name_en,
    element: character?.element,
    class: character?.class,
    burstStage: character?.use_burst_skill,
    corporation: character?.corporation,
    weaponType: character?.weapon_type,
    rarity: character?.original_rare,
    catalogId: character?.id,
    resourceId: character?.resource_id,
  });
}

export function catalogCharacterAliases(character) {
  return [...new Set([
    resolveSimplifiedChineseCharacterName(character),
    character?.name_cn,
    character?.name_en,
  ].map(normalizeCharacterName).filter(Boolean))];
}

export function findCatalogCharacterByName(catalog, name) {
  const normalized = normalizeCharacterName(name);
  if (!normalized) return null;
  return (Array.isArray(catalog) ? catalog : []).find((character) => (
    catalogCharacterAliases(character).includes(normalized)
  )) || null;
}

export function normalizeLocalCharacterRecord(record, now = Date.now()) {
  const nameCode = codeOf(record?.nameCode ?? record?.name_code);
  const custom = Boolean(record?.custom || (!nameCode && String(record?.localId || "").startsWith("custom:")));
  const source = SOURCE_VALUES.has(record?.source)
    ? record.source
    : custom
      ? LOCAL_CHARACTER_SOURCES.custom
      : LOCAL_CHARACTER_SOURCES.manual;
  const localId = codeOf(record?.localId)
    || (nameCode ? `standard:${nameCode}` : `custom:${now}`);
  const createdAt = optionalNumber(record?.createdAt, { min: 0 }) || now;
  const updatedAt = optionalNumber(record?.updatedAt, { min: 0 }) || createdAt;
  return {
    schemaVersion: LOCAL_CHARACTER_SCHEMA_VERSION,
    localId,
    nameCode,
    source,
    custom,
    base: normalizeBaseProfile(record?.base || record),
    level: optionalNumber(record?.level, { integer: true, min: 1 }),
    limitBreak: {
      grade: optionalNumber(record?.limitBreak?.grade ?? record?.limit_break?.grade, { integer: true, min: 0 }),
      core: optionalNumber(record?.limitBreak?.core ?? record?.limit_break?.core, { integer: true, min: 0 }),
    },
    combat: optionalNumber(record?.combat, { integer: true, min: 0 }),
    affectionLevel: optionalNumber(record?.affectionLevel ?? record?.affection_level, { integer: true, min: 0 }),
    equipments: normalizeEquipments(record?.equipments),
    createdAt,
    updatedAt,
    syncMissing: Boolean(record?.syncMissing),
    manualSupplementFields: Array.isArray(record?.manualSupplementFields)
      ? [...new Set(record.manualSupplementFields.map(String).filter(Boolean))]
      : [],
  };
}

export function createEmptyLocalCharacterRoster() {
  return { schemaVersion: LOCAL_CHARACTER_SCHEMA_VERSION, records: [] };
}

export function normalizeLocalCharacterRoster(payload) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const seen = new Set();
  return {
    schemaVersion: LOCAL_CHARACTER_SCHEMA_VERSION,
    records: records
      .map((record) => normalizeLocalCharacterRecord(record))
      .filter((record) => {
        if (!record.localId || seen.has(record.localId)) return false;
        seen.add(record.localId);
        return true;
      }),
  };
}

export function validateEquipmentInput(equipments) {
  const errors = [];
  normalizeEquipments(equipments).forEach((slot, slotIndex) => {
    const usedTypes = new Set();
    slot.forEach((line, lineIndex) => {
      if (!line.functionType) {
        if (line.value !== null || line.level !== null) {
          errors.push(`装备${slotIndex + 1}词条${lineIndex + 1}缺少词条类型`);
        }
        return;
      }
      if (usedTypes.has(line.functionType)) {
        errors.push(`装备${slotIndex + 1}存在重复词条：${EQUIPMENT_FUNCTION_LABELS[line.functionType]}`);
      }
      usedTypes.add(line.functionType);
      if (line.value === null) errors.push(`装备${slotIndex + 1}词条${lineIndex + 1}缺少数值`);
      if (line.level === null) errors.push(`装备${slotIndex + 1}词条${lineIndex + 1}缺少档位`);
    });
  });
  return errors;
}

export function validateCustomProfile(profile, { catalog = [], records = [], currentLocalId = "" } = {}) {
  const base = normalizeBaseProfile(profile);
  const errors = [];
  if (!base.name) errors.push("名称不能为空");
  [
    ["属性", base.element],
    ["职业", base.class],
    ["爆裂阶段", base.burstStage],
    ["企业", base.corporation],
    ["武器类型", base.weaponType],
    ["稀有度", base.rarity],
  ].forEach(([label, value]) => {
    if (!value) errors.push(`${label}不能为空`);
  });
  if (base.name && findCatalogCharacterByName(catalog, base.name)) {
    errors.push("该名称与内置标准角色相同，请直接录入标准角色");
  }
  const normalizedName = normalizeCharacterName(base.name);
  const duplicateCustom = (Array.isArray(records) ? records : []).find((record) => (
    record.custom
    && record.localId !== currentLocalId
    && normalizeCharacterName(record.base?.name) === normalizedName
  ));
  if (normalizedName && duplicateCustom) errors.push("已存在同名自定义角色");
  return errors;
}

function defaultIdFactory() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function saveLocalCharacterRecord(records, {
  catalogCharacter = null,
  draft = {},
  custom = false,
  existingLocalId = "",
  source = null,
  catalog = [],
  now = Date.now(),
  idFactory = defaultIdFactory,
  preserveStatus = false,
} = {}) {
  const currentRecords = Array.isArray(records) ? records.map((record) => normalizeLocalCharacterRecord(record)) : [];
  const existing = existingLocalId
    ? currentRecords.find((record) => record.localId === existingLocalId) || null
    : null;
  const nameCode = custom ? "" : codeOf(catalogCharacter?.name_code ?? draft?.nameCode);
  const base = custom
    ? normalizeBaseProfile(draft?.base || draft)
    : catalogCharacterToBaseProfile(catalogCharacter);
  const errors = [
    ...(custom ? validateCustomProfile(base, { catalog, records: currentRecords, currentLocalId: existingLocalId }) : []),
    ...validateEquipmentInput(draft?.equipments),
  ];
  if (!custom && !nameCode) errors.push("标准角色缺少 name_code");
  if (errors.length) return { records: currentRecords, record: null, errors };

  const localId = existing?.localId
    || (nameCode ? `standard:${nameCode}` : `custom:${idFactory()}`);
  const next = normalizeLocalCharacterRecord({
    ...existing,
    ...draft,
    localId,
    nameCode,
    source: source || (custom ? LOCAL_CHARACTER_SOURCES.custom : LOCAL_CHARACTER_SOURCES.manual),
    custom,
    base,
    createdAt: existing?.createdAt || (preserveStatus ? draft?.createdAt : null) || now,
    updatedAt: preserveStatus ? (draft?.updatedAt || now) : now,
    syncMissing: preserveStatus ? Boolean(draft?.syncMissing) : false,
    manualSupplementFields: preserveStatus ? draft?.manualSupplementFields : existing?.manualSupplementFields,
  }, now);
  const nextRecords = currentRecords.filter((record) => record.localId !== localId);
  nextRecords.push(next);
  return { records: nextRecords, record: next, errors: [] };
}

export function deleteLocalCharacterRecord(records, localId) {
  return (Array.isArray(records) ? records : []).filter((record) => record.localId !== localId);
}

export function isRecordedLocalCharacter(record) {
  return Boolean(record?.custom) || record?.source !== LOCAL_CHARACTER_SOURCES.sync;
}

export function getRecordedLocalCharacters(records) {
  return (Array.isArray(records) ? records : []).filter(isRecordedLocalCharacter);
}

export function localCharacterKey(record) {
  return codeOf(record?.nameCode) || codeOf(record?.localId);
}

export function localRecordToCatalogCharacter(record) {
  const normalized = normalizeLocalCharacterRecord(record);
  return {
    id: normalized.base.catalogId || normalized.localId,
    resource_id: normalized.base.resourceId || "",
    name_code: localCharacterKey(normalized),
    name_cn: normalized.base.nameCn || normalized.base.name,
    name_en: normalized.base.nameEn || normalized.base.name,
    class: normalized.base.class,
    element: normalized.base.element,
    use_burst_skill: normalized.base.burstStage,
    corporation: normalized.base.corporation,
    weapon_type: normalized.base.weaponType,
    original_rare: normalized.base.rarity,
    _localRecordId: normalized.localId,
    _isCustom: normalized.custom,
  };
}

export function localRecordToCalculatorCharacter(record) {
  const normalized = normalizeLocalCharacterRecord(record);
  return {
    id: normalized.localId,
    nameCode: localCharacterKey(normalized),
    nameCn: normalized.base.nameCn || normalized.base.name,
    nameEn: normalized.base.nameEn || normalized.base.name,
    level: normalized.level,
    combat: normalized.combat,
    affectionLevel: normalized.affectionLevel,
    limitBreak: normalized.limitBreak,
    source: "local",
    equipments: normalized.equipments.map((slot) => slot
      .filter((line) => line.functionType)
      .map((line) => ({
        position: line.position,
        functionType: line.functionType,
        value: line.value,
        level: line.level,
      }))),
  };
}

const hasEquipmentData = (slot) => (
  Array.isArray(slot) && slot.some((line) => codeOf(line?.functionType ?? line?.function_type))
);

function mergeOptionalSyncedField(syncedValue, existingValue, field, supplementFields) {
  if (syncedValue !== null && syncedValue !== undefined && String(syncedValue) !== "") {
    return syncedValue;
  }
  if (existingValue !== null && existingValue !== undefined && String(existingValue) !== "") {
    supplementFields.push(field);
    return existingValue;
  }
  return null;
}

export function reconcileLocalCharactersAfterSync(records, snapshot, catalog, now = Date.now()) {
  const currentRecords = (Array.isArray(records) ? records : []).map((record) => normalizeLocalCharacterRecord(record));
  const customRecords = currentRecords.filter((record) => record.custom);
  const standardRecords = currentRecords.filter((record) => !record.custom);
  const existingByCode = new Map(standardRecords.map((record) => [record.nameCode, record]));
  const catalogByCode = new Map((Array.isArray(catalog) ? catalog : [])
    .map((character) => [codeOf(character?.name_code), character])
    .filter(([code]) => code));
  const syncedCharacters = (Array.isArray(snapshot?.accounts) ? snapshot.accounts : [])
    .filter((account) => account?.source !== "local")
    .flatMap((account) => Array.isArray(account?.characters) ? account.characters : []);
  const syncedCodes = new Set();
  const mergedByCode = new Map();
  let overwrittenStandardCount = 0;

  syncedCharacters.forEach((character) => {
    const nameCode = codeOf(character?.nameCode);
    if (!nameCode || syncedCodes.has(nameCode)) return;
    syncedCodes.add(nameCode);
    const existing = existingByCode.get(nameCode) || null;
    if (existing && existing.source !== LOCAL_CHARACTER_SOURCES.sync) overwrittenStandardCount += 1;
    const catalogCharacter = catalogByCode.get(nameCode);
    const supplementFields = [];
    const syncedEquipments = normalizeEquipments(character?.equipments);
    const existingEquipments = normalizeEquipments(existing?.equipments);
    const equipments = syncedEquipments.map((slot, slotIndex) => {
      if (!hasEquipmentData(slot) && hasEquipmentData(existingEquipments[slotIndex])) {
        supplementFields.push(`equipments.${slotIndex}`);
        return existingEquipments[slotIndex];
      }
      return slot.map((line, lineIndex) => {
        const existingLine = existingEquipments[slotIndex][lineIndex];
        if (!line.functionType && existingLine.functionType) {
          supplementFields.push(`equipments.${slotIndex}.${lineIndex}`);
          return existingLine;
        }
        if (!line.functionType) return line;
        return {
          ...line,
          value: mergeOptionalSyncedField(line.value, existingLine.value, `equipments.${slotIndex}.${lineIndex}.value`, supplementFields),
          level: mergeOptionalSyncedField(line.level, existingLine.level, `equipments.${slotIndex}.${lineIndex}.level`, supplementFields),
        };
      });
    });
    const syncedLimitBreak = character?.limitBreak || {};
    const record = normalizeLocalCharacterRecord({
      ...existing,
      localId: existing?.localId || `standard:${nameCode}`,
      nameCode,
      source: LOCAL_CHARACTER_SOURCES.sync,
      custom: false,
      base: catalogCharacter
        ? catalogCharacterToBaseProfile(catalogCharacter)
        : existing?.base || {
            name: character?.nameCn || character?.nameEn || nameCode,
            nameCn: character?.nameCn,
            nameEn: character?.nameEn,
          },
      level: mergeOptionalSyncedField(character?.level, existing?.level, "level", supplementFields),
      combat: mergeOptionalSyncedField(character?.combat, existing?.combat, "combat", supplementFields),
      affectionLevel: mergeOptionalSyncedField(
        character?.affectionLevel,
        existing?.affectionLevel,
        "affectionLevel",
        supplementFields,
      ),
      limitBreak: {
        grade: mergeOptionalSyncedField(
          syncedLimitBreak?.grade,
          existing?.limitBreak?.grade,
          "limitBreak.grade",
          supplementFields,
        ),
        core: mergeOptionalSyncedField(
          syncedLimitBreak?.core,
          existing?.limitBreak?.core,
          "limitBreak.core",
          supplementFields,
        ),
      },
      equipments,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      syncMissing: false,
      manualSupplementFields: supplementFields,
    }, now);
    mergedByCode.set(nameCode, record);
  });

  standardRecords.forEach((record) => {
    if (mergedByCode.has(record.nameCode)) return;
    mergedByCode.set(record.nameCode, normalizeLocalCharacterRecord({
      ...record,
      syncMissing: record.source !== LOCAL_CHARACTER_SOURCES.sync,
      updatedAt: record.source !== LOCAL_CHARACTER_SOURCES.sync ? now : record.updatedAt,
    }, now));
  });

  return {
    records: [...mergedByCode.values(), ...customRecords],
    summary: {
      overwrittenStandardCount,
      retainedCustomCount: customRecords.length,
      syncMissingCount: [...mergedByCode.values()].filter((record) => record.syncMissing).length,
    },
  };
}
