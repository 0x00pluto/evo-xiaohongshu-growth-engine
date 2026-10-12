'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ARTICLE_TOO_LONG,
  EMPTY_BUSINESS,
  charLength,
  formatPost,
  formatTopics,
  validateInputs,
} = require('../../src/draft/validate');

test('业务一句是空白时拒绝', () => {
  const result = validateInputs({ business: '   ', article: '', galleryCount: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.field, 'business');
  assert.equal(result.message, EMPTY_BUSINESS);
});

test('文章刚好 8000 字可以通过，多一个字就拒绝', () => {
  const ok = validateInputs({ business: '卖课', article: '字'.repeat(8000), galleryCount: 0 });
  assert.equal(ok.ok, true);
  assert.equal(charLength(ok.article), 8000);

  const tooLong = validateInputs({ business: '卖课', article: `  ${'字'.repeat(8001)}  `, galleryCount: 1 });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.field, 'article');
  assert.equal(tooLong.message, ARTICLE_TOO_LONG);
});

test('复制话题时补上井号并用空格隔开', () => {
  assert.equal(formatTopics(['夏天穿搭', '#已经有', '  通勤  ', '']), '#夏天穿搭 #已经有 #通勤');
});

test('整帖是标题、正文、话题，中间空一行', () => {
  assert.equal(formatPost({
    title: ' 夏天出门 ',
    body: '第一段\n第二段',
    topics: ['夏天穿搭', '#通勤'],
    coverLine: '不进帖子',
  }), '夏天出门\n\n第一段\n第二段\n\n#夏天穿搭 #通勤');
  assert.equal(formatPost({ title: '只有标题', body: '  ', topics: [] }), '只有标题');
});
