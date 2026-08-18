// SPDX-License-Identifier: GPL-3.0-or-later

import { EXTENDED_RECOMMENDATION_PRESETS } from "./recommendationPresetsExtended.js";
import { LINEUP_RECOMMENDATION_PRESETS } from "./recommendationLineupPresets.js";

export const RECOMMENDATION_COLLECTION_PREFIX = "recommendation:";

const item = (nameCode, name, note, equipment, lines, skills, cube, collectible) => ({
  nameCode,
  name,
  note,
  equipment,
  lines,
  skills,
  cube,
  collectible,
});

const ALL_RECOMMENDATION_PRESETS = [
  {
    id: "stage-one-cooldown",
    name: "1阶段减减冷却角色",
    items: [
      item("5169", "阿妮斯：超级巨星", "7.5秒", "4T10，头手甲升级", "优越、攻击、1装弹", "10/10/10", "遗迹巨熊", "SR15级"),
      item("5137", "小美人鱼", "7.5秒", "4T10，头手甲升级", "优越、攻击", "10/10/10", "战术/遗迹巨熊", "SR15级"),
      item("1021", "牡丹", "7.5秒", "4T10，头手甲升级", "出啥用啥", "1+/10/10", "遗迹/战术巨熊", "3阶珍藏品"),
      item("5011", "丽塔", "叠层8.21秒", "无硬性需求", "出啥用啥", "10/7/10", "战术/遗迹巨熊", "SR0级"),
      item("5049", "露姬", "7秒", "4T10，头手甲升级", "最好1装弹", "10/4++/7+", "遗迹巨熊", "SR5+级"),
      item("5129", "拉毗：小红帽", "7.5秒；非优越期间可以当减冷却", "4T10，头手甲升级", "3+装弹、优越、攻击（可4弹或3弹1爆伤）", "10/10/10", "战术巨熊", "SR15级"),
      item("5158", "索林：霜雪车票", "7.5秒；一般跟霰弹队用", "无所谓", "无所谓", "10/1/1", "战术/遗迹巨熊", "SR0+级"),
      item("5110", "D：杀手妻子", "7秒；除企业塔外使用较少", "T10头手甲升级", "出啥用啥", "7+/10/7+", "战术/遗迹巨熊", "SR0+级"),
    ],
  },
  {
    id: "flexible-support",
    name: "灵活搭配辅助",
    items: [
      item("5065", "皇冠", "独一档强度、PVE必练", "4T10，头手甲升级", "2+装弹", "10/10/10", "战术/遗迹巨熊", "SR15级"),
      item("5155", "娜由塔", "有奶有增伤，好用", "4T10，头手甲升级", "优越、攻击", "7+/7+/10", "战术/遗迹巨熊", "SR15级"),
      item("5007", "普丽瓦蒂", "可以轴外，很好用", "4T10，头手甲升级", "无装弹、攻击、优越（优越和攻击收益接近）", "10/10/7+", "遗迹巨熊", "珍藏品3阶"),
      item("5126", "芙萝拉", "配皇冠/阿尔卡娜使用", "4T10，头手甲升级", "无所谓", "4+/7+/7+", "战术/遗迹巨熊", "3阶"),
      item("5151", "艾德：特工兔女郎", "多队补位用", "T10头手甲升级", "无所谓", "4++/4++/10", "战术/遗迹巨熊", "SR0+级"),
      item("5160", "布丽德：静默轨道", "就业仅限火优", "4T10，头手甲升级", "优越、攻击", "7/7/10", "战术/遗迹巨熊", "SR0+级"),
      item("5021", "桑迪", "就业仅限铁优", "4T10，头手甲升级", "无所谓", "7+/7+/1（不开大）", "战术/遗迹巨熊", "2阶"),
      item("5125", "格拉维", "多队补位用", "4T10，头手甲升级", "优越、攻击、爆伤", "7+/7+/10", "穿透/毁灭/巨熊", "SR0+级"),
      item("5116", "罗珊娜：别致海洋", "辅助持续伤害角色", "T10头手甲升级", "无所谓", "4+/4+/10", "战术/遗迹巨熊", "SR0+级"),
      item("5098", "海伦：海蓝宝石", "就业仅限铁优", "无所谓", "无所谓", "4/7+/4", "战术/遗迹巨熊", "SR0级"),
    ],
  },
  {
    id: "paired-support",
    name: "双子辅助",
    items: [
      item("5130", "马斯特：浪漫女仆", "女仆双子（目前版本重点，个突必练）", "T10头手甲升级", "出啥用啥", "10/10/10", "战术/遗迹巨熊", "SR15级"),
      item("5131", "安克：天真女仆", "女仆双子（目前版本重点，个突必练）", "T10头手甲升级", "出啥用啥", "7/7+/4+", "战术/遗迹巨熊", "SR5+级"),
      item("5172", "敏特", "偶像双子（目前版本重点，个突必练）", "T10头手甲升级", "出啥用啥", "7+/7+/7", "战术/遗迹巨熊", "SR5+级"),
      item("5173", "普丽卡", "偶像双子；强绑定敏特", "T10头手甲升级", "出啥用啥", "7/7/7", "战术/遗迹巨熊", "SR0+级"),
      item("5008", "布兰儿", "黑白兔（主要PVP就业）；需绑定露姬/诺亚尔之一", "无硬性需求", "出啥用啥", "1+/4++/10", "遗迹/战术巨熊", "SR0+级"),
      item("5009", "诺亚尔", "黑白兔（主要PVP就业）", "T10头手甲升级", "出啥用啥", "7+/9/4+", "战术/遗迹巨熊", "SR0+级"),
      item("5100", "蒂亚", "黑白JK（主要爬米西利斯塔，其他玩法较少）", "无硬性需求", "无建议", "7+/1+/1+", "双巨熊/体力神器", "SR0+级"),
      item("5099", "娜嘉", "黑白JK；需要皇冠/蒂亚启动；配皇冠可不升爆裂", "T10头手甲升级", "出啥用啥", "10/10/10", "战术/遗迹巨熊", "SR0+级"),
      item("5147", "艾玛：战术升级", "特殊双子（前排偶尔会用，普通玩家可跳过）", "可给T10头手甲", "不推荐洗", "4/7+/7+", "战术巨熊", "SR0+级"),
      item("5149", "尤妮华：战术升级", "特殊双子（前排偶尔会用，普通玩家可跳过）", "T10头手甲升级", "优越、攻击", "7+/7+/7+", "战术/遗迹巨熊", "SR0+级"),
    ],
  },
  ...EXTENDED_RECOMMENDATION_PRESETS,
  ...LINEUP_RECOMMENDATION_PRESETS,
];

