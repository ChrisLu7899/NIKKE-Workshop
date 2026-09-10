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

test('program updates select only full packages even when lite and artwork assets exist', () => {
  const value = raw();
  value.assets.push({ ...value.assets[0], id: 2, name: 'NIKKE-Workshop-Lite.zip', browser_download_url: RELEASE_ROOT + 'download/v1.0.11/NIKKE-Workshop-Lite.zip' });
  value.assets.push({ ...value.assets[0], id: 3, name: 'NIKKE-Workshop-Artwork.zip', browser_download_url: RELEASE_ROOT + 'download/v1.0.11/NIKKE-Workshop-Artwork.zip' });
  assert.equal(parseRelease(value).asset.id, 1);
  value.assets = value.assets.slice(1);
  assert.equal(parseRelease(value).asset, null);
  const versioned = raw();
  versioned.assets[0].name = 'NIKKE-Workshop-v1.0.11.zip';
  versioned.assets[0].browser_download_url = RELEASE_ROOT + 'download/v1.0.11/' + versioned.assets[0].name;
  assert.equal(parseRelease(versioned).asset.id, 1);
});
test('extension never directly controls native installation', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url)));
  assert.ok(!manifest.permissions.includes('nativeMessaging'));
  const background = readFileSync(new URL('../public/update-background.js', import.meta.url), 'utf8');
  assert.doesNotMatch(background, /connectNative|sendNativeMessage|downloads\.download|workshop\.update\.install/);
});

test('updater link leaves the side panel for browser protocol confirmation', () => {
  const component = readFileSync(new URL('../src/components/app/UpdateNotice.jsx', import.meta.url), 'utf8');
  assert.match(component, /href=\{UPDATER_URI\} target="_blank" rel="noopener noreferrer"/);
  assert.match(component, /if \(!inManagementPage\) return <Button[^;]*href="management.html#workshop-updater"/);
  assert.match(component, /location\?\.hash === '#workshop-updater'/);
  assert.doesNotMatch(component, /window\.location\s*=|location\.(?:href\s*=|assign\()/);
});

test('update dialog keeps notes and setup help collapsed without nested scrolling', () => {
  const component = readFileSync(new URL('../src/components/app/UpdateNotice.jsx', import.meta.url), 'utf8');
  assert.equal((component.match(/component="details"/g) || []).length, 2);
  assert.doesNotMatch(component, /component="details" open|overflowY/);
  assert.match(component, /screenshots 截图保留/);
  assert.match(component, /role="status"/);
});
test('Windows transactional installer protects screenshots, rejects unsafe ZIPs and recovers', { skip: process.platform !== 'win32', timeout: 120000 }, () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./updater-core.ps1', import.meta.url))], { encoding: 'utf8', timeout: 110000 });
  const result = JSON.parse(output.trim());
  assert.ok(result.passed >= 30); assert.equal(result.realInstallationModified, false);
});
test('real Windows VBS launch shows a window and repeat launch restores the same instance', { skip: process.platform !== 'win32', timeout: 60000 }, () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./updater-window.ps1', import.meta.url))], { encoding: 'utf8', timeout: 55000 });
  const result = JSON.parse(output.trim());
  assert.equal(result.passed, true); assert.equal(result.realVbsLaunch, true);
  assert.equal(result.duplicateRestored, true); assert.equal(result.sameProcess, true);
  assert.equal(result.differentInstallRejected, true); assert.equal(result.realInstallationModified, false);
});

test('Windows updater switches validated directories, locks and recovery state safely', { skip: process.platform !== 'win32', timeout: 60000 }, () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./updater-directory.ps1', import.meta.url))], { encoding: 'utf8', timeout: 55000 });
  const result = JSON.parse(output.trim());
  assert.ok(result.passed >= 20);
  assert.equal(result.selection, true);
  assert.equal(result.mutexTransferred, true);
  assert.equal(result.realInstallationModified, false);
  assert.equal(result.protocolChanged, false);
});
