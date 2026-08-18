// SPDX-License-Identifier: GPL-3.0-or-later

const SOURCE_ONLY_NOTE = "原图仅提供阵容头像";
const SOURCE_NOT_PROVIDED = "原图未提供";

const lineupItem = (nameCode, name) => ({
  nameCode,
  name,
  note: SOURCE_ONLY_NOTE,
  equipment: SOURCE_NOT_PROVIDED,
  lines: SOURCE_NOT_PROVIDED,
  skills: SOURCE_NOT_PROVIDED,
  cube: SOURCE_NOT_PROVIDED,
  collectible: SOURCE_NOT_PROVIDED,
});

export const normalizeLineupPresetTitle = (value) => String(value ?? "")
  .replace(/\s+/g, "")
  .replace(/[（(][^）)]*[）)]\s*$/, "")
  .replace(/[：:]+$/, "")
  .trim();

const uniqueLineupItems = (entries) => {
  const seen = new Set();
  return entries.filter(([nameCode]) => {
    const code = String(nameCode);
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  }).map(([nameCode, name]) => lineupItem(nameCode, name));
};

const lineupPreset = (id, recognizedTitle, entries) => ({
  id,
  name: normalizeLineupPresetTitle(recognizedTitle),
  items: uniqueLineupItems(entries),
});

export const LINEUP_RECOMMENDATION_PRESETS = [
  lineupPreset("version-campaign-lineup", "版本推图阵容", [
    ["5169", "阿妮斯：超级巨星"],
    ["5065", "皇冠"],
    ["5175", "灰姑娘：琉璃波光"],
    ["5161", "白雪公主：重型武装"],
    ["5007", "普丽瓦蒂"],
    ["5169", "阿妮斯：超级巨星"],
    ["5155", "娜由塔"],
    ["5129", "拉毗：小红帽"],
    ["5066", "海伦"],
    ["5065", "皇冠"],
  ]),
  lineupPreset("kraken-auto-stage-9", "克拉肯全自动9阶", [
    ["5066", "海伦"],
    ["5131", "安克：天真女仆"],
    ["5137", "小美人鱼"],
    ["5155", "娜由塔"],
    ["5156", "莉贝雷利奥"],
    ["5131", "安克：天真女仆"],
    ["5065", "皇冠"],
    ["5156", "莉贝雷利奥"],
    ["5066", "海伦"],
    ["5129", "拉毗：小红帽"],
  ]),
  lineupPreset("kraken-stage-9", "克拉肯9阶", [
    ["5137", "小美人鱼"],
    ["5155", "娜由塔"],
    ["5156", "莉贝雷利奥"],
    ["5066", "海伦"],
    ["5065", "皇冠"],
  ]),
  lineupPreset("radical-stage-9", "过激派9阶", [
    ["5169", "阿妮斯：超级巨星"],
    ["5065", "皇冠"],
    ["5175", "灰姑娘：琉璃波光"],
    ["5129", "拉毗：小红帽"],
    ["5130", "马斯特：浪漫女仆"],
  ]),
  lineupPreset("harvester-stage-9", "死神9阶", [
    ["5169", "阿妮斯：超级巨星"],
    ["5065", "皇冠"],
    ["5161", "白雪公主：重型武装"],
    ["5066", "海伦"],
    ["5007", "普丽瓦蒂"],
  ]),
  lineupPreset("mirror-container-stage-9", "镜像容器9阶（伤害溢出不用打水晶鞋了）", [
    ["5169", "阿妮斯：超级巨星"],
    ["5065", "皇冠"],
    ["5170", "尼恩：透视之眼"],
    ["5066", "海伦"],
    ["5007", "普丽瓦蒂"],
  ]),
  lineupPreset("indivilia-stage-9", "茵迪维利亚9阶", [
    ["5169", "阿妮斯：超级巨星"],
    ["5065", "皇冠"],
    ["5129", "拉毗：小红帽"],
    ["5066", "海伦"],
    ["5130", "马斯特：浪漫女仆"],
    ["5169", "阿妮斯：超级巨星"],
    ["5155", "娜由塔"],
    ["5129", "拉毗：小红帽"],
    ["5066", "海伦"],
    ["5007", "普丽瓦蒂"],
  ]),
  lineupPreset("elysion-tower", "极乐净土塔", [
    ["5110", "D：杀手妻子"],
    ["5130", "马斯特：浪漫女仆"],
    ["5129", "拉毗：小红帽"],
    ["5066", "海伦"],
    ["5131", "安克：天真女仆"],
  ]),
  lineupPreset("tetra-tower", "泰特拉塔", [
    ["5169", "阿妮斯：超级巨星"],
    ["5172", "敏特"],
    ["5173", "普莉卡"],
    ["1021", "牡丹"],
    ["5004", "爱丽丝"],
  ]),
  lineupPreset("missilis-tower", "米西利斯塔", [
    ["5100", "蒂亚"],
    ["5011", "丽塔"],
    ["5170", "尼恩：透视之眼"],
    ["5099", "娜嘉"],
  ]),
  lineupPreset("pilgrim-overspec-tower", "朝圣者/超标准塔", [
    ["5137", "小美人鱼"],
    ["5155", "娜由塔"],
    ["5161", "白雪公主：重型武装"],
    ["5175", "灰姑娘：琉璃波光"],
    ["5065", "皇冠"],
  ]),
];
