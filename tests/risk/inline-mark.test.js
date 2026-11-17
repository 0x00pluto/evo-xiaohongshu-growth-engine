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

test('escapeHtml 转义尖括号', () => {
  assert.equal(api.escapeHtml('<a&b>'), '&lt;a&amp;b&gt;');
});

test('resolveMarkRange 纠正偏移', () => {
  const body = '默认双人，陪玩帮你带任务要用的道具和装备。';
  const text = '陪玩帮你带任务要用的道具和装备';
  const real = body.indexOf(text);
  const range = api.resolveMarkRange(body, real - 2, real + text.length - 2, text);
  assert.ok(range);
  assert.equal(range.start, real);
  assert.equal(body.slice(range.start, range.end), text);
});

test('pickNonOverlappingMarks 重叠时留较短', () => {
  const picked = api.pickNonOverlappingMarks([
    {
      id: 'long', source: 'ai', fieldId: 'body', displayField: 'body',
      start: 0, end: 10, text: 'abcdefghij', reason: '', replacement: '', badge: '',
    },
    {
      id: 'short', source: 'lexicon', fieldId: 'body', displayField: 'body',
      start: 2, end: 5, text: 'cde', reason: '', replacement: '', badge: '',
    },
  ]);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].id, 'short');
});

test('buildOverlayHtml 三色内联底色且无 underline', () => {
  const html = api.buildOverlayHtml('你好世界也好', [
    {
      id: 'm1', source: 'ai', fieldId: 'body', displayField: 'body',
      start: 0, end: 2, text: '你好', reason: '', replacement: '您好', badge: '', uiState: 'pending',
    },
    {
      id: 'm2', source: 'ai', fieldId: 'body', displayField: 'body',
      start: 2, end: 4, text: '世界', reason: '', replacement: '地球', badge: '', uiState: 'applied',
    },
    {
      id: 'm3', source: 'ai', fieldId: 'body', displayField: 'body',
      start: 4, end: 6, text: '也好', reason: '', replacement: '也行', badge: '', uiState: 'discarded',
    },
  ]);
  assert.match(html, /background-color:#FECACA/);
  assert.match(html, /background-color:#BBF7D0/);
  assert.match(html, /background-color:#FEF08A/);
  assert.equal(html.includes('underline'), false);
  assert.equal(html.includes('bg-success/20'), false);
});

test('collectInlineMarks 保留 discarded 与 applied', () => {
  const marks = api.collectInlineMarks({
    bodyText: '正文内容最好',
    bodyOnly: '正文内容最好',
    titleText: '',
    hits: [],
    suggestions: [{
      id: 'a1',
      fieldId: 'body',
      start: 4,
      end: 6,
      text: '最好',
      reason: '极限词',
      replacement: '更合适',
      status: '还没改',
      uiState: 'discarded',
    }, {
      id: 'a2',
      fieldId: 'body',
      start: 0,
      end: 2,
      text: '正文',
      reason: '示范',
      replacement: '文案',
      status: '已改这一处',
      uiState: 'applied',
    }],
  });
  // applied 用替换文「文案」重定位；当前 body 仍是「正文…」时找不到则不画
  const discarded = marks.find((item) => item.id === 'a1');
  assert.ok(discarded);
  assert.equal(discarded.uiState, 'discarded');
});

test('collectInlineMarks applied 带 originalText', () => {
  const marks = api.collectInlineMarks({
    bodyText: '文案内容最好',
    bodyOnly: '文案内容最好',
    titleText: '',
    hits: [],
    suggestions: [{
      id: 'a2',
      fieldId: 'body',
      start: 0,
      end: 2,
      text: '正文',
      originalText: '正文',
      reason: '示范',
      replacement: '文案',
      status: '已改这一处',
      uiState: 'applied',
    }],
  });
  assert.equal(marks.length, 1);
  assert.equal(marks[0].uiState, 'applied');
  assert.equal(marks[0].text, '文案');
  assert.equal(marks[0].originalText, '正文');
});

test('markStyleForState 内联底色', () => {
  assert.equal(api.markStyleForState('applied').style.includes('#BBF7D0'), true);
  assert.equal(api.markStyleForState('pending').style.includes('#FECACA'), true);
  assert.equal(api.markStyleForState('discarded').style.includes('#FEF08A'), true);
  assert.match(api.markClassForState('pending'), /error/);
  assert.match(api.markClassForState('applied'), /success/);
  assert.match(api.markClassForState('discarded'), /warning/);
});
