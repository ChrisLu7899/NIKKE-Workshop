import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCharacterAccountData,
  collectConfiguredCharacterCodes,
  getFavoriteItemRarity,
  planOwnedCharacterDetails,
} from "../src/domain/characterAccountData.js";

const createDict = () => ({
  cubes: [{ cube_id: 7, cube_level: 1 }],
  elements: {
    Fire: [{ name_code: 101 }, { name_code: 102 }],
    Water: [{ name_code: 101 }],
  },
});

test("full catalog becomes one deduplicated owned detail request plan", () => {
  const dict = createDict();
  const configured = collectConfiguredCharacterCodes(dict);
  assert.deepEqual(configured, ["101", "102"]);
  assert.deepEqual(
    planOwnedCharacterDetails(configured, [{ name_code: 102 }, { name_code: 999 }]),
    ["102"],
  );
});

test("account roster and details merge into the stable export contract", () => {
  const dict = createDict();
  const { summary, requestedCodes } = applyCharacterAccountData({
    dict,
    userCharacters: [{
      name_code: 101,
      lv: 400,
      combat: 12345,
      grade: 0,
      core: 0,
    }],
    characterDetails: [{
      name_code: 101,
      skill1_lv: 10,
      skill2_lv: 9,
      ulti_skill_lv: 8,
      attractive_lv: 30,
      favorite_item_lv: 2,
      favorite_item_tid: 212,
      equipments: { 0: [{ function_type: 1, function_value: 10 }] },
      cube_id: 7,
      cube_level: 5,
    }],
  });

  assert.deepEqual(requestedCodes, ["101"]);
  assert.equal(summary.configuredCharacterCount, 2);
  assert.equal(summary.ownedCharacterCount, 1);
  assert.equal(summary.requestedCharacterCount, 1);
  assert.equal(summary.receivedDetailCount, 1);
  assert.equal(summary.populatedCharacterCount, 1);
  assert.equal(dict.elements.Fire[0].is_owned, true);
  assert.equal(dict.elements.Fire[0].level, 400);
  assert.deepEqual(dict.elements.Fire[0].limit_break, { grade: 0, core: 0 });
  assert.equal(dict.elements.Fire[0].item_rare, "SSR");
  assert.equal(dict.elements.Fire[1].is_owned, false);
  assert.equal(dict.cubes[0].cube_level, 5);
});

test("favorite item rarity mapping remains compatible", () => {
  assert.equal(getFavoriteItemRarity(111), "R");
  assert.equal(getFavoriteItemRarity(112), "SR");
  assert.equal(getFavoriteItemRarity(212), "SSR");
  assert.equal(getFavoriteItemRarity(0), "");
});
