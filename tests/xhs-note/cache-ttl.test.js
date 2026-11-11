'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CACHE_TTL_MS,
  isCacheFresh,
  writeNotePayload,
  readFetchedAtMs,
} = require('../../src/xhs-note/cache');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-cache-ttl-'));
}

test('writeNotePayload 写入 fetchedAtMs；30 分钟内新鲜', () => {
  const root = tempDir();
  const noteId = 'noteFresh000000000001';
  writeNotePayload(root, noteId, { sourceUrl: 'https://www.xiaohongshu.com/explore/' + noteId, title: 't', body: 'b', images: [] });
  const at = readFetchedAtMs(root, noteId);
  assert.ok(Number.isFinite(at));
  assert.equal(isCacheFresh(root, noteId, at), true);
  assert.equal(isCacheFresh(root, noteId, at + CACHE_TTL_MS - 1), true);
  assert.equal(isCacheFresh(root, noteId, at + CACHE_TTL_MS + 1), false);
});

test('无 cache-meta 则不新鲜', () => {
  const root = tempDir();
  assert.equal(isCacheFresh(root, 'missing'), false);
});
