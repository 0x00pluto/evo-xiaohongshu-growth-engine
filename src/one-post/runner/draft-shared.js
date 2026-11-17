// @ts-check
'use strict';

/**
 * @typedef {import('../../draft/store').DraftState} DraftState
 * @typedef {'copy' | 'promptsPlan' | 'promptsScenes'} BillingField
 */

/**
 * 成稿 / 提示词 / 生图 / 编辑共用的稿面与计费小工具；纯闭包，不持状态，各子模块可各自创建。
 * @param {import('./context').RunnerCtx} ctx
 */
function createDraftInternals(ctx) {
  const { complete } = ctx;

  /**
   * @param {string} id
   * @param {string} step
   * @param {number} attempts
   * @returns {string}
   */
  function stepKey(id, step, attempts) {
    const base = `${id}:${step}`;
    return Number.isInteger(attempts) && attempts > 0 ? `${base}:retry-${attempts}` : base;
  }

  /**
   * @returns {import('../../draft/store').BillingAttempts}
   */
  function emptyBilling() {
    return { copy: 0, promptsPlan: 0, promptsScenes: 0 };
  }

  /**
   * @param {DraftState} state
   * @param {BillingField} field
   * @returns {number}
   */
  function readBilling(state, field) {
    const billing = state.billing || emptyBilling();
    const n = Number(billing[field]);
    return Number.isInteger(n) && n > 0 ? n : 0;
  }

  /**
   * @param {BillingField} field
   */
  function bumpBilling(field) {
    if (!ctx.store) return;
    const state = ctx.store.read();
    const billing = { ...emptyBilling(), ...(state.billing || {}) };
    billing[field] = readBilling(state, field) + 1;
    state.billing = billing;
    ctx.store.write(state);
  }

  /**
   * @param {string | { system: string; user: string }} prompt
   * @param {BillingField} field
   * @param {string} step
   * @returns {Promise<string>}
   */
  async function completeWithStep(prompt, field, step) {
    const attempts = ctx.store ? readBilling(ctx.store.read(), field) : 0;
    const key = stepKey(ctx.currentId, step, attempts);
    try {
      const text = await complete(prompt, { idempotencyKey: key });
      bumpBilling(field);
      return text;
    } catch (err) {
      bumpBilling(field);
      throw err;
    }
  }

  /**
   * @param {DraftState} state
   * @param {Record<string, unknown>} payload
   */
  function applyPromptText(state, payload) {
    const prompts = payload.prompts;
    if (!prompts || typeof prompts !== 'object' || Array.isArray(prompts)) return;
    const next = /** @type {Record<string, unknown>} */ (prompts);
    if (typeof next.cover === 'string') state.prompts.cover = next.cover;
    if (Array.isArray(next.gallery)) {
      state.prompts.gallery = next.gallery.map((item) => String(item));
    }
  }

  /**
   * @param {DraftState} state
   * @param {Record<string, unknown>} payload
   */
  function applyDraftText(state, payload) {
    const draft = payload.draft;
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return;
    const next = /** @type {Record<string, unknown>} */ (draft);
    state.draft = {
      title: typeof next.title === 'string' ? next.title : '',
      body: typeof next.body === 'string' ? next.body : '',
      topics: Array.isArray(next.topics) ? next.topics.map((topic) => String(topic)) : [],
      coverLine: typeof next.coverLine === 'string' ? next.coverLine : '',
    };
  }

  /**
   * @param {string} step
   */
  function setJobRunning(step) {
    if (!ctx.store) return;
    const state = ctx.store.read();
    state.job = { running: true, step, error: '' };
    ctx.store.write(state);
  }

  return {
    applyDraftText,
    applyPromptText,
    completeWithStep,
    setJobRunning,
  };
}

module.exports = { createDraftInternals };
