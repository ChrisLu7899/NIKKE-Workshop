// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  OCR_EQUIPMENT_LINE_STATES,
  OCR_VALUE_STYLES,
  classifyOcrLockStateFromRgba,
  classifyOcrValueStyleFromRgba,
  createOcrLabelPreviewLine,
  expectedOcrValueStyle,
  isOcrValueStyleCompatible,
  isUnearnedEquipmentEffect,
  matchEquipmentFunctionType,
  matchEquipmentSlot,
  matchEquipmentSlotFromName,
  mergeOcrEntriesIntoEquipments,
  resolveOcrEquipmentLineState,
  resolveEquipmentSlot,
  validateOcrPreview,
} from "../src/domain/equipmentScreenshotOcr.js";
import { tierValue } from "../src/domain/equipmentAffixes.js";

const rgbaPixels = (...colors) => Uint8ClampedArray.from(colors.flatMap(([red, green, blue, alpha = 255]) => [red, green, blue, alpha]));

test("equipment slot OCR maps the screenshot's second grey label to four physical slots", () => {
  assert.equal(matchEquipmentSlot("全 头部"), "头部");
  assert.equal(matchEquipmentSlot("峙身躯"), "身躯");
  assert.equal(matchEquipmentSlot("点 涌部"), "臂部");
  assert.equal(matchEquipmentSlot("涌?部"), "臂部");
  assert.equal(matchEquipmentSlot("R 。 腿部"), "腿部");
});

test("the 12 overload equipment names determine their physical slot before the noisy corner label", () => {
  assert.equal(matchEquipmentSlotFromName("v金属面罩"), "头部");
  assert.equal(matchEquipmentSlotFromName("99型头盔"), "头部");
  assert.equal(matchEquipmentSlotFromName("代码XXX护目镜"), "头部");
  assert.equal(matchEquipmentSlotFromName("V 金属背心"), "身躯");
  assert.equal(matchEquipmentSlotFromName("99型防护服"), "身躯");
  assert.equal(matchEquipmentSlotFromName("代码A1夹克"), "身躯");
  assert.equal(matchEquipmentSlotFromName("v金属护臂"), "臂部");
  assert.equal(matchEquipmentSlotFromName("99型臂铠"), "臂部");
  assert.equal(matchEquipmentSlotFromName("代码XXX手套"), "臂部");
  assert.equal(matchEquipmentSlotFromName("v金属靴子"), "腿部");
  assert.equal(matchEquipmentSlotFromName("99型护腿"), "腿部");
  assert.equal(matchEquipmentSlotFromName("代码XXX鞋"), "腿部");
});

test("equipment slot resolution always prefers a recognized equipment name over a noisy label", () => {
  assert.deepEqual(resolveEquipmentSlot({ rawEquipmentName: "v金属护臂", rawSlot: "涌?部" }), {
    equipmentSlot: "臂部",
    equipmentSlotSource: "equipmentName",
    slotFromName: "臂部",
    slotFromLabel: "臂部",
    conflict: false,
  });
  assert.equal(resolveEquipmentSlot({ rawEquipmentName: "代码XXX护目镜", rawSlot: "念头部" }).equipmentSlot, "头部");
});

test("equipment icon match takes priority over noisy name and corner-label OCR", () => {
  assert.deepEqual(resolveEquipmentSlot({
    rawEquipmentName: "99型头盔",
    rawSlot: "头部",
    equipmentIconMatch: { slot: "臂部", confidence: "high" },
  }), {
    equipmentSlot: "臂部",
    equipmentSlotSource: "equipmentIcon",
    slotFromIcon: "臂部",
    slotFromName: "头部",
    slotFromLabel: "头部",
    conflict: true,
  });
});

test("affix OCR aliases map to the unified equipment model", () => {
  assert.equal(matchEquipmentFunctionType("【优越代码伤害增加】"), "IncElementDmg");
  assert.equal(matchEquipmentFunctionType("攻击力增加"), "StatAtk");
  assert.equal(matchEquipmentFunctionType("最大装单数增加"), "StatAmmoLoad");
});

test("label recognition waits for constrained value-template evidence", () => {
  const line = createOcrLabelPreviewLine(2, {
    rawLabel: "攻击力增加",
    locked: false,
  });
  assert.equal(line.position, 2);
  assert.equal(line.functionType, "StatAtk");
  assert.equal(line.value, null);
  assert.equal(line.level, null);
  assert.equal(line.locked, false);
  assert.equal(resolveOcrEquipmentLineState(line), OCR_EQUIPMENT_LINE_STATES.NEEDS_CONFIRMATION);
  assert.match(line.warnings.join("；"), /数值模板待匹配/);
});

