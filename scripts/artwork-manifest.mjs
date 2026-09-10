// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export const ARTWORK_DIRECTORY = 'ui-assets/nikke/character-artwork';
export const isArtworkImage = (path) => /^ui-assets\/nikke\/character-artwork\/[a-z0-9_-]+\.webp$/.test(path);
const hash = (data) => createHash('sha256').update(data).digest('hex');

/** The download source is immutable and must contain these exact image bytes. */
export async function createArtworkManifest(root = process.cwd()) {
  const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
  let ref = null, tree = '';
  try {
    ref = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    tree = execFileSync('git', ['ls-tree', '-r', '-z', ref, '--', `public/${ARTWORK_DIRECTORY}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { ref = null; } // Source ZIPs remain buildable; unpublished downloads stay disabled.
  const tracked = new Map(tree.split('\0').filter(Boolean).map((line) => {
    const [info, path] = line.split('\t'); return [path, info.split(' ')[2]];
  }));
  const files = [];
  let published = Boolean(ref);
  for (const name of (await readdir(resolve(root, 'public', ARTWORK_DIRECTORY))).sort()) {
    const path = `${ARTWORK_DIRECTORY}/${name}`;
    if (!isArtworkImage(path)) continue;
    const bytes = await readFile(resolve(root, 'public', path));
    const gitHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (tracked.get(`public/${path}`) !== gitHash) published = false;
    files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  if (!files.length) throw new Error('Artwork image catalog is empty.');
  const catalog = JSON.parse(await readFile(resolve(root, 'src/data/characterArtworkCatalog.json'), 'utf8'));
  const paths = new Set(files.map((file) => `/${file.path}`));
  for (const items of Object.values(catalog.characters)) for (const item of items) {
    if (!paths.has(item.url)) throw new Error(`Missing artwork: ${item.url}`);
  }
  return { schemaVersion: 1, appVersion: version, revision: hash(JSON.stringify(files)), sourceRef: published ? ref : null, files };
}
