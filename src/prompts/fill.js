'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateDraftFace, normalizeFace } = require('../draft/validate');

const PROMPT_FILES = new Set(['draft.md', 'cover.md', 'gallery.md']);

function readPromptFile(promptsDir, name) {
  if (!PROMPT_FILES.has(name)) {
    throw new Error('未知提示词文件');
  }
  const file = path.join(promptsDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`找不到提示词文件 ${name}`);
  }
  return fs.readFileSync(file, 'utf8');
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
  const face = {
    title: typeof data.title === 'string' ? data.title : '',
    body: typeof data.body === 'string' ? data.body : '',
    topics: Array.isArray(data.topics) ? data.topics : [],
    coverLine: typeof data.coverLine === 'string' ? data.coverLine : '',
  };
  const message = validateDraftFace(face);
  if (message) throw new Error(message);
  return normalizeFace(face);
}

function parseCoverText(text) {
  const data = parseJsonObject(text);
  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
  if (!prompt) throw new Error('封面提示词不是 1 条');
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
  faceVars,
  fillPrompt,
  parseCoverText,
  parseDraftText,
  parseGalleryText,
  parseJsonObject,
  readPromptFile,
};
