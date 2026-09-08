import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expectedEquipmentSprite, deriveOverloadBadge, EQUIPMENT_RECIPE } from '../scripts/sync-character-equipment.mjs';
import { equipmentFamilyForClass } from '../src/domain/characterCard.js';

const base = new URL('../public/ui-assets/nikke/', import.meta.url);
const sha = b => createHash('sha256').update(b).digest('hex');
test('12 displayed equipment assets match reviewed dp sources and correct class/slot', async () => {
  const proof = JSON.parse(await readFile(new URL('equipment/extracted-sources.json', base)));
  assert.deepEqual(proof.recipe, EQUIPMENT_RECIPE);
  const source = proof.sources.equipment;
  assert.equal(source.status, 'promoted');
  assert.equal(source.source.region, 'dp');
  assert.equal(source.items.length, 12);
  for (const cls of ['Attacker', 'Defender', 'Supporter']) for (const slot of ['head', 'body', 'arms', 'legs']) {
    const id = `${equipmentFamilyForClass(cls)}-${slot}`;
    const item = source.items.find(x => x.id === id);
    assert.equal(item.sprite_name, expectedEquipmentSprite(id));
    assert.equal(item.review_status, 'visually_verified');
    const bytes = await readFile(new URL(`equipment/overload/${id}.png`, base));
    assert.equal(sha(bytes), item.png_sha256);
    const meta = await sharp(bytes).metadata();
    assert.deepEqual([meta.width, meta.height, meta.hasAlpha], [128, 128, true]);
  }
  assert.equal(expectedEquipmentSprite('unknown-head'), '');
  assert.equal(expectedEquipmentSprite('99-unknown'), '');
});

test('overload badge is reproducible from three native layers with safe transparent bounds', async () => {
  const originals = await Promise.all(['frame','stroke','glyph'].map(n => readFile(new URL(`equipment/native/overload-${n}.png`, base))));
  const bytes = await deriveOverloadBadge(...originals);
  assert(bytes.equals(await readFile(new URL('equipment/overload-badge.png', base))));
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  assert.deepEqual([info.width, info.height], [112, 124]);
  // No trim at the canvas perimeter and no opaque rectangular background.
  for (let x=0; x<info.width; x++) {
    assert.equal(data[x*4+3], 0); assert.equal(data[((info.height-1)*info.width+x)*4+3], 0);
  }
  for (let y=0; y<info.height; y++) {
    assert.equal(data[(y*info.width)*4+3], 0); assert.equal(data[(y*info.width+info.width-1)*4+3], 0);
  }
});

test('every equipment derivative carries a matching hash and stable public manifest path', async () => {
  const proof = JSON.parse(await readFile(new URL('equipment/extracted-sources.json', base)));
  assert.equal(proof.items.length, 16);
  for (const item of proof.items) assert.equal(sha(await readFile(new URL(item.file, base))), item.png_sha256);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
  assert.equal(manifest.assets.characterCard.overloadBadgeSource, 'equipment/overload-badge.png');
});
