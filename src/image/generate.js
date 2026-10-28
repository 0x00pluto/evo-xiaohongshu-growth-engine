// @ts-check
'use strict';

/** @type {typeof import('../../lib/dex-buddy-sdk')} */
const dexBuddySdk = require('../../lib/dex-buddy-sdk');
const { bindModels, DexModelsError } = dexBuddySdk;

/** @type {Readonly<{ standard: string; pro: string }>} */
const IMAGE_MODELS = {
  standard: 'dexbuddy/image-standard',
  pro: 'dexbuddy/image-pro',
};

const IMAGE_ASPECT_RATIO = '3:4';

/**
 * @typedef {Record<string, string | undefined>} ImageEnv
 * @typedef {() => ImageEnv} ImageEnvReader
 * @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} FetchFn
 * @typedef {{ role: string; path: string }} ImageReference
 * @typedef {{
 *   list?: () => Promise<unknown>;
 *   billing: { quote: (body: unknown, options?: { idempotencyKey?: string }) => Promise<unknown> };
 *   images: { generate: (input: unknown, options?: { idempotencyKey?: string }) => Promise<unknown> };
 * }} HostImageModels
 * @typedef {{
 *   prompt: unknown;
 *   outputPath: string;
 *   references?: unknown;
 *   env?: ImageEnv | ImageEnvReader | null;
 *   ctx?: unknown;
 *   models?: HostImageModels | null;
 *   fetch?: FetchFn;
 *   model?: string;
 *   idempotencyKey?: string;
 * }} GenerateArgs
 */

/**
 * @param {ImageEnv | ImageEnvReader | null | undefined} env
 * @returns {ImageEnv}
 */
function readEnv(env) {
  if (typeof env === 'function') return env() || {};
  return env || {};
}

/**
 * @param {unknown} raw
 * @returns {ImageReference[]}
 */
function normalizeReferences(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  /** @type {ImageReference[]} */
  const list = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const bag = /** @type {Record<string, unknown>} */ (item);
    const role = typeof bag.role === 'string' ? bag.role.trim() : '';
    const filePath = typeof bag.path === 'string' ? bag.path.trim() : '';
    if (!role || !filePath) continue;
    list.push({ role, path: filePath });
  }
  return list;
}

/**
 * @param {unknown} model
 * @returns {string}
 */
function resolveImageModel(model) {
  const text = typeof model === 'string' ? model.trim() : '';
  if (text === IMAGE_MODELS.pro || text === 'pro' || text === 'sunburst') return IMAGE_MODELS.pro;
  return IMAGE_MODELS.standard;
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
 * @param {Pick<GenerateArgs, 'env' | 'ctx' | 'models' | 'fetch'>} args
 * @returns {HostImageModels}
 */
function getModels(args) {
  if (args.models) return args.models;
  return /** @type {HostImageModels} */ (bindModels(args.ctx, {
    env: readEnv(args.env),
    fetch: args.fetch,
  }));
}

/**
 * @param {Pick<GenerateArgs, 'env' | 'ctx' | 'models' | 'fetch' | 'model'>} args
 * @returns {Promise<{ estimate?: string; enough: boolean; balance?: string; model: string }>}
 */
async function quoteImage(args) {
  const models = getModels(args);
  const model = resolveImageModel(args.model);
  const quote = await models.billing.quote({ model });
  if (!quote || typeof quote !== 'object' || /** @type {{ enough?: unknown }} */ (quote).enough !== true) {
    throwInsufficient(quote, model);
  }
  return /** @type {{ estimate?: string; enough: boolean; balance?: string; model: string }} */ ({
    .../** @type {object} */ (quote),
    model,
  });
}

/**
 * @param {GenerateArgs} args
 * @returns {Promise<string>}
 */
async function generatePng({
  prompt,
  outputPath,
  references: rawReferences,
  env,
  ctx,
  models: modelsArg,
  fetch: fetchImpl,
  model: modelArg,
  idempotencyKey,
}) {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text) throw new Error('提示词是空的');
  const quoted = await quoteImage({ env, ctx, models: modelsArg, fetch: fetchImpl, model: modelArg });
  const references = normalizeReferences(rawReferences);
  /** @type {Record<string, unknown>} */
  const input = {
    prompt: text,
    aspect_ratio: IMAGE_ASPECT_RATIO,
  };
  if (references.length > 0) {
    input.input_images = references.map((item) => item.path);
  }
  const models = getModels({ env, ctx, models: modelsArg, fetch: fetchImpl });
  const generated = await models.images.generate({
    model: quoted.model,
    input,
    outputPath,
  }, { idempotencyKey });
  const record = generated && typeof generated === 'object'
    ? /** @type {{ output?: unknown; status?: unknown }} */ (generated)
    : null;
  if (!record || record.status !== 'succeeded' || typeof record.output !== 'string' || !record.output) {
    throw new Error('生图没有返回图片');
  }
  return record.output;
}

module.exports = {
  IMAGE_ASPECT_RATIO,
  IMAGE_MODELS,
  generatePng,
  normalizeReferences,
  quoteImage,
  resolveImageModel,
};
