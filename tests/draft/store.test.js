'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../../src/draft/store');

test('作废时删掉封面和配图文件', () => {
  const latestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-store-'));
  const store = createStore(latestDir);
  fs.writeFileSync(path.join(latestDir, 'cover.png'), 'cover');
  fs.writeFileSync(path.join(latestDir, 'gallery-01.png'), 'one');
  fs.writeFileSync(path.join(latestDir, 'gallery-02.png'), 'two');
  const state = store.read();
  state.galleryCount = 1;
  state.images.cover = { status: '成功', path: 'cover.png' };
  state.images.gallery = [
    { status: '成功', path: 'gallery-01.png' },
    { status: '成功', path: 'gallery-02.png' },
  ];

  store.invalidateImages(state);

  assert.equal(fs.existsSync(path.join(latestDir, 'cover.png')), false);
  assert.equal(fs.existsSync(path.join(latestDir, 'gallery-01.png')), false);
  assert.equal(fs.existsSync(path.join(latestDir, 'gallery-02.png')), false);
  assert.equal(state.images.cover.status, '作废');
  assert.equal(state.images.gallery.length, 1);
  assert.equal(state.images.gallery[0].status, '作废');
  assert.equal(state.images.gallery[0].path, '');
});
