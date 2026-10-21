// @ts-check
'use strict';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_VISION_MODEL = 'deepseek-flash';

/**
 * @typedef {Record<string, string | undefined>} LlmEnv
 * @typedef {() => LlmEnv} LlmEnvReader
 * @typedef {LlmEnv | LlmEnvReader | null | undefined} LlmEnvSource
 * @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} FetchFn
 * @typedef {{ text: string; dataUrl: string }} VisionInput
 */

/**
 * @param {LlmEnvSource} env
 * @returns {LlmEnv}
 */
function readEnv(env) {
  if (typeof env === 'function') return env() || {};
  return env || {};
}

/**
 * 第一个参数可以是环境对象，或每次请求再读的函数（设置页保存后不重跑 apply）。
 * @param {LlmEnvSource} env
 * @param {FetchFn} [fetchImpl]
 */
function createLlm(env, fetchImpl) {
  const fetchFn = fetchImpl || globalThis.fetch;

  /**
   * @returns {{ apiKey: string; baseUrl: string; source: LlmEnv }}
   */
  function auth() {
    const source = readEnv(env);
    const apiKey = String(source.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) throw new Error('缺少 DEEPSEEK_API_KEY');
    const baseUrl = String(source.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    return { apiKey, baseUrl, source };
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
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async function complete(prompt) {
    const { apiKey, baseUrl, source } = auth();
    const model = String(source.DEEPSEEK_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const response = await fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });
    if (!response.ok) {
      throw new Error(`模型请求失败（${response.status}）`);
    }
    return contentFrom(await response.json());
  }

  /**
   * 识图：与写稿 complete 分开；默认 deepseek-flash，可用 DEEPSEEK_VISION_MODEL 覆盖。
   * @param {VisionInput} input
   * @returns {Promise<string>}
   */
  async function completeVision(input) {
    const { apiKey, baseUrl, source } = auth();
    if (!input || typeof input !== 'object') {
      throw new Error('识图参数不完整');
    }
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    const dataUrl = typeof input.dataUrl === 'string' ? input.dataUrl.trim() : '';
    if (!text) throw new Error('识图提示词是空的');
    if (!dataUrl.startsWith('data:image/')) throw new Error('参考图格式不对');
    const model = String(source.DEEPSEEK_VISION_MODEL || DEFAULT_VISION_MODEL).trim()
      || DEFAULT_VISION_MODEL;
    const response = await fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'original' },
            },
          ],
        }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });
    if (!response.ok) {
      throw new Error(`模型请求失败（${response.status}）`);
    }
    return contentFrom(await response.json());
  }

  return { complete, completeVision };
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_VISION_MODEL,
  createLlm,
};
