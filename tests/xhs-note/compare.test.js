'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareLearnedParts } = require('../../src/xhs-note/compare');
const { articleTextHash, contentMd5 } = require('../../src/xhs-note/fingerprint');

function link(partial) {
  return {
    learned: {
      articleSampleId: '',
      albums: [],
      ...partial,
    },
  };
}

test('未学过 → new 且默认可勾', () => {
  const result = compareLearnedParts({
    link: link({}),
    title: '题',
    body: '正文',
    coverMd5: contentMd5(Buffer.from('cover')),
    innerMd5: contentMd5(Buffer.from('inner')),
    hasCover: true,
    hasInner: true,
  });
  assert.equal(result.article.status, 'new');
  assert.equal(result.cover.status, 'new');
  assert.equal(result.inner.status, 'new');
  assert.equal(result.allUnchanged, false);
  assert.equal(result.article.defaultChecked, true);
  assert.equal(result.article.locked, false);
});

test('哈希相同 → unchanged 锁定', () => {
  const body = '正文';
  const title = '题';
  const cover = contentMd5(Buffer.from('cover'));
  const inner = contentMd5(Buffer.from('inner'));
  const result = compareLearnedParts({
    link: link({
      articleSampleId: 'sample1',
      articleTextHash: articleTextHash(title, body),
      albums: [
        { albumId: 'a1', role: 'cover', contentMd5: cover },
        { albumId: 'a2', role: 'inner', contentMd5: inner },
      ],
    }),
    title,
    body,
    coverMd5: cover,
    innerMd5: inner,
    hasCover: true,
    hasInner: true,
  });
  assert.equal(result.allUnchanged, true);
  assert.equal(result.article.status, 'unchanged');
  assert.equal(result.cover.locked, true);
  assert.equal(result.cover.label, '没变');
});

test('缺指纹 → missing_fp 不默认勾', () => {
  const result = compareLearnedParts({
    link: link({
      articleSampleId: 'sample1',
      albums: [{ albumId: 'a1', role: 'cover' }],
    }),
    title: '题',
    body: '正文',
    coverMd5: contentMd5(Buffer.from('cover')),
    hasCover: true,
    hasInner: false,
  });
  assert.equal(result.article.status, 'missing_fp');
  assert.equal(result.cover.status, 'missing_fp');
  assert.equal(result.article.defaultChecked, false);
  assert.equal(result.article.locked, false);
  assert.equal(result.article.label, '需确认');
});

test('内容变了 → changed', () => {
  const result = compareLearnedParts({
    link: link({
      articleSampleId: 'sample1',
      articleTextHash: articleTextHash('旧题', '旧正文'),
      albums: [{ albumId: 'a1', role: 'cover', contentMd5: contentMd5(Buffer.from('old')) }],
    }),
    title: '新题',
    body: '新正文',
    coverMd5: contentMd5(Buffer.from('new')),
    hasCover: true,
    hasInner: false,
  });
  assert.equal(result.article.status, 'changed');
  assert.equal(result.cover.status, 'changed');
  assert.equal(result.article.defaultChecked, true);
  assert.equal(result.article.label, '有更新');
});
