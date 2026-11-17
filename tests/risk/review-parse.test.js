'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReviewSuggestions, resolveSuggestionRange } = require('../../src/risk/review');

test('resolveSuggestionRange 精确 slice 优先', () => {
  const source = '默认双人，陪玩帮你带任务要用的道具和装备。';
  const text = '陪玩帮你带任务要用的道具和装备';
  const start = source.indexOf(text);
  const range = resolveSuggestionRange(source, start, start + text.length, text);
  assert.deepEqual(range, { start, end: start + text.length });
});

test('resolveSuggestionRange 偏移错误时按 text 纠正', () => {
  const source = '默认双人，陪玩帮你带任务要用的道具和装备。';
  const text = '陪玩帮你带任务要用的道具和装备';
  const real = source.indexOf(text);
  const range = resolveSuggestionRange(source, real - 2, real + text.length - 2, text);
  assert.ok(range);
  assert.equal(range.start, real);
  assert.equal(range.end, real + text.length);
  assert.equal(source.slice(range.start, range.end), text);
});

test('parseReviewSuggestions 接受偏偏移并用 text 纠正', () => {
  const body = '默认双人，陪玩帮你带任务要用的道具和装备。后面还有。';
  const text = '陪玩帮你带任务要用的道具和装备';
  const real = body.indexOf(text);
  const parsed = parseReviewSuggestions({
    suggestions: [{
      fieldId: 'body',
      start: real - 2,
      end: real + text.length - 2,
      text,
      reason: '代练风险',
      replacement: '只提供语音建议',
      severity: '要改口',
    }],
  }, [{ id: 'body', text: body }]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].start, real);
  assert.equal(parsed[0].end, real + text.length);
  assert.equal(parsed[0].text, text);
});
