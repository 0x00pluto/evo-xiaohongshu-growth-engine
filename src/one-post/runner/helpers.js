// @ts-check
'use strict';

/** @type {typeof import('../model-error')} */
const modelErrorModule = require('../model-error');
/** @type {typeof import('../../prompts/fill')} */
const fillModule = require('../../prompts/fill');
/** @type {typeof import('../../draft/validate')} */
const validateModule = require('../../draft/validate');

const { formatModelError } = modelErrorModule;
const { embedEditablePrompt, extractEditablePrompt } = fillModule;
const { basisEqual, basisFrom } = validateModule;

/**
 * @typedef {import('../../draft/store').DraftState} DraftState
 * @typedef {{ slot: 'cover'; index: 0 } | { slot: 'gallery'; index: number }} ImageOnly
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
 * @returns {import('../../draft/store').PromptsState}
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

module.exports = {
  errorMessage,
  isSceneLengthError,
  isSceneDuplicateError,
  isSceneRetryableError,
  isPlanRetryableError,
  sceneLengthFromError,
  promptsBlockReason,
  requestedSlot,
  slotPromptText,
  blankPrompts,
  hasStampedPrompts,
  copyIsStale,
  slotBlockReason,
  editorFromState,
  applyPromptEdits,
};
