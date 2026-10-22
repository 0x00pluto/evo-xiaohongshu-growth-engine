'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ARTICLE_TOO_LONG,
  EMPTY_BUSINESS,
  REFERENCES_TOO_MANY,
  charLength,
  formatPost,
  formatTopics,
  validateDraftFace,
  validateInputs,
  xhsCharCount,
} = require('../../src/draft/validate');

test('业务一句是空白时拒绝', () => {
  const result = validateInputs({ business: '   ', sampleBody: '', galleryCount: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.field, 'business');
  assert.equal(result.message, EMPTY_BUSINESS);
});

test('范文刚好 8000 字可以通过，多一个字就拒绝', () => {
  const ok = validateInputs({ business: '卖课', sampleBody: '字'.repeat(8000), galleryCount: 0 });
  assert.equal(ok.ok, true);
  assert.equal(charLength(ok.sampleBody), 8000);

  const tooLong = validateInputs({
    business: '卖课',
    sampleBody: `  ${'字'.repeat(8001)}  `,
    galleryCount: 1,
  });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.field, 'sampleBody');
  assert.equal(tooLong.message, ARTICLE_TOO_LONG);
});

test('旧入参 article 仍可当范文正文校验', () => {
  const ok = validateInputs({ business: '卖课', article: '旧文章', galleryCount: 1 });
  assert.equal(ok.ok, true);
  assert.equal(ok.sampleBody, '旧文章');
});

test('参考资料超过 5 条拒绝，5 条通过', () => {
  const refs5 = Array.from({ length: 5 }, (_, i) => `条${i}`);
  const ok = validateInputs({ business: '卖课', sampleBody: '', references: refs5, galleryCount: 1 });
  assert.equal(ok.ok, true);
  const refs6 = Array.from({ length: 6 }, (_, i) => `条${i}`);
  const result = validateInputs({ business: '卖课', sampleBody: '', references: refs6, galleryCount: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.field, 'references');
  assert.equal(result.message, REFERENCES_TOO_MANY);
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

test('封面流程还没成功时，空的封面那句话可以通过成稿校验', () => {
  assert.equal(validateDraftFace({
    title: '标题',
    body: '正文',
    topics: ['甲', '乙', '丙'],
    coverLine: '',
  }), '');
  const inputs = validateInputs({
    business: '卖课',
    sampleBody: '',
    galleryCount: 1,
    coverLineSpecified: '   ',
  });
  assert.equal(inputs.ok, true);
  assert.equal(inputs.field, undefined);
});

test('标题小红书计字：超 20 仍通过校验，由页面计数提示', () => {
  const title19 = '字'.repeat(19);
  const title20 = '字'.repeat(20);
  const title21 = '字'.repeat(21);
  assert.equal(xhsCharCount(title19), 19);
  assert.equal(xhsCharCount(title20), 20);
  assert.equal(xhsCharCount(title21), 21);
  assert.equal(validateDraftFace({
    title: title19,
    body: '正文',
    topics: ['甲', '乙', '丙'],
  }), '');
  assert.equal(validateDraftFace({
    title: title20,
    body: '正文',
    topics: ['甲', '乙', '丙'],
  }), '');
  assert.equal(validateDraftFace({
    title: title21,
    body: '正文',
    topics: ['甲', '乙', '丙'],
  }), '');
});
