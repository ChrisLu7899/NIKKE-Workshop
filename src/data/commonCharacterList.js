// SPDX-License-Identifier: GPL-3.0-or-later

import {
  buildCharactersConfig,
  flattenCharacterConfig,
} from "../utils/characterCollections.js";
import { resolveSimplifiedChineseCharacterName } from "./characterNameOverrides.js";

export const COMMON_CHARACTER_TEMPLATE_KEY = "common";
export const COMMON_CHARACTER_TEMPLATE_NAME = "常用";
export const COMMON_CHARACTER_TEMPLATE_VERSION = 1;

const commonCharacter = (nameCode, upstreamName) => ({
  nameCode,
  name: resolveSimplifiedChineseCharacterName({ nameCode, nameCn: upstreamName }),
});

export const COMMON_CHARACTER_LIST = Object.freeze([
  commonCharacter("5129", "拉毗：小红帽"),
  { nameCode: "5180", name: "雪子" },
  { nameCode: "5159", name: "迪塞尔：冬日甜心" },
  { nameCode: "5138", name: "米哈拉：羁绊锁链" },
  { nameCode: "5148", name: "贝斯蒂：战术升级" },
  { nameCode: "5161", name: "白雪公主：重型武装" },
  { nameCode: "5145", name: "桃乐丝：机缘巧遇" },
  { nameCode: "5066", name: "海伦" },
  { nameCode: "5007", name: "普丽瓦蒂" },
  { nameCode: "5135", name: "布蕾德" },
  { nameCode: "5137", name: "小美人鱼" },
  { nameCode: "5105", name: "红莲：暗影" },
  { nameCode: "5156", name: "莉贝雷利奥" },
  { nameCode: "5155", name: "娜由塔" },
  { nameCode: "5177", name: "拉普拉斯：究极英雄" },
  { nameCode: "5133", name: "明日香：WILLE" },
  { nameCode: "5169", name: "阿妮斯：超级巨星" },
  { nameCode: "5170", name: "尼恩：透视之眼" },
  { nameCode: "5124", name: "灰姑娘" },
  { nameCode: "5152", name: "艾达" },
  { nameCode: "5175", name: "灰姑娘：琉璃波光" },
  commonCharacter("5143", "蕾雯"),
  { nameCode: "5176", name: "玛律恰那：海洋进修" },
  { nameCode: "5012", name: "白雪公主" },
  { nameCode: "5101", name: "小红帽" },
  { nameCode: "1010", name: "拉普拉斯" },
]);

const normalizeCode = (value) => String(value ?? "").trim();

export const isCommonCharacterTemplate = (template) => (
  template?.systemKey === COMMON_CHARACTER_TEMPLATE_KEY
);

export const buildCommonCharacterData = (nikkeList, existingData = null) => {
  const catalogByCode = new Map(
    (Array.isArray(nikkeList) ? nikkeList : [])
      .map((nikke) => [normalizeCode(nikke?.name_code), nikke])
      .filter(([code]) => code),
  );
  const existingByCode = new Map(
    flattenCharacterConfig(existingData)
      .map((character) => [normalizeCode(character?.name_code), character])
      .filter(([code]) => code),
  );
  const resolved = COMMON_CHARACTER_LIST
    .map((entry) => catalogByCode.get(entry.nameCode))
    .filter(Boolean);
  const data = buildCharactersConfig(resolved, {
    showEquipDetails: existingData?.options?.showEquipDetails !== false,
  });
  flattenCharacterConfig(data).forEach((character) => {
    const existing = existingByCode.get(normalizeCode(character?.name_code));
    if (Array.isArray(existing?.showStats)) character.showStats = [...existing.showStats];
  });
  data.order = COMMON_CHARACTER_LIST.map((entry) => entry.nameCode);
  return {
    data,
    missing: COMMON_CHARACTER_LIST.filter((entry) => !catalogByCode.has(entry.nameCode)),
  };
};

export const upsertCommonCharacterTemplate = ({
  templates,
  nikkeList,
  newTemplateId,
  now = Date.now(),
}) => {
  const source = Array.isArray(templates) ? templates : [];
  let target = source.find(isCommonCharacterTemplate)
    || source.find((template) => template?.isDefault)
    || source[0]
    || null;
  if (!target) {
    target = {
      id: String(newTemplateId || ""),
      createdAt: now,
      data: {},
    };
  }
  const { data, missing } = buildCommonCharacterData(nikkeList, target.data);
  const common = {
    ...target,
    name: COMMON_CHARACTER_TEMPLATE_NAME,
    data,
    isDefault: true,
    isFixed: true,
    systemKey: COMMON_CHARACTER_TEMPLATE_KEY,
    commonListVersion: COMMON_CHARACTER_TEMPLATE_VERSION,
  };
  const withoutTarget = source.filter((template) => template.id !== target.id);
  const next = [common, ...withoutTarget.map((template) => ({
    ...template,
    isDefault: false,
  }))];
  return { templates: next, template: common, missing };
};
