'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore, nextImageFile } = require('../../src/draft/store');

test('旧路径算第 1 张，下一张用新文件名', () => {
  const latestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-store-'));
  const store = createStore(latestDir);
  fs.writeFileSync(path.join(latestDir, 'cover.png'), 'cover');
  fs.writeFileSync(path.join(latestDir, 'gallery-01.png'), 'one');
  const state = store.read();
  state.images.cover = { status: '成功', path: 'cover.png', revisedAt: 12 };
  state.images.gallery = [{ status: '成功', path: 'gallery-01.png', revisedAt: 4 }];
  store.write(state);
  const saved = store.read();
  assert.equal(saved.images.cover.selected, 1);
  assert.equal(saved.images.cover.versions.length, 1);
  assert.equal(saved.images.cover.versions[0].path, 'cover.png');
  assert.equal(saved.images.cover.revisedAt, 12);
  assert.equal(nextImageFile('cover', 0, saved.images.cover.versions), 'cover-2.png');
  assert.equal(nextImageFile('gallery', 1, saved.images.gallery[0].versions), 'gallery-01-2.png');
  assert.equal(nextImageFile('cover', 0, []), 'cover-1.png');
  assert.equal(fs.existsSync(path.join(latestDir, 'cover.png')), true);
  assert.equal(fs.existsSync(path.join(latestDir, 'gallery-01.png')), true);
});

test('同一张图的修订号会留下来', () => {
  const latestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-store-'));
  const store = createStore(latestDir);
  const state = store.read();
  state.images.cover = { status: '成功', path: 'cover.png', revisedAt: 12 };
  store.write(state);
  assert.equal(store.read().images.cover.revisedAt, 12);
});
