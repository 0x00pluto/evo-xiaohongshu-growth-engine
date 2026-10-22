// @ts-check
'use strict';

/** @type {typeof import('./template')} */
const templateModule = require('./template');
const { fillPrompt, readPromptFile } = templateModule;

/** @type {ReadonlySet<string>} */
const ARTICLE_TYPES = new Set(['种草', '引流', '涨粉', '曝光', '搜索', '转化']);
/** @type {Readonly<Record<string, string>>} */
const ARTICLE_FILES = {
  种草: 'seed',
  引流: 'lead',
  涨粉: 'growth',
  曝光: 'awareness',
  搜索: 'seo',
  转化: 'conversion',
};

/** @type {ReadonlySet<string>} */
const PERSONA_TYPES = new Set(['素人', 'KOC', '达人', '官号', '创始人', '店主', '员工']);
/** @type {Readonly<Record<string, string>>} */
const PERSONA_FILES = {
  素人: 'amateur',
  KOC: 'koc',
  达人: 'expert',
  官号: 'brand',
  创始人: 'founder',
  店主: 'shop',
  员工: 'employee',
};

/**
 * @typedef {{ system: string; user: string }} DraftMessages
 * @typedef {{
 *   business: string;
 *   persona?: string;
 *   sampleBody?: string;
 *   references?: string[];
 * }} DraftPromptVars
 */

/**
 * @param {unknown} type
 * @returns {type is string}
 */
function isArticleType(type) {
  return typeof type === 'string' && ARTICLE_TYPES.has(type);
}

/**
 * @param {unknown} persona
 * @returns {persona is string}
 */
function isPersonaType(persona) {
  return typeof persona === 'string' && PERSONA_TYPES.has(persona);
}

/**
 * @param {unknown} type
 * @returns {string}
 */
function articlePromptName(type) {
  if (!isArticleType(type)) {
    throw new Error('文章目的不在允许列表');
  }
  return `article/article-types/${ARTICLE_FILES[type]}.md`;
}

/**
 * @param {unknown} persona
 * @returns {string}
 */
function personaPromptName(persona) {
  if (!isPersonaType(persona)) {
    throw new Error('人设不在允许列表');
  }
  return `article/article-voices/${PERSONA_FILES[persona]}.md`;
}

/**
 * @param {unknown} sampleBody
 * @returns {string}
 */
function buildSampleBlock(sampleBody) {
  const body = typeof sampleBody === 'string' ? sampleBody.trim() : '';
  if (!body) {
    return '无范文，采用该目的基本写法。';
  }
  return [
    '以下是参考文章。抓住重点，按上面的口吻仿写。不要复述原文结构，不要照搬原图，不要把原文段落搬进正文。事实、数字、人名、案例以新内容为准，不搬参考文章里的事实。',
    '',
    body,
  ].join('\n');
}

/**
 * @param {string} business
 * @param {unknown} references
 * @returns {string}
 */
function buildContentBlock(business, references) {
  /** @type {string[]} */
  const lines = [
    '业务一句（品牌、卖什么、对谁说）：',
    business,
  ];
  const refs = Array.isArray(references)
    ? references.map((item) => String(item).trim()).filter(Boolean)
    : [];
  if (refs.length > 0) {
    lines.push('');
    lines.push('参考资料（事实材料）：');
    refs.forEach((ref, index) => {
      lines.push(`${index + 1}. ${ref}`);
    });
  }
  return lines.join('\n');
}

/**
 * @param {DraftPromptVars} vars
 * @returns {string}
 */
function resolvePersona(vars) {
  if (isPersonaType(vars.persona)) return vars.persona;
  return '素人';
}

/**
 * @param {string} promptsDir
 * @param {unknown} articleType
 * @param {DraftPromptVars} vars
 * @returns {DraftMessages}
 */
function buildDraftMessages(promptsDir, articleType, vars) {
  const persona = resolvePersona(vars);
  const voice = readPromptFile(promptsDir, personaPromptName(persona));
  const skeleton = readPromptFile(promptsDir, articlePromptName(articleType));
  const emojiRules = readPromptFile(promptsDir, 'article/article-rules/emoji.md');
  const sampleBody = typeof vars.sampleBody === 'string' ? vars.sampleBody : '';
  const references = Array.isArray(vars.references) ? vars.references : [];
  const system = fillPrompt(readPromptFile(promptsDir, 'article/shell.md'), {
    voice,
    skeleton,
    emojiRules,
  });
  const user = [buildSampleBlock(sampleBody), '', buildContentBlock(vars.business, references)].join('\n');
  return { system, user };
}

/**
 * 兼容旧调用：拼成单段字符串（测试与调试用）。
 * @param {string} promptsDir
 * @param {unknown} articleType
 * @param {DraftPromptVars} vars
 * @returns {string}
 */
function buildDraftPrompt(promptsDir, articleType, vars) {
  const messages = buildDraftMessages(promptsDir, articleType, vars);
  return `${messages.system}\n\n${messages.user}`;
}

module.exports = {
  ARTICLE_FILES,
  ARTICLE_TYPES,
  PERSONA_FILES,
  PERSONA_TYPES,
  articlePromptName,
  buildContentBlock,
  buildDraftMessages,
  buildDraftPrompt,
  buildSampleBlock,
  isArticleType,
  isPersonaType,
  personaPromptName,
};
