'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalExploreUrl, extractXhsNoteId } = require('../../src/xhs-note/note-id');

test('从 explore 链接抽出 noteId，忽略 xsec query', () => {
  const url = 'https://www.xiaohongshu.com/explore/6ae697ff000000002503a6a9?xsec_token=ABUsNzIq8HkRxF7-hpiF6eAm3pOugHppVtblDikfNy71w=&xsec_source=pc_feed';
  assert.equal(extractXhsNoteId(url), '6ae697ff000000002503a6a9');
  assert.equal(
    canonicalExploreUrl(url),
    'https://www.xiaohongshu.com/explore/6ae697ff000000002503a6a9',
  );
});

test('discovery/item 路径也能抽 noteId', () => {
  assert.equal(
    extractXhsNoteId('https://www.xiaohongshu.com/discovery/item/abc123def'),
    'abc123def',
  );
});

test('短链抽不出 noteId', () => {
  assert.equal(extractXhsNoteId('https://xhslink.com/abcTest1'), '');
});
