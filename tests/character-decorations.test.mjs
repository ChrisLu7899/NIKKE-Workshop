import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { nineSlice, DECORATION_RECIPE, deriveDecorations } from '../scripts/sync-character-decorations.mjs';
import { readApprovedUi } from '../scripts/sync-character-card-ui.mjs';

test('decoration images bind reviewed source, independent level badge, and declared recipe', async () => {
  const dir = new URL('../public/ui-assets/nikke/metadata/decorations/', import.meta.url);
  const proof = JSON.parse(await readFile(new URL('extracted-sources.json', dir)));
  assert.deepEqual(proof.recipe, DECORATION_RECIPE);
  assert.equal(proof.source.status, 'promoted');
  assert.equal(proof.source.items.length, 4);
  assert(proof.source.items.every(i => i.review_status === 'visually_verified'));
  const sizes = { heart: [84, 80], 'affection-frame': [348, 62], 'skill-frame': [100, 100], 'level-badge': [128, 128] };
  for (const item of proof.items) {
    const b = await readFile(new URL(`${item.id}.png`, dir));
    assert.equal(createHash('sha256').update(b).digest('hex'), item.png_sha256);
    const m = await sharp(b).metadata();
    assert.deepEqual([m.width, m.height], sizes[item.id]);
    assert.equal(m.hasAlpha, true);
  }
});

test('nine-slice preserves corner pixels and rejects collapsed regions', async () => {
  const src = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#ff0000' } }).png().toBuffer();
  const output = await nineSlice(src, 348, 62, 20);
  const corner = await sharp(output).extract({ left: 0, top: 0, width: 20, height: 20 }).raw().toBuffer();
  assert(corner.every((v, i) => v === [255, 0, 0, 255][i % 4]));
  await assert.rejects(nineSlice(src, 30, 30, 20), /nine-slice/);
});

test('source gate rejects unknown decoration groups and incomplete derivation', async () => {
  await assert.rejects(readApprovedUi('.', 'decoration-unknown'), /Invalid UI group/);
  await assert.rejects(deriveDecorations({ assets: [] }));
});
