// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('../llm/client')} */
const llmModule = require('../llm/client');
/** @type {typeof import('../image/generate')} */
const imageModule = require('../image/generate');
/** @type {typeof import('../prompts/fill')} */
const fillModule = require('../prompts/fill');
/** @type {typeof import('../draft/store')} */
const storeModule = require('../draft/store');
/** @type {typeof import('../draft/validate')} */
const validateModule = require('../draft/validate');
/** @type {typeof import('./posts')} */
const postsModule = require('./posts');

const { createLlm } = llmModule;
const { generatePng } = imageModule;
const {
  albumHint,
  albumPromptName,
  albumSampleFile,
  albumSamplePath,
  assignContrastSlots,
  assignGalleryRoles,
  assignStoryRoles,
  buildAlbumDraft,
  buildDraftPrompt,
  commitAlbumDraft,
  copySchema,
  deleteAlbumFiles,
  draftPublicView,
  fillPrompt,
  formatGallerySlots,
  formatPlannedLines,
  frameDisplayLine,
  isAlbum,
  isArticleType,
  isBuiltinAlbum,
  loadAlbumCatalog,
  normalizeReferenceImage,
  parseDraftText,
  parsePlanText,
  parseScenesText,
  pickAlbum,
  pickStoryType,
  readLearnSystemPrompt,
  readPromptFile,
  renderAlbumPrompt,
  storyPromptName,
} = fillModule;
const { createStore, emptyState, nextImageFile } = storeModule;
const {
  basisFrom,
  validateDraftFace,
  validateGalleryCount,
  validateInputs,
  normalizeFace,
} = validateModule;
const {
  allocatePost,
  hasPost,
  importLegacy,
  listPosts,
  touchPost,
} = postsModule;

const BUSY_MESSAGE = '正在生成，请等这一轮结束';

/**
 * @typedef {import('../draft/store').DraftState} DraftState
 * @typedef {import('../draft/store').ImageSlot} ImageSlot
 * @typedef {import('../draft/validate').DraftFace} DraftFace
 * @typedef {{ slot: 'cover'; index: 0 } | { slot: 'gallery'; index: number }} ImageOnly
 * @typedef {{
 *   postsDir?: string;
 *   latestDir?: string;
 *   promptsDir: string;
 *   env?: Record<string, string | undefined>;
 *   fetch?: import('../llm/client').FetchFn;
 *   now?: () => Date;
 *   complete?: (prompt: string) => Promise<string>;
 *   completeVision?: (input: { text: string; dataUrl: string }) => Promise<string>;
 *   generateImage?: (args: { prompt: string; outputPath: string }) => Promise<string>;
 *   revealFile?: (absPath: string) => void;
 *   random?: () => number;
 * }} RunnerOptions
 */

/**
 * @param {unknown} err
 * @param {string} fallback
 * @returns {string}
 */
