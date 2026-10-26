'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { apply } = require('../index');

test('桥把 onePost 的方法登记到宿主', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-bridge-'));
  let service;
  let pluginEnvCalls = 0;
  apply({
    dirs: { data: dataDir },
    pluginEnv: () => {
      pluginEnvCalls += 1;
      return { DEX_BUDDY_API_KEY: 'host-key' };
    },
    registerService(name, methods) {
      service = { name, methods };
    },
  });
  assert.equal(service.name, 'onePost');
  for (const method of [
    'loadLatest', 'listPosts', 'listAlbums', 'listLibraryUploadRefs', 'addLibraryUploadRef',
    'listLibraryArticleSamples', 'getLibraryArticleSample', 'saveLibraryArticleSample',
    'deleteLibraryArticleSample', 'getAlbumDetail',
    'learnAlbum', 'commitAlbum', 'updateAlbumPrompt', 'discardAlbum', 'deleteAlbum',
    'openPost', 'startNew', 'saveEditor', 'generateDraft', 'generatePrompts',
    'chooseImage', 'generateImages', 'retryImage', 'previewImage', 'previewPostCover', 'previewHistoryPost',
    'previewAlbumSample',
    'revealImage', 'revealPost', 'addUploadRef', 'updateUploadRefUsage', 'deleteUploadRef', 'setSlotPick',
    'previewUploadRef', 'previewLibraryUploadRef', 'draftUploadRefUsage', 'saveUploadRefToLibrary',
    'pickLibraryUploadRef', 'deleteLibraryUploadRef',
  ]) {
    assert.equal(typeof service.methods[method], 'function');
  }
  const latest = service.methods.loadLatest();
  assert.equal(latest.ok, true);
  assert.equal(latest.id, '');
  assert.equal(latest.galleryCount, 1);
  assert.equal(latest.draft, null);
  assert.equal(fs.existsSync(path.join(dataDir, 'output', 'one-post', 'posts', 'index.json')), false);
  // 设置保存不重跑 apply；登记服务与读空态都不该碰 pluginEnv。
  assert.equal(pluginEnvCalls, 0);
});
