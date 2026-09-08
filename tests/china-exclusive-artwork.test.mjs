// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { CHINA_EXCLUSIVE_CHARACTERS, withChinaExclusiveCharacters } from "../src/data/chinaExclusiveCharacters.js";
import { getNikkeArtworkCandidates } from "../src/utils/nikkeAvatar.js";

const manifest = JSON.parse(await readFile(new URL("../public/ui-assets/nikke/manifest.json", import.meta.url)));
const provenance = JSON.parse(await readFile(new URL("../public/ui-assets/nikke/character-artwork/china-exclusive-sources.json", import.meta.url)));

test("CN defaults use offline artwork without inventing upstream IDs or expression skins", () => {
  for (const character of CHINA_EXCLUSIVE_CHARACTERS) {
    assert.equal(character.resource_id, null);
    assert.equal(character.artwork_url, `${manifest.basePath}/${manifest.assets.characterArtwork.chinaExclusiveDefaults[character.id]}`);
    assert.deepEqual(getNikkeArtworkCandidates(character), [{ id: "default", label: "默认", url: character.artwork_url }]);
    assert.match(character.artwork_url, /^\/ui-assets\/nikke\/character-artwork\/cn-exclusive-[a-z]+\.webp$/);
  }
});

test("stale cached CN artwork is upgraded without changing character identity", () => {
  const cached = CHINA_EXCLUSIVE_CHARACTERS.map((character) => ({ ...character, artwork_url: `images/characters/${character.id}.png` }));
  const refreshed = withChinaExclusiveCharacters(cached);
  assert.deepEqual(refreshed, CHINA_EXCLUSIVE_CHARACTERS);
  assert.deepEqual(refreshed.map(({ id }) => id), cached.map(({ id }) => id));
});

test("CN full-body assets match provenance and have transparent, uncropped 1600px canvases", async () => {
  assert.equal(provenance.conversion.crop, false);
  assert.deepEqual(provenance.characters.map(({ id }) => id), CHINA_EXCLUSIVE_CHARACTERS.map(({ id }) => id));
  for (const item of provenance.characters) {
    const file = await readFile(new URL(`../public/ui-assets/nikke/character-artwork/${item.output.file}`, import.meta.url));
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1600);
    assert.equal(metadata.height, 1600);
    assert.equal(metadata.hasAlpha, true);
    assert.equal(file.length, item.output.bytes);
    assert.equal(createHash("sha256").update(file).digest("hex"), item.output.sha256);
    assert.match(item.source, /^https:\/\/www\.spriters-resource\.com\//);
    assert.match(item.entry, /Standing\/Idle\/Idle \(Default\)\.png$/);
    assert.deepEqual(item.availableCostumes, ["00"]);
    assert.equal(item.expressionVariantsAreCostumes, false);
    // Default card cover clips the sides of a square asset: all opaque pixels must
    // fit inside that visible portrait window, including hair, weapons and feet.
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let visiblePixels = 0;
    let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
    for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] > 10) {
        visiblePixels += 1;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    assert.ok(visiblePixels > 250000);
    const visibleWidth = 1600 * 736 / 1096;
    assert.ok(minX > (1600 - visibleWidth) / 2 && maxX < (1600 + visibleWidth) / 2);
    assert.ok(minY >= 32 && maxY < 1568);
  }
});
