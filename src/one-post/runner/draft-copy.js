// @ts-check
'use strict';

/** @type {typeof import('../../draft/validate')} */
const validateModule = require('../../draft/validate');
/** @type {typeof import('../../prompts/fill')} */
const fillModule = require('../../prompts/fill');
/** @type {typeof import('../posts')} */
const postsModule = require('../posts');
/** @type {typeof import('./helpers')} */
const helpersModule = require('./helpers');
/** @type {typeof import('./draft-shared')} */
const sharedModule = require('./draft-shared');

const { validateInputs } = validateModule;
const {
  buildDraftMessages,
  isArticleType,
  isPersonaType,
  parseDraftText,
} = fillModule;
const { allocatePost } = postsModule;
const { blankPrompts, errorMessage } = helpersModule;
const { createDraftInternals } = sharedModule;

/**
 * 当篇稿：成稿（文案）。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachDraftCopy(ctx) {
  const {
    markJobFailed,
    now,
    postsDir,
    promptsDir,
    usePost,
    withEntitlement,
  } = ctx;
  const { completeWithStep } = createDraftInternals(ctx);

  /**
   * @param {{
   *   business: string;
   *   sampleBody: string;
   *   references: import('../../draft/validate').ReferenceItem[];
   *   galleryCount: number;
   *   articleType: string;
   *   persona: string;
   * }} checked
   */
  async function runGenerateDraft(checked) {
    try {
      if (!ctx.store) throw new Error('没有这一篇');
      const draftMessages = buildDraftMessages(promptsDir, checked.articleType, {
        business: checked.business,
        persona: checked.persona,
        sampleBody: checked.sampleBody,
        references: checked.references,
      });
      let face;
      try {
        face = parseDraftText(await completeWithStep(draftMessages, 'copy', 'copy'));
      } catch (err) {
        markJobFailed(errorMessage(err, '成稿失败'));
        return;
      }
      const drafted = ctx.store.read();
      drafted.draft = face;
      drafted.articleType = checked.articleType;
      drafted.persona = checked.persona;
      drafted.prompts = blankPrompts();
      drafted.job = { running: false, step: '', error: '' };
      ctx.store.write(drafted);
    } catch (err) {
      markJobFailed(errorMessage(err, '生成稿失败'));
    }
  }

  /**
   * @param {ReturnType<typeof validateInputs> & { ok: true }} checked
   * @param {Record<string, unknown>} payload
   * @param {string} articleType
   * @param {string} persona
   */
  function acceptGenerateDraft(checked, payload, articleType, persona) {
    if (!ctx.store) usePost(allocatePost(postsDir, now()));
    if (!ctx.store) {
      ctx.lock = null;
      return { ok: false, message: '没有这一篇' };
    }
    const state = ctx.store.read();
    state.business = checked.business;
    state.sampleBody = checked.sampleBody;
    state.references = checked.references;
    if (typeof payload.sampleTitle === 'string') {
      state.sampleTitle = payload.sampleTitle;
    }
    state.articleType = articleType;
    state.persona = persona;
    state.galleryCount = checked.galleryCount;
    if (typeof payload.coverLineSpecified === 'string') {
      state.coverLineSpecified = payload.coverLineSpecified.trim();
    }
    state.job = { running: true, step: '成稿', error: '' };
    ctx.store.write(state);
    runGenerateDraft({ ...checked, articleType, persona }).finally(() => {
      ctx.lock = null;
    });
    return { ok: true, accepted: true, id: ctx.currentId };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  async function generateDraft(payload) {
    const checked = validateInputs(payload);
    if (!checked.ok) return checked;
    const articleType = payload && payload.articleType;
    if (!isArticleType(articleType)) {
      return { ok: false, message: '文章目的不在允许列表', field: 'articleType' };
    }
    const persona = payload && payload.persona;
    if (!isPersonaType(persona)) {
      return { ok: false, message: '人设不在允许列表', field: 'persona' };
    }
    return withEntitlement('generateDraft', () => acceptGenerateDraft(checked, payload, articleType, persona));
  }

  return { generateDraft };
}

module.exports = { attachDraftCopy };
