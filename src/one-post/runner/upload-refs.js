// @ts-check
'use strict';

/** @type {typeof import('../../upload-refs/rules')} */
const uploadRefRules = require('../../upload-refs/rules');
/** @type {typeof import('../../upload-refs/files')} */
const uploadRefFiles = require('../../upload-refs/files');
/** @type {typeof import('../../prompts/parse')} */
const parseModule = require('../../prompts/parse');
/** @type {typeof import('../model-error')} */
const modelErrorModule = require('../model-error');
/** @type {typeof import('../../prompts/fill')} */
const fillModule = require('../../prompts/fill');

/** @type {typeof import('./helpers')} */
const helpersModule = require('./helpers');

const { parseJsonObject } = parseModule;
const { formatModelError } = modelErrorModule;
const { normalizeReferenceImage } = fillModule;
const { requestedSlot } = helpersModule;

/**
 * 上传参考图：本篇引用、槽位指定与素材库。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachUploadRefs(ctx) {
  const {
    busy,
    completeVision,
    promptsDir,
    rememberVisionFailure,
    userUploadRefsDir,
    visionStepKey,
  } = ctx;

  /**
   * @param {Record<string, unknown>} payload
   */
  function addUploadRef(payload) {
    if (!ctx.store || !ctx.currentDir) return { ok: false, message: '没有这一篇' };
    if (ctx.lock) return busy();
    uploadRefFiles.migratePostUploadRefsLayout(ctx.currentDir);
    const state = ctx.store.read();
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
      const item = uploadRefFiles.writePostUploadRef(ctx.currentDir, image, usageCheck.usage);
      state.uploadRefs = state.uploadRefs.concat([item]);
      state.picks = uploadRefRules.addUploadRefToAllPicks(state.picks, item.id);
      ctx.store.write(state);
      return { ok: true, uploadRef: item, uploadRefs: state.uploadRefs, picks: state.picks };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '上传失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function updateUploadRefUsage(payload) {
    if (!ctx.store) return { ok: false, message: '没有这一篇' };
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明上传参考' };
    const usageCheck = uploadRefRules.validateUsage(source.usage);
    if (!usageCheck.ok) return usageCheck;
    const state = ctx.store.read();
    const index = state.uploadRefs.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, message: '没有这条上传参考' };
    const next = state.uploadRefs.slice();
    next[index] = { ...next[index], usage: usageCheck.usage };
    state.uploadRefs = next;
    ctx.store.write(state);
    return { ok: true, uploadRefs: state.uploadRefs, picks: state.picks };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function deleteUploadRef(payload) {
    if (!ctx.store || !ctx.currentDir) return { ok: false, message: '没有这一篇' };
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明上传参考' };
    const state = ctx.store.read();
    const item = state.uploadRefs.find((entry) => entry.id === id);
    if (!item) return { ok: false, message: '没有这条上传参考' };
    uploadRefFiles.deletePostUploadRefFile(ctx.currentDir, item.fileName);
    state.uploadRefs = state.uploadRefs.filter((entry) => entry.id !== id);
    state.picks = uploadRefRules.removeUploadRefFromPicks(state.picks, id);
    ctx.store.write(state);
    return { ok: true, uploadRefs: state.uploadRefs, picks: state.picks };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function setSlotPick(payload) {
    if (!ctx.store) return { ok: false, message: '没有这一篇' };
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const only = requestedSlot(source);
    if (!only) return { ok: false, message: '要指明封面或配图序号' };
    const state = ctx.store.read();
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
    ctx.store.write(state);
    return { ok: true, picks: state.picks, uploadRefs: state.uploadRefs };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function previewUploadRef(payload) {
    if (!ctx.currentDir) return { ok: false, message: '没有这一篇' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id || !ctx.store) return { ok: false, message: '没有这条上传参考' };
    uploadRefFiles.migratePostUploadRefsLayout(ctx.currentDir);
    const state = ctx.store.read();
    const item = state.uploadRefs.find((entry) => entry.id === id);
    if (!item) return { ok: false, message: '没有这条上传参考' };
    const preview = uploadRefFiles.readPostUploadRefPreview(ctx.currentDir, item.fileName);
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
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    /** @type {ReturnType<typeof normalizeReferenceImage>} */
    let image;
    try {
      image = normalizeReferenceImage(source);
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '上传参考图不合格' };
    }
    ctx.lock = 'draftUploadRefUsage';
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
      ctx.lock = null;
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function saveUploadRefToLibrary(payload) {
    if (!ctx.store || !ctx.currentDir) return { ok: false, message: '没有这一篇' };
    if (!userUploadRefsDir) return { ok: false, message: '缺少上传参考库目录' };
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id) return { ok: false, message: '要指明上传参考' };
    const state = ctx.store.read();
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
        ctx.currentDir,
        { ...item, usage: usageCheck.usage },
      );
      const next = state.uploadRefs.slice();
      next[index] = { ...item, usage: usageCheck.usage, libraryId: saved.id };
      state.uploadRefs = next;
      ctx.store.write(state);
      return { ok: true, id: saved.id, usage: saved.usage, uploadRefs: state.uploadRefs };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '存进库失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function pickLibraryUploadRef(payload) {
    if (!ctx.store || !ctx.currentDir) return { ok: false, message: '没有这一篇' };
    if (!userUploadRefsDir) return { ok: false, message: '缺少上传参考库目录' };
    if (ctx.lock) return busy();
    uploadRefFiles.migratePostUploadRefsLayout(ctx.currentDir);
    const state = ctx.store.read();
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
      const item = uploadRefFiles.pickLibraryUploadRefIntoPost(userUploadRefsDir, ctx.currentDir, id);
      state.uploadRefs = state.uploadRefs.concat([item]);
      state.picks = uploadRefRules.addUploadRefToAllPicks(state.picks, item.id);
      ctx.store.write(state);
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
    if (ctx.lock) return busy();
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
    if (ctx.lock) return busy();
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

  return {
    addLibraryUploadRef,
    addUploadRef,
    deleteLibraryUploadRef,
    deleteUploadRef,
    draftUploadRefUsage,
    listLibraryUploadRefs,
    pickLibraryUploadRef,
    previewLibraryUploadRef,
    previewUploadRef,
    saveUploadRefToLibrary,
    setSlotPick,
    updateUploadRefUsage,
  };
}

module.exports = { attachUploadRefs };
