// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('../../draft/validate')} */
const validateModule = require('../../draft/validate');
/** @type {typeof import('../../upload-refs/rules')} */
const uploadRefRules = require('../../upload-refs/rules');
/** @type {typeof import('../model-error')} */
const modelErrorModule = require('../model-error');
/** @type {typeof import('../../prompts/fill')} */
const fillModule = require('../../prompts/fill');
/** @type {typeof import('../../draft/store')} */
const storeModule = require('../../draft/store');
/** @type {typeof import('../posts')} */
const postsModule = require('../posts');
/** @type {typeof import('./helpers')} */
const helpersModule = require('./helpers');
/** @type {typeof import('./draft-shared')} */
const sharedModule = require('./draft-shared');
/** @type {typeof import('./draft-prompts')} */
const promptsModule = require('./draft-prompts');

const { formatPost } = validateModule;
const { errorCode } = modelErrorModule;
const {
  composeImagePrompt,
  findImageSafety,
  formatImageSafetyMessage,
  isAlbum,
} = fillModule;
const { createStore, nextImageFile } = storeModule;
const { hasPost, indexEntry } = postsModule;
const {
  applyPromptEdits,
  copyIsStale,
  errorMessage,
  hasStampedPrompts,
  promptsBlockReason,
  requestedSlot,
  slotBlockReason,
} = helpersModule;
const { createDraftInternals } = sharedModule;
const { createPromptPipeline } = promptsModule;

/**
 * @typedef {import('../../draft/store').DraftState} DraftState
 * @typedef {import('../../draft/store').ImageSlot} ImageSlot
 * @typedef {import('./helpers').ImageOnly} ImageOnly
 */

