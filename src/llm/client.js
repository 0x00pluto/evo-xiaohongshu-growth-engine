// @ts-check
'use strict';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

/**
 * @typedef {Record<string, string | undefined>} LlmEnv
 * @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} FetchFn
 */

/**
 * @param {LlmEnv | null | undefined} env
 * @param {FetchFn} [fetchImpl]
 */
function createLlm(env, fetchImpl) {
  const source = env || {};
  const fetchFn = fetchImpl || globalThis.fetch;

  /**
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async function complete(prompt) {
    const apiKey = String(source.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) throw new Error('缺少 DEEPSEEK_API_KEY');
    const baseUrl = String(source.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
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
    const body = await response.json();
    const content = body && body.choices && body.choices[0] && body.choices[0].message
      ? body.choices[0].message.content
      : '';
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('模型没有返回内容');
    }
    return content;
  }

  return { complete };
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  createLlm,
};
