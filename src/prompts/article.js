// @ts-check
'use strict';

/** @type {typeof import('./template')} */
const templateModule = require('./template');
const { fillPrompt, readPromptFile } = templateModule;

/** @type {ReadonlySet<string>} */
const ARTICLE_TYPES = new Set(['种草', '引流', '素人']);
/** @type {Readonly<Record<string, string>>} */
const ARTICLE_FILES = {
  种草: 'seed',
  引流: 'lead',
  素人: 'amateur',
};

/**
 * @param {unknown} type
 * @returns {type is string}
 */
function isArticleType(type) {
  return typeof type === 'string' && ARTICLE_TYPES.has(type);
}

/**
 * @param {unknown} type
 * @returns {string}
 */
function articlePromptName(type) {
  if (!isArticleType(type)) {
    throw new Error('文章类型不在允许列表');
  }
  return `article/${ARTICLE_FILES[type]}.md`;
}

/**
 * @param {string} promptsDir
 * @param {unknown} articleType
 * @param {{ business: string; article: string }} vars
 * @returns {string}
 */
function buildDraftPrompt(promptsDir, articleType, vars) {
  const skeleton = readPromptFile(promptsDir, articlePromptName(articleType));
  return fillPrompt(readPromptFile(promptsDir, 'article/shell.md'), {
    skeleton,
    business: vars.business,
    article: vars.article,
  });
}

module.exports = {
  ARTICLE_FILES,
  ARTICLE_TYPES,
  articlePromptName,
  buildDraftPrompt,
  isArticleType,
};
