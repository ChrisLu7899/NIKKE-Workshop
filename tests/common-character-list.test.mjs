import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMON_CHARACTER_LIST,
  COMMON_CHARACTER_TEMPLATE_KEY,
  COMMON_CHARACTER_TEMPLATE_VERSION,
  buildCommonCharacterData,
  upsertCommonCharacterTemplate,
} from "../src/data/commonCharacterList.js";
import { flattenCharacterConfig } from "../src/utils/characterCollections.js";

const catalog = COMMON_CHARACTER_LIST.map((entry, index) => ({
  id: index + 1,
  resource_id: index + 100,
  name_code: entry.nameCode,
  name_cn: entry.name,
  name_en: entry.name,
  element: "Fire",
}));

test("common list contains the requested unique Nikkes", () => {
  assert.equal(COMMON_CHARACTER_LIST.length, 31);
  assert.equal(new Set(COMMON_CHARACTER_LIST.map((entry) => entry.nameCode)).size, 31);
  assert.equal(COMMON_CHARACTER_LIST[0].name, "拉毗：小红帽");
  assert.equal(COMMON_CHARACTER_LIST[1].nameCode, "5065");
  assert.equal(COMMON_CHARACTER_LIST[1].name, "皇冠");
  assert.equal(COMMON_CHARACTER_LIST[26].name, "拉普拉斯");
  assert.deepEqual(COMMON_CHARACTER_LIST.slice(-4), [
    { nameCode: "5186", name: "红莲：弑神" },
    { nameCode: "5185", name: "玛丽安：女王" },
    { nameCode: "5126", name: "芙罗拉" },
    { nameCode: "1021", name: "牡丹" },
  ]);
});

test("legacy default template migrates to a fixed common template", () => {
  const legacy = [{
    id: "1",
    name: "妮姬列表1",
    isDefault: true,
    data: {},
  }];
  const result = upsertCommonCharacterTemplate({
    templates: legacy,
    nikkeList: catalog,
    newTemplateId: "2",
    now: 123,
  });
  assert.equal(result.template.id, "1");
  assert.equal(result.template.name, "常用");
  assert.equal(result.template.systemKey, COMMON_CHARACTER_TEMPLATE_KEY);
  assert.equal(result.template.isFixed, true);
  assert.deepEqual(
    flattenCharacterConfig(result.template.data).map((entry) => String(entry.name_code)),
    COMMON_CHARACTER_LIST.map((entry) => entry.nameCode),
  );
  assert.deepEqual(result.missing, []);

  // A stored v1 common list gains the new identities without losing its ID,
  // display preferences or unrelated user lists; repeated loading is stable.
  const previous = structuredClone(result.template);
  previous.commonListVersion = 1;
  previous.data.elements.Fire = previous.data.elements.Fire.filter(entry => !["5186", "5185", "5126", "1021"].includes(String(entry.name_code)));
  previous.data.elements.Fire[0].showStats = ["existing-display-setting"];
  previous.data.options.showEquipDetails = false;
  const custom = { id: "custom", name: "自选", data: { marker: "keep" } };
  const updated = upsertCommonCharacterTemplate({templates: [previous, custom], nikkeList: catalog});
  assert.equal(updated.template.id, previous.id);
  assert.equal(updated.template.commonListVersion, COMMON_CHARACTER_TEMPLATE_VERSION);
  assert.equal(flattenCharacterConfig(updated.template.data).length, 31);
  assert.deepEqual(flattenCharacterConfig(updated.template.data)[0].showStats, ["existing-display-setting"]);
  assert.equal(updated.template.data.options.showEquipDetails, false);
  assert.deepEqual(updated.templates[1].data, custom.data);
  const repeated = upsertCommonCharacterTemplate({templates: updated.templates, nikkeList: catalog});
  assert.deepEqual(repeated.templates, updated.templates);
});

test("common ordering follows the current catalog across elements, rather than membership insertion order", () => {
  const entry = code => catalog.find(nikke => nikke.name_code === code);
  const firstCodes = ["1021", "5129", "5065", "5126"];
  const reordered = [
    { ...entry("1021"), element: "Water" },
    entry("5129"),
    { name_code: "not-common", element: "Fire" },
    { ...entry("5065"), element: "Iron" },
    { ...entry("5126"), element: "Wind" },
    ...catalog.filter(nikke => !firstCodes.includes(nikke.name_code)).reverse(),
    entry("1021"),
  ];
  const { data, missing } = buildCommonCharacterData(reordered);
  assert.deepEqual(data.order.slice(0, 4), firstCodes);
  assert.equal(data.order.length, 31);
  assert.equal(new Set(data.order).size, 31);
  assert.equal(data.order.includes("not-common"), false);
  assert.deepEqual(missing, []);
  const partial = buildCommonCharacterData([entry("1021"), entry("5126")]);
  assert.deepEqual(partial.data.order, ["1021", "5126"]);
  assert.equal(partial.missing.length, 29);
});
