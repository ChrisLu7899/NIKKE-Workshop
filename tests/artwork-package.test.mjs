// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateArtworkManifest, artworkDownloadUrl, verifyArtwork } from '../src/domain/artworkPackage.js';
import { createArtworkManifest, isArtworkImage } from '../scripts/artwork-manifest.mjs';
const image = Buffer.from('RIFFabcdWEBPunit-test');
const file = { path: 'ui-assets/nikke/character-artwork/c100.webp', bytes: image.length, sha256: createHash('sha256').update(image).digest('hex') };
const manifest = { schemaVersion: 1, appVersion: '1.0.10', revision: 'a'.repeat(64), sourceRef: 'b'.repeat(40), files: [file] };

test('optional artwork manifest strictly pins version, paths, byte counts and immutable source', async () => {
  assert.equal(validateArtworkManifest(manifest, '1.0.10').totalBytes, image.length);
  assert.throws(() => validateArtworkManifest(manifest, '1.0.11'));
  for (const path of ['../file.webp', 'ui-assets/nikke/character-artwork/../code.js', 'images/avatar.png', 'ui-assets/nikke/character-artwork/a.webp?x']) assert.throws(() => validateArtworkManifest({ ...manifest, files: [{ ...file, path }] }, '1.0.10'));
  assert.throws(() => validateArtworkManifest({ ...manifest, files: [file, file] }, '1.0.10'));
  assert.throws(() => validateArtworkManifest({ ...manifest, sourceRef: 'main' }, '1.0.10'));
  assert.throws(() => artworkDownloadUrl({ ...manifest, sourceRef: null }, file));
  assert.equal(artworkDownloadUrl(manifest, file), `https://raw.githubusercontent.com/ChrisLu7899/NIKKE-Workshop/${'b'.repeat(40)}/public/${file.path}`);
  assert.equal((await verifyArtwork(image, file)).type, 'image/webp');
  await assert.rejects(verifyArtwork(Buffer.from('RIFFabcdWEBPbad-bytes'), file));
  await assert.rejects(verifyArtwork(image.subarray(0, 12), file));
});
test('build catalog covers all installed artwork and excludes functional icons/OCR', async () => {
  const actual = await createArtworkManifest();
  assert.ok(actual.files.length > 600);
  assert.ok(actual.sourceRef === null || /^[a-f0-9]{40}$/.test(actual.sourceRef));
  assert.ok(actual.files.some((f) => f.path.endsWith('cn-exclusive-huapi.webp')));
  for (const path of ['ocr/figure.webp', 'ui-assets/nikke/cubes/ie_1.png', 'ui-assets/nikke/equipment/head.webp', 'ui-assets/nikke/character-artwork/catalog.json']) assert.equal(isArtworkImage(path), false);
  assert.equal(validateArtworkManifest(actual, JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version).files.length, actual.files.length);
});
test('source archives without Git still build complete assets with downloads disabled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workshop-art-source-'));
  await mkdir(join(root, 'public/ui-assets/nikke/character-artwork'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.0.10' }));
  await writeFile(join(root, 'public', file.path), image);
  await writeFile(join(root, 'src/data/characterArtworkCatalog.json'), JSON.stringify({ characters: { c100: [{ url: '/' + file.path }] } }));
  const generated = await createArtworkManifest(root);
  assert.equal(generated.sourceRef, null);
  assert.equal(generated.files[0].sha256, file.sha256);
});
test('complete distribution renders installed images without download permissions', () => {
  const card = readFileSync(new URL('../src/components/management/CharacterCard.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(card, /artworkStorage|subscribeArtwork|resolveArtwork/);
  const extension = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url)));
  assert.ok(!extension.optional_host_permissions.includes('https://raw.githubusercontent.com/*'));
  assert.ok(!(extension.optional_permissions || []).includes('unlimitedStorage'));
});
