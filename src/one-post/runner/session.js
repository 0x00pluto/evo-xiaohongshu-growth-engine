// @ts-check
'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

/** @type {typeof import('../../upload-refs/files')} */
const uploadRefFiles = require('../../upload-refs/files');
/** @type {typeof import('../../image/aspect')} */
const aspectModule = require('../../image/aspect');
/** @type {typeof import('../../prompts/fill')} */
const fillModule = require('../../prompts/fill');
/** @type {typeof import('../../draft/store')} */
const storeModule = require('../../draft/store');
/** @type {typeof import('../posts')} */
const postsModule = require('../posts');

/** @type {typeof import('./helpers')} */
const helpersModule = require('./helpers');
/** @type {typeof import('./constants')} */
const constantsModule = require('./constants');

const { ASPECT_RATIOS, cssAspectRatio, DEFAULT_ASPECT_RATIO, normalizeAspectRatio } = aspectModule;
const { ensureAlbumAspectRatio, isAlbum } = fillModule;
const { createStore, emptyState } = storeModule;
const { touchPost } = postsModule;
const { editorFromState } = helpersModule;
const { BUSY_MESSAGE } = constantsModule;

/**
 * @typedef {import('../../draft/store').DraftState} DraftState
 * @typedef {import('../../draft/store').ImageSlot} ImageSlot
 */

/**
 * 各域共用的当篇会话助手：锁、买断、切篇、读当篇、失败落盘、识图幂等键。
 * 只依赖 state，不依赖其它域，供 RunnerCtx 推断类型。
 * @param {import('./context').RunnerState} ctx
 */
function createSession(ctx) {
  const { checkEntitlement, options, postsDir, promptsDir, userAlbumsDir, visionAttempts } = ctx;

  /**
   * @param {unknown} err
   * @returns {boolean}
   */
  function isSilencedEntitlement(err) {
    if (!err || typeof err !== 'object' || !('code' in err)) return false;
    const code = /** @type {{ code?: unknown }} */ (err).code;
    return code === 'UNAUTHORIZED' || code === 'NOT_ENTITLED';
  }

  /**
   * 本地校验通过后、accepted 之前查买断。失败不写 job.running。
   * @param {string} nextLock
   * @param {() => { ok: boolean } & Record<string, unknown>} proceed
   */
  async function withEntitlement(nextLock, proceed) {
    if (ctx.lock) return busy();
    ctx.lock = nextLock;
    try {
      await checkEntitlement(options.ctx);
    } catch (err) {
      ctx.lock = null;
      if (isSilencedEntitlement(err)) return { ok: false, silenced: true };
      return { ok: false, message: err instanceof Error ? err.message : '没有完成' };
    }
    return proceed();
  }

  /**
   * @param {string} id
   */
  function usePost(id) {
    ctx.currentId = id;
    ctx.currentDir = path.join(postsDir, id);
    uploadRefFiles.migratePostUploadRefsLayout(ctx.currentDir);
    ctx.store = createStore(ctx.currentDir, { promptsDir, userAlbumsDir });
    const writeFile = ctx.store.write;
    ctx.store.write = (state) => {
      writeFile(state);
      touchPost(postsDir, id, state);
    };
  }

  function blank() {
    const state = emptyState();
    return {
      ok: true,
      ...state,
      ...aspectPublicFields(state),
      editor: editorFromState(state),
      directory: '',
      id: '',
    };
  }

  // 锁占用时把当前篇带回去，页面重挂才能接上等待层。
  function busy() {
    if (!ctx.store) return { ok: false, message: BUSY_MESSAGE };
    return { ...loadLatest(), ok: false, message: BUSY_MESSAGE };
  }

  /**
   * 本篇有效比例：锁定优先，否则跟当前图册归档，再兜底 3:4。
   * @param {DraftState} state
   * @param {string} [lookOverride]
   * @returns {string}
   */
  function resolveEffectiveAspectRatio(state, lookOverride) {
    const locked = normalizeAspectRatio(state && state.aspectRatioLocked);
    if (locked) return locked;
    const look = typeof lookOverride === 'string' && lookOverride.trim()
      ? lookOverride.trim()
      : (state && state.prompts && typeof state.prompts.look === 'string'
        ? state.prompts.look.trim()
        : '');
    if (look && isAlbum(look, promptsDir, userAlbumsDir)) {
      return ensureAlbumAspectRatio(promptsDir, userAlbumsDir, look) || DEFAULT_ASPECT_RATIO;
    }
    return DEFAULT_ASPECT_RATIO;
  }

  /**
   * @param {DraftState} state
   * @returns {{
   *   aspectRatio: string;
   *   aspectRatioLocked: string;
   *   aspectRatioCss: string;
   *   aspectRatios: ReadonlyArray<string>;
   * }}
   */
  function aspectPublicFields(state) {
    const aspectRatio = resolveEffectiveAspectRatio(state);
    const locked = normalizeAspectRatio(state && state.aspectRatioLocked);
    return {
      aspectRatio,
      aspectRatioLocked: locked || '',
      aspectRatioCss: cssAspectRatio(aspectRatio),
      aspectRatios: ASPECT_RATIOS,
    };
  }

  /**
   * @param {ImageSlot} slot
   * @returns {ImageSlot}
   */
  function stopGenerating(slot) {
    if (!slot || slot.status !== '生成中') return slot;
    const hasVersion = Array.isArray(slot.versions) && slot.versions.length > 0;
    return { ...slot, status: hasVersion ? '成功' : '失败' };
  }

  /**
   * @param {string} message
   */
  function markJobFailed(message) {
    if (!ctx.store) return;
    const state = ctx.store.read();
    state.images.cover = stopGenerating(state.images.cover);
    state.images.gallery = state.images.gallery.map((slot) => stopGenerating(slot));
    state.prompts.stale = false;
    state.job = { running: false, step: '', error: message || '没有完成' };
    ctx.store.write(state);
  }

  /**
   * @param {string} prefix
   * @param {string} dataUrl
   * @returns {{ step: string; key: string }}
   */
  function visionStepKey(prefix, dataUrl) {
    const hash = crypto.createHash('sha256').update(String(dataUrl || '')).digest('hex').slice(0, 16);
    const step = `${prefix}:${hash}:vision`;
    const n = visionAttempts.get(step) || 0;
    return { step, key: n > 0 ? `${step}:retry-${n}` : step };
  }

  /**
   * @param {string} step
   */
  function rememberVisionFailure(step) {
    visionAttempts.set(step, (visionAttempts.get(step) || 0) + 1);
  }

  function loadLatest() {
    if (!ctx.store) return blank();
    const existed = ctx.store.exists();
    const state = ctx.store.read();
    if (existed && state.job.running && !ctx.lock) {
      state.job = {
        running: false,
        step: '',
        error: state.job.error || '上次生成中断，请重试',
      };
      state.images.cover = stopGenerating(state.images.cover);
      state.images.gallery = state.images.gallery.map((slot) => stopGenerating(slot));
      ctx.store.write(state);
    }
    return {
      ok: true,
      ...state,
      ...aspectPublicFields(state),
      editor: editorFromState(state),
      directory: ctx.currentDir,
      id: ctx.currentId,
    };
  }

  return {
    isSilencedEntitlement,
    withEntitlement,
    usePost,
    blank,
    busy,
    resolveEffectiveAspectRatio,
    aspectPublicFields,
    stopGenerating,
    markJobFailed,
    visionStepKey,
    rememberVisionFailure,
    loadLatest,
  };
}

module.exports = { createSession };
