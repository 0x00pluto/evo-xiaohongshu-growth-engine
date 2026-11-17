// @ts-check
'use strict';

/** @type {typeof import('./draft-copy')} */
const copyModule = require('./draft-copy');
/** @type {typeof import('./draft-prompts')} */
const promptsModule = require('./draft-prompts');
/** @type {typeof import('./draft-images')} */
const imagesModule = require('./draft-images');
/** @type {typeof import('./draft-posts')} */
const postsModule = require('./draft-posts');

const { attachDraftCopy } = copyModule;
const { attachDraftPrompts } = promptsModule;
const { attachDraftImages } = imagesModule;
const { attachDraftPosts } = postsModule;

/**
 * 当篇稿：成稿、提示词、生图、编辑、历史篇与预览。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachDraft(ctx) {
  return {
    ...attachDraftCopy(ctx),
    ...attachDraftPrompts(ctx),
    ...attachDraftImages(ctx),
    ...attachDraftPosts(ctx),
  };
}

module.exports = { attachDraft };
