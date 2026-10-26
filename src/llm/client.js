// @ts-check
'use strict';

/** @type {typeof import('../../lib/dex-models')} */
const dexModels = require('../../lib/dex-models');
const { bindModels, DexModelsError } = dexModels;

const DEFAULT_CHAT_MODEL = 'dexbuddy-chat';

/**
 * @typedef {Record<string, string | undefined>} LlmEnv
 * @typedef {() => LlmEnv} LlmEnvReader
 * @typedef {LlmEnv | LlmEnvReader | null | undefined} LlmEnvSource
 * @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} FetchFn
 * @typedef {{ text: string; dataUrl: string }} VisionInput
 * @typedef {{ system: string; user: string }} ChatMessages
 * @typedef {{
 *   list: () => Promise<unknown>;
 *   billing: { quote: (body: unknown, options?: { idempotencyKey?: string }) => Promise<unknown> };
 *   chat: { completions: { create: (body: unknown, options?: { idempotencyKey?: string }) => Promise<unknown> } };
 * }} HostModels
 * @typedef {{
 *   env?: LlmEnvSource;
 *   ctx?: unknown;
 *   models?: HostModels | null;
 *   fetch?: FetchFn;
 * }} LlmOptions
 * @typedef {{ idempotencyKey?: string }} LlmCallOptions
 * @typedef {{
 *   kind?: string;
 *   estimate?: string;
 *   enough?: boolean;
 *   balance?: string;
 *   model: string;
 *   messages: Array<{ role: string; content: unknown }>;
 * }} ChatQuote
 */

/**
 * @param {unknown} value
 * @returns {value is LlmOptions}
 */
function isLlmOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = /** @type {Record<string, unknown>} */ (value);
  return Boolean(record.models || record.ctx || record.env || record.fetch);
}

/**
 * @param {LlmEnvSource} env
 * @returns {LlmEnv}
 */
function readEnv(env) {
  if (typeof env === 'function') return env() || {};
  return env || {};
}

/**
 * @param {unknown} list
 * @param {string} kind
 * @param {string} fallback
 * @returns {string}
 */
function pickModel(list, kind, fallback) {
  const record = list && typeof list === 'object' ? /** @type {{ data?: unknown }} */ (list) : null;
  const data = record && Array.isArray(record.data) ? record.data : [];
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = /** @type {{ kind?: unknown; id?: unknown }} */ (item);
    if (row.kind === kind && typeof row.id === 'string' && row.id.trim()) return row.id.trim();
  }
  return fallback;
}

/**
 * @param {unknown} body
 * @returns {string}
 */
function contentFrom(body) {
  const content = body && typeof body === 'object'
    && /** @type {{ choices?: Array<{ message?: { content?: unknown } }> }} */ (body).choices
    && /** @type {{ choices: Array<{ message?: { content?: unknown } }> }} */ (body).choices[0]
    && /** @type {{ choices: Array<{ message?: { content?: unknown } }> }} */ (body).choices[0].message
    ? /** @type {{ choices: Array<{ message: { content?: unknown } }> }} */ (body).choices[0].message.content
    : '';
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('模型没有返回内容');
  }
  return content;
}

/**
 * @param {string | ChatMessages} prompt
 * @returns {Array<{ role: string; content: unknown }>}
 */
function toMessages(prompt) {
  if (typeof prompt === 'string') {
    return [{ role: 'user', content: prompt }];
  }
  if (
    prompt
    && typeof prompt === 'object'
    && typeof prompt.system === 'string'
    && typeof prompt.user === 'string'
  ) {
    const system = prompt.system.trim();
    const user = prompt.user.trim();
    if (!system || !user) {
      throw new Error('模型提示词不完整');
    }
    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }
  throw new Error('模型提示词格式不对');
}

/**
 * @param {unknown} quote
 * @param {string} model
 * @returns {never}
 */
