// @ts-check
'use strict';

const path = require('node:path');

/** @type {typeof import('../llm/client')} */
const llmModule = require('../llm/client');
/** @type {typeof import('../image/generate')} */
const imageModule = require('../image/generate');
/** @type {typeof import('../prompts/fill')} */
const fillModule = require('../prompts/fill');
/** @type {typeof import('./posts')} */
const postsModule = require('./posts');
/** @type {typeof import('../upload-refs/files')} */
const uploadRefFiles = require('../upload-refs/files');
/** @type {typeof import('../xhs-note/fetch')} */
const xhsNoteFetch = require('../xhs-note/fetch');
/** @type {typeof import('../risk/match')} */
const riskMatch = require('../risk/match');
/** @type {typeof import('../../lib/dex-buddy-sdk')} */
const dexBuddySdk = require('../../lib/dex-buddy-sdk');

/** @type {typeof import('./runner/constants')} */
const constantsModule = require('./runner/constants');
/** @type {typeof import('./runner/helpers')} */
const helpersModule = require('./runner/helpers');
/** @type {typeof import('./runner/session')} */
const sessionModule = require('./runner/session');
/** @type {typeof import('./runner/draft')} */
const draftModule = require('./runner/draft');
/** @type {typeof import('./runner/albums')} */
const albumsModule = require('./runner/albums');
/** @type {typeof import('./runner/upload-refs')} */
const uploadRefsModule = require('./runner/upload-refs');
/** @type {typeof import('./runner/library-copy')} */
const libraryCopyModule = require('./runner/library-copy');
/** @type {typeof import('./runner/xhs-notes')} */
const xhsNotesModule = require('./runner/xhs-notes');
/** @type {typeof import('./runner/risk')} */
const riskModule = require('./runner/risk');

const { createLlm } = llmModule;
const { requireEntitlement: sdkRequireEntitlement } = dexBuddySdk;
const { generatePng } = imageModule;
const {
  ensureAllAlbumAspectRatios,
  migrateUserAlbumPacks,
  migrateUserAlbumsFromAssets,
} = fillModule;
const { importLegacy } = postsModule;
const { BUSY_MESSAGE } = constantsModule;
const { promptsBlockReason } = helpersModule;
const { createSession } = sessionModule;
const { attachDraft } = draftModule;
const { attachAlbums } = albumsModule;
const { attachUploadRefs } = uploadRefsModule;
const { attachLibraryCopy } = libraryCopyModule;
const { attachXhsNotes } = xhsNotesModule;
const { attachRisk } = riskModule;

/**
 * @typedef {import('./runner/context').RunnerOptions} RunnerOptions
 * @typedef {import('./runner/context').RunnerState} RunnerState
 */

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
  const userRiskDir = typeof options.userRiskDir === 'string' && options.userRiskDir.trim()
    ? path.resolve(options.userRiskDir.trim())
    : '';
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

  /** @type {RunnerState} */
  const state = {
    options,
    postsDir,
    promptsDir,
    userAlbumsDir,
    userImageRefsDir,
    userUploadRefsDir,
    userArticleSamplesDir,
    userReferenceDocsDir,
    userXhsNotesDir,
    userXhsNotesCacheDir,
    userRiskDir,
    fetchNoteByUrl,
    checkBridgeFn,
    readEnv,
    fetchImpl,
    now,
    complete,
    completeVision,
    generateImage,
    visionAttempts: new Map(),
    revealFile: options.revealFile || (() => {}),
    random: options.random || Math.random,
    factoryPack: riskMatch.loadFactoryWords(),
    checkEntitlement: typeof options.requireEntitlement === 'function'
      ? options.requireEntitlement
      : sdkRequireEntitlement,
    currentId: '',
    currentDir: '',
    store: null,
    // 成稿 / 生图 / 图册等互斥锁；AI 查词另用 riskAiBusy，不打断也不排队。
    lock: null,
    riskAiBusy: false,
    riskAiSeq: 0,
  };
  const ctx = Object.assign(state, createSession(state));

  return {
    ...attachDraft(ctx),
    ...attachAlbums(ctx),
    ...attachUploadRefs(ctx),
    ...attachLibraryCopy(ctx),
    ...attachXhsNotes(ctx),
    ...attachRisk(ctx),
  };
}

module.exports = {
  BUSY_MESSAGE,
  createRunner,
  promptsBlockReason,
};
