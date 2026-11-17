'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  WORD_LIMIT,
  addPersonalWords,
  deletePersonalWord,
  readPersonalWords,
  readSelection,
  writeSelection,
} = require('../../src/risk/store');
const { parseReviewSuggestions } = require('../../src/risk/review');

function tempRiskDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'risk-store-'));
}

test('勾选默认全开，写入后重启可读', () => {
  const dir = tempRiskDir();
  const selection = readSelection(dir);
  assert.equal(selection.ad_extreme, true);
  assert.equal(selection.personal, true);
  writeSelection(dir, { ...selection, banned: false });
  assert.equal(readSelection(dir).banned, false);
});

test('个人词添加、超长拒绝、删除', () => {
  const dir = tempRiskDir();
  const long = '字'.repeat(WORD_LIMIT + 1);
  const saved = addPersonalWords(dir, ['品牌忌讳', long, '品牌忌讳', '']);
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.added.length, 1);
  assert.equal(saved.added[0].text, '品牌忌讳');
  assert.equal(saved.rejected.length, 1);
  assert.equal(saved.rejected[0].line, 2);
  assert.equal(readPersonalWords(dir).length, 1);

  const removed = deletePersonalWord(dir, '品牌忌讳');
  assert.equal(removed.ok, true);
  assert.equal(readPersonalWords(dir).length, 0);
});

test('AI 建议原文对不上则丢弃', () => {
  const suggestions = parseReviewSuggestions(
    {
      suggestions: [
        {
          fieldId: 'title',
          start: 0,
          end: 2,
          text: '最好',
          reason: '绝对化',
          replacement: '更合适',
          severity: '要改口',
        },
        {
          fieldId: 'title',
          start: 0,
          end: 2,
          text: '最差',
          reason: '错了',
          replacement: '一般',
          severity: '要改口',
        },
      ],
    },
    [{ id: 'title', text: '最好用' }],
  );
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].text, '最好');
  assert.equal(suggestions[0].status, '还没改');
});