function throwInsufficient(quote, model) {
  const record = quote && typeof quote === 'object' && !Array.isArray(quote)
    ? /** @type {{ estimate?: unknown; balance?: unknown }} */ (quote)
    : null;
  const err = new DexModelsError('INSUFFICIENT_CREDITS', '积分不足（INSUFFICIENT_CREDITS）', 402);
  /** @type {{ quote?: { estimate: string; balance: string; model: string } }} */ (err).quote = {
    estimate: record && typeof record.estimate === 'string' ? record.estimate : '',
    balance: record && typeof record.balance === 'string' ? record.balance : '',
    model,
  };
  throw err;
}

/**
 * 第一个参数可以是环境对象，或 `{ env, ctx, models }`。
 * @param {LlmEnvSource | LlmOptions} envOrOptions
 * @param {FetchFn} [fetchImpl]
 */
function createLlm(envOrOptions, fetchImpl) {
  const options = isLlmOptions(envOrOptions)
    ? envOrOptions
    : { env: envOrOptions, fetch: fetchImpl };
  const envSource = options.env;
  const fetchFn = options.fetch || fetchImpl;

  /**
   * @returns {HostModels}
   */
  function getModels() {
    if (options.models) return options.models;
    const env = readEnv(envSource);
    return /** @type {HostModels} */ (bindModels(options.ctx, {
      env,
      fetch: fetchFn,
    }));
  }

  /**
   * @param {Array<{ role: string; content: unknown }>} messages
   * @returns {Promise<ChatQuote>}
   */
  async function quoteChat(messages) {
    const models = getModels();
    const listed = await models.list();
    const model = pickModel(listed, 'chat', DEFAULT_CHAT_MODEL);
    const quote = await models.billing.quote({ model, messages });
    if (!quote || typeof quote !== 'object' || /** @type {{ enough?: unknown }} */ (quote).enough !== true) {
      throwInsufficient(quote, model);
    }
    return /** @type {ChatQuote} */ ({
      .../** @type {object} */ (quote),
      model,
      messages,
    });
  }

  /**
   * @param {string | ChatMessages} prompt
   * @returns {Promise<ChatQuote>}
   */
  function quoteComplete(prompt) {
    return quoteChat(toMessages(prompt));
  }

  /**
   * 入参可为单段 user 字符串，或成稿用的 `{ system, user }`。
   * @param {string | ChatMessages} prompt
   * @param {LlmCallOptions} [callOptions]
   * @returns {Promise<string>}
   */
  async function complete(prompt, callOptions) {
    const quoted = await quoteChat(toMessages(prompt));
    const models = getModels();
    const body = await models.chat.completions.create({
      model: quoted.model,
      messages: quoted.messages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }, { idempotencyKey: callOptions && callOptions.idempotencyKey });
    return contentFrom(body);
  }

  /**
   * 识图：与写稿共用 chat 渠道，内容块保持 image_url。
   * @param {VisionInput} input
   * @param {LlmCallOptions} [callOptions]
   * @returns {Promise<string>}
   */
  async function completeVision(input, callOptions) {
    if (!input || typeof input !== 'object') {
      throw new Error('识图参数不完整');
    }
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    const dataUrl = typeof input.dataUrl === 'string' ? input.dataUrl.trim() : '';
    if (!text) throw new Error('识图提示词是空的');
    if (!dataUrl.startsWith('data:image/')) throw new Error('参考图格式不对');
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text },
        {
          type: 'image_url',
          image_url: { url: dataUrl, detail: 'original' },
        },
      ],
    }];
    const quoted = await quoteChat(messages);
    const models = getModels();
    const body = await models.chat.completions.create({
      model: quoted.model,
      messages: quoted.messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }, { idempotencyKey: callOptions && callOptions.idempotencyKey });
    return contentFrom(body);
  }

  return { complete, completeVision, quoteComplete };
}

module.exports = {
  DEFAULT_CHAT_MODEL,
  createLlm,
  pickModel,
  toMessages,
};
