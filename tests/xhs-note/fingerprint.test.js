'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  articleTextHash,
  contentMd5,
  contentMd5FromDataUrl,
} = require('../../src/xhs-note/fingerprint');

test('articleTextHash 对 trim 后标题与正文稳定', () => {
  const a = articleTextHash('  题  ', '  正文\n第二段  ');
  const b = articleTextHash('题', '正文\n第二段');
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test('contentMd5 与 dataUrl 一致', () => {
  const bytes = Buffer.from('hello-image');
  const hex = contentMd5(bytes);
  const dataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  assert.equal(contentMd5FromDataUrl(dataUrl), hex);
  assert.equal(contentMd5FromDataUrl('not-a-data-url'), '');
});
