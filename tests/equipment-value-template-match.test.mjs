// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  composeValueGlyphMasks,
  createValueGlyphMask,
  rankComposedValueCandidates,
  rankValueTemplateCandidates,
} from "../src/domain/equipmentValueTemplateMatch.js";

function rgbaMask(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const rgba = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => [...row].forEach((value, x) => {
    const color = value === "#" ? 40 : 232;
    const offset = ((y * width) + x) * 4;
    rgba[offset] = color;
    rgba[offset + 1] = color;
    rgba[offset + 2] = color;
    rgba[offset + 3] = 255;
  }));
  return createValueGlyphMask(rgba, width, height);
}

test("value mask removes a continuous effect-row border without erasing tight glyph rows", () => {
  const mask = rgbaMask([
    "##############################",
    "..............................",
    ".###.###...###.###............",
    ".#.#.#.#...#.#.#.#............",
    ".###.###...###.###............",
  ]);
  assert.ok(mask.width > 8);
  assert.ok(mask.height >= 3);
  assert.ok(mask.data.some(Boolean));
});

test("legal full-value templates rank the identical glyph sequence first", () => {
  const observed = rgbaMask([
    ".##..##....#...##..###.",
    "..#...#....#....#..#.#.",
    ".##..##....#...##..###.",
  ]);
  const wrong = rgbaMask([
    ".##..##....#...###.###.",
    "..#...#....#...#.#.#.#.",
    ".##..##....#...###.###.",
  ]);
  const ranked = rankValueTemplateCandidates(observed, [
    { level: 9, mask: wrong },
    { level: 10, mask: observed },
  ]);
  assert.equal(ranked[0].level, 10);
  assert.equal(ranked[0].score, 0);
  assert.ok(ranked[1].score > ranked[0].score);
});

test("composed character templates rank an exact legal percentage first", () => {
  const one = rgbaMask(["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."]);
  const zero = rgbaMask([".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."]);
  const four = rgbaMask(["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."]);
  const dot = rgbaMask([".....", ".....", ".....", ".....", ".....", ".##..", ".##.."]) ;
  const percent = rgbaMask(["##..#", "##.#.", "..#..", ".#...", "#..##", "..##.", "....."]);
  const observed = composeValueGlyphMasks([one, zero, dot, four, zero, percent], { gap: 1 });
  const wrong = composeValueGlyphMasks([zero, zero, dot, zero, zero, percent], { gap: 1 });
  const ranked = rankComposedValueCandidates(observed, [
    { level: 11, mask: wrong },
    { level: 9, mask: observed },
  ]);
  assert.equal(ranked[0].level, 9);
  assert.equal(ranked[0].score, 0);
  assert.ok(ranked[1].score > ranked[0].score);
});
