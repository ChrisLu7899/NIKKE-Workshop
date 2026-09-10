import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (path) => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
test('utility actions live in the side-panel bottom navigation, not either header', () => {
  const app = source('App.jsx');
  assert.match(app, /component="nav" aria-label="插件工具"[\s\S]*?<UpdateNotice color="primary" \/>/);
  assert.doesNotMatch(app, /ArtworkManager/);
  assert.doesNotMatch(source('components/management/CharacterWorkspaceDrawer.jsx'), /ArtworkManager/);
  assert.match(app, /minHeight: '100dvh'/);
  assert.doesNotMatch(source('components/app/AppHeader.jsx'), /UpdateNotice|ArtworkManager/);
  const header = source('components/management/ManagementHeader.jsx');
  assert.doesNotMatch(header, /ArtworkManager/);
  assert.match(header, /<UpdateNotice showTrigger=\{false\} \/>/);
  assert.match(source('components/app/UpdateNotice.jsx'), /showTrigger && <Button/);
});
