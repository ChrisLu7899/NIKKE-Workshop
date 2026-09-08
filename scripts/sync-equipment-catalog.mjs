// SPDX-License-Identifier: GPL-3.0-or-later
// Consume promoted output only. Exact original PNG bytes, no image guessing.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApprovedUi } from './sync-character-card-ui.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = 'E:/NIKKE_files/output/character_card_ui_equipment-standard';
const dest = path.join(root, 'public/ui-assets/nikke');
const sha = b => createHash('sha256').update(b).digest('hex');
const json = x => JSON.stringify(x, null, 2) + '\n';
const assert = (ok, message) => { if (!ok) throw new Error(message); };

async function main() {
  const args = process.argv.slice(2);
  assert(args.every(a => a === '--check'), 'Usage: node scripts/sync-equipment-catalog.mjs [--check]');
  const manifestBytes = await readFile(path.join(input, 'manifest.json'));
  const m = JSON.parse(manifestBytes);
  assert(m.schema === 'character-card-equipment-v1' && m.status === 'promoted', 'Not promoted equipment');
  assert(m.items.length === 60 && m.external_items.length === 12, 'Equipment coverage changed; review required');
  assert(m.source.region === 'dp' && /^[a-f0-9]{64}$/.test(m.source.bundle_sha256)
    && m.source.resource_key.endsWith(`_${m.source.bundle_hash}.bundle`), 'Invalid source identity');
  const reviewBytes = await readFile(path.join(input, 'visual_review.json'));
  const catalogBytes = await readFile(path.join(input, 'equipment_catalog.json'));
  const tableBytes = await readFile(path.join(input, 'ItemEquipTable-zh-tw.json'));
  assert(sha(reviewBytes) === m.review_sha256 && sha(catalogBytes) === m.catalog.sha256
    && sha(tableBytes) === m.table_source.sha256, 'Source/review hash mismatch');
  const review = JSON.parse(reviewBytes);
  const official = JSON.parse(tableBytes).records;
  const original = JSON.parse(catalogBytes).records;
  assert(original.length === 124 && official.length === 124, 'Table coverage changed; review required');
  const old = await readApprovedUi('E:/NIKKE_files/output/character_card_ui_equipment', 'equipment');
  const files = new Map();
  const icons = {};
  const sourceAssets = new Map();
  for (const item of [...m.items, ...m.external_items]) {
    assert(!sourceAssets.has(item.resource_id) && item.sprite_name === item.resource_id, 'Duplicate/mismatched sprite');
    let bytes, file;
    if (item.asset_group === 'character_card_ui_equipment') {
      const match = old.assets.find(a => a.item.sprite_name === item.resource_id && a.item.file === item.file);
      assert(match, `Missing approved external ${item.resource_id}`);
      bytes = match.bytes;
      file = `equipment/overload/${match.item.id}.png`;
      assert((await readFile(path.join(dest, file))).equals(bytes), `Existing icon differs: ${file}`);
    } else {
      assert(item.file === `equipment-standard/${item.resource_id}.png`
        && /^icn_equipment_(head|body|arm|leg)_(attacker|defender|supporter)_t(1|3|5|7|9_1)$/.test(item.resource_id), 'Invalid standard path');
      assert(review.items[item.resource_id]?.status === 'visually_verified'
        && review.items[item.resource_id].png_sha256 === item.png_sha256, 'Missing individual review');
      bytes = await readFile(path.join(input, item.file));
      file = `equipment/standard/${item.resource_id}.png`;
      files.set(path.join(dest, file), bytes);
    }
    assert(item.review_status === 'visually_verified' && sha(bytes) === item.png_sha256
      && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
      && bytes.readUInt32BE(16) === 128 && bytes.readUInt32BE(20) === 128, 'Invalid icon bytes');
    icons[item.resource_id] = file;
    sourceAssets.set(item.resource_id, item);
  }
  const seen = new Set();
  const records = original.map(r => {
    const o = official.find(v => v.id === r.id);
    const asset = sourceAssets.get(r.resource_id);
    assert(!seen.has(r.id) && o && asset && asset.png_sha256 === r.asset_png_sha256, 'Invalid catalog relation');
    seen.add(r.id);
    for (const [key, value] of Object.entries(o)) assert(JSON.stringify(r[key]) === JSON.stringify(value), `Changed official field ${r.id}/${key}`);
    return Object.fromEntries(['id', 'name_localkey', 'resource_id', 'item_sub_type', 'class', 'item_rare', 'grow_grade'].map(k => [k, r[k]]));
  });
  const data = { schemaVersion: 1, records, icons };
  files.set(path.join(root, 'src/data/equipmentCatalog.json'), Buffer.from(json(data)));
  files.set(path.join(dest, 'equipment/catalog.json'), Buffer.from(json(data)));
  const source = Object.fromEntries(['normalized_bundle', 'resource_key', 'region', 'bundle_hash', 'bundle_sha256'].map(k => [k, m.source[k]]));
  files.set(path.join(dest, 'equipment/standard-sources.json'), Buffer.from(json({
    schema: 'workshop-equipment-catalog-v1', source, table_source: m.table_source,
    formal_manifest_sha256: sha(manifestBytes), catalog_sha256: sha(catalogBytes), review_sha256: sha(reviewBytes),
    producer_sha256: m.producer_sha256, importer_sha256: sha(await readFile(fileURLToPath(import.meta.url))),
    method: 'Exact promoted PNG bytes; tiers use official item_rare, never sprite suffix. No runtime network.',
    items: [...sourceAssets.values()].map(i => ({ resource_id: i.resource_id, path_id: i.path_id, file: icons[i.resource_id], png_sha256: i.png_sha256 })),
  })));
  const manifestPath = path.join(dest, 'manifest.json');
  const mapping = JSON.parse(await readFile(manifestPath));
  if (args.includes('--check')) assert(mapping.assets.equipmentCatalog === 'equipment/catalog.json', 'Missing catalog mapping');
  else { mapping.assets.equipmentCatalog = 'equipment/catalog.json'; files.set(manifestPath, Buffer.from(json(mapping))); }
  // Validate the complete input before any write. Never delete stale or unrelated assets.
  for (const [file, bytes] of files) {
    if (args.includes('--check')) assert((await readFile(file)).equals(bytes), `Outdated output: ${file}`);
    else { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
  }
  console.log(json({ checked: args.includes('--check'), records: records.length, newIcons: 60, reusedIcons: 12 }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
