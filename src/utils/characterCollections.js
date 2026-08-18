// SPDX-License-Identifier: GPL-3.0-or-later

import { isUnowned } from "./ael.js";
import {
  SHOW_STATS_CONFIG_MARKER,
  SIMULATED_STATS_CONFIG_MARKER,
  basicStatKeys,
  equipStatKeys,
} from "../components/management/constants.js";
import { DEFAULT_SIMULATED_STAT_KEYS } from "./showStats.js";
import {
  RECOMMENDATION_PRESETS,
  recommendationCollectionId,
} from "../data/recommendationPresets.js";

export const SYSTEM_COLLECTION_IDS = Object.freeze({
  catalog: "catalog",
  owned: "owned",
});

export const DEFAULT_CHARACTER_SHOW_STATS = Object.freeze([
  SHOW_STATS_CONFIG_MARKER,
  SIMULATED_STATS_CONFIG_MARKER,
  ...basicStatKeys,
  ...DEFAULT_SIMULATED_STAT_KEYS,
  "AtkElemLbScore",
  ...equipStatKeys,
]);

const ELEMENT_KEYS = ["Electronic", "Fire", "Wind", "Water", "Iron", "Utility"];

const normalizeCode = (value) => String(value ?? "").trim();

export function createCharacterListEntry(nikke, showStats = DEFAULT_CHARACTER_SHOW_STATS) {
  return {
    name_code: nikke?.name_code,
    id: nikke?.id,
    resource_id: nikke?.resource_id,
    name_cn: nikke?.name_cn,
    name_en: nikke?.name_en,
    priority: "yellow",
    showStats: [...showStats],
  };
}

export function buildCharactersConfig(nikkes, options = {}) {
  const elements = Object.fromEntries(ELEMENT_KEYS.map((key) => [key, []]));
  const showStats = Array.isArray(options.showStats)
    ? options.showStats
    : DEFAULT_CHARACTER_SHOW_STATS;

  (Array.isArray(nikkes) ? nikkes : []).forEach((nikke) => {
    const code = normalizeCode(nikke?.name_code);
    if (!code) return;
    const element = ELEMENT_KEYS.includes(nikke?.element) ? nikke.element : "Utility";
    elements[element].push(createCharacterListEntry(nikke, showStats));
  });

  return {
    elements,
    options: {
      showEquipDetails: options.showEquipDetails !== false,
    },
  };
}

export function flattenCharacterConfig(characters) {
  return ELEMENT_KEYS.flatMap((element) => {
    const list = characters?.elements?.[element];
    return Array.isArray(list) ? list.filter(Boolean) : [];
  });
}

export function characterCodeSet(characters) {
  return new Set(
    flattenCharacterConfig(characters)
      .map((character) => normalizeCode(character?.name_code))
      .filter(Boolean),
  );
}

export function mergeNikkesIntoCharacters(characters, nikkes) {
  const existingCodes = characterCodeSet(characters);
  const next = {
    ...characters,
    elements: Object.fromEntries(ELEMENT_KEYS.map((element) => [
      element,
      [...(Array.isArray(characters?.elements?.[element]) ? characters.elements[element] : [])],
    ])),
    options: {
      ...(characters?.options || {}),
      showEquipDetails: characters?.options?.showEquipDetails !== false,
    },
  };

  (Array.isArray(nikkes) ? nikkes : []).forEach((nikke) => {
    const code = normalizeCode(nikke?.name_code);
    if (!code || existingCodes.has(code)) return;
    const element = ELEMENT_KEYS.includes(nikke?.element) ? nikke.element : "Utility";
    next.elements[element].push(createCharacterListEntry(nikke));
    existingCodes.add(code);
  });
  return next;
}

export function removeCodesFromCharacters(characters, codes) {
  const removedCodes = codes instanceof Set ? codes : new Set(codes || []);
  return {
    ...characters,
    elements: Object.fromEntries(ELEMENT_KEYS.map((element) => [
      element,
      (Array.isArray(characters?.elements?.[element]) ? characters.elements[element] : [])
        .filter((character) => !removedCodes.has(normalizeCode(character?.name_code))),
    ])),
  };
}

