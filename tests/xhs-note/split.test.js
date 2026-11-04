'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeNotePayload,
  pickInnerImage,
  splitNoteParts,
} = require('../../src/xhs-note/split');

test('拆分首图与内页；无 cover 时第一张当首图', () => {
  const withCover = splitNoteParts({
    sourceUrl: 'https://www.xiaohongshu.com/explore/1',
    title: '标题',
    body: '正文',
    tags: [],
    images: [
      { url: 'https://img/cover.jpg', role: 'cover' },
      { url: 'https://img/a.jpg', role: 'image' },
      { url: 'https://img/b.jpg', role: 'image' },
    ],
    fetchedAt: '',
  });
  assert.equal(withCover.cover?.url, 'https://img/cover.jpg');
  assert.equal(withCover.inners.length, 2);
  assert.equal(pickInnerImage(withCover, 1)?.url, 'https://img/b.jpg');

  const noRole = splitNoteParts({
    sourceUrl: 'https://www.xiaohongshu.com/explore/2',
    title: '',
    body: '有正文',
    tags: [],
    images: [
      { url: 'https://img/1.jpg' },
      { url: 'https://img/2.jpg' },
    ],
    fetchedAt: '',
  });
  assert.equal(noRole.title, '未命名笔记');
  assert.equal(noRole.cover?.url, 'https://img/1.jpg');
  assert.equal(noRole.inners.length, 1);
});

test('normalizeNotePayload 拒绝无 sourceUrl', () => {
  assert.equal(normalizeNotePayload(null), null);
  assert.equal(normalizeNotePayload({ title: 'x' }), null);
  const ok = normalizeNotePayload({
    sourceUrl: ' https://www.xiaohongshu.com/explore/x ',
    title: 't',
    body: 'b',
    tags: ['a', 1, ''],
    images: [{ url: 'https://img/x.jpg', role: 'cover' }],
  });
  assert.equal(ok?.sourceUrl, 'https://www.xiaohongshu.com/explore/x');
  assert.deepEqual(ok?.tags, ['a']);
});
