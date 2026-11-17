'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/studio/static/lib/risk-ai-poll-wait.js'),
  'utf8',
);
const sandbox = { window: {}, console };
vm.runInNewContext(source, sandbox);
const api = sandbox.window.riskAiPollWait;

test('默认间隔与窗口', () => {
  assert.equal(api.POLL_INTERVAL_MS, 10000);
  assert.equal(api.POLL_MAX_MS, 120000);
  assert.equal(api.POLL_GRACE_MS, 5000);
});

test('timing 未超时不该停', () => {
  const started = 1_000_000;
  const t = api.timing(started + 60_000, started);
  assert.equal(t.shouldStopWaiting, false);
  assert.equal(t.inGrace, false);
  assert.equal(t.elapsedMs, 60_000);
});

test('timing 进入宽限', () => {
  const started = 1_000_000;
  const t = api.timing(started + 122_000, started);
  assert.equal(t.inGrace, true);
  assert.equal(t.shouldStopWaiting, false);
});

test('timing 宽限后应停并提示重试', () => {
  const started = 1_000_000;
  const t = api.timing(started + 125_000, started);
  assert.equal(t.shouldStopWaiting, true);
  assert.equal(t.inGrace, false);
});
