// @ts-check
'use strict';

/** @type {typeof import('../draft/validate')} */
const validateModule = require('../draft/validate');
/** @type {typeof import('./album/catalog')} */
const catalogModule = require('./album/catalog');
/** @type {typeof import('./album/frame')} */
const frameModule = require('./album/frame');

const { validateDraftFace, normalizeFace } = validateModule;
const { albumKind, isAlbum } = catalogModule;
const { frameDisplayLine, normalizeFrame } = frameModule;

/**
 * @typedef {{ album: string; scenes: string[] }} ScenesResult
 */

/**
 * @param {unknown} text
 * @returns {Record<string, unknown>}
 */
function parseJsonObject(text) {
  let raw = String(text || '').replace(/^\uFEFF/, '').trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) raw = fenced[1].trim();
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('模型没有返回 JSON 对象');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('模型没有返回 JSON 对象');
  }
  return /** @type {Record<string, unknown>} */ (data);
}

/**
 * @param {unknown} text
 * @returns {import('../draft/validate').DraftFace}
 */
function parseDraftText(text) {
  const data = parseJsonObject(text);
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

/**
 * @param {unknown} body
 * @returns {string}
 */
function lastBodyLine(body) {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item && item !== 'ㅤ');
  return lines.length > 0 ? lines[lines.length - 1] : '';
}

/**
 * @param {unknown} text
 * @param {unknown} displayLines
 * @param {unknown} album
 * @param {string} promptsDir
 * @returns {ScenesResult}
 */
function parseScenesText(text, displayLines, album, promptsDir) {
  if (!isAlbum(album, promptsDir)) throw new Error('图册不在允许列表');
  const data = parseJsonObject(text);
  const expected = Array.isArray(displayLines)
    ? displayLines.map((item) => String(item).trim())
    : [];
  const got = Array.isArray(data.scenes) ? data.scenes.length : 0;
  if (!Array.isArray(data.scenes) || got !== expected.length) {
    throw new Error(`画面应为 ${expected.length} 张，模型返回了 ${got} 张`);
  }
  const scenes = data.scenes.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (scenes.some((item) => !item)) throw new Error('这一张的画面是空的');
  const seen = new Set();
  for (let index = 0; index < scenes.length; index += 1) {
    if (scenes[index] === expected[index]) throw new Error('这一张的画面不能只是文案');
    if (seen.has(scenes[index])) throw new Error('这一张的画面重复了');
    seen.add(scenes[index]);
  }
  return { album, scenes };
}

/**
 * @param {unknown} text
 * @param {number} galleryCount
 * @param {unknown} body
 * @param {unknown} album
 * @param {string} promptsDir
 * @returns {import('./album/frame').CopyFrame[]}
 */
function parsePlanText(text, galleryCount, body, album, promptsDir) {
  if (!isAlbum(album, promptsDir)) throw new Error('图册不在允许列表');
  const data = parseJsonObject(text);
  const count = galleryCount + 1;
  const lengthError = `策划句子应为 ${count} 条`;

  /** @type {unknown[]} */
  let rawFrames;
  const kind = albumKind(album, promptsDir);
  if (Array.isArray(data.frames)) {
    rawFrames = data.frames;
  } else if (
    (kind === 'magazine' || kind === 'scrapbook')
    && Array.isArray(data.lines)
  ) {
    rawFrames = data.lines.map((line) => ({
      line: typeof line === 'string' ? line : '',
      note: '',
    }));
  } else {
    throw new Error(lengthError);
  }

  if (rawFrames.length !== count) throw new Error(lengthError);
  const frames = rawFrames.map((item) => normalizeFrame(item, album, promptsDir));
  const displays = frames.map((frame) => frameDisplayLine(album, frame, promptsDir));
  if (displays.some((item) => !item)) throw new Error('策划那一句是空的');
  const seen = new Set();
  for (const line of displays) {
    if (seen.has(line)) throw new Error('策划那一句重复了');
    seen.add(line);
  }
  const ending = lastBodyLine(body);
  if (ending && displays[displays.length - 1] === ending) {
    throw new Error('最后一句不要照抄正文结尾');
  }
  return frames;
}

module.exports = {
  parseDraftText,
  parseJsonObject,
  parsePlanText,
  parseScenesText,
};
