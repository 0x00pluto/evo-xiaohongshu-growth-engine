// @ts-check
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('../llm/client')} */
const llmModule = require('../llm/client');
/** @type {typeof import('../image/generate')} */
const imageModule = require('../image/generate');
/** @type {typeof import('../image/aspect')} */
const aspectModule = require('../image/aspect');
/** @type {typeof import('../prompts/fill')} */
const fillModule = require('../prompts/fill');
/** @type {typeof import('../draft/store')} */
const storeModule = require('../draft/store');
/** @type {typeof import('../draft/validate')} */
const validateModule = require('../draft/validate');
/** @type {typeof import('./posts')} */
const postsModule = require('./posts');
/** @type {typeof import('../upload-refs/rules')} */
const uploadRefRules = require('../upload-refs/rules');
/** @type {typeof import('../upload-refs/files')} */
const uploadRefFiles = require('../upload-refs/files');
/** @type {typeof import('../article-samples/store')} */
const articleSamplesStore = require('../article-samples/store');
/** @type {typeof import('../reference-docs/store')} */
const referenceDocsStore = require('../reference-docs/store');
/** @type {typeof import('../xhs-note/links')} */
const xhsNoteLinks = require('../xhs-note/links');
/** @type {typeof import('../xhs-note/split')} */
const xhsNoteSplit = require('../xhs-note/split');
/** @type {typeof import('../xhs-note/fetch')} */
const xhsNoteFetch = require('../xhs-note/fetch');
/** @type {typeof import('../xhs-note/download-image')} */
const xhsNoteDownload = require('../xhs-note/download-image');
/** @type {typeof import('../xhs-note/bridge')} */
const xhsNoteBridge = require('../xhs-note/bridge');
/** @type {typeof import('../xhs-note/note-id')} */
const xhsNoteId = require('../xhs-note/note-id');
/** @type {typeof import('../xhs-note/cache')} */
const xhsNoteCache = require('../xhs-note/cache');
/** @type {typeof import('../xhs-note/provenance')} */
const xhsNoteProvenance = require('../xhs-note/provenance');
/** @type {typeof import('../prompts/parse')} */
const parseModule = require('../prompts/parse');

/** @type {typeof import('./model-error')} */
const modelErrorModule = require('./model-error');
/** @type {typeof import('../../lib/dex-buddy-sdk')} */
const dexBuddySdk = require('../../lib/dex-buddy-sdk');

