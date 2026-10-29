// SPDX-License-Identifier: GPL-3.0-or-later
// Explicit approved portrait IDs only; preserve all other delivered portraits.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const ids = args.filter(a => a !== '--check');
if (!ids.length || ids.some(id => !/^c\d{3,4}$/.test(id)) || new Set(ids).size !== ids.length) {
  throw new Error('Usage: node scripts/sync-character-avatars.mjs [--check] cNNN ...');
}
const publicDir = path.join(root, 'public/ui-assets/nikke/character-avatars');
const proofPath = path.join(publicDir, 'sources.json');
const catalogPath = path.join(root, 'src/data/characterAvatarCatalog.json');
const proof = JSON.parse(await fs.readFile(proofPath, 'utf8'));
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const plan = [];
for (const id of ids) {
  const dir = path.join('E:/NIKKE_files/output/character_avatars', id);
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  const b = await fs.readFile(path.join(dir, `${id}.png`));
  const hash = sha(b), meta = await sharp(b).metadata();
  if (manifest.assetId !== id || manifest.spriteName !== `mi_${id}_00_s`
    || manifest.reviewStatus !== 'passed' || manifest.pngSha256 !== hash
    || manifest.visualReview?.sha256 !== hash
    || !['identity', 'face', 'originalFraming', 'alpha'].every(k => manifest.visualReview?.checks?.[k] === true)
    || !/^[a-f0-9]{64}$/.test(manifest.bundleSha256)
    || !/^[a-f0-9]{32}$/.test(manifest.bundleHash)
    || !manifest.resourceKey?.endsWith(`_${manifest.bundleHash}.bundle`)
    || !/^CAB-[a-f0-9]+$/.test(manifest.cab) || !/^-?\d+$/.test(manifest.pathId)
    || meta.format !== 'png' || !meta.hasAlpha
    || JSON.stringify([meta.width, meta.height]) !== JSON.stringify(manifest.size)) {
    throw new Error(`Portrait identity, provenance or native bytes failed: ${id}`);
  }
  // Keep portable provenance, without copying candidate workspace paths.
  const approved = structuredClone(manifest);
  delete approved.visualReview.evidence;
  approved.source = `character_avatars/${id}/${id}.png`;
  proof.assets[id] = approved;
  catalog[id.slice(1)] = `/ui-assets/nikke/character-avatars/${id}.png`;
  plan.push([path.join(publicDir, `${id}.png`), b]);
}
const serialize = v => Buffer.from(JSON.stringify(v, null, 2) + '\n');
plan.push([proofPath, serialize(proof)], [catalogPath, serialize(catalog)]);
for (const [dest, bytes] of plan) {
  const old = await fs.readFile(dest).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
  if (old?.equals(bytes)) continue;
  if (check) throw new Error(`Delivered portrait differs: ${path.relative(root, dest)}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, bytes);
}
console.log(JSON.stringify({ mode: check ? 'check' : 'sync', approvedIds: ids, deleted: 0 }));
