// SPDX-License-Identifier: GPL-3.0-or-later
// Only consumes promoted UI assets; never reads game files or extraction candidates.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hex = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const groups = {
  rarity: ['R', 'SR', 'SSR'], breakthrough: ['star-empty', 'star-filled', 'core-frame'],
  burst: ['burst-1', 'burst-2', 'burst-3', 'burst-all'],
  element: ['fire', 'water', 'wind', 'electric', 'iron'], weapon: ['ar', 'mg', 'rl', 'sg', 'smg', 'sr'],
  class: ['attacker', 'defender', 'supporter'], manufacturer: ['elysion', 'missilis', 'tetra', 'pilgrim', 'abnormal'],
  frames: ['hex-dark'],
  decorations: ['heart', 'affection-border', 'circle', 'skill-ring'],
  equipment: ['vmetal', '99', 'code'].flatMap(f => ['head', 'body', 'arms', 'legs'].map(s => `${f}-${s}`)),
  'overload-frame': ['frame'], 'overload-glyph': ['glyph'], 'overload-stroke': ['stroke'],
};

export async function readApprovedUi(input, group = 'rarity') {
  if (!Object.hasOwn(groups, group)) throw new Error('Invalid UI group');
  const ids = groups[group];
  const manifestBytes = await readFile(path.join(input, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== 'character-card-ui-v1' || manifest.status !== 'promoted'
    || !hex(manifest.review_sha256) || !hex(manifest.producer_sha256)
    || manifest.items?.length !== ids.length) throw new Error('Invalid promoted UI manifest');
  for (const source of [manifest.source, manifest.atlas]) {
    if (!hex(source?.bundle_sha256) || source.region !== (group === 'equipment' ? 'dp' : 'core')
      || !source.resource_key?.endsWith(`_${source.bundle_hash}.bundle`)) {
      throw new Error('Incomplete UI source provenance');
    }
  }
  const assets = [];
  for (const id of ids) {
    const matches = manifest.items.filter((item) => item.id === id);
    if (matches.length !== 1) throw new Error(`Missing or duplicate rarity: ${id}`);
    const item = matches[0];
    const file = `${group}/${id.toLowerCase()}.png`;
    if (item.file !== file || item.review_status !== 'visually_verified'
      || !item.review || !item.path_id || !item.sprite_name) throw new Error(`Unreviewed UI: ${id}`);
    const bytes = await readFile(path.join(input, file));
    if (sha(bytes) !== item.png_sha256 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || bytes.readUInt32BE(16) !== item.size?.[0] || bytes.readUInt32BE(20) !== item.size?.[1]) {
      throw new Error(`Invalid UI PNG: ${id}`);
    }
    assets.push({ item, file: `metadata/${file}`, bytes });
  }
  return { assets, provenance: { ...manifest, formal_manifest_sha256: sha(manifestBytes) } };
}

export const readApprovedRarity = (input) => readApprovedUi(input, 'rarity');

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check' && !arg.startsWith('--asset-library=') && !arg.startsWith('--group='))) {
    throw new Error('Usage: node scripts/sync-character-card-ui.mjs [--check] [--group=rarity|breakthrough] [--asset-library=<formal-output>]');
  }
  const group = args.find((arg) => arg.startsWith('--group='))?.slice(8) || 'rarity';
  if (!['rarity', 'breakthrough'].includes(group)) throw new Error('Use sync-character-metadata.mjs for the five metadata groups and frames');
  const input = args.find((arg) => arg.startsWith('--asset-library='))?.split('=').slice(1).join('=')
    || `E:/NIKKE_files/output/character_card_ui${group === 'rarity' ? '' : '_breakthrough'}`;
  const { assets, provenance } = await readApprovedUi(input, group);
  const dest = path.join(root, 'public/ui-assets/nikke');
  const mapping = JSON.parse(await readFile(path.join(dest, 'manifest.json'), 'utf8'));
  const rarity = Object.fromEntries(assets.map(({ item, file }) => [item.id, file]));
  const proof = JSON.stringify(provenance, null, 2) + '\n';
  if (args.includes('--check')) {
    if (JSON.stringify(mapping.assets[group]) !== JSON.stringify(rarity)) throw new Error('UI mapping differs');
    if (await readFile(path.join(dest, `metadata/${group}/extracted-sources.json`), 'utf8') !== proof) {
      throw new Error('Rarity provenance differs');
    }
    for (const { file, bytes } of assets) {
      if (!(await readFile(path.join(dest, file))).equals(bytes)) throw new Error(`UI differs: ${file}`);
    }
  } else {
    // All input validation completes before the first write. No stale-asset deletion.
    await mkdir(path.join(dest, `metadata/${group}`), { recursive: true });
    for (const { file, bytes } of assets) await writeFile(path.join(dest, file), bytes);
    await writeFile(path.join(dest, `metadata/${group}/extracted-sources.json`), proof);
    mapping.assets[group] = rarity;
    if (group === 'rarity') mapping.assets.characterCard.raritySsr = rarity.SSR;
    else Object.assign(mapping.assets.characterCard, {
      starEmpty: rarity['star-empty'], starFilled: rarity['star-filled'], coreFrame: rarity['core-frame'],
    });
    await writeFile(path.join(dest, 'manifest.json'), JSON.stringify(mapping, null, 2) + '\n');
  }
  console.log(JSON.stringify({ checked: args.includes('--check'), group, ids: groups[group] }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