const { createLlm } = llmModule;
const { requireEntitlement: sdkRequireEntitlement } = dexBuddySdk;
const { parseJsonObject } = parseModule;
const { generatePng } = imageModule;
const {
  ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  aspectRatioFromImage,
  cssAspectRatio,
  normalizeAspectRatio,
} = aspectModule;
const { errorCode, formatModelError } = modelErrorModule;
const {
  albumHint,
  albumSampleFile,
  albumSamplePath,
  assertPromptPlaceholders,
  assertPromptSheet,
  assignContrastSlots,
  assignGalleryRoles,
  assignStoryRoles,
  buildAlbumDraft,
  buildDraftMessages,
  commitAlbumDraft,
  commitFlaggedAlbumDraft,
  copyFramesFitSchema,
  copySchema,
  decodeFilledPrompt,
  deleteAlbumFiles,
  draftPublicView,
  embedEditablePrompt,
  ensureAlbumAspectRatio,
  ensureAllAlbumAspectRatios,
  extractEditablePrompt,
  extractSceneFromPrompt,
  fillPrompt,
  formatGallerySlots,
  formatPlannedLines,
  frameDisplayLine,
  composeImagePrompt,
  findImageSafety,
  formatImageSafetyMessage,
  isAlbum,
  isArticleType,
  isPersonaType,
  isBuiltinAlbum,
  loadAlbumCatalog,
  migrateUserAlbumPacks,
  migrateUserAlbumsFromAssets,
  normalizeReferenceImage,
  parseDraftText,
  parsePlanText,
  parseScenesText,
  pickAlbum,
  pickStoryType,
  readAlbumPromptText,
  readLearnSystemPrompt,
  readPromptFile,
  renderAlbumPrompt,
  storyPromptName,
  updateAlbumPromptMd,
} = fillModule;
const { createStore, emptyState, nextImageFile } = storeModule;
const {
  basisEqual,
  basisFrom,
  formatPost,
  validateDraftFace,
  validateGalleryCount,
  validateInputs,
  normalizeFace,
} = validateModule;
const {
  allocatePost,
  hasPost,
  importLegacy,
  indexEntry,
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
 *   userAlbumsDir?: string;
 *   userImageRefsDir?: string;
 *   userUploadRefsDir?: string;
 *   userArticleSamplesDir?: string;
 *   userReferenceDocsDir?: string;
 *   userXhsNotesDir?: string;
 *   userXhsNotesCacheDir?: string;
 *   userMaterialsDir?: string;
 *   fetchNoteByUrl?: typeof xhsNoteFetch.fetchNoteByUrl;
 *   checkBridge?: typeof xhsNoteFetch.checkBridge;
 *   env?: Record<string, string | undefined>;
 *   readEnv?: () => Record<string, string | undefined>;
 *   ctx?: unknown;
 *   requireEntitlement?: (ctx?: unknown) => Promise<unknown>;
 *   models?: unknown;
 *   fetch?: import('../llm/client').FetchFn;
 *   now?: () => Date;
 *   complete?: (prompt: string | { system: string; user: string }, options?: { idempotencyKey?: string }) => Promise<string>;
 *   completeVision?: (input: { text: string; dataUrl: string }, options?: { idempotencyKey?: string }) => Promise<string>;
 *   generateImage?: (args: {
 *     prompt: string;
 *     outputPath: string;
 *     references?: import('../image/generate').ImageReference[];
 *     idempotencyKey?: string;
 *     model?: string;
 *   }) => Promise<string>;
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
  return formatModelError(err, fallback);
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
 * @returns {boolean}
 */
function isSceneDuplicateError(err) {
  return errorMessage(err, '') === '这一张的画面重复了';
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isSceneRetryableError(err) {
  return isSceneLengthError(err) || isSceneDuplicateError(err);
}

/**
 * 策划缺必填上图字段、空句、重复句时允许再调一次。
 * @param {unknown} err
 * @returns {boolean}
 */
function isPlanRetryableError(err) {
  const text = errorMessage(err, '');
  return /策划字段不完整|策划那一句是空的|策划那一句重复了|策划句子应为/.test(text);
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
 * @returns {import('../draft/store').PromptsState}
 */
function blankPrompts() {
  return {
    cover: '',
    storyType: '',
    look: '',
    gallery: [],
    galleryLines: [],
    galleryRoles: [],
    style: '',
    stale: false,
    basis: null,
  };
}

/**
 * @param {DraftState} state
 * @returns {boolean}
 */
function hasStampedPrompts(state) {
  if (state.prompts && state.prompts.basis) return true;
  if (String(state.prompts && state.prompts.cover || '').trim()) return true;
  const gallery = state.prompts && Array.isArray(state.prompts.gallery) ? state.prompts.gallery : [];
  return gallery.some((item) => String(item).trim());
}

/**
 * @param {DraftState} state
 * @returns {boolean}
 */
function copyIsStale(state) {
  if (!state.draft) return false;
  if (!state.prompts || !state.prompts.basis) return true;
  return !basisEqual(
    state.prompts.basis,
    basisFrom(state.draft, state.galleryCount, state.coverLineSpecified),
  );
}

/**
 * @param {DraftState} state
 * @param {ImageOnly} only
 * @returns {string}
 */
function slotBlockReason(state, only) {
  if (!state.draft) return '还没有稿面';
  if (only.slot === 'gallery' && only.index > state.galleryCount) return '还没有这一张的提示词';
  if (!hasStampedPrompts(state) || copyIsStale(state)) return '';
  if (only.slot === 'gallery' && only.index > state.prompts.gallery.length) return '还没有这一张的提示词';
  if (!slotPromptText(state, only)) return '还没有这一张的提示词';
  return '';
}

/**
 * @param {DraftState} state
 * @returns {{ cover: string; gallery: string[] }}
 */
function editorFromState(state) {
  const gallery = Array.isArray(state.prompts.gallery) ? state.prompts.gallery : [];
  return {
    cover: extractEditablePrompt(state.prompts.cover),
    gallery: gallery.map((item) => extractEditablePrompt(String(item || ''))),
  };
}

/**
 * @param {DraftState} state
 * @param {Record<string, unknown>} payload
 */
function applyPromptEdits(state, payload) {
  const edits = payload.promptEdits;
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return;
  const next = /** @type {Record<string, unknown>} */ (edits);
  if (typeof next.cover === 'string') {
    state.prompts.cover = embedEditablePrompt(state.prompts.cover, next.cover);
  }
  if (Array.isArray(next.gallery)) {
    const gallery = Array.isArray(state.prompts.gallery) ? state.prompts.gallery.slice() : [];
    next.gallery.forEach((item, index) => {
      if (typeof item !== 'string') return;
      while (gallery.length <= index) gallery.push('');
      gallery[index] = embedEditablePrompt(gallery[index], item);
    });
    state.prompts.gallery = gallery;
  }
}

/**
 * @param {RunnerOptions} options
 */
function createRunner(options) {
  const postsDirOption = options.postsDir || options.latestDir;
  if (!postsDirOption) throw new Error('缺少 postsDir');
  const postsDir = postsDirOption;
  const promptsDir = options.promptsDir;
  const userAlbumsDir = typeof options.userAlbumsDir === 'string' && options.userAlbumsDir.trim()
    ? path.resolve(options.userAlbumsDir.trim())
    : '';
  const userImageRefsDir = typeof options.userImageRefsDir === 'string' && options.userImageRefsDir.trim()
    ? path.resolve(options.userImageRefsDir.trim())
    : '';
  const userUploadRefsDir = (() => {
    if (typeof options.userUploadRefsDir === 'string' && options.userUploadRefsDir.trim()) {
      return path.resolve(options.userUploadRefsDir.trim());
    }
    // 兼容旧字段：原先指 runtime/materials，现叶子在 upload-refs
    if (typeof options.userMaterialsDir === 'string' && options.userMaterialsDir.trim()) {
      const resolved = path.resolve(options.userMaterialsDir.trim());
      if (path.basename(resolved) === 'upload-refs') return resolved;
      return path.join(resolved, 'upload-refs');
    }
    return '';
  })();
  const userArticleSamplesDir = typeof options.userArticleSamplesDir === 'string'
    && options.userArticleSamplesDir.trim()
    ? path.resolve(options.userArticleSamplesDir.trim())
    : '';
  const userReferenceDocsDir = typeof options.userReferenceDocsDir === 'string'
    && options.userReferenceDocsDir.trim()
    ? path.resolve(options.userReferenceDocsDir.trim())
    : '';
  const userXhsNotesDir = typeof options.userXhsNotesDir === 'string'
    && options.userXhsNotesDir.trim()
    ? path.resolve(options.userXhsNotesDir.trim())
    : '';
  const userXhsNotesCacheDir = typeof options.userXhsNotesCacheDir === 'string'
    && options.userXhsNotesCacheDir.trim()
    ? path.resolve(options.userXhsNotesCacheDir.trim())
    : (userXhsNotesDir
      ? path.resolve(userXhsNotesDir, '..', '..', '..', 'cache', 'xhs-notes')
      : '');
  const fetchNoteByUrl = typeof options.fetchNoteByUrl === 'function'
    ? options.fetchNoteByUrl
    : xhsNoteFetch.fetchNoteByUrl;
  const checkBridgeFn = typeof options.checkBridge === 'function'
    ? options.checkBridge
    : xhsNoteFetch.checkBridge;
  const staticEnv = options.env || {};
  const readEnv = typeof options.readEnv === 'function'
    ? options.readEnv
    : () => staticEnv;
  const fetchImpl = options.fetch;
  const now = options.now || (() => new Date());
  if (userAlbumsDir) {
    migrateUserAlbumsFromAssets(promptsDir, userAlbumsDir);
    migrateUserAlbumPacks(userAlbumsDir, promptsDir);
  }
  if (userUploadRefsDir) {
    uploadRefFiles.migrateLibraryUploadRefsLayout(userUploadRefsDir);
  }
  importLegacy(postsDir, promptsDir, userAlbumsDir);
  try {
    ensureAllAlbumAspectRatios(promptsDir, userAlbumsDir);
  } catch {
    // 补算失败不阻断启动
  }
  let currentId = '';
  let currentDir = '';
  /** @type {import('../draft/store').DraftStore | null} */
  let store = null;
  const llm = createLlm({
    env: readEnv,
    ctx: options.ctx,
    models: options.models ? /** @type {import('../llm/client').HostModels} */ (options.models) : undefined,
    fetch: fetchImpl,
  });
  const complete = options.complete
    || ((/** @type {string | { system: string; user: string }} */ prompt, callOptions) => (
      llm.complete(prompt, callOptions)
    ));
  const completeVision = options.completeVision
    || ((/** @type {{ text: string; dataUrl: string }} */ input, callOptions) => (
      llm.completeVision(input, callOptions)
    ));
  const generateImage = options.generateImage || ((/** @type {{
    prompt: string;
    outputPath: string;
    references?: import('../image/generate').ImageReference[];
    aspectRatio?: string;
    idempotencyKey?: string;
    model?: string;
  }} */ args) => generatePng({
    prompt: args.prompt,
    outputPath: args.outputPath,
    references: args.references,
    aspectRatio: args.aspectRatio,
    env: readEnv,
    ctx: options.ctx,
    models: options.models ? /** @type {import('../image/generate').HostImageModels} */ (options.models) : undefined,
    fetch: fetchImpl,
    model: args.model,
    idempotencyKey: args.idempotencyKey,
  }));
  /** @type {Map<string, number>} */
  const visionAttempts = new Map();
  const revealFile = options.revealFile || (() => {});
  const random = options.random || Math.random;
  /** @type {string | null} */
  let lock = null;
  const checkEntitlement = typeof options.requireEntitlement === 'function'
    ? options.requireEntitlement
    : sdkRequireEntitlement;

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
    if (lock) return busy();
    lock = nextLock;
    try {
      await checkEntitlement(options.ctx);
    } catch (err) {
      lock = null;
      if (isSilencedEntitlement(err)) return { ok: false, silenced: true };
      return { ok: false, message: err instanceof Error ? err.message : '没有完成' };
    }
    return proceed();
  }

  /** @type {import('../prompts/album/learn').AlbumDraft | null} */
  let albumDraft = null;
  let albumDraftSeq = 0;
  /** 正在 resolve / import 的粘贴串或 sourceUrl（防并行） */
  let xhsNoteBusyKey = '';

  /**
   * @param {string} id
   */
  function usePost(id) {
    currentId = id;
    currentDir = path.join(postsDir, id);
    uploadRefFiles.migratePostUploadRefsLayout(currentDir);
    store = createStore(currentDir, { promptsDir, userAlbumsDir });
    const writeFile = store.write;
    store.write = (state) => {
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
    if (!store) return { ok: false, message: BUSY_MESSAGE };
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
    if (!store) return;
    const state = store.read();
    state.images.cover = stopGenerating(state.images.cover);
    state.images.gallery = state.images.gallery.map((slot) => stopGenerating(slot));
    state.prompts.stale = false;
    state.job = { running: false, step: '', error: message || '没有完成' };
    store.write(state);
  }

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
   * @returns {import('../draft/store').BillingAttempts}
   */
  function emptyBilling() {
    return { copy: 0, promptsPlan: 0, promptsScenes: 0 };
  }

  /**
   * @param {import('../draft/store').DraftState} state
   * @param {'copy' | 'promptsPlan' | 'promptsScenes'} field
   * @returns {number}
   */
  function readBilling(state, field) {
    const billing = state.billing || emptyBilling();
    const n = Number(billing[field]);
    return Number.isInteger(n) && n > 0 ? n : 0;
  }

  /**
   * @param {'copy' | 'promptsPlan' | 'promptsScenes'} field
   */
  function bumpBilling(field) {
    if (!store) return;
    const state = store.read();
    const billing = { ...emptyBilling(), ...(state.billing || {}) };
    billing[field] = readBilling(state, field) + 1;
    state.billing = billing;
    store.write(state);
  }

  /**
   * @param {string | { system: string; user: string }} prompt
   * @param {'copy' | 'promptsPlan' | 'promptsScenes'} field
   * @param {string} step
   * @returns {Promise<string>}
   */
  async function completeWithStep(prompt, field, step) {
    const attempts = store ? readBilling(store.read(), field) : 0;
    const key = stepKey(currentId, step, attempts);
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
   * 画面条数必须等于已定文案行数；条数不对或画面重复时附纠正句再调一次。
   * @param {string[]} displayLines
   * @param {Record<string, string>} sceneVars
   * @param {string} look
   * @returns {Promise<{ album: string; scenes: string[] }>}
   */
  async function completeScenes(displayLines, sceneVars, look) {
    const need = displayLines.length;
    const basePrompt = fillPrompt(readPromptFile(promptsDir, 'article-image/scenes.md'), sceneVars);
    /** @type {unknown} */
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = attempt === 0
        ? basePrompt
        : `${basePrompt}\n\n上一轮返回了 ${sceneLengthFromError(lastErr, need)} 条，必须正好 ${need} 条，且每一条画面都不能相同，只返回 JSON。`;
      try {
        return parseScenesText(
          await completeWithStep(prompt, 'promptsScenes', 'prompts:scenes'),
          displayLines,
          look,
          promptsDir,
          userAlbumsDir,
        );
      } catch (err) {
        lastErr = err;
        if (attempt === 0 && isSceneRetryableError(err)) continue;
        throw err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('画面失败');
  }

  /**
   * @param {DraftFace} face
   * @param {number} galleryCount
   * @param {string} [albumLook] 合法图册 id；缺省则随机抽
   * @param {{ keepScenes?: string[]; keepStoryType?: string }} [options]
   */
  async function producePrompts(face, galleryCount, albumLook, options) {
    const keepStoryType = options && typeof options.keepStoryType === 'string'
      ? options.keepStoryType.trim()
      : '';
    const storyType = keepStoryType === 'contrast' || keepStoryType === 'process'
      ? keepStoryType
      : pickStoryType(random);
    const look = typeof albumLook === 'string' && isAlbum(albumLook, promptsDir, userAlbumsDir)
      ? albumLook
      : pickAlbum(promptsDir, random, userAlbumsDir);
    const tone = readPromptFile(promptsDir, 'article-image/tone.md');
    const shared = {
      title: face.title,
      body: face.body,
      topics: face.topics.join('、'),
    };
    const slots = storyType === 'contrast' ? assignContrastSlots(galleryCount) : assignStoryRoles(galleryCount);
    const planPrompt = fillPrompt(readPromptFile(promptsDir, storyPromptName(storyType)), {
      ...shared,
      tone,
      albumHint: albumHint(promptsDir, look, userAlbumsDir),
      copySchema: copySchema(look, promptsDir, userAlbumsDir),
      imageCount: String(galleryCount + 1),
      slots: formatGallerySlots(slots),
    });
    /** @type {import('../prompts/album/frame').CopyFrame[] | null} */
    let planned = null;
    /** @type {unknown} */
    let lastPlanErr = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = attempt === 0
        ? planPrompt
        : `${planPrompt}\n\n上一轮有字段缺失或不合规。copySchema 里未标明可空/可选/没有则…的字段必须给出非空可上图文案；只返回 JSON。`;
      try {
        planned = parsePlanText(
          await completeWithStep(prompt, 'promptsPlan', 'prompts:plan'),
          galleryCount,
          face.body,
          look,
          promptsDir,
          userAlbumsDir,
        );
        lastPlanErr = null;
        break;
      } catch (err) {
        lastPlanErr = err;
        if (attempt === 0 && isPlanRetryableError(err)) continue;
        throw err;
      }
    }
    if (!planned) {
      throw lastPlanErr instanceof Error ? lastPlanErr : new Error('策划失败');
    }
    const displayLines = planned.map((frame) => frameDisplayLine(look, frame, promptsDir, userAlbumsDir));
    const keepScenes = options && Array.isArray(options.keepScenes)
      ? options.keepScenes.map((item) => String(item || '').trim())
      : [];
    const canKeepScenes = keepScenes.length === displayLines.length && keepScenes.every(Boolean);
    const art = canKeepScenes
      ? { album: look, scenes: keepScenes }
      : await completeScenes(displayLines, {
        ...shared,
        tone,
        albumHint: albumHint(promptsDir, look, userAlbumsDir),
        plannedLines: formatPlannedLines(planned, look, promptsDir, userAlbumsDir),
        storyHint: storyType === 'contrast'
          ? '每一张画面仍是一个对照，前后接成一个故事。'
          : '前后接成一个故事。',
        sceneCount: String(displayLines.length),
      }, look);
    const rendered = planned.map((frame, index) => renderAlbumPrompt(
      promptsDir,
      look,
      art.scenes[index],
      frame,
      userAlbumsDir,
    ));
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
   * @param {boolean} [keepJob]
   */
  function commitPrompts(face, galleryCount, produced, keepJob) {
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
    if (!keepJob) {
      state.job = { running: false, step: '', error: '' };
    }
    store.write(state);
  }

  /**
   * @param {{
   *   business: string;
   *   sampleBody: string;
   *   references: import('../draft/validate').ReferenceItem[];
   *   galleryCount: number;
   *   articleType: string;
   *   persona: string;
   * }} checked
   */
  async function runGenerateDraft(checked) {
    try {
      if (!store) throw new Error('没有这一篇');
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
      const drafted = store.read();
      drafted.draft = face;
      drafted.articleType = checked.articleType;
      drafted.persona = checked.persona;
      drafted.prompts = blankPrompts();
      drafted.job = { running: false, step: '', error: '' };
      store.write(drafted);
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

  /**
   * @param {DraftState} state
   * @returns {string[]}
   */
  function extractAllScenes(state) {
    const prompts = [state.prompts.cover, ...(state.prompts.gallery || [])];
    return prompts.map((item) => extractSceneFromPrompt(String(item || '')));
  }

  /**
   * @param {DraftState} state
   * @param {string} newLook
   * @returns {{
   *   cover: string;
   *   storyType: string;
   *   look: string;
   *   coverLine: string;
   *   gallery: string[];
   *   galleryLines: string[];
   *   galleryRoles: string[];
   *   style: string;
   * } | null}
   */
  function tryRestylePrompts(state, newLook) {
    const oldLook = state.prompts && typeof state.prompts.look === 'string'
      ? state.prompts.look.trim()
      : '';
    if (!oldLook || !isAlbum(oldLook, promptsDir, userAlbumsDir)) return null;
    if (!isAlbum(newLook, promptsDir, userAlbumsDir)) return null;
    const slots = [state.prompts.cover, ...state.prompts.gallery];
    if (slots.length !== state.galleryCount + 1) return null;
    /** @type {{ scene: string; frame: import('../prompts/album/frame').CopyFrame }[]} */
    const decoded = [];
    for (const prompt of slots) {
      const item = decodeFilledPrompt(String(prompt || ''), oldLook, promptsDir, userAlbumsDir);
      if (!item) return null;
      decoded.push(item);
    }
    const frames = decoded.map((item) => item.frame);
    if (!copyFramesFitSchema(frames, newLook, promptsDir, userAlbumsDir)) return null;
    try {
      const rendered = decoded.map((item) => renderAlbumPrompt(
        promptsDir,
        newLook,
        item.scene,
        item.frame,
        userAlbumsDir,
      ));
      const displayLines = frames.map((frame) => (
        frameDisplayLine(newLook, frame, promptsDir, userAlbumsDir)
      ));
      return {
        cover: rendered[0].prompt,
        storyType: state.prompts.storyType,
        look: newLook,
        coverLine: displayLines[0],
        gallery: rendered.slice(1).map((item) => item.prompt),
        galleryLines: displayLines.slice(1),
        galleryRoles: state.prompts.galleryRoles,
        style: rendered[0].style,
      };
    } catch {
      return null;
    }
  }

  /**
   * @param {DraftState} state
   * @param {string} requestedLook
   * @returns {'plan' | 'restyle' | 'draw'}
   */
  function promptWorkKind(state, requestedLook) {
    const stampedLook = state.prompts && typeof state.prompts.look === 'string'
      ? state.prompts.look.trim()
      : '';
    const look = requestedLook || stampedLook;
    if (!hasStampedPrompts(state) || copyIsStale(state)) return 'plan';
    if (!look || look === stampedLook) return 'draw';
    return tryRestylePrompts(state, look) ? 'restyle' : 'plan';
  }

  /**
   * @param {string} step
   */
  function setJobRunning(step) {
    if (!store) return;
    const state = store.read();
    state.job = { running: true, step, error: '' };
    store.write(state);
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
      if (!store) throw new Error('没有这一篇');
      const initial = store.read();
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
        const current = store.read();
        const previous = readImageSlot(current, job.slot, job.index);
        const attempts = Number.isInteger(previous.attempts) ? previous.attempts : 0;
        const stepName = job.slot === 'cover' ? 'cover' : `gallery-${String(job.index).padStart(2, '0')}`;
        const pending = typeof previous.idempotencyKey === 'string' ? previous.idempotencyKey.trim() : '';
        // 失败未取回时复用同一把 key；成功后再抽才 gen+1。
        const key = pending || imageGenKey(currentId, stepName, attempts + 1);
        const file = nextImageFile(job.slot, job.index, previous.versions);
        const pick = job.slot === 'cover'
          ? current.picks.cover
          : (current.picks.gallery[job.index - 1] || uploadRefRules.emptySlotPick());
        const composed = composeImagePrompt(job.prompt, {
          promptsDir,
          look,
          userAlbumsDir,
          userImageRefsDir,
          postDir: currentDir,
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
          store.write(current);
          continue;
        }
        setImageSlot(current, job.slot, job.index, {
          ...previous,
          status: '生成中',
          idempotencyKey: key,
        });
        current.job = { running: true, step: job.label, error: '' };
        store.write(current);
        const outputPath = path.join(currentDir, file);
        try {
          await generateImage({
            prompt: composed.prompt,
            outputPath,
            aspectRatio,
            idempotencyKey: key,
            ...(composed.references.length > 0 ? { references: composed.references } : {}),
          });
          const done = store.read();
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
          store.write(done);
        } catch (err) {
          failed += 1;
          const code = errorCode(err);
          const expired = code === 'OUTPUT_EXPIRED';
          const flagged = code === 'CONTENT_FLAGGED';
          lastFailKind = flagged ? 'flagged' : (expired ? 'expired' : 'replay');
          lastError = errorMessage(err, '生图失败');
          fs.rmSync(outputPath, { force: true });
          const failedState = store.read();
          const base = readImageSlot(failedState, job.slot, job.index);
          setImageSlot(failedState, job.slot, job.index, {
            ...base,
            status: base.versions.length > 0 ? '成功' : '失败',
            // 过期 / 敏感：清 key 且 attempts+1，禁止原样取回；其它失败保留 pending key。
            attempts: (expired || flagged) ? attempts + 1 : attempts,
            idempotencyKey: (expired || flagged) ? '' : key,
          });
          failedState.job = { running: true, step: job.label, error: '' };
          store.write(failedState);
        }
      }
      const finished = store.read();
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
    return {
      ok: true,
      ...state,
      ...aspectPublicFields(state),
      editor: editorFromState(state),
      directory: currentDir,
      id: currentId,
    };
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
    return { ok: true, posts: listPosts(postsDir, promptsDir, userAlbumsDir) };
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
    store.write(state);
    return { ok: true };
  }

  /**
   * @param {ReturnType<typeof validateInputs> & { ok: true }} checked
   * @param {Record<string, unknown>} payload
   * @param {string} articleType
   * @param {string} persona
   */
  function acceptGenerateDraft(checked, payload, articleType, persona) {
    if (!store) usePost(allocatePost(postsDir, now()));
    if (!store) {
      lock = null;
      return { ok: false, message: '没有这一篇' };
    }
    const state = store.read();
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
    store.write(state);
    runGenerateDraft({ ...checked, articleType, persona }).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true, id: currentId };
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
    if (albumLook && !isAlbum(albumLook, promptsDir, userAlbumsDir)) {
      return { ok: false, message: '图册不在允许列表', field: 'look' };
    }
    if (albumLook) {
      const lookMeta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(albumLook);
      if (lookMeta.safetyStatus === 'flagged') {
        return { ok: false, message: '这套风格未通过安全审核，不能用于生图', field: 'look' };
      }
    }
    if (!state.draft) return { ok: false, message: '还没有稿面' };
    const faceMessage = validateDraftFace(state.draft);
    if (faceMessage) return { ok: false, message: faceMessage };
    state.draft = normalizeFace(state.draft);
    lock = 'generatePrompts';
    state.job = { running: true, step: '定画面', error: '' };
    store.write(state);
    runGeneratePrompts(albumLook || undefined).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  function listAlbums() {
    const catalog = loadAlbumCatalog(promptsDir, userAlbumsDir);
    return {
      ok: true,
      albums: catalog.list().map((meta) => {
        const samplePath = albumSamplePath(meta.id, promptsDir, userAlbumsDir);
        const aspectRatio = ensureAlbumAspectRatio(promptsDir, userAlbumsDir, meta.id);
        return {
          id: meta.id,
          label: meta.label,
          hint: meta.hint,
          kind: meta.kind,
          samplePath,
          hasSample: fs.existsSync(albumSampleFile(promptsDir, meta.id, userAlbumsDir)),
          deletable: meta.source === 'user',
          aspectRatio,
          aspectRatioCss: cssAspectRatio(aspectRatio),
          safetyStatus: meta.safetyStatus,
          safetyProbed: meta.safetyProbed,
        };
      }),
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function setAspectRatio(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const ratio = normalizeAspectRatio(source.aspectRatio);
    if (!ratio) return { ok: false, message: '比例不在七档里' };
    const state = store.read();
    state.aspectRatioLocked = ratio;
    store.write(state);
    return { ok: true, ...aspectPublicFields(state) };
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
    if (!userAlbumsDir) return { ok: false, message: '缺少用户图册目录' };
    const learnedFrom = xhsNoteProvenance.normalizeXhsProvenance(source.source);
    lock = 'learnAlbum';
    const vis = visionStepKey('album-learn', image.dataUrl);
    const probeDir = path.join(path.dirname(userAlbumsDir), 'temp', 'album-probe');
    const probeSample = path.join(probeDir, `sample-${vis.key.slice(-16)}${image.ext}`);
    const probeOut = path.join(probeDir, `out-${vis.key.slice(-16)}.png`);
    try {
      // 先探针：最短提示 + 仅本图；过审才识图学词。
      fs.mkdirSync(probeDir, { recursive: true });
      fs.writeFileSync(probeSample, image.bytes);
      try {
        await generateImage({
          prompt: '生成一张类似的图',
          outputPath: probeOut,
          aspectRatio: normalizeAspectRatio(aspectRatioFromImage(image.bytes)) || DEFAULT_ASPECT_RATIO,
          references: [{ role: 'template', path: probeSample }],
          idempotencyKey: `album-probe:${vis.key}`,
        });
      } catch (probeErr) {
        if (errorCode(probeErr) === 'CONTENT_FLAGGED') {
          const saved = commitFlaggedAlbumDraft(
            userAlbumsDir,
            {
              sampleBytes: image.bytes,
              sampleExt: image.ext,
              learnedFrom: learnedFrom || null,
            },
            promptsDir,
          );
          if (
            learnedFrom
            && learnedFrom.kind === 'xhs-note'
            && userXhsNotesDir
            && learnedFrom.linkId
          ) {
            xhsNoteLinks.attachLearnedAlbum(
              userXhsNotesDir,
              learnedFrom.linkId,
              saved.id,
              learnedFrom.role || 'image',
            );
          }
          return {
            ok: true,
            safetyStatus: 'flagged',
            album: {
              id: saved.id,
              label: saved.label,
              safetyStatus: 'flagged',
              safetyProbed: true,
            },
            message: '这张图未通过安全审核，已入库但不能用于生图',
          };
        }
        return { ok: false, message: formatModelError(probeErr, '检查这张图失败') };
      }

      const system = readLearnSystemPrompt(promptsDir);
      const raw = await completeVision({ text: system, dataUrl: image.dataUrl }, { idempotencyKey: vis.key });
      albumDraftSeq += 1;
      const draftId = `draft-${albumDraftSeq}`;
      const draft = buildAlbumDraft(promptsDir, raw, image, draftId, userAlbumsDir);
      if (learnedFrom) draft.learnedFrom = learnedFrom;
      albumDraft = draft;
      return { ok: true, safetyStatus: 'passed', draft: draftPublicView(draft) };
    } catch (err) {
      rememberVisionFailure(vis.step);
      return { ok: false, message: formatModelError(err, '学习失败') };
    } finally {
      fs.rmSync(probeSample, { force: true });
      fs.rmSync(probeOut, { force: true });
      lock = null;
    }
  }

  /**
   * @param {string} promptMd
   * @param {string} kind
   * @param {string} schema
   * @returns {string}
   */
  function validatedPromptTemplate(promptMd, kind, schema) {
    const text = String(promptMd || '').trim();
    if (!text) throw new Error('绘图题词是空的');
    assertPromptSheet(text);
    assertPromptPlaceholders(kind, text, schema);
    return text;
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function commitAlbum(payload) {
    if (!albumDraft) return { ok: false, message: '没有可写入的草稿' };
    if (lock) return busy();
    if (!userAlbumsDir) return { ok: false, message: '缺少用户图册目录' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const draftId = typeof source.draftId === 'string' ? source.draftId.trim() : '';
    if (draftId && draftId !== albumDraft.draftId) {
      return { ok: false, message: '草稿已过期，请重新学习' };
    }
    try {
      if (typeof source.promptTemplate === 'string') {
        albumDraft.promptMd = validatedPromptTemplate(
          source.promptTemplate,
          albumDraft.kind,
          albumDraft.copySchema,
        );
      }
      const learnedFrom = albumDraft.learnedFrom || null;
      const result = commitAlbumDraft(userAlbumsDir, albumDraft, promptsDir);
      albumDraft = null;
      if (
        learnedFrom
        && learnedFrom.kind === 'xhs-note'
        && userXhsNotesDir
        && learnedFrom.linkId
      ) {
        xhsNoteLinks.attachLearnedAlbum(
          userXhsNotesDir,
          learnedFrom.linkId,
          result.id,
          learnedFrom.role || 'image',
        );
      }
      return { ok: true, id: result.id };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '写入失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function updateAlbumPrompt(payload) {
    if (lock) return busy();
    if (!userAlbumsDir) return { ok: false, message: '缺少用户图册目录' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明图册' };
    if (isBuiltinAlbum(id)) return { ok: false, message: '出厂图册不能修改' };
    if (!isAlbum(id, promptsDir, userAlbumsDir)) {
      return { ok: false, message: '图册不在允许列表' };
    }
    if (albumBusy(id)) {
      return { ok: false, message: '这本图册正在用于生成，请等这一轮结束' };
    }
    try {
      const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(id);
      if (meta.source !== 'user') {
        return { ok: false, message: '出厂图册不能修改' };
      }
      if (meta.safetyStatus === 'flagged') {
        return { ok: false, message: '未通过审核的风格不能改怎么画' };
      }
      const promptMd = validatedPromptTemplate(
        typeof source.promptTemplate === 'string' ? source.promptTemplate : '',
        meta.kind,
        meta.copySchema,
      );
      updateAlbumPromptMd(promptsDir, userAlbumsDir, id, promptMd);
      return { ok: true, id };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '保存失败' };
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
      deleteAlbumFiles(promptsDir, userAlbumsDir, id);
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
    if (!isAlbum(id, promptsDir, userAlbumsDir)) return { ok: false, message: '图册不在允许列表' };
    const abs = albumSampleFile(promptsDir, id, userAlbumsDir);
    if (!fs.existsSync(abs)) return { ok: false, message: '没有样图' };
    const bytes = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = ext === '.png'
      ? 'image/png'
      : (ext === '.webp'
        ? 'image/webp'
        : (ext === '.bmp' ? 'image/bmp' : 'image/jpeg'));
    return { ok: true, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function getAlbumDetail(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!isAlbum(id, promptsDir, userAlbumsDir)) return { ok: false, message: '图册不在允许列表' };
    const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(id);
    let promptTemplate = '';
    try {
      promptTemplate = readAlbumPromptText(promptsDir, id, userAlbumsDir);
    } catch {
      return { ok: false, message: '找不到图册题词' };
    }
    const aspectRatio = ensureAlbumAspectRatio(promptsDir, userAlbumsDir, id);
    /** @type {Record<string, unknown>} */
    const detail = {
      ok: true,
      id: meta.id,
      label: meta.label,
      hint: meta.hint,
      editable: meta.source === 'user' && meta.safetyStatus !== 'flagged',
      hasSample: fs.existsSync(albumSampleFile(promptsDir, id, userAlbumsDir)),
      promptSheetVersion: meta.promptSheetVersion,
      promptTemplate,
      aspectRatio,
      aspectRatioCss: cssAspectRatio(aspectRatio),
      safetyStatus: meta.safetyStatus,
      safetyProbed: meta.safetyProbed,
    };
    if (meta.learnedFrom) detail.source = meta.learnedFrom;
    return detail;
  }

  /**
   * @param {ImageOnly} only
   * @param {string} [requestedLook]
   */
  async function runRefreshThenDraw(only, requestedLook) {
    try {
      if (!store) throw new Error('没有这一篇');
      const state = store.read();
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
    if (!store) {
      lock = null;
      return { ok: false, message: '没有这一篇' };
    }
    const state = store.read();
    const kind = promptWorkKind(state, requestedLook || '');
    state.job = {
      running: true,
      step: kind === 'plan'
        ? '定画面'
        : (only.slot === 'cover' ? '封面' : `配图 ${only.index}`),
      error: '',
    };
    store.write(state);
    runRefreshThenDraw(only, requestedLook).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  async function generateImages(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const only = requestedSlot(source);
    if (!only) return { ok: false, message: '要指明封面或配图序号' };
    const state = store.read();
    applyPromptText(state, source);
    applyPromptEdits(state, source);
    const albumLook = typeof source.look === 'string' ? source.look.trim() : '';
    if (albumLook && !isAlbum(albumLook, promptsDir, userAlbumsDir)) {
      store.write(state);
      return { ok: false, message: '图册不在允许列表', field: 'look' };
    }
    const reason = slotBlockReason(state, only);
    if (reason) {
      store.write(state);
      return { ok: false, message: reason };
    }
    store.write(state);
    return withEntitlement('generateImages', () => acceptGenerateImages(only, albumLook));
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  async function retryImage(payload) {
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
    /** @type {ImageOnly} */
    const only = slot === 'cover' ? { slot: 'cover', index: 0 } : { slot: 'gallery', index };
    return withEntitlement('retryImage', () => acceptGenerateImages(only));
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
    if (!currentDir) return { ok: false, message: '没有这一篇' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const file = imageFileFor(source);
    const abs = file ? path.join(currentDir, file) : currentDir;
    const target = file && fs.existsSync(abs) ? abs : currentDir;
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

  /**
   * @param {Record<string, unknown>} payload
   */
  function addUploadRef(payload) {
    if (!store || !currentDir) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    uploadRefFiles.migratePostUploadRefsLayout(currentDir);
    const state = store.read();
    if (state.uploadRefs.length >= uploadRefRules.MAX_UPLOAD_REFS_PER_POST) {
      return {
        ok: false,
        message: `一篇最多囤 ${uploadRefRules.MAX_UPLOAD_REFS_PER_POST} 张上传参考`,
      };
    }
    const source = payload && typeof payload === 'object' ? payload : {};
    const usageCheck = uploadRefRules.validateUsage(source.usage);
    if (!usageCheck.ok) return usageCheck;
    /** @type {ReturnType<typeof normalizeReferenceImage>} */
    let image;
    try {
      image = normalizeReferenceImage(source);
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '上传参考图不合格' };
    }
    try {
      const item = uploadRefFiles.writePostUploadRef(currentDir, image, usageCheck.usage);
      state.uploadRefs = state.uploadRefs.concat([item]);
      state.picks = uploadRefRules.addUploadRefToAllPicks(state.picks, item.id);
      store.write(state);
      return { ok: true, uploadRef: item, uploadRefs: state.uploadRefs, picks: state.picks };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '上传失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function updateUploadRefUsage(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明上传参考' };
    const usageCheck = uploadRefRules.validateUsage(source.usage);
    if (!usageCheck.ok) return usageCheck;
    const state = store.read();
    const index = state.uploadRefs.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, message: '没有这条上传参考' };
    const next = state.uploadRefs.slice();
    next[index] = { ...next[index], usage: usageCheck.usage };
    state.uploadRefs = next;
    store.write(state);
    return { ok: true, uploadRefs: state.uploadRefs, picks: state.picks };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function deleteUploadRef(payload) {
    if (!store || !currentDir) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明上传参考' };
    const state = store.read();
    const item = state.uploadRefs.find((entry) => entry.id === id);
    if (!item) return { ok: false, message: '没有这条上传参考' };
    uploadRefFiles.deletePostUploadRefFile(currentDir, item.fileName);
    state.uploadRefs = state.uploadRefs.filter((entry) => entry.id !== id);
    state.picks = uploadRefRules.removeUploadRefFromPicks(state.picks, id);
    store.write(state);
    return { ok: true, uploadRefs: state.uploadRefs, picks: state.picks };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function setSlotPick(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const only = requestedSlot(source);
    if (!only) return { ok: false, message: '要指明封面或配图序号' };
    const state = store.read();
    if (only.slot === 'gallery' && only.index > state.galleryCount) {
      return { ok: false, message: '没有这一张配图' };
    }
    if (Array.isArray(source.materialIds)
      && source.materialIds.length > uploadRefRules.MAX_APPLIED_UPLOAD_REFS) {
      return { ok: false, message: uploadRefRules.APPLY_LIMIT_MESSAGE };
    }
    const pick = uploadRefRules.normalizeSlotPick({
      materialIds: source.materialIds,
      overrides: source.overrides,
    });
    /** @type {Set<string>} */
    const known = new Set(state.uploadRefs.map((item) => item.id));
    for (const id of pick.materialIds) {
      if (!known.has(id)) return { ok: false, message: '勾选了不存在的上传参考' };
    }
    if (only.slot === 'cover') {
      state.picks.cover = pick;
    } else {
      const gallery = state.picks.gallery.slice();
      while (gallery.length < only.index) gallery.push(uploadRefRules.emptySlotPick());
      gallery[only.index - 1] = pick;
      state.picks.gallery = gallery;
    }
    state.picks = uploadRefRules.normalizePicks(state.picks, state.galleryCount);
    store.write(state);
    return { ok: true, picks: state.picks, uploadRefs: state.uploadRefs };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function previewUploadRef(payload) {
    if (!currentDir) return { ok: false, message: '没有这一篇' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id || !store) return { ok: false, message: '没有这条上传参考' };
    uploadRefFiles.migratePostUploadRefsLayout(currentDir);
    const state = store.read();
    const item = state.uploadRefs.find((entry) => entry.id === id);
    if (!item) return { ok: false, message: '没有这条上传参考' };
    const preview = uploadRefFiles.readPostUploadRefPreview(currentDir, item.fileName);
    if (!preview) return { ok: false, message: '找不到上传参考文件' };
    return { ok: true, dataUrl: preview.dataUrl };
  }

  function listLibraryUploadRefs() {
    if (!userUploadRefsDir) return { ok: true, uploadRefs: [] };
    return {
      ok: true,
      uploadRefs: uploadRefFiles.listLibraryUploadRefs(userUploadRefsDir).map((item) => ({
        id: item.id,
        usage: item.usage,
        createdAt: item.createdAt,
      })),
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function previewLibraryUploadRef(payload) {
    if (!userUploadRefsDir) return { ok: false, message: '缺少上传参考库目录' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明上传参考' };
    const preview = uploadRefFiles.readLibraryUploadRefPreview(userUploadRefsDir, id);
    if (!preview) return { ok: false, message: '库里没有这条上传参考' };
    return { ok: true, dataUrl: preview.dataUrl, usage: preview.usage };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  async function draftUploadRefUsage(payload) {
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    /** @type {ReturnType<typeof normalizeReferenceImage>} */
    let image;
    try {
      image = normalizeReferenceImage(source);
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '上传参考图不合格' };
    }
    lock = 'draftUploadRefUsage';
    const vis = visionStepKey('upload-ref', image.dataUrl);
    try {
      const system = uploadRefFiles.readUploadRefUsageSystemPrompt(promptsDir);
      const raw = await completeVision({ text: system, dataUrl: image.dataUrl }, { idempotencyKey: vis.key });
      const data = parseJsonObject(raw);
      const usageCheck = uploadRefRules.validateUsage(
        typeof data.usage === 'string' ? data.usage : '',
      );
      if (!usageCheck.ok) {
        return { ok: false, message: '识图没有写出可用的用法句，请手写' };
      }
      return { ok: true, usage: usageCheck.usage };
    } catch (err) {
      rememberVisionFailure(vis.step);
      return { ok: false, message: formatModelError(err, '识图失败') };
    } finally {
      lock = null;
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function saveUploadRefToLibrary(payload) {
    if (!store || !currentDir) return { ok: false, message: '没有这一篇' };
    if (!userUploadRefsDir) return { ok: false, message: '缺少上传参考库目录' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明上传参考' };
    const state = store.read();
    const index = state.uploadRefs.findIndex((entry) => entry.id === id);
    if (index < 0) return { ok: false, message: '没有这条上传参考' };
    const item = state.uploadRefs[index];
    const usageCheck = uploadRefRules.validateUsage(
      typeof source.usage === 'string' ? source.usage : item.usage,
    );
    if (!usageCheck.ok) return usageCheck;
    try {
      const saved = uploadRefFiles.saveUploadRefToLibrary(
        userUploadRefsDir,
        currentDir,
        { ...item, usage: usageCheck.usage },
      );
      const next = state.uploadRefs.slice();
      next[index] = { ...item, usage: usageCheck.usage, libraryId: saved.id };
      state.uploadRefs = next;
      store.write(state);
      return { ok: true, id: saved.id, usage: saved.usage, uploadRefs: state.uploadRefs };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '存进库失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function pickLibraryUploadRef(payload) {
    if (!store || !currentDir) return { ok: false, message: '没有这一篇' };
    if (!userUploadRefsDir) return { ok: false, message: '缺少上传参考库目录' };
    if (lock) return busy();
    uploadRefFiles.migratePostUploadRefsLayout(currentDir);
    const state = store.read();
    if (state.uploadRefs.length >= uploadRefRules.MAX_UPLOAD_REFS_PER_POST) {
      return {
        ok: false,
        message: `一篇最多囤 ${uploadRefRules.MAX_UPLOAD_REFS_PER_POST} 张上传参考`,
      };
    }
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明上传参考' };
    try {
      const item = uploadRefFiles.pickLibraryUploadRefIntoPost(userUploadRefsDir, currentDir, id);
      state.uploadRefs = state.uploadRefs.concat([item]);
      state.picks = uploadRefRules.addUploadRefToAllPicks(state.picks, item.id);
      store.write(state);
      return { ok: true, uploadRef: item, uploadRefs: state.uploadRefs, picks: state.picks };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '从库挑失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function deleteLibraryUploadRef(payload) {
    if (!userUploadRefsDir) return { ok: false, message: '缺少上传参考库目录' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明上传参考' };
    try {
      uploadRefFiles.deleteLibraryUploadRef(userUploadRefsDir, id);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '删除失败' };
    }
  }

  /**
   * 资料库直建上传参考，不依赖当前篇。
   * @param {Record<string, unknown>} payload
   */
  function addLibraryUploadRef(payload) {
    if (!userUploadRefsDir) return { ok: false, message: '缺少上传参考库目录' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const usageCheck = uploadRefRules.validateUsage(source.usage);
    if (!usageCheck.ok) return usageCheck;
    /** @type {ReturnType<typeof normalizeReferenceImage>} */
    let image;
    try {
      image = normalizeReferenceImage(source);
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '上传参考图不合格' };
    }
    try {
      uploadRefFiles.migrateLibraryUploadRefsLayout(userUploadRefsDir);
      const saved = uploadRefFiles.writeLibraryUploadRef(
        userUploadRefsDir,
        image,
        usageCheck.usage,
      );
      return {
        ok: true,
        id: saved.id,
        usage: saved.usage,
        createdAt: saved.createdAt,
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '入库失败' };
    }
  }

  function listLibraryArticleSamples() {
    if (!userArticleSamplesDir) return { ok: true, samples: [] };
    return {
      ok: true,
      samples: articleSamplesStore.listArticleSamples(userArticleSamplesDir).map((item) => (
        articleSamplesStore.publicListItem(item)
      )),
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function getLibraryArticleSample(payload) {
    if (!userArticleSamplesDir) return { ok: false, message: '缺少范文库目录' };
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    const meta = articleSamplesStore.readArticleSample(userArticleSamplesDir, id);
    if (!meta) return { ok: false, message: '库里没有这篇范文' };
    return { ok: true, sample: meta };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function saveLibraryArticleSample(payload) {
    if (!userArticleSamplesDir) return { ok: false, message: '缺少范文库目录' };
    try {
      const saved = articleSamplesStore.saveArticleSample(userArticleSamplesDir, {
        id: typeof payload.id === 'string' ? payload.id : '',
        title: payload.title,
        body: payload.body,
      });
      return { ok: true, sample: articleSamplesStore.publicListItem(saved) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '保存失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function deleteLibraryArticleSample(payload) {
    if (!userArticleSamplesDir) return { ok: false, message: '缺少范文库目录' };
    try {
      const id = typeof payload.id === 'string' ? payload.id : '';
      articleSamplesStore.deleteArticleSample(userArticleSamplesDir, id);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '删除失败' };
    }
  }

  function listLibraryReferenceDocs() {
    if (!userReferenceDocsDir) return { ok: true, docs: [] };
    return {
      ok: true,
      docs: referenceDocsStore.listReferenceDocs(userReferenceDocsDir).map((item) => (
        referenceDocsStore.publicListItem(item)
      )),
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function getLibraryReferenceDoc(payload) {
    if (!userReferenceDocsDir) return { ok: false, message: '缺少参考资料库目录' };
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    const meta = referenceDocsStore.readReferenceDoc(userReferenceDocsDir, id);
    if (!meta) return { ok: false, message: '库里没有这条参考资料' };
    return { ok: true, doc: meta };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function saveLibraryReferenceDoc(payload) {
    if (!userReferenceDocsDir) return { ok: false, message: '缺少参考资料库目录' };
    try {
      const saved = referenceDocsStore.saveReferenceDoc(userReferenceDocsDir, {
        id: typeof payload.id === 'string' ? payload.id : '',
        name: payload.name,
        body: payload.body,
      });
      // 返回完整条目（含 body），加一条去重后才能用库里的名称快照。
      return { ok: true, doc: saved };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '保存失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function deleteLibraryReferenceDoc(payload) {
    if (!userReferenceDocsDir) return { ok: false, message: '缺少参考资料库目录' };
    try {
      const id = typeof payload.id === 'string' ? payload.id : '';
      referenceDocsStore.deleteReferenceDoc(userReferenceDocsDir, id);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '删除失败' };
    }
  }

  /**
   * 打开进料弹层时探测本机 Chrome 扩展取料通道与版本。
   */
  async function checkXhsNoteBridge() {
    const result = await checkBridgeFn();
    if (result.ok) {
      return {
        ok: true,
        version: result.version,
        minVersion: result.minVersion,
      };
    }
    return {
      ok: false,
      code: result.code,
      message: result.message,
      version: result.version || '',
      minVersion: result.minVersion,
    };
  }

  /**
   * 组装 resolve 成功回包：预览图优先 cache，缺再 CDN，并回写 cache 图片。
   * @param {string} inputUrl
   * @param {import('../xhs-note/split').NoteImportPayload} note
   * @param {string} noteId
   */
  async function buildResolveOkResult(inputUrl, note, noteId) {
    const parts = xhsNoteSplit.splitNoteParts(note);
    /** @type {string} */
    let coverUrl = '';
    /** @type {string} */
    let coverPreviewUrl = '';
    if (parts.cover && parts.cover.url) {
      coverUrl = parts.cover.url;
      if (userXhsNotesCacheDir) {
        coverPreviewUrl = xhsNoteCache.readImageDataUrl(userXhsNotesCacheDir, noteId, 'cover');
      }
      if (!coverPreviewUrl) {
        const coverDownloaded = await xhsNoteDownload.downloadNoteImage(coverUrl, {
          mime: parts.cover.mime || '',
          fetchFn: fetchImpl || globalThis.fetch,
        });
        if (coverDownloaded && coverDownloaded.dataUrl) {
          coverPreviewUrl = coverDownloaded.dataUrl;
          if (userXhsNotesCacheDir) {
            xhsNoteCache.writeImageDataUrl(
              userXhsNotesCacheDir,
              noteId,
              'cover',
              coverPreviewUrl,
            );
          }
        }
      }
    }

    /** @type {{ index: number; url: string; role: string; mime: string; previewUrl: string }[]} */
    const inners = [];
    for (let index = 0; index < parts.inners.length; index += 1) {
      const img = parts.inners[index];
      /** @type {string} */
      let previewUrl = '';
      // 多内页勾选网格才准备内页预览；单张不展示缩略网格
      if (parts.inners.length > 1 && img.url) {
        if (userXhsNotesCacheDir) {
          previewUrl = xhsNoteCache.readImageDataUrl(
            userXhsNotesCacheDir,
            noteId,
            `inner-${index}`,
          );
        }
        if (!previewUrl) {
          const downloaded = await xhsNoteDownload.downloadNoteImage(img.url, {
            mime: img.mime || '',
            fetchFn: fetchImpl || globalThis.fetch,
          });
          if (downloaded && downloaded.dataUrl) {
            previewUrl = downloaded.dataUrl;
            if (userXhsNotesCacheDir) {
              xhsNoteCache.writeImageDataUrl(
                userXhsNotesCacheDir,
                noteId,
                `inner-${index}`,
                previewUrl,
              );
            }
          }
        }
      }
      inners.push({
        index,
        url: img.url,
        role: img.role || 'image',
        mime: img.mime || '',
        previewUrl,
      });
    }
    return {
      ok: true,
      inputUrl,
      note,
      fromCache: false,
      parts: {
        title: parts.title,
        body: parts.body,
        tagOnlyBody: xhsNoteSplit.isTagOnlyBody(parts.body),
        hasCover: Boolean(parts.cover),
        coverUrl,
        coverPreviewUrl,
        innerCount: parts.inners.length,
        inners,
      },
    };
  }

  /**
   * 粘贴链接：已收录则停；有 cache 则直接拼勾选层（不调插件）；否则取料并立刻写 cache。
   * @param {Record<string, unknown>} payload
   */
  async function resolveXhsNote(payload) {
    if (!userXhsNotesDir) return { ok: false, code: 'INTERNAL', message: '缺少小红书链接库目录' };
    const url = xhsNoteLinks.trimUrl(payload.url);
    if (!url) {
      return {
        ok: false,
        code: 'INVALID_URL',
        message: xhsNoteBridge.humanError('INVALID_URL'),
      };
    }
    if (xhsNoteBusyKey) {
      return {
        ok: false,
        code: 'IMPORTING',
        message: xhsNoteBridge.humanError('IMPORTING'),
      };
    }
    const known = xhsNoteLinks.findXhsNoteLinkByUrl(userXhsNotesDir, url);
    if (known) {
      return {
        ok: false,
        code: 'ALREADY',
        message: xhsNoteBridge.humanError('ALREADY'),
        link: {
          id: known.id,
          noteId: known.noteId,
          sourceUrl: known.sourceUrl,
          title: known.title,
        },
      };
    }

    const pastedNoteId = xhsNoteId.extractXhsNoteId(url);
    if (pastedNoteId && userXhsNotesCacheDir) {
      const cachedRaw = xhsNoteCache.readNotePayload(userXhsNotesCacheDir, pastedNoteId);
      const cachedNote = xhsNoteSplit.normalizeNotePayload(cachedRaw);
      if (cachedNote) {
        const knownCached = xhsNoteLinks.findXhsNoteLinkByNoteId(userXhsNotesDir, pastedNoteId);
        if (knownCached) {
          xhsNoteLinks.rememberInputUrl(userXhsNotesDir, knownCached.sourceUrl, url);
          return {
            ok: false,
            code: 'ALREADY',
            message: xhsNoteBridge.humanError('ALREADY'),
            link: {
              id: knownCached.id,
              noteId: knownCached.noteId,
              sourceUrl: knownCached.sourceUrl,
              title: knownCached.title,
            },
          };
        }
        xhsNoteBusyKey = url;
        try {
          const result = await buildResolveOkResult(url, cachedNote, pastedNoteId);
          return { ...result, fromCache: true };
        } finally {
          xhsNoteBusyKey = '';
        }
      }
    }

    xhsNoteBusyKey = url;
    try {
      const fetched = await fetchNoteByUrl(url);
      if (!fetched.ok) {
        return {
          ok: false,
          code: fetched.code,
          message: fetched.message || xhsNoteBridge.humanError(fetched.code),
        };
      }
      const note = fetched.note;
      const noteId = xhsNoteId.extractXhsNoteId(note.sourceUrl);
      if (!noteId) {
        return {
          ok: false,
          code: 'INVALID_URL',
          message: '取料回包缺少可识别的笔记 ID',
        };
      }
      const knownAfter = xhsNoteLinks.findXhsNoteLinkByNoteId(userXhsNotesDir, noteId)
        || xhsNoteLinks.findXhsNoteLinkByUrl(userXhsNotesDir, note.sourceUrl);
      if (knownAfter) {
        xhsNoteLinks.rememberInputUrl(userXhsNotesDir, knownAfter.sourceUrl, url);
        return {
          ok: false,
          code: 'ALREADY',
          message: xhsNoteBridge.humanError('ALREADY'),
          link: {
            id: knownAfter.id,
            noteId: knownAfter.noteId,
            sourceUrl: knownAfter.sourceUrl,
            title: knownAfter.title,
          },
        };
      }
      if (userXhsNotesCacheDir) {
        xhsNoteCache.writeNotePayload(userXhsNotesCacheDir, noteId, note);
      }
      const result = await buildResolveOkResult(url, note, noteId);
      return { ...result, fromCache: false };
    } finally {
      xhsNoteBusyKey = '';
    }
  }

  /**
   * 确认勾选后：写瘦链接 meta + cache；不写范文（留给 saveXhsNoteArticle）；返回待学图队列。
   * @param {Record<string, unknown>} payload
   */
  async function importXhsNote(payload) {
    if (!userXhsNotesDir) return { ok: false, code: 'INTERNAL', message: '缺少小红书链接库目录' };
    if (!userXhsNotesCacheDir) {
      return { ok: false, code: 'INTERNAL', message: '缺少小红书笔记缓存目录' };
    }
    const inputUrl = xhsNoteLinks.trimUrl(payload.url);
    const note = xhsNoteSplit.normalizeNotePayload(payload.note);
    if (!inputUrl || !note) {
      return {
        ok: false,
        code: 'INVALID_URL',
        message: xhsNoteBridge.humanError('INVALID_URL'),
      };
    }
    const noteId = xhsNoteId.extractXhsNoteId(note.sourceUrl);
    if (!noteId) {
      return {
        ok: false,
        code: 'INVALID_URL',
        message: '无法从链接识别小红书笔记 ID',
      };
    }
    if (xhsNoteBusyKey) {
      return {
        ok: false,
        code: 'IMPORTING',
        message: xhsNoteBridge.humanError('IMPORTING'),
      };
    }
    const known = xhsNoteLinks.findXhsNoteLinkByNoteId(userXhsNotesDir, noteId)
      || xhsNoteLinks.findXhsNoteLinkByUrl(userXhsNotesDir, note.sourceUrl)
      || xhsNoteLinks.findXhsNoteLinkByUrl(userXhsNotesDir, inputUrl);
    if (known) {
      xhsNoteLinks.rememberInputUrl(userXhsNotesDir, known.sourceUrl, inputUrl);
      return {
        ok: false,
        code: 'ALREADY',
        message: xhsNoteBridge.humanError('ALREADY'),
        link: {
          id: known.id,
          noteId: known.noteId,
          sourceUrl: known.sourceUrl,
          title: known.title,
        },
      };
    }
    const learnArticle = payload.learnArticle === true;
    const learnCover = payload.learnCover === true;
    const learnInner = payload.learnInner === true;
    if (!learnArticle && !learnCover && !learnInner) {
      return { ok: false, code: 'INTERNAL', message: '请至少选择学习文章、首图或内页中的一项' };
    }
    const parts = xhsNoteSplit.splitNoteParts(note);
    if (learnArticle && !parts.body) {
      return { ok: false, code: 'INTERNAL', message: '这篇没有正文可学' };
    }
    if (learnCover && !parts.cover) {
      return { ok: false, code: 'INTERNAL', message: '这篇没有首图可学' };
    }
    const innerIndex = Number.isInteger(payload.innerIndex)
      ? /** @type {number} */ (payload.innerIndex)
      : 0;
    const inner = learnInner ? xhsNoteSplit.pickInnerImage(parts, innerIndex) : null;
    if (learnInner && !inner) {
      return { ok: false, code: 'INTERNAL', message: '这篇没有内页可学' };
    }

    const coverDataUrl = typeof payload.coverDataUrl === 'string' ? payload.coverDataUrl.trim() : '';
    const innerDataUrl = typeof payload.innerDataUrl === 'string' ? payload.innerDataUrl.trim() : '';

    xhsNoteBusyKey = noteId;
    try {
      const link = xhsNoteLinks.saveXhsNoteLink(userXhsNotesDir, {
        noteId,
        sourceUrl: note.sourceUrl,
        inputUrl,
        title: note.title,
        fetchedAt: note.fetchedAt,
      });
      xhsNoteCache.writeNotePayload(userXhsNotesCacheDir, noteId, note);

      /** @type {{
       *   role: string;
       *   label: string;
       *   dataUrl: string;
       *   source: import('../xhs-note/provenance').XhsNoteProvenance;
       * }[]} */
      const learnImages = [];
      /**
       * @param {string} remoteUrl
       * @param {{ mime?: string }} [options]
       */
      const downloadFn = async (remoteUrl, options) => xhsNoteDownload.downloadNoteImage(remoteUrl, {
        mime: options && options.mime,
        fetchFn: fetchImpl || globalThis.fetch,
      });

      if (learnCover && parts.cover) {
        const dataUrl = await xhsNoteCache.resolveImageDataUrl({
          cacheRoot: userXhsNotesCacheDir,
          noteId,
          basename: 'cover',
          dataUrl: coverDataUrl,
          remoteUrl: parts.cover.url,
          mime: parts.cover.mime,
          downloadFn,
        });
        if (dataUrl) {
          learnImages.push({
            role: 'cover',
            label: '首图',
            dataUrl,
            source: {
              kind: 'xhs-note',
              noteId,
              linkId: link.id,
              role: 'cover',
            },
          });
        }
      }
      if (learnInner && inner) {
        const dataUrl = await xhsNoteCache.resolveImageDataUrl({
          cacheRoot: userXhsNotesCacheDir,
          noteId,
          basename: `inner-${innerIndex}`,
          dataUrl: innerDataUrl,
          remoteUrl: inner.url,
          mime: inner.mime,
          downloadFn,
        });
        if (dataUrl) {
          learnImages.push({
            role: 'inner',
            label: '内页',
            dataUrl,
            source: {
              kind: 'xhs-note',
              noteId,
              linkId: link.id,
              role: 'inner',
            },
          });
        }
      }

      // 勾选层已预览的其它内页也落进 cache，方便以后复用
      if (Array.isArray(parts.inners) && parts.inners.length > 1) {
        const previewInners = Array.isArray(payload.innerPreviews) ? payload.innerPreviews : [];
        for (let i = 0; i < parts.inners.length; i += 1) {
          if (learnInner && i === innerIndex) continue;
          const preview = previewInners.find((row) => (
            row && typeof row === 'object' && Number(/** @type {Record<string, unknown>} */ (row).index) === i
          ));
          const previewUrl = preview && typeof /** @type {Record<string, unknown>} */ (preview).previewUrl === 'string'
            ? String(/** @type {Record<string, unknown>} */ (preview).previewUrl)
            : '';
          if (previewUrl.startsWith('data:')) {
            xhsNoteCache.writeImageDataUrl(userXhsNotesCacheDir, noteId, `inner-${i}`, previewUrl);
          }
        }
      }

      return {
        ok: true,
        link: {
          id: link.id,
          noteId: link.noteId,
          sourceUrl: link.sourceUrl,
          title: link.title,
        },
        wantArticle: learnArticle,
        learnImages,
        skippedImages: (learnCover && parts.cover && !learnImages.some((i) => i.role === 'cover'))
          || (learnInner && inner && !learnImages.some((i) => i.role === 'inner')),
      };
    } finally {
      xhsNoteBusyKey = '';
    }
  }

  /**
   * 图队列结束后写范文，并回写链接 learned.articleSampleId。
   * @param {Record<string, unknown>} payload
   */
  function saveXhsNoteArticle(payload) {
    if (!userXhsNotesDir) return { ok: false, code: 'INTERNAL', message: '缺少小红书链接库目录' };
    if (!userArticleSamplesDir) return { ok: false, code: 'INTERNAL', message: '缺少范文库目录' };
    const linkId = typeof payload.linkId === 'string' ? payload.linkId.trim() : '';
    const note = xhsNoteSplit.normalizeNotePayload(payload.note);
    if (!linkId || !note) {
      return { ok: false, code: 'INVALID_URL', message: xhsNoteBridge.humanError('INVALID_URL') };
    }
    const link = xhsNoteLinks.readXhsNoteLink(userXhsNotesDir, linkId);
    if (!link) return { ok: false, code: 'INTERNAL', message: '找不到对应的笔记链接' };
    const parts = xhsNoteSplit.splitNoteParts(note);
    if (!parts.body) return { ok: false, code: 'INTERNAL', message: '这篇没有正文可学' };
    try {
      const saved = articleSamplesStore.saveArticleSample(userArticleSamplesDir, {
        title: parts.title,
        body: parts.body,
        source: {
          kind: 'xhs-note',
          noteId: link.noteId,
          linkId: link.id,
        },
      });
      xhsNoteLinks.attachLearnedArticle(userXhsNotesDir, link.id, saved.id);
      return { ok: true, articleSample: { id: saved.id, title: saved.title } };
    } catch (err) {
      return {
        ok: false,
        code: 'INTERNAL',
        message: err instanceof Error ? err.message : '写入范文失败',
      };
    }
  }

  return {
    addLibraryUploadRef,
    addUploadRef,
    chooseImage,
    commitAlbum,
    deleteAlbum,
    deleteLibraryArticleSample,
    deleteLibraryReferenceDoc,
    deleteLibraryUploadRef,
    deleteUploadRef,
    discardAlbum,
    draftUploadRefUsage,
    generateDraft,
    generateImages,
    generatePrompts,
    getAlbumDetail,
    getLibraryArticleSample,
    getLibraryReferenceDoc,
    checkXhsNoteBridge,
    importXhsNote,
    saveXhsNoteArticle,
    learnAlbum,
    listAlbums,
    listLibraryArticleSamples,
    listLibraryReferenceDocs,
    listLibraryUploadRefs,
    listPosts: catalog,
    loadLatest,
    openPost,
    pickLibraryUploadRef,
    previewAlbumSample,
    previewHistoryPost,
    previewImage,
    previewPostCover,
    previewLibraryUploadRef,
    previewUploadRef,
    resolveXhsNote,
    revealImage,
    revealPost,
    retryImage,
    saveEditor,
    saveLibraryArticleSample,
    saveLibraryReferenceDoc,
    saveUploadRefToLibrary,
    setAspectRatio,
    setSlotPick,
    startNew,
    updateAlbumPrompt,
    updateUploadRefUsage,
  };
}

module.exports = {
  BUSY_MESSAGE,
  createRunner,
  promptsBlockReason,
};
