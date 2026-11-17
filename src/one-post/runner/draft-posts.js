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

const { validateGalleryCount } = validateModule;
const { isArticleType, isPersonaType } = fillModule;
const { hasPost, listPosts } = postsModule;
const { applyPromptEdits } = helpersModule;
const { createDraftInternals } = sharedModule;

/**
 * 当篇稿：新开 / 切换 / 列历史篇 / 编辑区落盘。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachDraftPosts(ctx) {
  const {
    blank,
    busy,
    loadLatest,
    postsDir,
    promptsDir,
    usePost,
    userAlbumsDir,
  } = ctx;
  const { applyDraftText, applyPromptText } = createDraftInternals(ctx);

  function startNew() {
    if (ctx.lock) return busy();
    ctx.currentId = '';
    ctx.currentDir = '';
    ctx.store = null;
    return blank();
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function openPost(payload) {
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id : '';
    if (!hasPost(postsDir, id)) return { ok: false, message: '没有这一篇' };
    usePost(id);
    return loadLatest();
  }

  function catalog() {
    return { ok: true, posts: listPosts(postsDir, promptsDir, userAlbumsDir) };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function saveEditor(payload) {
    if (!ctx.store) return { ok: true, skipped: true };
    if (ctx.lock) return busy();
    const state = ctx.store.read();
    const source = payload && typeof payload === 'object' ? payload : {};
    if (typeof source.business === 'string') state.business = source.business;
    if (typeof source.sampleTitle === 'string') state.sampleTitle = source.sampleTitle;
    if (typeof source.sampleBody === 'string') {
      state.sampleBody = source.sampleBody;
    } else if (typeof source.article === 'string') {
      // 兼容旧前端仍写 article 的短暂过渡。
      state.sampleBody = source.article;
    }
    if (Array.isArray(source.references)) {
      state.references = validateModule.normalizeReferencesInput(source.references);
    }
    if (typeof source.articleType === 'string') {
      state.articleType = isArticleType(source.articleType) ? source.articleType : '涨粉';
    }
    if (typeof source.persona === 'string') {
      state.persona = isPersonaType(source.persona) ? source.persona : '素人';
    }
    if (typeof source.coverLineSpecified === 'string') {
      state.coverLineSpecified = source.coverLineSpecified.trim();
    }
    if (source.galleryCount != null) {
      const count = validateGalleryCount(source.galleryCount);
      if (!count.ok) return count;
      state.galleryCount = count.galleryCount;
    }
    applyDraftText(state, source);
    applyPromptText(state, source);
    applyPromptEdits(state, source);
    ctx.store.write(state);
    return { ok: true };
  }

  return {
    listPosts: catalog,
    loadLatest,
    openPost,
    saveEditor,
    startNew,
  };
}

module.exports = { attachDraftPosts };
