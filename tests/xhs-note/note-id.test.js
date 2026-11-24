'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalExploreUrl,
  extractXhsNoteId,
  extractXsecToken,
  toDurableShareFetchUrl,
} = require('../../src/xhs-note/note-id');

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

test('toDurableShareFetchUrl：有 token 改写为 discovery 分享链；无 token 空串', () => {
  const noteId = '6af3b0c8000000001803b777';
  const token = 'ABohZ0eW9OAxkT4t-Rnu8_X5DfIpj7Mlo6FAJdLZ4r3bQ=';
  const explore = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${token}&xsec_source=pc_feed`;
  const share = toDurableShareFetchUrl(explore);
  assert.match(share, new RegExp(`/discovery/item/${noteId}\\?`));
  assert.match(share, /source=webshare/);
  assert.match(share, /xhsshare=pc_web/);
  assert.match(share, /xsec_source=pc_share/);
  assert.equal(extractXsecToken(share), token);
  assert.equal(toDurableShareFetchUrl(`https://www.xiaohongshu.com/explore/${noteId}`), '');
  assert.equal(toDurableShareFetchUrl('https://xhslink.com/noToken'), '');
});
