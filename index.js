// @ts-check
'use strict';

const path = require('node:path');

/**
 * @typedef {{
 *   pluginEnv?: () => Record<string, string>;
 *   dirs?: { data?: string };
 *   registerService: (name: string, service: Record<string, Function>) => void;
 * }} AppContext
 * @typedef {{
 *   apply: (ctx: AppContext) => void | Promise<void>;
 *   dispose?: () => void | Promise<void>;
 * }} PluginModule
 */

/** @type {typeof import('./src/one-post/env')} */
const envModule = require('./src/one-post/env');
/** @type {typeof import('./src/one-post/run')} */
const runModule = require('./src/one-post/run');
const { fillMissingFromDotEnv } = envModule;
const { createRunner } = runModule;

/**
 * @returns {string}
 */
function pluginRoot() {
  return __dirname;
}

/**
 * @param {AppContext | undefined} ctx
 * @returns {Record<string, string>}
 */
function resolveEnv(ctx) {
  const base = ctx && typeof ctx.pluginEnv === 'function' ? { ...ctx.pluginEnv() } : {};
  return fillMissingFromDotEnv(base, path.join(pluginRoot(), '.env'));
}

/**
 * @param {string} absPath
 */
function revealInFolder(absPath) {
  // Dex Buddy 主进程提供 electron；本仓不装这个包。
  // @ts-expect-error 宿主注入，本仓无 electron 模块
  const { shell } = require('electron');
  shell.showItemInFolder(absPath);
}

/**
 * @param {unknown} payload
 * @returns {Record<string, unknown>}
 */
function asObject(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return /** @type {Record<string, unknown>} */ (payload);
}

/**
 * @type {PluginModule}
 */
module.exports = {
  /**
   * @param {AppContext} ctx
   */
  apply(ctx) {
    const dataDir = ctx && ctx.dirs && ctx.dirs.data ? ctx.dirs.data : pluginRoot();
    const runner = createRunner({
      postsDir: path.join(dataDir, 'output', 'one-post', 'posts'),
      promptsDir: path.join(pluginRoot(), 'assets', 'prompts', 'one-post'),
      userAlbumsDir: path.join(dataDir, 'runtime', 'albums'),
      userImageRefsDir: path.join(dataDir, 'runtime', 'image-refs'),
      userUploadRefsDir: path.join(dataDir, 'runtime', 'materials', 'upload-refs'),
      // 设置页保存不重跑 apply；真正发请求时再读 pluginEnv。
      readEnv: () => resolveEnv(ctx),
      revealFile: revealInFolder,
    });
    ctx.registerService('onePost', {
      listPosts() {
        return runner.listPosts();
      },
      listAlbums() {
        return runner.listAlbums();
      },
      listLibraryUploadRefs() {
        return runner.listLibraryUploadRefs();
      },
      /**
       * @param {unknown} payload
       */
      addLibraryUploadRef(payload) {
        return runner.addLibraryUploadRef(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      getAlbumDetail(payload) {
        return runner.getAlbumDetail(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      learnAlbum(payload) {
        return runner.learnAlbum(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      commitAlbum(payload) {
        return runner.commitAlbum(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      updateAlbumPrompt(payload) {
        return runner.updateAlbumPrompt(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      discardAlbum(payload) {
        return runner.discardAlbum(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      deleteAlbum(payload) {
        return runner.deleteAlbum(asObject(payload));
      },
      loadLatest() {
        return runner.loadLatest();
      },
      /**
       * @param {unknown} payload
       */
      openPost(payload) {
        return runner.openPost(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      saveEditor(payload) {
        return runner.saveEditor(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      generateDraft(payload) {
        return runner.generateDraft(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      generatePrompts(payload) {
        return runner.generatePrompts(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      chooseImage(payload) {
        return runner.chooseImage(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      generateImages(payload) {
        return runner.generateImages(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      retryImage(payload) {
        return runner.retryImage(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      previewImage(payload) {
        return runner.previewImage(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      previewAlbumSample(payload) {
        return runner.previewAlbumSample(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      revealImage(payload) {
        return runner.revealImage(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      addUploadRef(payload) {
        return runner.addUploadRef(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      updateUploadRefUsage(payload) {
        return runner.updateUploadRefUsage(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      deleteUploadRef(payload) {
        return runner.deleteUploadRef(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      setSlotPick(payload) {
        return runner.setSlotPick(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      previewUploadRef(payload) {
        return runner.previewUploadRef(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      previewLibraryUploadRef(payload) {
        return runner.previewLibraryUploadRef(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      draftUploadRefUsage(payload) {
        return runner.draftUploadRefUsage(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      saveUploadRefToLibrary(payload) {
        return runner.saveUploadRefToLibrary(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      pickLibraryUploadRef(payload) {
        return runner.pickLibraryUploadRef(asObject(payload));
      },
      /**
       * @param {unknown} payload
       */
      deleteLibraryUploadRef(payload) {
        return runner.deleteLibraryUploadRef(asObject(payload));
      },
      startNew() {
        return runner.startNew();
      },
    });
  },

  dispose() {},
};
