// SPDX-License-Identifier: GPL-3.0-or-later
// Approved originals only. Badge composition is a declared Workshop derivative.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readApprovedUi } from './sync-character-card-ui.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = b => createHash('sha256').update(b).digest('hex');
export const EQUIPMENT_RECIPE = {
  version: 1, equipment: 'original PNG bytes; no crop, scaling, or recoloring',
  badge: { size: [112, 124], purple: [185, 0, 179], stroke: [80, 92], glyph: [46, 52], strokeRotation: 90 },
  note: 'Workshop purple and aspect-preserving geometry; original Image references verified, not a claim of runtime shader/color reproduction.',
};
export function expectedEquipmentSprite(id) {
  const [family, slot] = id.split('-');
  const cls = { vmetal: 'attacker', 99: 'defender', code: 'supporter' }[family];
  const part = { head: 'head', body: 'body', arms: 'arm', legs: 'leg' }[slot];
  return cls && part ? `icn_equipment_${part}_${cls}_t9_3` : '';
}
export async function deriveOverloadBadge(frame, stroke, glyph) {
  const { badge } = EQUIPMENT_RECIPE;
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Multiply original RGB rather than replacing it, preserving the native shadow.
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * badge.purple[c] / 255);
  const base = await sharp(data, { raw: info }).png().toBuffer();
  const layers = [];
  for (const [bytes, box, rotation] of [[stroke, badge.stroke, badge.strokeRotation], [glyph, badge.glyph, 0]]) {
    const { data: input, info: m } = await sharp(bytes).rotate(rotation).resize(...box, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
    layers.push({ input, left: Math.round((badge.size[0] - m.width) / 2), top: Math.round((badge.size[1] - m.height) / 2) });
  }
  return sharp(base).composite(layers).png().toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--check')) throw new Error('Usage: node scripts/sync-character-equipment.mjs [--check]');
  const groups = ['equipment', 'overload-frame', 'overload-glyph', 'overload-stroke'];
  const approved = Object.fromEntries(await Promise.all(groups.map(async g => [g, await readApprovedUi(`E:/NIKKE_files/output/character_card_ui_${g}`, g)])));
  const files = {};
  for (const { item, bytes } of approved.equipment.assets) {
    if (item.sprite_name !== expectedEquipmentSprite(item.id) || item.size[0] !== 128 || item.size[1] !== 128) throw new Error(`Wrong equipment class/slot: ${item.id}`);
    files[`equipment/overload/${item.id}.png`] = bytes;
  }
  for (const g of groups.slice(1)) {
    const a = approved[g].assets[0];
    files[`equipment/native/${g}.png`] = a.bytes;
  }
  files['equipment/overload-badge.png'] = await deriveOverloadBadge(approved['overload-frame'].assets[0].bytes, approved['overload-stroke'].assets[0].bytes, approved['overload-glyph'].assets[0].bytes);
  const dest = path.join(root, 'public/ui-assets/nikke');
  const proof = JSON.stringify({ schema: 'character-equipment-derived-v1', recipe: EQUIPMENT_RECIPE,
    producer_sha256: sha(await readFile(fileURLToPath(import.meta.url))), sharp: sharp.versions.sharp,
    sources: Object.fromEntries(groups.map(g => [g, approved[g].provenance])),
    items: Object.entries(files).map(([file, bytes]) => ({ file, png_sha256: sha(bytes) })),
  }, null, 2) + '\n';
  const manifestPath = path.join(dest, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const equipmentMap = Object.fromEntries(['vmetal', '99', 'code'].map(f => [f, Object.fromEntries(['head', 'body', 'arms', 'legs'].map(s => [s, `equipment/overload/${f}-${s}.png`]))]));
  if (args.includes('--check')) {
    if (manifest.assets.characterCard.overloadBadgeSource !== 'equipment/overload-badge.png') throw new Error('Stale screenshot badge mapping');
    for (const [f, slots] of Object.entries(equipmentMap)) for (const [s, file] of Object.entries(slots)) if (manifest.assets.overloadEquipment?.[f]?.[s] !== file) throw new Error('Equipment mapping differs');
    if (await readFile(path.join(dest, 'equipment/extracted-sources.json'), 'utf8') !== proof) throw new Error('Equipment provenance differs');
    for (const [file, bytes] of Object.entries(files)) if (!(await readFile(path.join(dest, file))).equals(bytes)) throw new Error(`Equipment differs: ${file}`);
  } else {
    for (const [file, bytes] of Object.entries(files)) { await mkdir(path.dirname(path.join(dest, file)), { recursive: true }); await writeFile(path.join(dest, file), bytes); }
    await writeFile(path.join(dest, 'equipment/extracted-sources.json'), proof);
    manifest.assets.overloadEquipment = equipmentMap;
    manifest.assets.characterCard.overloadBadgeSource = 'equipment/overload-badge.png';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log(JSON.stringify({ checked: args.includes('--check'), equipment: 12, badge: 1, nativeBadgeComponents: 3 }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
