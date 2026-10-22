// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('./album/catalog')} */
const catalogModule = require('./album/catalog');
const { isAlbum } = catalogModule;

/** @type {ReadonlySet<string>} */
const FIXED_PROMPT_FILES = new Set([
  'article/shell.md',
  'article/article-types/seed.md',
  'article/article-types/lead.md',
  'article/article-types/growth.md',
  'article/article-types/awareness.md',
  'article/article-types/seo.md',
  'article/article-types/conversion.md',
  'article/article-voices/amateur.md',
  'article/article-voices/koc.md',
  'article/article-voices/expert.md',
  'article/article-voices/brand.md',
  'article/article-voices/founder.md',
  'article/article-voices/shop.md',
  'article/article-voices/employee.md',
  'article/article-rules/emoji.md',
  'article-image/lines/process.md',
  'article-image/lines/contrast.md',
  'article-image/scenes.md',
  'article-image/tone.md',
  'article-image/image-refs.md',
  'article-image/subject-slot.md',
]);

/**
 * @typedef {Record<string, string | number | boolean>} PromptVars
 */

/**
 * @param {string} name
 * @param {string} promptsDir
 * @returns {boolean}
 */
function isAllowedPromptFile(name, promptsDir) {
  if (FIXED_PROMPT_FILES.has(name)) return true;
  const albumPrompt = name.match(/^albums\/(.+)\/prompt\.md$/);
  if (albumPrompt) {
    return isAlbum(albumPrompt[1], promptsDir);
  }
  const albumSample = name.match(/^albums\/(.+)\/copy-sample\.md$/);
  if (albumSample) {
    return isAlbum(albumSample[1], promptsDir);
  }
  // 兼容旧相对路径
  const albumMd = name.match(/^albums\/(.+)\.md$/);
  if (albumMd && !name.endsWith('.copy-sample.md')) {
    return isAlbum(albumMd[1], promptsDir);
  }
  const albumCopyLegacy = name.match(/^albums\/(.+)\.copy-sample\.md$/);
  if (albumCopyLegacy) {
    return isAlbum(albumCopyLegacy[1], promptsDir);
  }
  return false;
}

/**
 * @param {string} promptsDir
 * @param {string} name
 * @returns {string}
 */
function readPromptFile(promptsDir, name) {
  if (typeof name !== 'string' || !isAllowedPromptFile(name, promptsDir)) {
    throw new Error('未知提示词文件');
  }
  const file = path.join(promptsDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`找不到提示词文件 ${name}`);
  }
  return fs.readFileSync(file, 'utf8');
}

/**
 * @param {string} template
 * @param {PromptVars} vars
 * @returns {string}
 */
function fillPrompt(template, vars) {
  /** @type {string[]} */
  const missing = [];
  const text = String(template).replace(/\{\{([^{}]+)\}\}/g, (match, key) => {
    const name = String(key).trim();
    if (!Object.prototype.hasOwnProperty.call(vars, name)) {
      missing.push(name);
      return match;
    }
    return String(vars[name]);
  });
  if (missing.length > 0) {
    throw new Error(`提示词变量没有装填：${missing.join('、')}`);
  }
  return text;
}

module.exports = {
  FIXED_PROMPT_FILES,
  fillPrompt,
  readPromptFile,
};
