'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasLearnableNoteContent } = require('../../src/xhs-note/split');

test('仅标题不可学；有正文或有图可学', () => {
  assert.equal(hasLearnableNoteContent(null), false);
  assert.equal(hasLearnableNoteContent({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc',
    title: '只有标题',
    body: '',
    images: [],
  }), false);
  assert.equal(hasLearnableNoteContent({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc',
    title: '题',
    body: '  正文  ',
    images: [],
  }), true);
  assert.equal(hasLearnableNoteContent({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc',
    title: '',
    body: '',
    images: [{ url: 'https://example.com/a.jpg', role: 'cover' }],
  }), true);
  assert.equal(hasLearnableNoteContent({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc',
    title: '',
    body: '',
    images: [{ url: '  ', role: 'cover' }],
  }), false);
});