test("null value and tier cannot be coerced into a completed zero-valued line", () => {
  const line = {
    position: 1,
    functionType: "StatAtk",
    value: null,
    level: null,
    locked: false,
  };
  assert.equal(resolveOcrEquipmentLineState(line), OCR_EQUIPMENT_LINE_STATES.NEEDS_CONFIRMATION);
  assert.match(validateOcrPreview([{
    characterName: "测试角色",
    fileName: "null-value.png",
    equipmentSlot: "头部",
    lines: [line],
  }]).join("；"), /需要确认数值与档位/);
});

test("unleveled equipment's unearned-effect row remains a blank physical slot", () => {
  assert.equal(isUnearnedEquipmentEffect("未获得效果"), true);
  assert.equal(isUnearnedEquipmentEffect("未获待效果"), true);
  const line = createOcrLabelPreviewLine(3, {
    rawLabel: "未获得效果",
    locked: null,
  });
  assert.equal(line.position, 3);
  assert.equal(line.functionType, "");
  assert.equal(line.value, null);
  assert.equal(line.level, null);
  assert.equal(line.locked, null);
  assert.equal(line.unearned, true);
  assert.equal(line.state, OCR_EQUIPMENT_LINE_STATES.UNEARNED);
  assert.equal(line.requiresConfirmation, false);
  assert.deepEqual(line.warnings, []);
});

test("an unreadable blank crop requires confirmation instead of silently becoming unearned", () => {
  const line = createOcrLabelPreviewLine(1, { rawLabel: "", alternateLabel: "" });
  assert.equal(line.functionType, "");
  assert.equal(line.unearned, undefined);
  assert.equal(line.state, OCR_EQUIPMENT_LINE_STATES.NEEDS_CONFIRMATION);
  assert.equal(line.requiresConfirmation, true);
  assert.match(line.warnings.join("；"), /为空或未识别/);
});

test("value colors constrain OCR to the only tiers allowed by the game UI", () => {
  assert.equal(expectedOcrValueStyle(1), OCR_VALUE_STYLES.LIGHT_BLACK);
  assert.equal(expectedOcrValueStyle(11), OCR_VALUE_STYLES.LIGHT_BLACK);
  assert.equal(expectedOcrValueStyle(12), OCR_VALUE_STYLES.LIGHT_BLUE);
  assert.equal(expectedOcrValueStyle(14), OCR_VALUE_STYLES.LIGHT_BLUE);
  assert.equal(expectedOcrValueStyle(15), OCR_VALUE_STYLES.DARK_BLUE);

  assert.equal(isOcrValueStyleCompatible(11, OCR_VALUE_STYLES.LIGHT_BLACK), true);
  assert.equal(isOcrValueStyleCompatible(13, OCR_VALUE_STYLES.LIGHT_BLUE), true);
  assert.equal(isOcrValueStyleCompatible(15, OCR_VALUE_STYLES.DARK_BLUE), true);
  assert.equal(isOcrValueStyleCompatible(15, OCR_VALUE_STYLES.LIGHT_BLACK), false);
});

test("value and lock color classifiers distinguish the three visual tiers and two lock states", () => {
  const darkInkOnLight = rgbaPixels(...Array.from({ length: 20 }, () => [230, 232, 232]), [70, 80, 84]);
  const blueInkOnLight = rgbaPixels(...Array.from({ length: 20 }, () => [230, 232, 232]), [0, 155, 230]);
  const blueInkOnDark = rgbaPixels(...Array.from({ length: 20 }, () => [25, 30, 35]), [0, 155, 230]);
  assert.equal(classifyOcrValueStyleFromRgba(darkInkOnLight), OCR_VALUE_STYLES.LIGHT_BLACK);
  assert.equal(classifyOcrValueStyleFromRgba(blueInkOnLight), OCR_VALUE_STYLES.LIGHT_BLUE);
  assert.equal(classifyOcrValueStyleFromRgba(blueInkOnDark, { darkBackground: true }), OCR_VALUE_STYLES.DARK_BLUE);

  const unlocked = rgbaPixels(...Array.from({ length: 20 }, () => [235, 235, 235]), [80, 80, 80]);
  const locked = rgbaPixels(...Array.from({ length: 20 }, () => [30, 30, 30]), [0, 155, 230]);
  assert.equal(classifyOcrLockStateFromRgba(unlocked), false);
  assert.equal(classifyOcrLockStateFromRgba(locked), true);
});

