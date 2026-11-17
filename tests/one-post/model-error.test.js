'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatModelError,
  isIdempotencyConflict,
  isReplayableErrorMessage,
  isReplayableModelError,
} = require('../../src/one-post/model-error');

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

test('NETWORK_ERROR / fetch failed 可同 key 重放', () => {
  const err = new Error('fetch failed');
  /** @type {{ code?: string }} */ (err).code = 'NETWORK_ERROR';
  assert.equal(isReplayableModelError(err), true);
  assert.equal(isReplayableErrorMessage('fetch failed（NETWORK_ERROR）'), true);
  assert.equal(isReplayableErrorMessage('取回失败，再点「用 AI 再看一遍」（不会重复扣费）'), true);
});

test('IDEMPOTENCY_CONFLICT 可同 key 重放', () => {
  const err = new Error('同 key 正在处理');
  /** @type {{ code?: string }} */ (err).code = 'IDEMPOTENCY_CONFLICT';
  assert.equal(isIdempotencyConflict(err), true);
  assert.equal(isReplayableModelError(err), true);
});

test('CONTENT_FLAGGED 不可当网络重放', () => {
  const err = new Error('flagged');
  /** @type {{ code?: string }} */ (err).code = 'CONTENT_FLAGGED';
  assert.equal(isReplayableModelError(err), false);
});