/**
 * 当篇稿：生图、选版本、预览与访达打开（含历史篇只读预览）。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachDraftImages(ctx) {
  const {
    busy,
    generateImage,
    markJobFailed,
    postsDir,
    promptsDir,
    resolveEffectiveAspectRatio,
    revealFile,
    userAlbumsDir,
    userImageRefsDir,
    withEntitlement,
  } = ctx;
  const { applyPromptText, setJobRunning } = createDraftInternals(ctx);
  const {
    commitPrompts,
    extractAllScenes,
    producePrompts,
    promptWorkKind,
    tryRestylePrompts,
  } = createPromptPipeline(ctx);

  let imageStamp = 0;

  function nextRevisedAt() {
    const now = Date.now();
    imageStamp = Math.max(imageStamp + 1, now);
    return imageStamp;
  }

  /**
   * @param {DraftState} state
   * @param {'cover' | 'gallery'} slot
   * @param {number} index
   * @returns {ImageSlot}
   */
  function readImageSlot(state, slot, index) {
    if (slot === 'cover') return state.images.cover;
    return state.images.gallery[index - 1] || {
      status: '空',
      path: '',
      selected: 0,
      revisedAt: 0,
      versions: [],
      attempts: 0,
      idempotencyKey: '',
    };
  }

  /**
   * @param {DraftState} state
   * @param {'cover' | 'gallery'} slot
   * @param {number} index
   * @param {ImageSlot} next
   */
  function setImageSlot(state, slot, index, next) {
    if (slot === 'cover') {
      state.images.cover = next;
      return;
    }
    const gallery = state.images.gallery.slice();
    while (gallery.length < index) {
      gallery.push({
        status: '空',
        path: '',
        selected: 0,
        revisedAt: 0,
        versions: [],
        attempts: 0,
        idempotencyKey: '',
      });
    }
    gallery[index - 1] = next;
    state.images.gallery = gallery;
  }

  /**
   * 生图幂等键：{postId}:{cover|gallery-NN}:gen-{n}；n 从 1 起。
   * @param {string} id
   * @param {string} stepName
   * @param {number} gen
   * @returns {string}
   */
  function imageGenKey(id, stepName, gen) {
    const n = Number.isInteger(gen) && gen > 0 ? gen : 1;
    return `${id}:${stepName}:gen-${n}`;
  }

  /**
   * @param {ImageOnly | null} [only]
   */
  async function runImages(only) {
    try {
      if (!ctx.store) throw new Error('没有这一篇');
      const initial = ctx.store.read();
      const look = initial.prompts && typeof initial.prompts.look === 'string'
        ? initial.prompts.look.trim()
        : '';
      const aspectRatio = resolveEffectiveAspectRatio(initial, look);
      /** @type {{ slot: 'cover' | 'gallery'; index: number; prompt: string; label: string }[]} */
      const jobs = [{ slot: 'cover', index: 0, prompt: initial.prompts.cover, label: '封面' }];
      initial.prompts.gallery.forEach((prompt, index) => {
        const number = index + 1;
        jobs.push({
          slot: 'gallery',
          index: number,
          prompt,
          label: `配图 ${number}`,
        });
      });
      const selected = only
        ? jobs.filter((job) => job.slot === only.slot && (only.slot === 'cover' || job.index === only.index))
        : jobs;
      let failed = 0;
      let lastError = '';
      let lastFailKind = '';
      for (const job of selected) {
        const current = ctx.store.read();
        const previous = readImageSlot(current, job.slot, job.index);
        const attempts = Number.isInteger(previous.attempts) ? previous.attempts : 0;
        const stepName = job.slot === 'cover' ? 'cover' : `gallery-${String(job.index).padStart(2, '0')}`;
        const pending = typeof previous.idempotencyKey === 'string' ? previous.idempotencyKey.trim() : '';
        // 失败未取回时复用同一把 key；成功后再抽才 gen+1。
        const key = pending || imageGenKey(ctx.currentId, stepName, attempts + 1);
        const file = nextImageFile(job.slot, job.index, previous.versions);
        const pick = job.slot === 'cover'
          ? current.picks.cover
          : (current.picks.gallery[job.index - 1] || uploadRefRules.emptySlotPick());
        const composed = composeImagePrompt(job.prompt, {
          promptsDir,
          look,
          userAlbumsDir,
          userImageRefsDir,
          postDir: ctx.currentDir,
          uploadRefs: current.uploadRefs,
          pick,
          aspectRatio,
        });
        // 只检查不改字；命中则停住，不写「生成中」、不调生图。
        const safetyHits = findImageSafety(composed.prompt);
        if (safetyHits.length > 0) {
          failed += 1;
          lastFailKind = 'safety';
          lastError = formatImageSafetyMessage(safetyHits);
          current.job = { running: true, step: job.label, error: '' };
          ctx.store.write(current);
          continue;
        }
        setImageSlot(current, job.slot, job.index, {
          ...previous,
          status: '生成中',
          idempotencyKey: key,
        });
        current.job = { running: true, step: job.label, error: '' };
        ctx.store.write(current);
        const outputPath = path.join(ctx.currentDir, file);
        try {
          await generateImage({
            prompt: composed.prompt,
            outputPath,
            aspectRatio,
            idempotencyKey: key,
            ...(composed.references.length > 0 ? { references: composed.references } : {}),
          });
          const done = ctx.store.read();
          const base = readImageSlot(done, job.slot, job.index);
          const revisedAt = nextRevisedAt();
          const versions = base.versions.concat([{ path: file, revisedAt, aspectRatio }]);
          setImageSlot(done, job.slot, job.index, {
            status: '成功',
            path: file,
            selected: versions.length,
            revisedAt,
            versions,
            attempts: attempts + 1,
            idempotencyKey: '',
          });
          done.job = { running: true, step: job.label, error: '' };
          ctx.store.write(done);
        } catch (err) {
          failed += 1;
          const code = errorCode(err);
          const expired = code === 'OUTPUT_EXPIRED';
          const flagged = code === 'CONTENT_FLAGGED';
          lastFailKind = flagged ? 'flagged' : (expired ? 'expired' : 'replay');
          lastError = errorMessage(err, '生图失败');
          fs.rmSync(outputPath, { force: true });
          const failedState = ctx.store.read();
          const base = readImageSlot(failedState, job.slot, job.index);
          setImageSlot(failedState, job.slot, job.index, {
            ...base,
            status: base.versions.length > 0 ? '成功' : '失败',
            // 过期 / 敏感：清 key 且 attempts+1，禁止原样取回；其它失败保留 pending key。
            attempts: (expired || flagged) ? attempts + 1 : attempts,
            idempotencyKey: (expired || flagged) ? '' : key,
          });
          failedState.job = { running: true, step: job.label, error: '' };
          ctx.store.write(failedState);
        }
      }
      const finished = ctx.store.read();
      let failMessage = '';
      if (failed > 0) {
        if (lastFailKind === 'safety' || lastFailKind === 'flagged') {
          failMessage = lastError;
        } else {
          const failHint = lastFailKind === 'expired'
            ? '成图已过期，请再点一次出一张新的'
            : '请再点一次取回这张图（不会重复扣费）';
          failMessage = `${lastError}。${failHint}`;
        }
      }
      finished.job = {
        running: false,
        step: '',
        error: failMessage,
      };
      ctx.store.write(finished);
    } catch (err) {
      markJobFailed(errorMessage(err, '生图失败'));
    }
  }

  /**
   * @param {ImageOnly} only
   * @param {string} [requestedLook]
   */
  async function runRefreshThenDraw(only, requestedLook) {
    try {
      if (!ctx.store) throw new Error('没有这一篇');
      const state = ctx.store.read();
      const face = state.draft;
      if (!face) throw new Error('还没有稿面');
      const galleryCount = state.galleryCount;
      const stampedLook = state.prompts && typeof state.prompts.look === 'string'
        ? state.prompts.look.trim()
        : '';
      const look = requestedLook && isAlbum(requestedLook, promptsDir, userAlbumsDir)
        ? requestedLook
        : (stampedLook && isAlbum(stampedLook, promptsDir, userAlbumsDir) ? stampedLook : '');
      const needContent = !hasStampedPrompts(state) || copyIsStale(state);
      if (needContent) {
        setJobRunning('定画面');
        const produced = await producePrompts(face, galleryCount, look || undefined);
        commitPrompts(face, galleryCount, produced, true);
      } else if (look && look !== stampedLook) {
        const restyled = tryRestylePrompts(state, look);
        if (restyled) {
          commitPrompts(face, galleryCount, restyled, true);
        } else {
          setJobRunning('定画面');
          const produced = await producePrompts(face, galleryCount, look, {
            keepScenes: extractAllScenes(state),
            keepStoryType: state.prompts.storyType,
          });
          commitPrompts(face, galleryCount, produced, true);
        }
      }
      await runImages(only);
    } catch (err) {
      markJobFailed(errorMessage(err, '生图失败'));
    }
  }

  /**
   * @param {ImageOnly} only
   * @param {string} [requestedLook]
   */
  function acceptGenerateImages(only, requestedLook) {
    if (!ctx.store) {
      ctx.lock = null;
      return { ok: false, message: '没有这一篇' };
    }
    const state = ctx.store.read();
    const kind = promptWorkKind(state, requestedLook || '');
    state.job = {
      running: true,
      step: kind === 'plan'
        ? '定画面'
        : (only.slot === 'cover' ? '封面' : `配图 ${only.index}`),
      error: '',
    };
    ctx.store.write(state);
    runRefreshThenDraw(only, requestedLook).finally(() => {
      ctx.lock = null;
    });
    return { ok: true, accepted: true };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  async function generateImages(payload) {
    if (!ctx.store) return { ok: false, message: '没有这一篇' };
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const only = requestedSlot(source);
    if (!only) return { ok: false, message: '要指明封面或配图序号' };
    const state = ctx.store.read();
    const albumLook = typeof source.look === 'string' ? source.look.trim() : '';
    if (albumLook && !isAlbum(albumLook, promptsDir, userAlbumsDir)) {
      return { ok: false, message: '图册不在允许列表', field: 'look' };
    }
    // 先判能不能画：拒绝时不写可改段，避免空字符串先抹掉全文。
    const reason = slotBlockReason(state, only, albumLook);
    if (reason) {
      return { ok: false, message: reason };
    }
    applyPromptText(state, source);
    applyPromptEdits(state, source);
    ctx.store.write(state);
    return withEntitlement('generateImages', () => acceptGenerateImages(only, albumLook));
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  async function retryImage(payload) {
    if (!ctx.store) return { ok: false, message: '没有这一篇' };
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const slot = source.slot;
    const index = Number(source.index);
    if (slot !== 'cover' && slot !== 'gallery') {
      return { ok: false, message: '要指明封面或配图序号' };
    }
    if (slot === 'gallery' && (!Number.isInteger(index) || index < 1 || index > 9)) {
      return { ok: false, message: '要指明封面或配图序号' };
    }
    const state = ctx.store.read();
    const blocked = promptsBlockReason(state);
    if (blocked) return { ok: false, message: blocked };
    const image = slot === 'cover' ? state.images.cover : state.images.gallery[index - 1];
    if (!image || image.status !== '失败') {
      return { ok: false, message: '只能重试失败的那一张' };
    }
    /** @type {ImageOnly} */
    const only = slot === 'cover' ? { slot: 'cover', index: 0 } : { slot: 'gallery', index };
    return withEntitlement('retryImage', () => acceptGenerateImages(only));
  }

  /**
   * @param {Record<string, unknown>} source
   * @returns {string}
   */
  function imageFileFor(source) {
    if (!ctx.store) return '';
    const only = requestedSlot(source);
    if (!only) return '';
    const state = ctx.store.read();
    const image = only.slot === 'cover'
      ? state.images.cover
      : state.images.gallery[only.index - 1];
    if (!image) return '';
    const version = Number(source.version);
    if (Number.isInteger(version) && version >= 1) {
      const item = image.versions[version - 1];
      return item ? item.path : '';
    }
    return image.path || '';
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function chooseImage(payload) {
    if (!ctx.store) return { ok: false, message: '没有这一篇' };
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const only = requestedSlot(source);
    if (!only) return { ok: false, message: '要指明封面或配图序号' };
    const version = Number(source.version);
    const state = ctx.store.read();
    const image = only.slot === 'cover'
      ? state.images.cover
      : state.images.gallery[only.index - 1];
    if (!image || !Number.isInteger(version) || version < 1 || version > image.versions.length) {
      return { ok: false, message: '没有这一张' };
    }
    const chosen = image.versions[version - 1];
    setImageSlot(state, only.slot, only.index, {
      ...image,
      status: '成功',
      selected: version,
      path: chosen.path,
      revisedAt: chosen.revisedAt,
    });
    ctx.store.write(state);
    return { ok: true };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function previewImage(payload) {
    if (!ctx.currentDir) return { ok: false, message: '没有这张图' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const file = imageFileFor(source);
    if (!file) return { ok: false, message: '没有这张图' };
    const abs = path.join(ctx.currentDir, file);
    if (!fs.existsSync(abs)) return { ok: false, message: '图片不在' };
    const bytes = fs.readFileSync(abs);
    return { ok: true, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` };
  }

  /**
   * 按篇读选用封面，不切换当前稿。
   * @param {Record<string, unknown>} payload
   */
  function previewPostCover(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id : '';
    if (!hasPost(postsDir, id)) return { ok: false, message: '没有这一篇' };
    const postDir = path.join(postsDir, id);
    const state = createStore(postDir, { promptsDir, userAlbumsDir }).read();
    const file = state.images && state.images.cover && state.images.cover.path
      ? String(state.images.cover.path)
      : '';
    if (!file) return { ok: false, message: '没有这张图' };
    const abs = path.join(postDir, file);
    if (!fs.existsSync(abs)) return { ok: false, message: '图片不在' };
    const bytes = fs.readFileSync(abs);
    return { ok: true, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` };
  }

  /**
   * 历史详情：文案 + 选用图，不切换当前稿。
   * @param {Record<string, unknown>} payload
   */
  function previewHistoryPost(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id : '';
    if (!hasPost(postsDir, id)) return { ok: false, message: '没有这一篇' };
    const postDir = path.join(postsDir, id);
    const state = createStore(postDir, { promptsDir, userAlbumsDir }).read();
    const draft = state.draft;
    const title = draft && typeof draft.title === 'string' ? draft.title.trim() : '';
    const body = draft && typeof draft.body === 'string' ? draft.body.trim() : '';
    const topics = draft && Array.isArray(draft.topics)
      ? draft.topics.map((topic) => String(topic))
      : [];
    const meta = indexEntry(postsDir, id);
    /** @type {{ key: string; dataUrl: string }[]} */
    const images = [];
    /**
     * @param {string} key
     * @param {string} file
     */
    const pushImage = (key, file) => {
      if (!file) return;
      const abs = path.join(postDir, file);
      if (!fs.existsSync(abs)) return;
      const bytes = fs.readFileSync(abs);
      images.push({ key, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` });
    };
    if (state.images && state.images.cover && state.images.cover.path) {
      pushImage('cover', String(state.images.cover.path));
    }
    const gallery = state.images && Array.isArray(state.images.gallery) ? state.images.gallery : [];
    for (let index = 0; index < gallery.length; index += 1) {
      const slot = gallery[index];
      if (!slot || !slot.path) continue;
      pushImage(`gallery-${index + 1}`, String(slot.path));
    }
    return {
      ok: true,
      id,
      title,
      body,
      topics,
      postText: formatPost(draft),
      createdAt: meta && meta.createdAt ? meta.createdAt : '',
      images,
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function revealImage(payload) {
    if (!ctx.currentDir) return { ok: false, message: '没有这一篇' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const file = imageFileFor(source);
    const abs = file ? path.join(ctx.currentDir, file) : ctx.currentDir;
    const target = file && fs.existsSync(abs) ? abs : ctx.currentDir;
    if (!fs.existsSync(target)) return { ok: false, message: '打不开文件夹' };
    try {
      revealFile(target);
    } catch {
      return { ok: true, path: target };
    }
    return { ok: true, path: target };
  }

  /**
   * 按篇打开访达到第一张选用图，不切换当前稿。
   * @param {Record<string, unknown>} payload
   */
  function revealPost(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id : '';
    if (!hasPost(postsDir, id)) return { ok: false, message: '没有这一篇' };
    const postDir = path.join(postsDir, id);
    const state = createStore(postDir, { promptsDir, userAlbumsDir }).read();
    /** @type {string[]} */
    const files = [];
    if (state.images && state.images.cover && state.images.cover.path) {
      files.push(String(state.images.cover.path));
    }
    const gallery = state.images && Array.isArray(state.images.gallery) ? state.images.gallery : [];
    for (const slot of gallery) {
      if (!slot || !slot.path) continue;
      files.push(String(slot.path));
    }
    let abs = '';
    for (const file of files) {
      const candidate = path.join(postDir, file);
      if (fs.existsSync(candidate)) {
        abs = candidate;
        break;
      }
    }
    if (!abs) return { ok: false, message: '没有这张图' };
    try {
      revealFile(abs);
    } catch {
      return { ok: true, path: abs };
    }
    return { ok: true, path: abs };
  }

  return {
    chooseImage,
    generateImages,
    previewHistoryPost,
    previewImage,
    previewPostCover,
    revealImage,
    revealPost,
    retryImage,
  };
}

module.exports = { attachDraftImages };
