// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MODEL_URL = 'https://api.replicate.com/v1/models/openai/gpt-image-2.5-flare/predictions';
const POLL_INTERVAL_MS = 3000;
const POLL_DEADLINE_MS = 8 * 60 * 1000;

const IMAGE_INPUT = {
  aspect_ratio: '3:4',
  quality: 'medium',
  output_format: 'png',
  number_of_images: 1,
};

/**
 * @typedef {Record<string, string | undefined>} ImageEnv
 * @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} FetchFn
 * @typedef {(ms: number) => Promise<void>} SleepFn
 * @typedef {{
 *   status?: string;
 *   error?: unknown;
 *   output?: unknown;
 *   urls?: { get?: string };
 * }} Prediction
 */

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {unknown} output
 * @returns {string}
 */
function outputUrl(output) {
  if (typeof output === 'string' && output.startsWith('http')) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = outputUrl(item);
      if (url) return url;
    }
    return '';
  }
  if (output && typeof output === 'object') {
    const record = /** @type {Record<string, unknown>} */ (output);
    if (typeof record.url === 'string') return record.url;
    if (typeof record.href === 'string') return record.href;
  }
  return '';
}

/**
 * @param {Response} response
 * @returns {Promise<Prediction>}
 */
async function readPrediction(response) {
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body && typeof body.detail === 'string' ? body.detail : '';
    } catch {
      detail = '';
    }
    throw new Error(detail ? `生图失败：${detail}` : `生图失败（${response.status}）`);
  }
  return /** @type {Promise<Prediction>} */ (response.json());
}

/**
 * @param {Prediction} prediction
 * @param {string} token
 * @param {FetchFn} fetchFn
 * @param {SleepFn} [sleepImpl]
 * @returns {Promise<string>}
 */
async function waitForPrediction(prediction, token, fetchFn, sleepImpl) {
  let current = prediction;
  const pause = sleepImpl || sleep;
  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (current && (current.status === 'starting' || current.status === 'processing')) {
    if (Date.now() > deadline) throw new Error('生图超时');
    const pollUrl = current.urls && current.urls.get;
    if (!pollUrl) throw new Error('生图没有返回查询地址');
    await pause(POLL_INTERVAL_MS);
    const response = await fetchFn(pollUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    current = await readPrediction(response);
  }
  if (!current || current.status !== 'succeeded') {
    const reason = current && typeof current.error === 'string' && current.error ? current.error : '生图失败';
    throw new Error(reason);
  }
  const url = outputUrl(current.output);
  if (!url) throw new Error('生图没有返回图片');
  return url;
}

/**
 * @param {{
 *   prompt: unknown;
 *   outputPath: string;
 *   env?: ImageEnv | null;
 *   fetch?: FetchFn;
 *   sleep?: SleepFn;
 * }} args
 * @returns {Promise<string>}
 */
async function generatePng({ prompt, outputPath, env, fetch: fetchImpl, sleep: sleepImpl }) {
  const token = String((env && env.REPLICATE_API_TOKEN) || '').trim();
  if (!token) throw new Error('缺少 REPLICATE_API_TOKEN');
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text) throw new Error('提示词是空的');
  const fetchFn = fetchImpl || globalThis.fetch;
  const created = await fetchFn(MODEL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      input: {
        prompt: text,
        ...IMAGE_INPUT,
      },
    }),
  });
  const prediction = await readPrediction(created);
  const url = await waitForPrediction(prediction, token, fetchFn, sleepImpl);
  const downloaded = await fetchFn(url);
  if (!downloaded.ok) throw new Error('图片下载失败');
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  if (bytes.length === 0) throw new Error('图片是空的');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes);
  return outputPath;
}

module.exports = {
  IMAGE_INPUT,
  MODEL_URL,
  generatePng,
  outputUrl,
};