function errorMessage(err, fallback) {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = /** @type {{ message?: unknown }} */ (err).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isSceneLengthError(err) {
  return /画面应为 \d+ 张，模型返回了 \d+ 张/.test(errorMessage(err, ''));
}

/**
 * @param {unknown} err
 * @param {number} fallback
 * @returns {number}
 */
function sceneLengthFromError(err, fallback) {
  const match = errorMessage(err, '').match(/模型返回了 (\d+) 张/);
  if (!match) return fallback;
  return Number(match[1]);
}

/**
 * @param {DraftState} state
 * @returns {string}
 */
function promptsBlockReason(state) {
  if (!state.draft) return '还没有稿面';
  if (!state.prompts.cover.trim()) return '封面提示词是空的';
  if (state.prompts.gallery.some((item) => !String(item).trim())) return '有配图提示词是空的';
  return '';
}

/**
 * @param {Record<string, unknown> | null | undefined} source
 * @returns {ImageOnly | null}
 */
function requestedSlot(source) {
  const slot = source && source.slot;
  const index = Number(source && source.index);
  if (slot === 'cover') return { slot: 'cover', index: 0 };
  if (slot === 'gallery' && Number.isInteger(index) && index >= 1 && index <= 9) {
    return { slot: 'gallery', index };
  }
  return null;
}

/**
 * @param {DraftState} state
 * @param {ImageOnly} only
 * @returns {string}
 */
function slotPromptText(state, only) {
  if (only.slot === 'cover') return String(state.prompts.cover || '').trim();
  const item = state.prompts.gallery[only.index - 1];
  return typeof item === 'string' ? item.trim() : '';
}

/**
 * @param {DraftState} state
 * @param {ImageOnly} only
 * @returns {string}
 */
function slotBlockReason(state, only) {
  if (!state.draft) return '还没有稿面';
  if (only.slot === 'gallery' && only.index > state.prompts.gallery.length) return '还没有这一张的提示词';
  if (!slotPromptText(state, only)) return '还没有这一张的提示词';
  return '';
}

/**
 * @param {RunnerOptions} options
 */
function createRunner(options) {
  const postsDirOption = options.postsDir || options.latestDir;
  if (!postsDirOption) throw new Error('缺少 postsDir');
  const postsDir = postsDirOption;
  const promptsDir = options.promptsDir;
  const env = options.env || {};
  const fetchImpl = options.fetch;
  const now = options.now || (() => new Date());
  importLegacy(postsDir, promptsDir);
  let currentId = '';
  let currentDir = '';
  /** @type {import('../draft/store').DraftStore | null} */
  let store = null;
  const llm = createLlm(env, fetchImpl);
  const complete = options.complete || ((/** @type {string} */ prompt) => llm.complete(prompt));
  const completeVision = options.completeVision
    || ((/** @type {{ text: string; dataUrl: string }} */ input) => llm.completeVision(input));
  const generateImage = options.generateImage || ((/** @type {{ prompt: string; outputPath: string }} */ args) => generatePng({
    prompt: args.prompt,
    outputPath: args.outputPath,
    env,
    fetch: fetchImpl,
  }));
  const revealFile = options.revealFile || (() => {});
  const random = options.random || Math.random;
  /** @type {string | null} */
  let lock = null;
  /** @type {import('../prompts/album/learn').AlbumDraft | null} */
  let albumDraft = null;
  let albumDraftSeq = 0;

  /**
   * @param {string} id
   */
  function usePost(id) {
    currentId = id;
    currentDir = path.join(postsDir, id);
    store = createStore(currentDir, { promptsDir });
    const writeFile = store.write;
    store.write = (state) => {
      writeFile(state);
      touchPost(postsDir, id, state);
    };
  }

  function blank() {
    return { ok: true, ...emptyState(), directory: '', id: '' };
  }

  function busy() {
    return { ok: false, message: BUSY_MESSAGE };
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
    if (!store) return;
    const state = store.read();
    state.images.cover = stopGenerating(state.images.cover);
    state.images.gallery = state.images.gallery.map((slot) => stopGenerating(slot));
    state.prompts.stale = false;
    state.job = { running: false, step: '', error: message || '没有完成' };
    store.write(state);
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
   * 画面条数必须等于已定文案行数；长度不符时附纠正句再调一次。
   * @param {string[]} displayLines
   * @param {Record<string, string>} sceneVars
   * @param {string} look
   * @returns {Promise<{ album: string; scenes: string[] }>}
   */
  async function completeScenes(displayLines, sceneVars, look) {
    const need = displayLines.length;
    const basePrompt = fillPrompt(readPromptFile(promptsDir, 'scenes.md'), sceneVars);
    /** @type {unknown} */
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = attempt === 0
        ? basePrompt
        : `${basePrompt}\n\n上一轮返回了 ${sceneLengthFromError(lastErr, need)} 条，必须正好 ${need} 条，只返回 JSON。`;
      try {
        return parseScenesText(await complete(prompt), displayLines, look, promptsDir);
      } catch (err) {
        lastErr = err;
        if (attempt === 0 && isSceneLengthError(err)) continue;
        throw err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('画面失败');
  }

  /**
   * @param {DraftFace} face
   * @param {number} galleryCount
   * @param {string} [albumLook] 合法图册 id；缺省则随机抽
   */
  async function producePrompts(face, galleryCount, albumLook) {
    const storyType = pickStoryType(random);
    const look = typeof albumLook === 'string' && isAlbum(albumLook, promptsDir)
      ? albumLook
      : pickAlbum(promptsDir, random);
    const tone = readPromptFile(promptsDir, 'tone.md');
    const shared = {
      title: face.title,
      body: face.body,
      topics: face.topics.join('、'),
    };
    const slots = storyType === 'contrast' ? assignContrastSlots(galleryCount) : assignStoryRoles(galleryCount);
    const planned = parsePlanText(
      await complete(fillPrompt(readPromptFile(promptsDir, storyPromptName(storyType)), {
        ...shared,
        tone,
        albumHint: albumHint(promptsDir, look),
        copySchema: copySchema(look, promptsDir),
        imageCount: String(galleryCount + 1),
        slots: formatGallerySlots(slots),
      })),
      galleryCount,
      face.body,
      look,
      promptsDir,
    );
    const displayLines = planned.map((frame) => frameDisplayLine(look, frame, promptsDir));
    const art = await completeScenes(displayLines, {
      ...shared,
      tone,
      albumHint: albumHint(promptsDir, look),
      plannedLines: formatPlannedLines(planned, look, promptsDir),
      storyHint: storyType === 'contrast'
        ? '每一张画面仍是一个对照，前后接成一个故事。'
        : '前后接成一个故事。',
      sceneCount: String(displayLines.length),
    }, look);
    const rendered = planned.map((frame, index) => renderAlbumPrompt(promptsDir, look, art.scenes[index], frame));
    const galleryRoles = galleryCount === 0
      ? []
      : (storyType === 'contrast'
        ? Array.from({ length: galleryCount }, () => 'contrast')
        : assignGalleryRoles(galleryCount));
    return {
      cover: rendered[0].prompt,
      storyType,
      look,
      coverLine: displayLines[0],
      gallery: rendered.slice(1).map((item) => item.prompt),
      galleryLines: displayLines.slice(1),
      galleryRoles,
      style: rendered[0].style,
    };
  }

  /**
   * @param {DraftFace} face
   * @param {number} galleryCount
   * @param {{
   *   cover: string;
   *   storyType: string;
   *   look: string;
   *   coverLine: string;
   *   gallery: string[];
   *   galleryLines: string[];
   *   galleryRoles: string[];
   *   style: string;
   * }} produced
   */
  function commitPrompts(face, galleryCount, produced) {
    if (!store) return;
    const state = store.read();
    const nextFace = { ...face, coverLine: produced.coverLine };
    state.draft = nextFace;
    state.galleryCount = galleryCount;
    state.prompts = {
      cover: produced.cover,
      storyType: produced.storyType,
      look: produced.look,
      gallery: produced.gallery,
      galleryLines: produced.galleryLines,
      galleryRoles: produced.galleryRoles,
      style: produced.style,
      stale: false,
      basis: basisFrom(nextFace, galleryCount, state.coverLineSpecified),
    };
    state.job = { running: false, step: '', error: '' };
    store.write(state);
  }

  /**
   * @param {{ business: string; article: string; galleryCount: number; articleType: string }} checked
   */
  async function runGenerateDraft(checked) {
    try {
      if (!store) throw new Error('没有这一篇');
      const draftPrompt = buildDraftPrompt(promptsDir, checked.articleType, {
        business: checked.business,
        article: checked.article,
      });
      let face;
      try {
        face = parseDraftText(await complete(draftPrompt));
      } catch (err) {
        markJobFailed(errorMessage(err, '成稿失败'));
        return;
      }
      const drafted = store.read();
      drafted.draft = face;
      drafted.articleType = checked.articleType;
      drafted.prompts.stale = false;
      drafted.job = { running: true, step: '提示词', error: '' };
      store.write(drafted);
      let produced;
      try {
        produced = await producePrompts(face, checked.galleryCount);
      } catch (err) {
        markJobFailed(errorMessage(err, '提示词失败'));
        return;
      }
      commitPrompts(face, checked.galleryCount, produced);
    } catch (err) {
      markJobFailed(errorMessage(err, '生成稿失败'));
    }
  }

  /**
   * @param {string} [albumLook]
   */
  async function runGeneratePrompts(albumLook) {
    try {
      if (!store) throw new Error('没有这一篇');
      const state = store.read();
      const face = state.draft;
      if (!face) throw new Error('还没有稿面');
      const galleryCount = state.galleryCount;
      let produced;
      try {
        produced = await producePrompts(face, galleryCount, albumLook);
      } catch (err) {
        markJobFailed(errorMessage(err, '提示词失败'));
        return;
      }
      commitPrompts(face, galleryCount, produced);
    } catch (err) {
      markJobFailed(errorMessage(err, '提示词失败'));
    }
  }

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
    while (gallery.length < index) gallery.push({
      status: '空',
      path: '',
      selected: 0,
      revisedAt: 0,
      versions: [],
    });
    gallery[index - 1] = next;
    state.images.gallery = gallery;
  }

  /**
   * @param {ImageOnly | null} [only]
   */
  async function runImages(only) {
    try {
      if (!store) throw new Error('没有这一篇');
      const initial = store.read();
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
      for (const job of selected) {
        const current = store.read();
        const previous = readImageSlot(current, job.slot, job.index);
        const file = nextImageFile(job.slot, job.index, previous.versions);
        setImageSlot(current, job.slot, job.index, { ...previous, status: '生成中' });
        current.job = { running: true, step: job.label, error: '' };
        store.write(current);
        const outputPath = path.join(currentDir, file);
        try {
          await generateImage({ prompt: job.prompt, outputPath });
          const done = store.read();
          const base = readImageSlot(done, job.slot, job.index);
          const revisedAt = nextRevisedAt();
          const versions = base.versions.concat([{ path: file, revisedAt }]);
          setImageSlot(done, job.slot, job.index, {
            status: '成功',
            path: file,
            selected: versions.length,
            revisedAt,
            versions,
          });
          done.job = { running: true, step: job.label, error: '' };
          store.write(done);
        } catch (err) {
          failed += 1;
          lastError = errorMessage(err, '生图失败');
          fs.rmSync(outputPath, { force: true });
          const failedState = store.read();
          const base = readImageSlot(failedState, job.slot, job.index);
          setImageSlot(failedState, job.slot, job.index, {
            ...base,
            status: base.versions.length > 0 ? '成功' : '失败',
          });
          failedState.job = { running: true, step: job.label, error: '' };
          store.write(failedState);
        }
      }
      const finished = store.read();
      finished.job = {
        running: false,
        step: '',
        error: failed > 0 ? `${lastError}。可以再抽这一张` : '',
      };
      store.write(finished);
    } catch (err) {
      markJobFailed(errorMessage(err, '生图失败'));
    }
  }

  function loadLatest() {
    if (!store) return blank();
    const existed = store.exists();
    const state = store.read();
    if (existed && state.job.running && !lock) {
      state.job = {
        running: false,
        step: '',
        error: state.job.error || '上次生成中断，请重试',
      };
      state.images.cover = stopGenerating(state.images.cover);
      state.images.gallery = state.images.gallery.map((slot) => stopGenerating(slot));
      store.write(state);
    }
    return { ok: true, ...state, directory: currentDir, id: currentId };
  }

  function startNew() {
    if (lock) return busy();
    currentId = '';
    currentDir = '';
    store = null;
    return blank();
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function openPost(payload) {
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id : '';
    if (!hasPost(postsDir, id)) return { ok: false, message: '没有这一篇' };
    usePost(id);
    return loadLatest();
  }

  function catalog() {
    return { ok: true, posts: listPosts(postsDir, promptsDir) };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function saveEditor(payload) {
    if (!store) return { ok: true, skipped: true };
    if (lock) return busy();
    const state = store.read();
    const source = payload && typeof payload === 'object' ? payload : {};
    if (typeof source.business === 'string') state.business = source.business;
    if (typeof source.article === 'string') state.article = source.article;
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
    store.write(state);
    return { ok: true };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function generateDraft(payload) {
    const checked = validateInputs(payload);
    if (!checked.ok) return checked;
    const articleType = payload && payload.articleType;
    if (!isArticleType(articleType)) {
      return { ok: false, message: '文章类型不在允许列表', field: 'articleType' };
    }
    if (lock) return busy();
    if (!store) usePost(allocatePost(postsDir, now()));
    if (!store) return { ok: false, message: '没有这一篇' };
    lock = 'generateDraft';
    const state = store.read();
    state.business = checked.business;
    state.article = checked.article;
    state.articleType = articleType;
    state.galleryCount = checked.galleryCount;
    if (typeof payload.coverLineSpecified === 'string') {
      state.coverLineSpecified = payload.coverLineSpecified.trim();
    }
    state.job = { running: true, step: '成稿', error: '' };
    store.write(state);
    runGenerateDraft({ ...checked, articleType }).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true, id: currentId };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function generatePrompts(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const state = store.read();
    const source = payload && typeof payload === 'object' ? payload : {};
    if (source.galleryCount != null) {
      const count = validateGalleryCount(source.galleryCount);
      if (!count.ok) return count;
      state.galleryCount = count.galleryCount;
    }
    applyDraftText(state, source);
    if (typeof source.coverLineSpecified === 'string') {
      state.coverLineSpecified = source.coverLineSpecified.trim();
    }
    const albumLook = typeof source.look === 'string' ? source.look.trim() : '';
    if (albumLook && !isAlbum(albumLook, promptsDir)) {
      return { ok: false, message: '图册不在允许列表', field: 'look' };
    }
    if (!state.draft) return { ok: false, message: '还没有稿面' };
    const faceMessage = validateDraftFace(state.draft);
    if (faceMessage) return { ok: false, message: faceMessage };
    state.draft = normalizeFace(state.draft);
    lock = 'generatePrompts';
    state.job = { running: true, step: '提示词', error: '' };
    store.write(state);
    runGeneratePrompts(albumLook || undefined).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  function listAlbums() {
    const catalog = loadAlbumCatalog(promptsDir);
    return {
      ok: true,
      albums: catalog.list().map((meta) => {
        const samplePath = albumSamplePath(meta.id, promptsDir);
        return {
          id: meta.id,
          label: meta.label,
          hint: meta.hint,
          kind: meta.kind,
          samplePath,
          hasSample: fs.existsSync(albumSampleFile(promptsDir, meta.id)),
          deletable: !isBuiltinAlbum(meta.id),
        };
      }),
    };
  }

  /**
   * 当前笔记是否正在用某图册做提示词或生图。
   * @param {string} albumId
   * @returns {boolean}
   */
  function albumBusy(albumId) {
    if (!lock || !store) return false;
    if (lock !== 'generatePrompts' && lock !== 'generateImages' && lock !== 'retryImage') {
      return false;
    }
    const state = store.read();
    const look = state.prompts && typeof state.prompts.look === 'string'
      ? state.prompts.look.trim()
      : '';
    return Boolean(look && look === albumId);
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  async function learnAlbum(payload) {
    if (lock === 'learnAlbum') return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    /** @type {ReturnType<typeof normalizeReferenceImage>} */
    let image;
    try {
      image = normalizeReferenceImage(source);
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '参考图不合格' };
    }
    lock = 'learnAlbum';
    try {
      const system = readLearnSystemPrompt(promptsDir);
      const raw = await completeVision({ text: system, dataUrl: image.dataUrl });
      albumDraftSeq += 1;
      const draftId = `draft-${albumDraftSeq}`;
      const draft = buildAlbumDraft(promptsDir, raw, image, draftId);
      albumDraft = draft;
      return { ok: true, draft: draftPublicView(draft) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '学习失败' };
    } finally {
      lock = null;
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function commitAlbum(payload) {
    if (!albumDraft) return { ok: false, message: '没有可写入的草稿' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const draftId = typeof source.draftId === 'string' ? source.draftId.trim() : '';
    if (draftId && draftId !== albumDraft.draftId) {
      return { ok: false, message: '草稿已过期，请重新学习' };
    }
    try {
      const result = commitAlbumDraft(promptsDir, albumDraft);
      albumDraft = null;
      return { ok: true, id: result.id };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '写入失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} [_payload]
   */
  function discardAlbum(_payload) {
    albumDraft = null;
    return { ok: true };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function deleteAlbum(payload) {
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明图册' };
    if (isBuiltinAlbum(id)) return { ok: false, message: '出厂图册不能删除' };
    if (albumBusy(id)) {
      return { ok: false, message: '这本图册正在用于生成，请等这一轮结束' };
    }
    try {
      deleteAlbumFiles(promptsDir, id);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '删除失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function previewAlbumSample(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!isAlbum(id, promptsDir)) return { ok: false, message: '图册不在允许列表' };
    const abs = albumSampleFile(promptsDir, id);
    if (!fs.existsSync(abs)) return { ok: false, message: '没有样图' };
    const bytes = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = ext === '.png'
      ? 'image/png'
      : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
    return { ok: true, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function getAlbumDetail(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!isAlbum(id, promptsDir)) return { ok: false, message: '图册不在允许列表' };
    const meta = loadAlbumCatalog(promptsDir).get(id);
    let promptTemplate = '';
    try {
      promptTemplate = readPromptFile(promptsDir, albumPromptName(id, promptsDir));
    } catch {
      return { ok: false, message: '找不到图册题词' };
    }
    return {
      ok: true,
      id: meta.id,
      label: meta.label,
      hint: meta.hint,
      hasSample: fs.existsSync(albumSampleFile(promptsDir, id)),
      promptTemplate,
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function generateImages(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const only = requestedSlot(source);
    if (!only) return { ok: false, message: '要指明封面或配图序号' };
    const state = store.read();
    applyPromptText(state, source);
    const reason = slotBlockReason(state, only);
    if (reason) {
      store.write(state);
      return { ok: false, message: reason };
    }
    lock = 'generateImages';
    state.job = {
      running: true,
      step: only.slot === 'cover' ? '封面' : `配图 ${only.index}`,
      error: '',
    };
    store.write(state);
    runImages(only).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function retryImage(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const slot = source.slot;
    const index = Number(source.index);
    if (slot !== 'cover' && slot !== 'gallery') {
      return { ok: false, message: '要指明封面或配图序号' };
    }
    if (slot === 'gallery' && (!Number.isInteger(index) || index < 1 || index > 9)) {
      return { ok: false, message: '要指明封面或配图序号' };
    }
    const state = store.read();
    const blocked = promptsBlockReason(state);
    if (blocked) return { ok: false, message: blocked };
    const image = slot === 'cover' ? state.images.cover : state.images.gallery[index - 1];
    if (!image || image.status !== '失败') {
      return { ok: false, message: '只能重试失败的那一张' };
    }
    lock = 'retryImage';
    /** @type {ImageOnly} */
    const only = slot === 'cover' ? { slot: 'cover', index: 0 } : { slot: 'gallery', index };
    runImages(only).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  /**
   * @param {Record<string, unknown>} source
   * @returns {string}
   */
  function imageFileFor(source) {
    if (!store) return '';
    const only = requestedSlot(source);
    if (!only) return '';
    const state = store.read();
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
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const only = requestedSlot(source);
    if (!only) return { ok: false, message: '要指明封面或配图序号' };
    const version = Number(source.version);
    const state = store.read();
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
    store.write(state);
    return { ok: true };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function previewImage(payload) {
    if (!currentDir) return { ok: false, message: '没有这张图' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const file = imageFileFor(source);
    if (!file) return { ok: false, message: '没有这张图' };
    const abs = path.join(currentDir, file);
    if (!fs.existsSync(abs)) return { ok: false, message: '图片不在' };
    const bytes = fs.readFileSync(abs);
    return { ok: true, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function revealImage(payload) {
    if (!currentDir) return { ok: false, message: '没有这张图' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const file = imageFileFor(source);
    if (!file) return { ok: false, message: '没有这张图' };
    const abs = path.join(currentDir, file);
    if (!fs.existsSync(abs)) return { ok: false, message: '图片不在' };
    try {
      revealFile(abs);
    } catch {
      return { ok: true, path: abs };
    }
    return { ok: true, path: abs };
  }

  return {
    chooseImage,
    commitAlbum,
    deleteAlbum,
    discardAlbum,
    generateDraft,
    generateImages,
    generatePrompts,
    getAlbumDetail,
    learnAlbum,
    listAlbums,
    listPosts: catalog,
    loadLatest,
    openPost,
    previewAlbumSample,
    previewImage,
    revealImage,
    retryImage,
    saveEditor,
    startNew,
  };
}

module.exports = {
  BUSY_MESSAGE,
  createRunner,
  promptsBlockReason,
};
