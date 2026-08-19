import assert from "node:assert/strict";
import test from "node:test";

import {
  SIMPLIFIED_CHINESE_CHARACTER_NAME_OVERRIDES,
  resolveCharacterDisplayName,
  resolveSimplifiedChineseCharacterName,
} from "../src/data/characterNameOverrides.js";
import { COMMON_CHARACTER_LIST } from "../src/data/commonCharacterList.js";
import { RECOMMENDATION_PRESETS } from "../src/data/recommendationPresets.js";
import { adaptCalculatorSnapshot } from "../src/calculator/snapshotAdapter.js";

test("name code 5143 uses the simplified Chinese translation 渡鸦", () => {
  assert.equal(SIMPLIFIED_CHINESE_CHARACTER_NAME_OVERRIDES["5143"], "渡鸦");
  assert.equal(
    resolveSimplifiedChineseCharacterName({ name_code: "5143", name_cn: "蕾雯" }),
    "渡鸦",
  );
  assert.equal(
    resolveCharacterDisplayName({ nameCode: "5143", nameCn: "蕾雯", nameEn: "Raven" }, "zh"),
    "渡鸦",
  );
});

test("English and unrelated Chinese character names remain unchanged", () => {
  assert.equal(
    resolveCharacterDisplayName({ name_code: "5143", name_cn: "蕾雯", name_en: "Raven" }, "en"),
    "Raven",
  );
  assert.equal(
    resolveSimplifiedChineseCharacterName({ name_code: "5124", name_cn: "灰姑娘" }),
    "灰姑娘",
  );
});

test("common and recommendation collections consume the central override", () => {
  assert.equal(
    COMMON_CHARACTER_LIST.find((entry) => entry.nameCode === "5143")?.name,
    "渡鸦",
  );
  assert.equal(
    RECOMMENDATION_PRESETS
      .find((preset) => preset.id === "iron-main-c")
      ?.items.find((entry) => entry.nameCode === "5143")
      ?.name,
    "渡鸦",
  );
});

test("calculator applies the override to previously cached snapshots", () => {
  const characters = adaptCalculatorSnapshot({
    version: 2,
    ownershipSource: "GetUserCharacters",
    accounts: [{
      accountName: "测试账号",
      characters: [{
        nameCode: "5143",
        nameCn: "蕾雯",
        nameEn: "Raven",
        equipments: [[], [], [], []],
      }],
    }],
  }, {
    equipmentSlotNames: ["头", "身", "手", "足"],
    findTierForPercent: () => 1,
  });

  assert.equal(characters[0]?.name, "渡鸦");
});