export function filterAccountDictsToOwned(accountDicts, allowedCodes = null) {
  const allowed = allowedCodes == null
    ? null
    : (allowedCodes instanceof Set ? allowedCodes : new Set(allowedCodes));

  return (Array.isArray(accountDicts) ? accountDicts : []).flatMap((dict) => {
    const elements = Object.fromEntries(ELEMENT_KEYS.map((element) => {
      const list = Array.isArray(dict?.elements?.[element]) ? dict.elements[element] : [];
      return [element, list.filter((character) => {
        const code = normalizeCode(character?.name_code);
        return !isUnowned(character) && (!allowed || allowed.has(code));
      })];
    }));
    const count = Object.values(elements).reduce((sum, list) => sum + list.length, 0);
    return count > 0 ? [{ ...dict, elements }] : [];
  });
}

export function applyShowStatsToAccountDicts(accountDicts, showStats) {
  if (!Array.isArray(showStats)) return accountDicts;
  return (Array.isArray(accountDicts) ? accountDicts : []).map((dict) => ({
    ...dict,
    elements: Object.fromEntries(ELEMENT_KEYS.map((element) => [
      element,
      (Array.isArray(dict?.elements?.[element]) ? dict.elements[element] : [])
        .map((character) => ({ ...character, showStats: [...showStats] })),
    ])),
  }));
}

export function applyCharacterConfigShowStatsToAccountDicts(accountDicts, characters) {
  const showStatsByCode = new Map(
    flattenCharacterConfig(characters)
      .filter((character) => Array.isArray(character?.showStats))
      .map((character) => [normalizeCode(character.name_code), character.showStats]),
  );
  if (!showStatsByCode.size) return accountDicts;
  return (Array.isArray(accountDicts) ? accountDicts : []).map((dict) => ({
    ...dict,
    elements: Object.fromEntries(ELEMENT_KEYS.map((element) => [
      element,
      (Array.isArray(dict?.elements?.[element]) ? dict.elements[element] : [])
        .map((character) => {
          const showStats = showStatsByCode.get(normalizeCode(character?.name_code));
          return showStats ? { ...character, showStats: [...showStats] } : character;
        }),
    ])),
  }));
}

export function buildCalculatorCollections(snapshot, templates) {
  const ownedCodes = new Set(
    (Array.isArray(snapshot?.accounts) ? snapshot.accounts : []).flatMap((account) =>
      (Array.isArray(account?.characters) ? account.characters : [])
        .map((character) => normalizeCode(character?.nameCode))
        .filter(Boolean)),
  );

  const collections = [{
    id: SYSTEM_COLLECTION_IDS.owned,
    name: "已获得",
    characterCodes: [...ownedCodes],
    system: true,
  }];

  RECOMMENDATION_PRESETS.forEach((preset) => {
    const codes = preset.items
      .map((entry) => normalizeCode(entry.nameCode))
      .filter((code) => ownedCodes.has(code));
    if (!codes.length) return;
    collections.push({
      id: recommendationCollectionId(preset.id),
      name: preset.name,
      characterCodes: codes,
      system: true,
    });
  });

  (Array.isArray(templates) ? templates : []).forEach((template) => {
    const codes = [...characterCodeSet(template?.data)].filter((code) => ownedCodes.has(code));
    if (!codes.length) return;
    collections.push({
      id: `template:${template.id}`,
      name: String(template?.name || "未命名列表"),
      characterCodes: codes,
      system: false,
    });
  });

  return collections;
}

export function attachCalculatorCollections(snapshot, templates, preferredCollectionId = SYSTEM_COLLECTION_IDS.owned) {
  const collections = buildCalculatorCollections(snapshot, templates);
  const defaultCollectionId = collections.some((collection) => collection.id === preferredCollectionId)
    ? preferredCollectionId
    : SYSTEM_COLLECTION_IDS.owned;
  return {
    ...snapshot,
    collections,
    defaultCollectionId,
  };
}
