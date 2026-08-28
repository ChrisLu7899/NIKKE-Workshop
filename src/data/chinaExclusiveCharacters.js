// SPDX-License-Identifier: GPL-3.0-or-later
// 国服独占角色不会出现在 Blablalink 国际服目录中，因此在本地补齐。

export const CHINA_EXCLUSIVE_CHARACTERS = Object.freeze([
  Object.freeze({
    id: "cn-exclusive-huapi",
    resource_id: null,
    name_code: "cn-exclusive-huapi",
    class: "Attacker",
    name_cn: "画皮",
    name_en: "Huapi",
    avatar_url: "images/characters/cn-exclusive-huapi-thumb.png",
    artwork_url: "images/characters/cn-exclusive-huapi.png",
    element: "Water",
    use_burst_skill: "Step3",
    corporation: "MISSILIS",
    weapon_type: "AR",
    original_rare: "SSR",
    china_exclusive: true,
  }),
  Object.freeze({
    id: "cn-exclusive-yingning",
    resource_id: null,
    name_code: "cn-exclusive-yingning",
    class: "Supporter",
    name_cn: "婴宁",
    name_en: "Yingning",
    avatar_url: "images/characters/cn-exclusive-yingning-thumb.png",
    artwork_url: "images/characters/cn-exclusive-yingning.png",
    element: "Water",
    use_burst_skill: "Step2",
    corporation: "MISSILIS",
    weapon_type: "RL",
    original_rare: "SSR",
    china_exclusive: true,
  }),
]);

const normalizeIdentity = (value) => String(value ?? "").trim().toLocaleLowerCase();

const staticIdentityKeys = new Set(
  CHINA_EXCLUSIVE_CHARACTERS.flatMap((character) => [
    character.id,
    character.name_code,
    character.name_cn,
    character.name_en,
  ]).map(normalizeIdentity),
);

const matchesStaticCharacter = (character) => [
  character?.id,
  character?.name_code,
  character?.name_cn,
  character?.name_en,
].map(normalizeIdentity).some((value) => value && staticIdentityKeys.has(value));

/**
 * Appends the two CN-only characters in a deterministic order.
 * Existing copies are removed first so cached data and future remote data
 * cannot create duplicates or move the supplement away from the catalog end.
 */
export const withChinaExclusiveCharacters = (characters) => [
  ...(Array.isArray(characters) ? characters : []).filter((character) => !matchesStaticCharacter(character)),
  ...CHINA_EXCLUSIVE_CHARACTERS,
];
