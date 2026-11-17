// @ts-check
'use strict';

/** @type {typeof import('../../draft/validate')} */
const validateModule = require('../../draft/validate');
/** @type {typeof import('../../prompts/fill')} */
const fillModule = require('../../prompts/fill');
/** @type {typeof import('./helpers')} */
const helpersModule = require('./helpers');
/** @type {typeof import('./draft-shared')} */
const sharedModule = require('./draft-shared');

const {
  basisFrom,
  normalizeFace,
  validateDraftFace,
  validateGalleryCount,
} = validateModule;
const {
  albumHint,
  assignContrastSlots,
  assignGalleryRoles,
  assignStoryRoles,
  copyFramesFitSchema,
  copySchema,
  decodeFilledPrompt,
  extractSceneFromPrompt,
  fillPrompt,
  formatGallerySlots,
  formatPlannedLines,
  frameDisplayLine,
  isAlbum,
  loadAlbumCatalog,
  parsePlanText,
  parseScenesText,
  pickAlbum,
  pickStoryType,
  readPromptFile,
  renderAlbumPrompt,
  storyPromptName,
} = fillModule;
const {
  copyIsStale,
  errorMessage,
  hasStampedPrompts,
  isPlanRetryableError,
  isSceneRetryableError,
  sceneLengthFromError,
} = helpersModule;
const { createDraftInternals } = sharedModule;

/**
 * @typedef {import('../../draft/store').DraftState} DraftState
 * @typedef {import('../../draft/validate').DraftFace} DraftFace
 * @typedef {{
 *   cover: string;
 *   storyType: string;
 *   look: string;
 *   coverLine: string;
 *   gallery: string[];
 *   galleryLines: string[];
 *   galleryRoles: string[];
 *   style: string;
 * }} ProducedPrompts
 */

/**
 * 提示词流水线：策划 / 定画面 / 换风格本地重套 / 落盘；生图前刷新也走这里，故单独导出。
 * @param {import('./context').RunnerCtx} ctx
 */
function createPromptPipeline(ctx) {
  const { promptsDir, random, userAlbumsDir } = ctx;
  const { completeWithStep } = createDraftInternals(ctx);

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
   * @returns {Promise<ProducedPrompts>}
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
    /** @type {import('../../prompts/album/frame').CopyFrame[] | null} */
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
   * @param {ProducedPrompts} produced
   * @param {boolean} [keepJob]
   */
  function commitPrompts(face, galleryCount, produced, keepJob) {
    if (!ctx.store) return;
    const state = ctx.store.read();
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
    ctx.store.write(state);
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
   * @returns {ProducedPrompts | null}
   */
  function tryRestylePrompts(state, newLook) {
    const oldLook = state.prompts && typeof state.prompts.look === 'string'
      ? state.prompts.look.trim()
      : '';
    if (!oldLook || !isAlbum(oldLook, promptsDir, userAlbumsDir)) return null;
    if (!isAlbum(newLook, promptsDir, userAlbumsDir)) return null;
    const slots = [state.prompts.cover, ...state.prompts.gallery];
    if (slots.length !== state.galleryCount + 1) return null;
    /** @type {{ scene: string; frame: import('../../prompts/album/frame').CopyFrame }[]} */
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

  return {
    commitPrompts,
    extractAllScenes,
    producePrompts,
    promptWorkKind,
    tryRestylePrompts,
  };
}

/**
 * 当篇稿：只出提示词（不生图）。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachDraftPrompts(ctx) {
  const {
    busy,
    markJobFailed,
    promptsDir,
    userAlbumsDir,
  } = ctx;
  const { applyDraftText } = createDraftInternals(ctx);
  const { commitPrompts, producePrompts } = createPromptPipeline(ctx);

  /**
   * @param {string} [albumLook]
   */
  async function runGeneratePrompts(albumLook) {
    try {
      if (!ctx.store) throw new Error('没有这一篇');
      const state = ctx.store.read();
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
   * @param {Record<string, unknown>} payload
   */
  function generatePrompts(payload) {
    if (!ctx.store) return { ok: false, message: '没有这一篇' };
    if (ctx.lock) return busy();
    const state = ctx.store.read();
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
    ctx.lock = 'generatePrompts';
    state.job = { running: true, step: '定画面', error: '' };
    ctx.store.write(state);
    runGeneratePrompts(albumLook || undefined).finally(() => {
      ctx.lock = null;
    });
    return { ok: true, accepted: true };
  }

  return { generatePrompts };
}

module.exports = { attachDraftPrompts, createPromptPipeline };
