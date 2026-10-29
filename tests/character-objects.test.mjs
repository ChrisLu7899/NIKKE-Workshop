// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { cubeDisplayAsset, favoriteItemDisplayAsset } from '../src/domain/characterObjectAssets.js';
import { CUBE_ICON_CATALOG } from '../src/domain/cubeIconCatalog.js';
import { validateObjectManifest, mergeObjectManifests } from '../scripts/sync-character-objects.mjs';
import assets from '../src/data/characterObjectAssets.json' with { type: 'json' };
import skills from '../src/data/characterSkillIconCatalog.json' with { type: 'json' };

const publicRoot = new URL('../public/ui-assets/nikke/', import.meta.url);
const proof = JSON.parse(await readFile(new URL('objects/extracted-sources.json', publicRoot)));

test('manual cube choices match the identity-controlled cube catalog', async () => {
  const data = JSON.parse(await readFile(new URL('../public/cubes.json', import.meta.url)));
  assert.deepEqual(data.cubes, CUBE_ICON_CATALOG.map(c => ({ cube_id: c.cubeId, name_cn: c.nameCn, name_en: c.nameEn })));
  for (const c of CUBE_ICON_CATALOG) await readFile(new URL(`../public/${c.assetPath}`, import.meta.url));
});

test('retired UI images and wrapper stay removed, current manifest paths exist', async () => {
  const oldCard = ['core-frame.webp', 'overload-badge-source.png', 'rarity-ssr.png', 'star-empty.png', 'star-filled.png'];
  const cardFiles = await readdir(new URL('character-card/', publicRoot));
  for (const file of oldCard) assert.ok(!cardFiles.includes(file), file);
  for (const group of ['burst', 'class', 'element', 'manufacturer', 'weapon']) {
    const files = await readdir(new URL(`metadata/${group}/`, publicRoot)).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    assert.equal(files.length, 0, `Retired metadata/${group}`);
  }
  await assert.rejects(readFile(new URL('../scripts/sync-character-skill-icons.mjs', import.meta.url)), { code: 'ENOENT' });
  const manifest = JSON.parse(await readFile(new URL('manifest.json', publicRoot)));
  assert.equal(manifest.assets.skillIcons.size, undefined);
  assert.equal(manifest.assets.skillIcons.dimensionsFrom, 'objects/extracted-sources.json');
  async function check(value) {
    if (typeof value === 'string' && /\.(png|webp|json)$/.test(value)) await readFile(new URL(value, publicRoot));
    else if (value && typeof value === 'object') for (const child of Object.values(value)) await check(child);
  }
  await check(manifest.assets);
});

test('all display cubes map exact resource IDs without changing OCR template paths', () => {
  assert.equal(Object.keys(assets.cubes).length, CUBE_ICON_CATALOG.length);
  for (const c of CUBE_ICON_CATALOG) {
    assert.equal(cubeDisplayAsset(c.resourceId), `/ui-assets/nikke/cubes/ie_${c.resourceId}.png`);
    assert.ok(c.assetPath.startsWith('ocr/cube-icons/'));
    assert.equal(proof.source_manifest.mappings.cubes.find(x => x.cubeId === c.cubeId).resourceId, c.resourceId);
  }
  for (const id of [undefined, null, 0, -1, 1000301, 10011, 'unknown', '__proto__']) assert.equal(cubeDisplayAsset(id), '');
});

test('six native dolls and all 21 native favorite objects have identity-bound paths', () => {
  assert.deepEqual(Object.keys(assets.dolls).sort(), ['AR', 'MG', 'RL', 'SG', 'SMG', 'SR']);
  assert.equal(Object.keys(assets.favorites).length, 21);
  for (const cid of Object.keys(assets.favorites)) assert.equal(favoriteItemDisplayAsset(cid.slice(1)), `/ui-assets/nikke/character-card/favorite-items/${cid}.png`);
  for (const id of [undefined, null, '', 511, 'c352', '../352', '__proto__']) assert.equal(favoriteItemDisplayAsset(id), '');
  assert.equal(favoriteItemDisplayAsset(30), favoriteItemDisplayAsset('030'));
  for (const id of [140, 280, 411, 580]) assert.ok(favoriteItemDisplayAsset(id));
});

