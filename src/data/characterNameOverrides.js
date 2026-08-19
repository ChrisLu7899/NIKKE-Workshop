// SPDX-License-Identifier: GPL-3.0-or-later
// 上游目录与简体中文正式译名不一致时，在这里按稳定的 name_code 统一覆盖。

export const SIMPLIFIED_CHINESE_CHARACTER_NAME_OVERRIDES = Object.freeze({
  "5143": "渡鸦",
});

const characterCode = (character) => String(
  character?.nameCode
  ?? character?.name_code
  ?? character?.id
  ?? "",
).trim();

const chineseName = (character) => String(
  character?.nameCn
  ?? character?.name_cn
  ?? character?.name
  ?? character?.nameEn
  ?? character?.name_en
  ?? characterCode(character),
);

const englishName = (character) => String(
  character?.nameEn
  ?? character?.name_en
  ?? character?.nameCn
  ?? character?.name_cn
  ?? character?.name
  ?? characterCode(character),
);

export function resolveSimplifiedChineseCharacterName(character) {
  return SIMPLIFIED_CHINESE_CHARACTER_NAME_OVERRIDES[characterCode(character)]
    || chineseName(character);
}

export function resolveCharacterDisplayName(character, lang = "zh") {
  if (!character) return "";
  return lang === "en"
    ? englishName(character)
    : resolveSimplifiedChineseCharacterName(character);
}
