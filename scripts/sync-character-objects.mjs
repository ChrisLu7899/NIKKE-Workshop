// SPDX-License-Identifier: GPL-3.0-or-later
// Only promoted library output. Never fetch images, crop screenshots, or delete files.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUBE_ICON_CATALOG } from '../src/domain/cubeIconCatalog.js';
import { COLLECTIBLE_DOLL_BY_WEAPON } from '../src/domain/characterCard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = 'E:/NIKKE_files/output/character_card_objects';
const sha = b => createHash('sha256').update(b).digest('hex');
const serialize = value => JSON.stringify(value, null, 2) + '\n';
const hashPattern = /^[a-f0-9]{64}$/;
const sources = ['icons-equip(hd)_assets_all.bundle', 'icons-favoriteitem(hd)_assets_all.bundle', 'icons-skill(hd)_assets_all.bundle'];

// Original manifest digests stay binding; distribute portable evidence references only.
function portableEvidence(value) {
  if (typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value)) {
    const normalized = value.replaceAll('\\', '/');
    const library = normalized.match(/^[A-Za-z]:\/NIKKE_files\/(.+)$/i);
    return library ? `NIKKE_files/${library[1]}` : `source-file:${path.posix.basename(normalized)}`;
  }
  if (Array.isArray(value)) return value.map(portableEvidence);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, portableEvidence(v)]));
  return value;
}

export function validateObjectManifest(m, { partial = false } = {}) {
  const layered = m.schema === 'character-card-objects-layered-v1';
  if (!['character-card-objects-v1', 'character-card-objects-layered-v1'].includes(m.schema) || m.status !== 'promoted'
    || ![m.producer_sha256, m.review_sha256, m.character_directory_sha256].every(x => hashPattern.test(x))) throw new Error('Unapproved object manifest');
  if ((!layered && m.sources?.length !== sources.length)
    || new Set(m.sources?.map(s => s.normalized_bundle)).size !== sources.length
    || (layered && new Set(m.sources.map(s => s.source_id)).size !== m.sources.length)) throw new Error('Wrong source set');
  for (const s of m.sources) {
    if (!sources.includes(s.normalized_bundle) || !['core', 'dp'].includes(s.region)
      || !/^[a-f0-9]{28,32}$/.test(s.bundle_hash) || !hashPattern.test(s.bundle_sha256)
      || !s.resource_key.endsWith(`_${s.bundle_hash}.bundle`) || !s.cabs?.length
      || (layered && s.source_id !== `${s.normalized_bundle}:${s.bundle_sha256}`)) throw new Error('Invalid current source');
  }
  const byName = new Map();
  for (const i of m.items || []) {
    const s = m.sources.find(s => s.normalized_bundle === i.normalized_bundle && (!layered || s.source_id === i.source_id));
    if (!/^(?:ie_[0-9]+|mi_favoriteitem_(?:c[0-9]+|ar|smg|mg|sg|sr|rl)_00|icn_skill_[a-z0-9_]+)$/.test(i.sprite_name)
      || byName.has(i.sprite_name) || i.file !== `originals/${i.sprite_name}.png`
      || i.review_status !== 'visually_verified' || !i.reviewed_at || !i.review_note
      || !hashPattern.test(i.png_sha256) || !/^-?[0-9]+$/.test(i.path_id)
      || !s?.cabs.includes(i.cab) || (i.atlas_cab && !s.cabs.includes(i.atlas_cab))
      || i.size?.length !== 2 || !i.size.every(n => Number.isInteger(n) && n > 0 && n <= 4096)) throw new Error(`Invalid reviewed Sprite: ${i.sprite_name}`);
    byName.set(i.sprite_name, i);
  }
  const has = name => { if (!byName.has(name)) throw new Error(`Mapping references unreviewed sprite: ${name}`); };
  const maps = m.mappings;
  const expectedCubes = partial ? CUBE_ICON_CATALOG.filter(c => maps.cubes.some(x => x.cubeId === c.cubeId)) : CUBE_ICON_CATALOG;
  if (maps.cubes.length !== expectedCubes.length) throw new Error('Cube mapping coverage differs');
  for (const expected of expectedCubes) {
    const c = maps.cubes.filter(c => c.cubeId === expected.cubeId);
    if (c.length !== 1 || c[0].resourceId !== expected.resourceId || c[0].sprite !== `ie_${expected.resourceId}`) throw new Error('Cube identity mismatch');
    has(c[0].sprite);
  }
  if (!partial && Object.keys(maps.dolls).sort().join() !== Object.keys(COLLECTIBLE_DOLL_BY_WEAPON).sort().join()) throw new Error('Doll coverage mismatch');
  for (const [weapon, sprite] of Object.entries(maps.dolls)) {
    if (!Object.hasOwn(COLLECTIBLE_DOLL_BY_WEAPON, weapon) || sprite !== `mi_favoriteitem_${weapon.toLowerCase()}_00`) throw new Error('Doll weapon mismatch');
    has(sprite);
  }
  for (const [cid, item] of Object.entries(maps.favorites)) {
    if (!/^c\d{3,4}$/.test(cid) || item.character_id !== cid || item.sprite !== `mi_favoriteitem_${cid}_00`) throw new Error('Favorite identity mismatch');
    has(item.sprite);
  }
  for (const [rid, entry] of Object.entries(maps.skills)) {
    if (!/^\d+$/.test(rid)) throw new Error('Invalid character resource ID');
    for (const [slot, name] of Object.entries(entry)) {
      if (!['skill1', 'skill2', 'burst'].includes(slot) || (slot === 'burst' && name !== `icn_skill_c${rid.padStart(3, '0')}_ult`)) throw new Error('Skill slot/identity mismatch');
      has(name);
    }
  }
  return byName;
}

