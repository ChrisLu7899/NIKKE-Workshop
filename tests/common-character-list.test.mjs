import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMON_CHARACTER_LIST,
  COMMON_CHARACTER_TEMPLATE_KEY,
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

test("common list contains the requested unique Nikkes in source order", () => {
  assert.equal(COMMON_CHARACTER_LIST.length, 26);
  assert.equal(new Set(COMMON_CHARACTER_LIST.map((entry) => entry.nameCode)).size, 26);
  assert.equal(COMMON_CHARACTER_LIST[0].name, "拉毗：小红帽");
  assert.equal(COMMON_CHARACTER_LIST.at(-1).name, "拉普拉斯");
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
});

