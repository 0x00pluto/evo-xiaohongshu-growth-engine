'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateDraftFace, normalizeFace } = require('../draft/validate');

const COVER_TYPES = new Set(['story', 'compare']);

const PROMPT_FILES = new Set([
  'draft.md',
  'gallery.md',
  'cover/tone-amateur.md',
  'cover/large-type.md',
  'cover/sentence.md',
  'cover/choose-type.md',
  'cover/types/story.md',
  'cover/types/compare.md',
]);

function readPromptFile(promptsDir, name) {
  if (typeof name !== 'string' || !PROMPT_FILES.has(name)) {
    throw new Error('未知提示词文件');
  }
  const file = path.join(promptsDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`找不到提示词文件 ${name}`);
  }
  return fs.readFileSync(file, 'utf8');
}

function coverTypePromptName(type) {
  if (!COVER_TYPES.has(type)) {
    throw new Error('封面类型不在允许列表');
  }
  return `cover/types/${type}.md`;
}

function fillPrompt(template, vars) {
  const missing = [];
  const text = String(template).replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      missing.push(key);
      return match;
    }
    return String(vars[key]);
  });
  if (missing.length > 0) {
    throw new Error(`提示词变量没有装填：${missing.join('、')}`);
  }
  return text;
}

function parseJsonObject(text) {
  let raw = String(text || '').replace(/^\uFEFF/, '').trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) raw = fenced[1].trim();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error('模型没有返回 JSON 对象');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('模型没有返回 JSON 对象');
  }
  return data;
}

function parseDraftText(text) {
  const data = parseJsonObject(text);
  // 封面那句话改由封面流程写入。成稿若仍返回 coverLine，这里丢掉，避免两套句子并存。
  const face = {
    title: typeof data.title === 'string' ? data.title : '',
    body: typeof data.body === 'string' ? data.body : '',
    topics: Array.isArray(data.topics) ? data.topics : [],
    coverLine: '',
  };
  const message = validateDraftFace(face);
  if (message) throw new Error(message);
  return normalizeFace(face);
}

function parseCoverLineText(text) {
  const data = parseJsonObject(text);
  const coverLine = typeof data.coverLine === 'string' ? data.coverLine.trim() : '';
  if (!coverLine) throw new Error('封面那句话是空的');
  return coverLine;
}

function parseCoverTypeText(text) {
  const data = parseJsonObject(text);
  const type = typeof data.type === 'string' ? data.type.trim() : '';
  if (!COVER_TYPES.has(type)) throw new Error('封面类型不在允许列表');
  return type;
}

function parseCoverText(text, options) {
  const data = parseJsonObject(text);
  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
  if (!prompt) throw new Error('封面提示词不是 1 条');
  const type = options && options.type;
  const coverLine = options && typeof options.coverLine === 'string' ? options.coverLine.trim() : '';
  if (type === 'story' && (!coverLine || !prompt.includes(coverLine))) {
    throw new Error('故事句封面没有写上封面那句话');
  }
  return prompt;
}

function parseGalleryText(text, count) {
  const data = parseJsonObject(text);
  if (!Array.isArray(data.prompts) || data.prompts.length !== count) {
    throw new Error(`配图提示词应为 ${count} 条`);
  }
  const prompts = data.prompts.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (prompts.some((item) => !item)) throw new Error(`配图提示词应为 ${count} 条`);
  return prompts;
}

function faceVars(face, galleryCount) {
  return {
    title: face.title,
    body: face.body,
    topics: face.topics.join('、'),
    coverLine: face.coverLine,
    galleryCount: String(galleryCount),
  };
}

module.exports = {
  COVER_TYPES,
  coverTypePromptName,
  faceVars,
  fillPrompt,
  parseCoverLineText,
  parseCoverText,
  parseCoverTypeText,
  parseDraftText,
  parseGalleryText,
  parseJsonObject,
  readPromptFile,
};
