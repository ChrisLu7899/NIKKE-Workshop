// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApprovedRarity, readApprovedUi } from '../scripts/sync-character-card-ui.mjs';
import { characterCardRarityAsset } from '../src/domain/characterCard.js';

const ui = fileURLToPath(new URL('../public/ui-assets/nikke/', import.meta.url));

test('breakthrough originals are source-bound; unreviewed, duplicate and corrupt inputs rejected', async () => {
  const proof = JSON.parse(await readFile(path.join(ui, 'metadata/breakthrough/extracted-sources.json')));
  const mapping = JSON.parse(await readFile(path.join(ui, 'manifest.json')));
  assert.deepEqual(proof.items.map(i => i.size), [[91,90],[91,90],[107,107]]);
  assert.match(proof.atlas.resource_key, /^icon-spriteatlas\(sd\)_assets_atlas_common_class_/);
  const dir = await mkdtemp(path.join(tmpdir(), 'nikke-breakthrough-test-'));
  try {
    await mkdir(path.join(dir, 'breakthrough'));
    for (const item of proof.items) {
      assert.equal(mapping.assets.breakthrough[item.id], `metadata/${item.file}`);
      await cp(path.join(ui, 'metadata', item.file), path.join(dir, item.file));
    }
    const save = () => writeFile(path.join(dir, 'manifest.json'), JSON.stringify(proof));
    await save();
    assert.equal((await readApprovedUi(dir, 'breakthrough')).assets.length, 3);
    await assert.rejects(readApprovedUi(dir, '../invalid'), /Invalid UI group/);
    proof.items[0].review_status = 'candidate'; await save();
    await assert.rejects(readApprovedUi(dir, 'breakthrough'), /Unreviewed/);
    proof.items[0].review_status = 'visually_verified';
    proof.items[0].id = 'star-filled'; await save();
    await assert.rejects(readApprovedUi(dir, 'breakthrough'), /Missing or duplicate/);
    proof.items[0].id = 'star-empty'; await save();
    await writeFile(path.join(dir, proof.items[0].file), 'corrupt');
    await assert.rejects(readApprovedUi(dir, 'breakthrough'), /Invalid UI PNG/);
  } finally {
    await rm(dir, {recursive:true,force:true});
  }
});

test('all rarity paths resolve to verified native PNGs and manifest mappings', async () => {
  const proof = JSON.parse(await readFile(path.join(ui, 'metadata/rarity/extracted-sources.json')));
  const mapping = JSON.parse(await readFile(path.join(ui, 'manifest.json')));
  for (const item of proof.items) {
    assert.equal(characterCardRarityAsset(item.id), `/ui-assets/nikke/${mapping.assets.rarity[item.id]}`);
    assert.equal(item.review_status, 'visually_verified');
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'nikke-ui-test-'));
  try {
    await mkdir(path.join(dir, 'rarity'));
    for (const item of proof.items) await cp(path.join(ui, 'metadata', item.file), path.join(dir, item.file));
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(proof));
    assert.equal((await readApprovedRarity(dir)).assets.length, 3);
    proof.items[0].review_status = 'candidate';
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(proof));
    await assert.rejects(readApprovedRarity(dir), /Unreviewed/);
    proof.items[0].review_status = 'visually_verified';
    proof.items[0].file = '../outside.png';
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(proof));
    await assert.rejects(readApprovedRarity(dir), /Unreviewed/);
    proof.items[0].file = 'rarity/r.png';
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(proof));
    await writeFile(path.join(dir, 'rarity/r.png'), 'corrupt');
    await assert.rejects(readApprovedRarity(dir), /Invalid UI PNG/);
  } finally {
    // Only our uniquely created test fixture, never an asset/workspace directory.
    await rm(dir, {recursive:true,force:true});
  }
});
