'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  checkRiskText,
  loadFactoryWords,
  matchField,
} = require('../../src/risk/match');

const factoryPath = path.join(__dirname, '..', '..', 'assets', 'risk', 'factory-words.json');
const factory = loadFactoryWords(factoryPath);
const factoryRaw = JSON.parse(fs.readFileSync(factoryPath, 'utf8'));

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

test('出厂词带来源行业：代表词与去重键', () => {
  const rows = Array.isArray(factoryRaw.words) ? factoryRaw.words : [];
  assert.ok(rows.length > 0);

  /** @param {string} text */
  function byText(text) {
    return rows.filter((item) => item && item.text === text);
  }

  const welcome = byText('最受欢迎');
  assert.equal(welcome.length, 1);
  assert.equal(welcome[0].libraryId, 'ad_extreme');
  assert.equal(welcome[0].severity, '要改口');
  assert.equal(welcome[0].industry, '通用');

  const addWechat = byText('加微信');
  assert.equal(addWechat.length, 1);
  assert.equal(addWechat[0].libraryId, 'offsite_traffic');
  assert.equal(addWechat[0].severity, '不能发');
  assert.equal(addWechat[0].industry, '通用');

  const follow = byText('关注');
  assert.ok(follow.length >= 1);
  assert.ok(follow.some((item) => item.industry === '通用'));

  const sureWin = byText('稳赚不赔');
  assert.ok(sureWin.length >= 1);
  assert.ok(sureWin.every((item) => item.libraryId === 'banned'));
  assert.ok(sureWin.every((item) => item.severity === '不能发'));
  assert.ok(sureWin.some((item) => item.industry === '财富管理与家族传承'));

  const keys = new Set();
  for (const item of rows) {
    const text = typeof item.text === 'string' ? item.text : '';
    const industry = typeof item.industry === 'string' ? item.industry : '';
    assert.ok(text);
    assert.ok(industry);
    const key = `${text}\0${industry}`;
    assert.equal(keys.has(key), false, `重复词面+行业: ${text} / ${industry}`);
    keys.add(key);
  }

  const hit = checkRiskText({
    fields: [{ id: 'body', text: '稳赚不赔的理财' }],
    libraryIds: ['banned'],
    factoryWords: factory.words,
    libraries: factory.libraries,
  });
  assert.equal(hit.status, 'hits');
  assert.equal(hit.hits.length, 1);
  assert.equal(hit.hits[0].text, '稳赚不赔');
  assert.equal(hit.hits[0].severity, '不能发');
});

test('飞书备忘新增词：命中长词不拆、合规说法不误伤', () => {
  const hit = checkRiskText({
    fields: [{
      id: 'body',
      text: '截流运营用自动化脚本，全网首发；内容运营与账号运营最近复盘。',
    }],
    libraryIds: ['ad_extreme', 'offsite_traffic', 'banned'],
    factoryWords: factory.words,
    libraries: factory.libraries,
  });
  assert.equal(hit.status, 'hits');
  const texts = hit.hits.map((item) => item.text).sort();
  assert.deepEqual(texts, ['全网首发', '截流运营', '自动化脚本'].sort());
  assert.equal(hit.hits.filter((item) => item.text === '截流').length, 0);
  assert.equal(hit.hits.filter((item) => item.text === '内容运营').length, 0);
  assert.equal(hit.hits.filter((item) => item.text === '账号运营').length, 0);
  assert.equal(hit.hits.filter((item) => item.text === '最近').length, 0);
  assert.equal(hit.hits.filter((item) => item.text === '最').length, 0);

  const jieLiu = hit.hits.find((item) => item.text === '截流运营');
  assert.ok(jieLiu);
  assert.equal(jieLiu.libraryId, 'offsite_traffic');
  assert.equal(jieLiu.severity, '不能发');
  assert.equal(jieLiu.replacement, '内容运营复盘');
});

test('出厂不能发每条都有非空 replacement（prd-00021）', () => {
  const cannot = factoryRaw.words.filter((row) => row && row.severity === '不能发');
  assert.ok(cannot.length > 0);
  const missing = cannot.filter((row) => !String(row.replacement || '').trim());
  assert.equal(missing.length, 0, missing.slice(0, 5).map((row) => row.text).join(','));
});

test('不能发命中带出词库替换句', () => {
  const result = checkRiskText({
    fields: [{ id: 'body', text: '这套是全网第一的唯一档位，加微信领国家级攻略。' }],
    libraryIds: ['ad_extreme', 'offsite_traffic', 'banned'],
    factoryWords: factory.words,
    libraries: factory.libraries,
  });
  assert.equal(result.status, 'hits');
  const texts = ['全网第一', '唯一', '加微信', '国家级'];
  for (const text of texts) {
    const hit = result.hits.find((item) => item.text === text);
    assert.ok(hit, text);
    assert.equal(hit.severity, '不能发');
    assert.ok(String(hit.replacement || '').trim(), text);
  }
});