export const RECOMMENDATION_PRESET_GROUPS = [
  {
    id: "campaign",
    name: "推图阵容",
    nameEn: "Campaign",
    presetIds: ["version-campaign-lineup"],
  },
  {
    id: "interception",
    name: "异常拦截",
    nameEn: "Interception",
    presetIds: [
      "kraken-auto-stage-9",
      "kraken-stage-9",
      "radical-stage-9",
      "harvester-stage-9",
      "mirror-container-stage-9",
      "indivilia-stage-9",
    ],
  },
  {
    id: "support",
    name: "辅助角色",
    nameEn: "Support",
    presetIds: ["stage-one-cooldown", "flexible-support", "paired-support"],
  },
  {
    id: "union-raid-dps",
    name: "个突主C",
    nameEn: "Union Raid DPS",
    presetIds: ["fire-main-c", "water-main-c", "wind-main-c", "electric-main-c", "iron-main-c"],
  },
  {
    id: "corporation-tower",
    name: "企业塔",
    nameEn: "Manufacturer Tower",
    presetIds: ["elysion-tower", "tetra-tower", "missilis-tower", "pilgrim-overspec-tower"],
  },
  {
    id: "other",
    name: "其他",
    nameEn: "Other",
    presetIds: ["shotgun-team", "critical-team"],
  },
];

const recommendationPresetById = new Map(
  ALL_RECOMMENDATION_PRESETS.map((preset) => [preset.id, preset]),
);

export const RECOMMENDATION_PRESETS = RECOMMENDATION_PRESET_GROUPS.flatMap((group) =>
  group.presetIds.map((id) => recommendationPresetById.get(id)).filter(Boolean));

export const recommendationCollectionId = (presetId) => `${RECOMMENDATION_COLLECTION_PREFIX}${presetId}`;

export const getRecommendationPreset = (collectionId) => {
  const value = String(collectionId || "");
  if (!value.startsWith(RECOMMENDATION_COLLECTION_PREFIX)) return null;
  const id = value.slice(RECOMMENDATION_COLLECTION_PREFIX.length);
  return RECOMMENDATION_PRESETS.find((preset) => preset.id === id) || null;
};

export const getRecommendationItem = (preset, nameCode) => {
  const code = String(nameCode ?? "").trim();
  return preset?.items?.find((entry) => String(entry.nameCode) === code) || null;
};

const CULTIVATION_FIELDS = ["equipment", "lines", "skills", "cube", "collectible"];
const UNAVAILABLE_CULTIVATION_VALUE = "原图未提供";

export const listRecommendationAdvice = (nameCode, preferredCollectionId = "") => {
  const code = String(nameCode ?? "").trim();
  if (!code) return [];

  const preferredPresetId = String(preferredCollectionId || "").startsWith(RECOMMENDATION_COLLECTION_PREFIX)
    ? String(preferredCollectionId).slice(RECOMMENDATION_COLLECTION_PREFIX.length)
    : "";
  const matches = [];

  RECOMMENDATION_PRESETS.forEach((preset, presetIndex) => {
    const entry = getRecommendationItem(preset, code);
    if (!entry) return;
    const hasCultivationData = CULTIVATION_FIELDS.some((field) => {
      const value = String(entry[field] || "").trim();
      return value && value !== UNAVAILABLE_CULTIVATION_VALUE;
    });
    if (!hasCultivationData) return;
    matches.push({
      presetId: preset.id,
      presetName: preset.name,
      presetIndex,
      ...entry,
    });
  });

  return matches.sort((left, right) => {
    const leftPreferred = left.presetId === preferredPresetId ? 1 : 0;
    const rightPreferred = right.presetId === preferredPresetId ? 1 : 0;
    return rightPreferred - leftPreferred || left.presetIndex - right.presetIndex;
  });
};

const MERGED_ADVICE_FIELDS = ["note", ...CULTIVATION_FIELDS];

export const mergeRecommendationAdvice = (recommendations) => Object.fromEntries(
  MERGED_ADVICE_FIELDS.map((field) => {
    const values = [];
    (recommendations || []).forEach((recommendation) => {
      const value = String(recommendation?.[field] || "").trim();
      if (value && value !== UNAVAILABLE_CULTIVATION_VALUE && !values.includes(value)) values.push(value);
    });
    return [field, values.join("；") || "—"];
  }),
);
