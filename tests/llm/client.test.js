'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLlm } = require('../../src/llm/client');

test('没有 DeepSeek 密钥时不发请求', async () => {
  let called = false;
  const llm = createLlm({}, () => {
    called = true;
    throw new Error('不应请求');
  });
  await assert.rejects(() => llm.complete('你好'), /缺少 DEEPSEEK_API_KEY/);
  assert.equal(called, false);
});

test('文案请求走 Chat Completions 并要求 JSON 对象', async () => {
  let captured;
  const llm = createLlm({
    DEEPSEEK_API_KEY: 'test-key',
    DEEPSEEK_BASE_URL: 'https://example.test/v1/',
    DEEPSEEK_MODEL: 'deepseek-chat',
  }, async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"title":"甲"}' } }] }),
    };
  });
  const text = await llm.complete('写一篇');
  assert.equal(text, '{"title":"甲"}');
  assert.equal(captured.url, 'https://example.test/v1/chat/completions');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, 'deepseek-chat');
  assert.equal(body.temperature, 0.7);
  assert.deepEqual(body.messages, [{ role: 'user', content: '写一篇' }]);
  assert.deepEqual(body.response_format, { type: 'json_object' });
});

test('识图与写稿模型分开，默认 deepseek-flash', async () => {
  let captured;
  const llm = createLlm({
    DEEPSEEK_API_KEY: 'test-key',
    DEEPSEEK_BASE_URL: 'https://example.test/v1/',
    DEEPSEEK_MODEL: 'deepseek-chat',
  }, async (_url, options) => {
    captured = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"kind":"poster"}' } }] }),
    };
  });
  const text = await llm.completeVision({
    text: '学风格',
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
  });
  assert.equal(text, '{"kind":"poster"}');
  assert.equal(captured.model, 'deepseek-flash');
  assert.equal(captured.temperature, 0.2);
  assert.equal(captured.messages[0].content[1].image_url.detail, 'original');
});