test('every imported object keeps exact native bytes, provenance and a decodable PNG header', async () => {
  const byName = validateObjectManifest(proof.source_manifest);
  assert.ok(!/"[A-Za-z]:[\\/]/.test(JSON.stringify(proof)), 'Delivered source evidence must not expose absolute workstation paths');
  assert.equal(proof.items.length, 286);
  for (const item of proof.items) {
    const b = await readFile(new URL(item.file, publicRoot));
    const hash = createHash('sha256').update(b).digest('hex');
    assert.equal(hash, item.source_png_sha256, item.file);
    assert.equal(hash, item.output_png_sha256, item.file);
    assert.equal(hash, byName.get(item.sprite_name).png_sha256, item.file);
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], item.size);
  }
  assert.equal(Object.keys(skills).length, 203);
  for (const [rid, entry] of Object.entries(skills)) {
    assert.deepEqual(Object.keys(entry).sort(), ['burst', 'skill1', 'skill2']);
    assert.ok(proof.items.some(i => i.file === `skill-icons/${entry.burst}` && i.sprite_name === `icn_skill_c${rid.padStart(3, '0')}_ult`));
  }
});

test('import rejects candidate, traversal, duplicate sprite and crossed identities', () => {
  const rejects = change => { const m = structuredClone(proof.source_manifest); change(m); assert.throws(() => validateObjectManifest(m)); };
  rejects(m => { m.status = 'candidate'; });
  rejects(m => { m.items[0].file = '../other.png'; });
  rejects(m => { m.items.push(m.items[0]); });
  rejects(m => { m.items[0].review_status = 'unreviewed'; });
  rejects(m => { m.mappings.cubes[0].resourceId = 10002; });
  rejects(m => { m.mappings.favorites.c352.sprite = 'mi_favoriteitem_c030_00'; });
  rejects(m => { m.mappings.dolls.AR = 'mi_favoriteitem_sg_00'; });
  rejects(m => { m.mappings.skills['104'].burst = 'icn_skill_c101_ult'; });
});

test('reviewed object layers retain per-item source identity and require complete final coverage', () => {
  const base = proof.source_manifest;
  // Pick one known cube for a small, independently reviewed source layer.
  const delta = structuredClone(base);
  delta.schema = 'character-card-objects-v1';
  delta.mappings = { cubes: [structuredClone(base.mappings.cubes[0])], dolls: {}, favorites: {}, skills: {} };
  delta.items = [structuredClone(base.items.find(i => i.sprite_name === delta.mappings.cubes[0].sprite))];
  const selectedSource = base.sources.find(s => s.normalized_bundle === delta.items[0].normalized_bundle
    && (base.schema !== 'character-card-objects-layered-v1' || s.source_id === delta.items[0].source_id));
  delta.sources = [...new Map(base.sources.map(s => [s.normalized_bundle, s])).values()]
    .map(s => s.normalized_bundle === selectedSource.normalized_bundle ? selectedSource : s);
  delta.sources = structuredClone(delta.sources);
  for (const source of delta.sources) source.bundle_sha256 = 'a'.repeat(64);
  validateObjectManifest(delta, { partial: true });
  assert.throws(() => validateObjectManifest(delta), /coverage/i);
  const assembled = mergeObjectManifests([base, delta], 'b'.repeat(64));
  const byName = validateObjectManifest(assembled);
  // A layered manifest can itself be an assembly input without rebinding old PNGs to new bundles.
  assert.deepEqual(mergeObjectManifests([assembled], 'b'.repeat(64)).items, assembled.items);
  const selected = byName.get(delta.items[0].sprite_name);
  assert.ok(selected.source_id.endsWith(':'.concat('a'.repeat(64))));
  assert.equal(assembled.mappings.cubes.length, CUBE_ICON_CATALOG.length);
  const oldItem = assembled.items.find(i => i.sprite_name !== selected.sprite_name);
  assert.equal(oldItem.png_sha256, base.items.find(i => i.sprite_name === oldItem.sprite_name).png_sha256);
  const crossed = structuredClone(assembled);
  crossed.items.find(i => i.sprite_name === selected.sprite_name).source_id = 'missing';
  assert.throws(() => validateObjectManifest(crossed));
  const unapproved = structuredClone(delta); unapproved.status = 'candidate';
  assert.throws(() => mergeObjectManifests([base, unapproved], 'b'.repeat(64)));
});