export function mergeObjectManifests(parts, producerSha256) {
  if (!parts.length || !hashPattern.test(producerSha256)) throw new Error('Missing object manifest assembly inputs');
  const merged = structuredClone(parts[0]);
  merged.schema = 'character-card-objects-layered-v1';
  merged.sources = [];
  merged.items = [];
  merged.producer_sha256 = producerSha256;
  merged.review_sha256 = sha(Buffer.from(parts.map(m => m.review_sha256).join('\n')));
  merged.character_directory_sha256 = parts.at(-1).character_directory_sha256;
  merged.review_digest_method = 'SHA256 of component review digests; original per-item visual review remains binding';
  merged.components = [];
  merged.mappings = { cubes: [], dolls: {}, favorites: {}, skills: {} };
  const items = new Map(), sourceMap = new Map(), cubes = new Map();
  for (const part of parts) {
    validateObjectManifest(part, { partial: true });
    merged.components.push({ schema: part.schema, manifest_sha256: sha(Buffer.from(serialize(part))),
      producer_sha256: part.producer_sha256, review_sha256: part.review_sha256,
      character_directory_sha256: part.character_directory_sha256 });
    for (const source of part.sources) {
      const sourceId = `${source.normalized_bundle}:${source.bundle_sha256}`;
      sourceMap.set(sourceId, { ...source, source_id: sourceId });
    }
    for (const item of part.items) {
      const source = part.sources.find(s => s.normalized_bundle === item.normalized_bundle
        && (part.schema !== 'character-card-objects-layered-v1' || s.source_id === item.source_id));
      items.set(item.sprite_name, { ...item, source_id: `${source.normalized_bundle}:${source.bundle_sha256}` });
    }
    for (const cube of part.mappings.cubes) cubes.set(cube.cubeId, cube);
    Object.assign(merged.mappings.dolls, part.mappings.dolls);
    Object.assign(merged.mappings.favorites, part.mappings.favorites);
    for (const [rid, slots] of Object.entries(part.mappings.skills)) {
      merged.mappings.skills[rid] = { ...merged.mappings.skills[rid], ...slots };
    }
  }
  merged.sources = [...sourceMap.values()];
  merged.items = [...items.values()];
  merged.mappings.cubes = [...cubes.values()].sort((a, b) => a.cubeId - b.cubeId);
  validateObjectManifest(merged);
  return merged;
}

export async function readApprovedObjects(input = INPUT) {
  const roots = [input];
  const updates = path.join(path.dirname(input), 'character_card_objects_updates');
  const directories = await readdir(updates, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  for (const directory of directories.filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))) {
    roots.push(path.join(updates, directory.name));
  }
  const parts = [], bytes = new Map();
  for (const directory of roots) {
    const part = JSON.parse(await readFile(path.join(directory, 'manifest.json')));
    const partItems = validateObjectManifest(part, { partial: true });
    for (const [name, item] of partItems) {
      const b = await readFile(path.join(directory, item.file));
      if (b.length < 24 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || sha(b) !== item.png_sha256
        || b.readUInt32BE(16) !== item.size[0] || b.readUInt32BE(20) !== item.size[1]) throw new Error(`Original image changed: ${name}`);
      bytes.set(name, b);
    }
    parts.push(part);
  }
  const manifest = portableEvidence(parts.length === 1 ? parts[0] : mergeObjectManifests(parts, sha(await readFile(fileURLToPath(import.meta.url)))));
  const manifestBytes = Buffer.from(serialize(manifest));
  const byName = validateObjectManifest(manifest);
  return { manifest, manifestBytes, byName, bytes };
}

