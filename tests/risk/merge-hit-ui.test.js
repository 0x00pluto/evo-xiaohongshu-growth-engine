'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/studio/static/lib/risk-inline-mark.js'),
  'utf8',
);
const sandbox = { window: {}, console };
vm.runInNewContext(source, sandbox);
const api = sandbox.window.riskInlineMark;

test('mergeHitUiState 保留上一轮 applied', () => {
  const merged = api.mergeHitUiState(
    [{
      id: 'body:10:12:0',
      fieldId: 'body',
      text: '最好',
      libraryId: 'ad_extreme',
      replacement: '更合适',
      start: 10,
      end: 13,
      uiState: 'applied',
    }],
    [{
      id: 'body:20:22:0',
      fieldId: 'body',
      text: '绝对',
      libraryId: 'ad_extreme',
      replacement: '尽量',
      start: 20,
      end: 22,
    }],
  );
  assert.equal(merged.length, 2);
  const applied = merged.find((row) => row.uiState === 'applied');
  assert.ok(applied);
  assert.equal(applied.id, 'body:10:12:0');
  assert.equal(applied.replacement, '更合适');
  const pending = merged.find((row) => row.text === '绝对');
  assert.ok(pending);
  assert.equal(pending.uiState, 'pending');
});

test('mergeHitUiState 把 discarded 贴回新命中', () => {
  const merged = api.mergeHitUiState(
    [{
      id: 'body:0:2:0',
      fieldId: 'body',
      text: '最好',
      libraryId: 'ad_extreme',
      uiState: 'discarded',
    }],
    [{
      id: 'body:4:6:0',
      fieldId: 'body',
      text: '最好',
      libraryId: 'ad_extreme',
      start: 4,
      end: 6,
    }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].uiState, 'discarded');
  assert.equal(merged[0].id, 'body:4:6:0');
});

test('mergeHitUiState 同 id 时覆盖为 applied', () => {
  const merged = api.mergeHitUiState(
    [{
      id: 'same',
      fieldId: 'body',
      text: '最好',
      libraryId: 'ad_extreme',
      replacement: '更合适',
      start: 0,
      end: 3,
      uiState: 'applied',
    }],
    [{
      id: 'same',
      fieldId: 'body',
      text: '最好',
      libraryId: 'ad_extreme',
      start: 0,
      end: 2,
    }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].uiState, 'applied');
  assert.equal(merged[0].replacement, '更合适');
});
