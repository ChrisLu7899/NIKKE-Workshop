// SPDX-License-Identifier: GPL-3.0-or-later
// Display derivatives from reviewed output only; no game/cache/candidate inputs.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readApprovedUi } from './sync-character-card-ui.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const DECORATION_RECIPE = {
  version: 1, surfaceRgb: [50, 50, 50], affectionRgb: [239, 56, 72],
  frame: { width: 348, height: 62, slice: 20 },
  skill: { size: 100 }, badge: { size: 128, inner: 106 },
};

async function colorAlpha(bytes, rgb) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) [data[i], data[i + 1], data[i + 2]] = rgb;
  return sharp(data, { raw: info }).png().toBuffer();
}

// Preserve Sprite's 20px borders, not a whole-image stretch that distorts corners.
export async function nineSlice(bytes, width, height, slice) {
  const meta = await sharp(bytes).metadata();
  if (!Number.isInteger(slice) || slice <= 0 || Math.min(width, height, meta.width, meta.height) <= slice * 2) {
    throw new Error('Invalid nine-slice dimensions');
  }
  const sw = [slice, meta.width - slice * 2, slice], sh = [slice, meta.height - slice * 2, slice];
  const dw = [slice, width - slice * 2, slice], dh = [slice, height - slice * 2, slice];
  const sum = (a, end) => a.slice(0, end).reduce((v, n) => v + n, 0);
  const layers = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const input = await sharp(bytes).extract({ left: sum(sw, x), top: sum(sh, y), width: sw[x], height: sh[y] })
      .resize(dw[x], dh[y], { fit: 'fill' }).png().toBuffer();
    layers.push({ input, left: sum(dw, x), top: sum(dh, y) });
  }
  return sharp({ create: { width, height, channels: 4, background: '#00000000' } }).composite(layers).png().toBuffer();
}

export async function deriveDecorations(approved) {
  const raw = Object.fromEntries(approved.assets.map((a) => [a.item.id, a.bytes]));
  const { frame, skill, badge, surfaceRgb, affectionRgb } = DECORATION_RECIPE;
  const circle = await colorAlpha(raw.circle, surfaceRgb);
  return {
    heart: await colorAlpha(raw.heart, affectionRgb),
    'affection-frame': await nineSlice(await colorAlpha(raw['affection-border'], affectionRgb), frame.width, frame.height, frame.slice),
    'skill-frame': await sharp(circle).resize(skill.size, skill.size).composite([{ input: raw['skill-ring'] }]).png().toBuffer(),
    'level-badge': await sharp(raw.circle).resize(badge.size, badge.size).composite([{
      input: await sharp(circle).resize(badge.inner, badge.inner).png().toBuffer(),
      left: (badge.size - badge.inner) / 2, top: (badge.size - badge.inner) / 2,
    }]).png().toBuffer(),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== '--check' && !a.startsWith('--asset-library='))) throw new Error('Use --check or --asset-library=<formal-output>');
  const input = args.find((a) => a.startsWith('--asset-library='))?.slice(16) || 'E:/NIKKE_files/output/character_card_ui_decorations';
  const approved = await readApprovedUi(input, 'decorations');
  const images = await deriveDecorations(approved);
  const dir = path.join(root, 'public/ui-assets/nikke/metadata/decorations');
  const mapping = Object.fromEntries(Object.keys(images).map((id) => [id, `/ui-assets/nikke/metadata/decorations/${id}.png`]));
  const proof = JSON.stringify({ schema: 'character-decorations-derived-v1', recipe: DECORATION_RECIPE,
    producer_sha256: sha(await readFile(fileURLToPath(import.meta.url))), sharp: sharp.versions.sharp,
    source: approved.provenance, items: Object.entries(images).map(([id, b]) => ({ id, file: mapping[id], png_sha256: sha(b) })),
  }, null, 2) + '\n';
  const mapText = JSON.stringify(mapping, null, 2) + '\n';
  const mapPath = path.join(root, 'src/data/characterDecorationAssets.json');
  const manifestPath = path.join(root, 'public/ui-assets/nikke/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestMapping = Object.fromEntries(Object.entries(mapping).map(([id, file]) => [id, file.slice('/ui-assets/nikke/'.length)]));
  if (args.includes('--check')) {
    if (JSON.stringify(manifest.assets.decorations) !== JSON.stringify(manifestMapping)) throw new Error('Decoration asset manifest differs');
    if (await readFile(path.join(dir, 'extracted-sources.json'), 'utf8') !== proof || await readFile(mapPath, 'utf8') !== mapText) throw new Error('Decoration provenance/mapping differs');
    for (const [id, b] of Object.entries(images)) if (!(await readFile(path.join(dir, `${id}.png`))).equals(b)) throw new Error(`Decoration differs: ${id}`);
  } else {
    await mkdir(dir, { recursive: true });
    for (const [id, b] of Object.entries(images)) await writeFile(path.join(dir, `${id}.png`), b);
    await writeFile(path.join(dir, 'extracted-sources.json'), proof);
    await writeFile(mapPath, mapText);
    manifest.assets.decorations = manifestMapping;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log(JSON.stringify({ checked: args.includes('--check'), ids: Object.keys(images) }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