export async function syncCharacterObjects(args = process.argv.slice(2)) {
  if (args.some(a => !['--check', '--dry-run'].includes(a)) || args.length > 1) throw new Error('Usage: node scripts/sync-character-objects.mjs [--check|--dry-run]');
  const { manifest: m, manifestBytes, byName, bytes } = await readApprovedObjects();
  const maps = m.mappings, files = new Map(), entries = [];
  function use(sprite, file) {
    if (!files.has(file)) {
      files.set(file, bytes.get(sprite));
      entries.push({ file, sprite_name: sprite, source_png_sha256: byName.get(sprite).png_sha256,
        output_png_sha256: sha(bytes.get(sprite)), size: byName.get(sprite).size });
    }
    return file;
  }
  const catalog = { cubes: {}, dolls: {}, favorites: {} }, skills = {};
  for (const c of maps.cubes) catalog.cubes[c.resourceId] = use(c.sprite, `cubes/${c.sprite}.png`);
  for (const [weapon, sprite] of Object.entries(maps.dolls)) catalog.dolls[weapon] = use(sprite, `character-card/${COLLECTIBLE_DOLL_BY_WEAPON[weapon]}`);
  for (const [cid, item] of Object.entries(maps.favorites)) catalog.favorites[cid] = use(item.sprite, `character-card/favorite-items/${cid}.png`);
  for (const [rid, entry] of Object.entries(maps.skills)) {
    skills[rid] = {};
    for (const slot of ['skill1', 'skill2', 'burst']) {
      const sprite = entry[slot];
      if (!sprite) continue;
      const rel = slot === 'burst' ? `burst/c${rid.padStart(3, '0')}.png` : `generic/${sprite}.png`;
      use(sprite, `skill-icons/${rel}`); skills[rid][slot] = rel;
    }
  }
  const publicRoot = path.join(root, 'public/ui-assets/nikke');
  const proof = { schema: 'character-card-objects-delivery-v1', method: 'Native PNG bytes; no crop, recoloring, resize, background, embedded level, or screenshot processing',
    formal_manifest_sha256: sha(manifestBytes), producer_sha256: sha(await readFile(fileURLToPath(import.meta.url))),
    source_manifest: m, items: entries };
  files.set('objects/extracted-sources.json', Buffer.from(serialize(proof)));
  files.set('objects/catalog.json', Buffer.from(serialize(catalog)));
  files.set('skill-icons/catalog.json', Buffer.from(serialize(skills)));
  const manifestPath = path.join(publicRoot, 'manifest.json');
  const uiManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const favoriteItems = Object.fromEntries(Object.entries(catalog.favorites).map(([cid, file]) => [cid.slice(1), file]));
  const expectedMap = { ...uiManifest.assets.characterCard, collectibleDolls: catalog.dolls, favoriteItems };
  const expectedSkills = { catalog: 'skill-icons/catalog.json', genericDirectory: 'skill-icons/generic/',
    burstDirectory: 'skill-icons/burst/', format: 'png', dimensionsFrom: 'objects/extracted-sources.json' };
  const extraFiles = new Map([
    [path.join(root, 'src/data/characterObjectAssets.json'), Buffer.from(serialize(catalog))],
    [path.join(root, 'src/data/characterSkillIconCatalog.json'), Buffer.from(serialize(skills))],
  ]);
  if (args.includes('--check')) {
    if (serialize(uiManifest.assets.characterCard) !== serialize(expectedMap) || serialize(uiManifest.assets.cubes) !== serialize(catalog.cubes)
      || serialize(uiManifest.assets.skillIcons) !== serialize(expectedSkills)) throw new Error('UI manifest object mappings stale');
  } else {
    uiManifest.assets.characterCard = expectedMap; uiManifest.assets.cubes = catalog.cubes;
    uiManifest.assets.skillIcons = expectedSkills;
    extraFiles.set(manifestPath, Buffer.from(serialize(uiManifest)));
  }
  const plan = [...files].map(([f, b]) => [path.join(publicRoot, f), b]).concat([...extraFiles]);
  const changed = [];
  for (const [dest, b] of plan) {
    let old; try { old = await readFile(dest); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!old?.equals(b)) changed.push(dest);
  }
  if (args.includes('--check') && changed.length) throw new Error(`Delivery differs: ${changed.join(', ')}`);
  if (!args.length) for (const [dest, b] of plan) {
    if (!changed.includes(dest)) continue;
    await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, b);
  }
  console.log(serialize({ mode: args[0] || 'sync', cubes: maps.cubes.length, dolls: Object.keys(maps.dolls).length,
    favorites: Object.keys(maps.favorites).length, characters: Object.keys(skills).length, pngs: entries.length,
    changed: changed.map(f => path.relative(root, f)), deleted: 0 }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) syncCharacterObjects().catch(e => { console.error(e.message); process.exitCode = 1; });
