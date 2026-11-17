'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  checkRiskText,
  loadFactoryWords,
  matchField,
} = require('../../src/risk/match');

const factory = loadFactoryWords(
  path.join(__dirname, '..', '..', 'assets', 'risk', 'factory-words.json'),
);

test('最长优先：命中「最好」后不再报其中的「好」', () => {
  const hits = matchField(
    '这个最好用',
    [
      { libraryId: 'ad_extreme', text: '最好', severity: '要改口', source: 'factory' },
      { libraryId: 'personal', text: '好', severity: '要改口', source: 'personal' },
    ],
    factory.libraries,
    'title',
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].text, '最好');
  assert.equal(hits[0].libraryId, 'ad_extreme');
});

test('同一处出厂词优先于个人词', () => {
  const result = checkRiskText({
    fields: [{ id: 'title', text: '微信联系' }],
    libraryIds: ['offsite_traffic', 'personal'],
    factoryWords: factory.words,
    personalWords: [
      { libraryId: 'personal', text: '微信', severity: '要改口', source: 'personal' },
    ],
    libraries: [
      ...factory.libraries,
      { id: 'personal', name: '个人违禁词库' },
    ],
  });
  assert.equal(result.status, 'hits');
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].libraryId, 'offsite_traffic');
  assert.equal(result.hits[0].severity, '不能发');
  assert.equal(result.cannotCount, 1);
});

test('未勾词库时 need_library', () => {
  const result = checkRiskText({
    fields: [{ id: 'title', text: '最好' }],
    libraryIds: [],
    factoryWords: factory.words,
  });
  assert.equal(result.status, 'need_library');
});

test('无可查的字时 no_text', () => {
  const result = checkRiskText({
    fields: [{ id: 'title', text: '   ' }],
    libraryIds: ['ad_extreme'],
    factoryWords: factory.words,
  });
  assert.equal(result.status, 'no_text');
});

test('无命中时写明查了哪些库', () => {
  const result = checkRiskText({
    fields: [{ id: 'body', text: '今天天气不错' }],
    libraryIds: ['ad_extreme', 'offsite_traffic'],
    factoryWords: factory.words,
  });
  assert.equal(result.status, 'no_hit');
  assert.match(String(result.message), /广告法极限词/);
  assert.match(String(result.message), /没有危险词/);
});
