'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLlm, DEFAULT_CHAT_MODEL } = require('../../src/llm/client');

/**
 * @param {{ content?: string; enough?: boolean; chatId?: string }} [opts]
 */
function fakeModels(opts) {
  const content = opts && opts.content ? opts.content : '{"title":"甲"}';
  const enough = !opts || opts.enough !== false;
  const chatId = (opts && opts.chatId) || DEFAULT_CHAT_MODEL;
  /** @type {Array<{ op: string; body?: unknown; options?: unknown }>} */
  const calls = [];
  return {
    calls,
    list: async () => ({ data: [{ id: chatId, kind: 'chat' }] }),
    billing: {
      quote: async (body) => {
        calls.push({ op: 'quote', body });
        return {
          kind: 'chat',
          estimate: '0.0100',
          enough,
          balance: enough ? '10.0000' : '0.0000',
          model: chatId,
        };
      },
    },
    chat: {
      completions: {
        create: async (body, options) => {
          calls.push({ op: 'chat', body, options });
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
}

test('没有 Dex Buddy 钥匙时不发请求', async () => {
  let called = false;
  const llm = createLlm({}, () => {
    called = true;
    throw new Error('不应请求');
  });
  await assert.rejects(() => llm.complete('你好'), /DEX_BUDDY_API_KEY/);
  assert.equal(called, false);
});

test('文案请求走 chat 渠道并要求 JSON 对象', async () => {
  const models = fakeModels();
  const llm = createLlm({ models });
  const text = await llm.complete('写一篇');
  assert.equal(text, '{"title":"甲"}');
  const chat = models.calls.find((item) => item.op === 'chat');
  assert.ok(chat);
  const body = /** @type {{ model: string; temperature: number; messages: unknown; response_format: unknown }} */ (chat.body);
  assert.equal(body.model, DEFAULT_CHAT_MODEL);
  assert.equal(body.temperature, 0.7);
  assert.deepEqual(body.messages, [{ role: 'user', content: '写一篇' }]);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.pluginId, undefined);
});

test('成稿可走 system + user 两条 messages', async () => {
  const models = fakeModels();
  const llm = createLlm({ models });
  await llm.complete({ system: '你是编辑', user: '写一篇种草' });
  const chat = models.calls.find((item) => item.op === 'chat');
  const body = /** @type {{ messages: unknown }} */ (chat.body);
  assert.deepEqual(body.messages, [
    { role: 'system', content: '你是编辑' },
    { role: 'user', content: '写一篇种草' },
  ]);
});

test('识图与写稿共用 chat 渠道，图在 user 消息里', async () => {
  const models = fakeModels({ content: '{"kind":"poster"}' });
  const llm = createLlm({ models });
  const text = await llm.completeVision({
    text: '学风格',
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
  });
  assert.equal(text, '{"kind":"poster"}');
  const chat = models.calls.find((item) => item.op === 'chat');
  const body = /** @type {{ model: string; temperature: number; messages: Array<{ content: Array<{ type: string; image_url?: { detail: string } }> }> }} */ (chat.body);
  assert.equal(body.model, DEFAULT_CHAT_MODEL);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.messages[0].content[1].type, 'image_url');
  assert.equal(body.messages[0].content[1].image_url.detail, 'original');
});

test('步骤键只放在调用 options 里', async () => {
  const models = fakeModels();
  const llm = createLlm({ models });
  await llm.complete('写一篇', { idempotencyKey: 'post-1:copy' });
  const chat = models.calls.find((item) => item.op === 'chat');
  assert.deepEqual(chat.options, { idempotencyKey: 'post-1:copy' });
  const body = /** @type {Record<string, unknown>} */ (chat.body);
  assert.equal(body.idempotencyKey, undefined);
  assert.equal(body.pluginId, undefined);
});

test('报价不够时不调用 create', async () => {
  const models = fakeModels({ enough: false });
  const llm = createLlm({ models });
  await assert.rejects(() => llm.complete('写一篇'), /INSUFFICIENT_CREDITS/);
  assert.equal(models.calls.some((item) => item.op === 'chat'), false);
  assert.equal(models.calls.some((item) => item.op === 'quote'), true);
});

test('空目录回退 dexbuddy-chat', async () => {
  const models = fakeModels();
  models.list = async () => ({ data: [] });
  const llm = createLlm({ models });
  await llm.complete('写一篇');
  const chat = models.calls.find((item) => item.op === 'chat');
  assert.equal(/** @type {{ model: string }} */ (chat.body).model, DEFAULT_CHAT_MODEL);
});
