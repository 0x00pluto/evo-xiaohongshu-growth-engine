// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('../../xhs-note/links')} */
const xhsNoteLinks = require('../../xhs-note/links');
/** @type {typeof import('../../xhs-note/fingerprint')} */
const xhsNoteFingerprint = require('../../xhs-note/fingerprint');
/** @type {typeof import('../../xhs-note/provenance')} */
const xhsNoteProvenance = require('../../xhs-note/provenance');
/** @type {typeof import('../../image/aspect')} */
const aspectModule = require('../../image/aspect');
/** @type {typeof import('../model-error')} */
const modelErrorModule = require('../model-error');
/** @type {typeof import('../../prompts/fill')} */
const fillModule = require('../../prompts/fill');

const {
  aspectRatioFromImage,
  cssAspectRatio,
  DEFAULT_ASPECT_RATIO,
  normalizeAspectRatio,
} = aspectModule;
const { errorCode, formatModelError } = modelErrorModule;
const {
  albumSampleFile,
  albumSamplePath,
  assertPromptPlaceholders,
  assertPromptSheet,
  buildAlbumDraft,
  commitAlbumDraft,
  commitFlaggedAlbumDraft,
  deleteAlbumFiles,
  draftPublicView,
  ensureAlbumAspectRatio,
  isAlbum,
  isBuiltinAlbum,
  loadAlbumCatalog,
  normalizeReferenceImage,
  readAlbumPromptText,
  readLearnSystemPrompt,
  updateAlbumPromptMd,
} = fillModule;

/**
 * 图册：列表、学习、提交、改提示词、删除与预览。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachAlbums(ctx) {
  const {
    aspectPublicFields,
    busy,
    completeVision,
    generateImage,
    promptsDir,
    rememberVisionFailure,
    userAlbumsDir,
    userXhsNotesDir,
    visionStepKey,
  } = ctx;

  /** @type {import('../../prompts/album/learn').AlbumDraft | null} */
  let albumDraft = null;

  let albumDraftSeq = 0;

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
    if (!ctx.store) return { ok: false, message: '没有这一篇' };
    if (ctx.lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const ratio = normalizeAspectRatio(source.aspectRatio);
    if (!ratio) return { ok: false, message: '比例不在七档里' };
    const state = ctx.store.read();
    state.aspectRatioLocked = ratio;
    ctx.store.write(state);
    return { ok: true, ...aspectPublicFields(state) };
  }

  /**
   * 当前笔记是否正在用某图册做提示词或生图。
   * @param {string} albumId
   * @returns {boolean}
   */
  function albumBusy(albumId) {
    if (!ctx.lock || !ctx.store) return false;
    if (ctx.lock !== 'generatePrompts' && ctx.lock !== 'generateImages' && ctx.lock !== 'retryImage') {
      return false;
    }
    const state = ctx.store.read();
    const look = state.prompts && typeof state.prompts.look === 'string'
      ? state.prompts.look.trim()
      : '';
    return Boolean(look && look === albumId);
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  async function learnAlbum(payload) {
    if (ctx.lock === 'learnAlbum') return busy();
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
    const replaceAlbumId = typeof source.replaceAlbumId === 'string'
      ? source.replaceAlbumId.trim()
      : '';
    const contentMd5 = xhsNoteFingerprint.contentMd5FromDataUrl(image.dataUrl);
    ctx.lock = 'learnAlbum';
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
              contentMd5,
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
      if (replaceAlbumId) {
        draft.id = replaceAlbumId;
        draft.replaceExisting = true;
      }
      if (contentMd5) draft.contentMd5 = contentMd5;
      albumDraft = draft;
      return { ok: true, safetyStatus: 'passed', draft: draftPublicView(draft) };
    } catch (err) {
      rememberVisionFailure(vis.step);
      return { ok: false, message: formatModelError(err, '学习失败') };
    } finally {
      fs.rmSync(probeSample, { force: true });
      fs.rmSync(probeOut, { force: true });
      ctx.lock = null;
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
    if (ctx.lock) return busy();
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
      const contentMd5 = typeof albumDraft.contentMd5 === 'string' ? albumDraft.contentMd5 : '';
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
          contentMd5,
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
    if (ctx.lock) return busy();
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
    if (ctx.lock) return busy();
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

  return {
    commitAlbum,
    deleteAlbum,
    discardAlbum,
    getAlbumDetail,
    learnAlbum,
    listAlbums,
    previewAlbumSample,
    setAspectRatio,
    updateAlbumPrompt,
  };
}

module.exports = { attachAlbums };
