import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareVersions, parseRelease, RELEASE_ROOT } from '../public/update-policy.js';
const raw = () => ({ tag_name: 'v1.0.11', html_url: RELEASE_ROOT + 'tag/v1.0.11', published_at: '2026-09-08T00:00:00Z', body: '<script>not executed</script>', assets: [{ id: 1, name: 'NIKKE-Workshop.zip', size: 123, digest: 'sha256:' + 'a'.repeat(64), browser_download_url: RELEASE_ROOT + 'download/v1.0.11/NIKKE-Workshop.zip' }] });
test('stable versions use numeric comparison, never downgrade', () => {
  assert.equal(compareVersions('1.0.10', 'v1.0.9'), 1);
  assert.equal(compareVersions('1.0.10', '1.0.10.0'), 0);
  assert.equal(compareVersions('1.0.10', '1.0.11'), -1);
  for (const invalid of ['1.0', '1.0.11-beta', '1.0.999999', '../1.0.0']) assert.throws(() => compareVersions(invalid, '1.0.0'));
});
test('release metadata selects exact installer and rejects untrusted sources', () => {
  assert.equal(parseRelease(raw()).asset.name, 'NIKKE-Workshop.zip');
  for (const key of ['draft', 'prerelease']) assert.throws(() => parseRelease({ ...raw(), [key]: true }));
  const value = raw(); value.assets[0].browser_download_url = 'https://evil.example/installer.zip'; assert.throws(() => parseRelease(value));
  const source = raw(); source.assets[0].name = 'NIKKE-Workshop-source.zip'; assert.equal(parseRelease(source).asset, null);
  const missingHash = raw(); missingHash.assets[0].digest = null; assert.equal(parseRelease(missingHash).asset.digest, null);
});
test('extension never directly controls native installation', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url)));
  assert.ok(!manifest.permissions.includes('nativeMessaging'));
  const background = readFileSync(new URL('../public/update-background.js', import.meta.url), 'utf8');
  assert.doesNotMatch(background, /connectNative|sendNativeMessage|downloads\.download|workshop\.update\.install/);
});
test('Windows transactional installer protects snapshots, rejects unsafe ZIPs and recovers', { skip: process.platform !== 'win32', timeout: 120000 }, () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./updater-core.ps1', import.meta.url))], { encoding: 'utf8', timeout: 110000 });
  const result = JSON.parse(output.trim());
  assert.ok(result.passed >= 30); assert.equal(result.realInstallationModified, false);
});
