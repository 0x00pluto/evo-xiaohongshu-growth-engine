'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { formatModelError } = require('../../src/one-post/model-error');

test('CONTENT_FLAGGED 提示换画面说明或参考图', () => {
  const err = new Error('网关原文');
  /** @type {{ code?: string }} */ (err).code = 'CONTENT_FLAGGED';
  const text = formatModelError(err, '生图失败');
  assert.match(text, /安全审核/);
  assert.match(text, /参考图|风格样图|我们的图/);
  assert.match(text, /CONTENT_FLAGGED/);
  assert.doesNotMatch(text, /取回/);
});

test('其它码仍带原消息与码', () => {
  const err = new Error('上游挂了');
  /** @type {{ code?: string }} */ (err).code = 'UPSTREAM_ERROR';
  assert.match(formatModelError(err, '失败'), /上游挂了（UPSTREAM_ERROR）/);
});