test("unreadable labels are never inferred from a coincidental legal number", () => {
  const unresolved = createOcrLabelPreviewLine(1, {
    rawLabel: "无法识别的字形",
    locked: false,
    valueStyle: OCR_VALUE_STYLES.LIGHT_BLACK,
  });
  assert.equal(unresolved.functionType, "");
  assert.equal(unresolved.value, null);
  assert.equal(unresolved.level, null);
  assert.equal(unresolved.locked, null);
  assert.match(unresolved.warnings.join("；"), /未识别词条名称/);
});

test("OCR merge preserves physical positions, including a blank second line", () => {
  const equipments = mergeOcrEntriesIntoEquipments(null, [{
    characterName: "拉毗：小红帽",
    equipmentSlot: "腿部",
    lines: [
      { position: 1, functionType: "StatAmmoLoad", value: 68.93, level: 11, locked: true },
      { position: 2, functionType: "", value: null, level: null, locked: null },
      { position: 3, functionType: "IncElementDmg", value: 23.56, level: 11, locked: false },
    ],
  }]);
  assert.equal(equipments[3][0].position, 1);
  assert.equal(equipments[3][0].functionType, "StatAmmoLoad");
  assert.equal(equipments[3][0].locked, true);
  assert.equal(equipments[3][1].position, 2);
  assert.equal(equipments[3][1].functionType, "");
  assert.equal(equipments[3][2].position, 3);
  assert.equal(equipments[3][2].functionType, "IncElementDmg");
  assert.equal(equipments[3][2].locked, false);
});

test("preview validation only blocks unresolved or contradictory OCR results", () => {
  const valid = [{
    characterName: "拉毗：小红帽",
    fileName: "足部.png",
    equipmentSlot: "腿部",
    lines: [
      { position: 1, functionType: "StatAmmoLoad", value: 68.93, level: 11, locked: true },
      { position: 2, functionType: "", value: null, level: null, locked: null },
      { position: 3, functionType: "IncElementDmg", value: 23.56, level: 11, locked: false },
    ],
  }];
  assert.deepEqual(validateOcrPreview(valid), []);

  const invalid = structuredClone(valid);
  invalid[0].lines[2].locked = null;
  invalid[0].lines[0].value = 60.71;
  const errors = validateOcrPreview(invalid).join("；");
  assert.match(errors, /数值与档位不一致/);
  assert.match(errors, /需要确认锁定状态/);
});

test("all 27 empty/unlocked/locked physical-row states resolve without position drift", () => {
  const stateCodes = ["E", "U", "L"];
  const functionTypes = ["StatAtk", "StatAmmoLoad", "IncElementDmg"];
  let checked = 0;
  stateCodes.forEach((first) => stateCodes.forEach((second) => stateCodes.forEach((third) => {
    const codes = [first, second, third];
    const lines = codes.map((code, index) => {
      if (code === "E") {
        return {
          position: index + 1,
          functionType: "",
          value: null,
          level: null,
          locked: null,
          unearned: true,
          state: resolveOcrEquipmentLineState({ unearned: true }),
          requiresConfirmation: false,
        };
      }
      const functionType = functionTypes[index];
      const level = 10 + index;
      const locked = code === "L";
      const line = {
        position: index + 1,
        functionType,
        value: tierValue(functionType, level),
        level,
        locked,
        valueStyle: expectedOcrValueStyle(level),
        requiresConfirmation: false,
      };
      return { ...line, state: resolveOcrEquipmentLineState(line) };
    });
    assert.deepEqual(lines.map((line) => line.position), [1, 2, 3]);
    assert.deepEqual(lines.map((line) => line.state), codes.map((code) => (
      code === "E"
        ? OCR_EQUIPMENT_LINE_STATES.UNEARNED
        : code === "L"
          ? OCR_EQUIPMENT_LINE_STATES.LOCKED
          : OCR_EQUIPMENT_LINE_STATES.UNLOCKED
    )));
    assert.deepEqual(validateOcrPreview([{
      characterName: `测试角色-${checked}`,
      fileName: `${codes.join("")}.png`,
      equipmentSlot: "头部",
      lines,
    }]), []);
    checked += 1;
  })));
  assert.equal(checked, 27);
});
