// @ts-check
'use strict';

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
/** @type {typeof import('./frame')} */
const frameModule = require('./frame');
/** @type {typeof import('./sheet')} */
const sheetModule = require('./sheet');

const { isAlbum, loadAlbumCatalog, readAlbumPromptText } = catalogModule;
const { isOptionalSchemaField, schemaFieldNames } = frameModule;
const { THEME_SLOT } = sheetModule;

const FOOTER_RE = /\n(?:文案必须完整、准确|生成要求：)/;

/**
 * @param {string} prompt
 * @returns {{ start: number; end: number } | null}
 */
function editableRange(prompt) {
  const text = String(prompt || '');
  const start = text.indexOf(THEME_SLOT);
  if (start < 0) return null;
  const from = text.slice(start);
  const footer = from.search(FOOTER_RE);
  const end = footer >= 0 ? start + footer : text.length;
  return { start, end };
}

/**
 * 框里只留第 11 槽正文和画面上的文案；1–10、开场套话、文末约束不出现。
 * @param {string} prompt
 * @returns {string}
 */
function extractEditablePrompt(prompt) {
  const text = String(prompt || '');
  if (!text.trim()) return '';
  const range = editableRange(text);
  if (!range) return '';
  return text.slice(range.start, range.end).trim();
}

/**
 * 把可改段嵌回存盘全文。可改段删空则该槽存成空字符串。
 * @param {string} full
 * @param {string} edit
 * @returns {string}
 */
function embedEditablePrompt(full, edit) {
  const piece = String(edit || '').trim();
  if (!piece) return '';
  const stored = String(full || '');
  const range = editableRange(stored);
  if (!range) return stored;
  return `${stored.slice(0, range.start)}${piece}${stored.slice(range.end)}`;
}

/**
 * 图册 label 在逗号或顿号前的第一段，供等待文案使用。
 * @param {string} label
 * @returns {string}
 */
function albumLabelShort(label) {
  const text = String(label || '').trim();
  if (!text) return '';
  const cut = text.split(/[,，、]/)[0].trim();
  return cut || text;
}

/**
 * @param {string} template
 * @param {string} filled
 * @returns {Record<string, string> | null}
 */
function extractTemplateVars(template, filled) {
  const tmpl = String(template || '').replace(/\s+$/, '');
  const text = String(filled || '').replace(/\s+$/, '');
  if (!tmpl || !text) return null;
  /** @type {Array<{ type: 'lit'; value: string } | { type: 'var'; name: string }>} */
  const tokens = [];
  const re = /\{\{([^{}]+)\}\}/g;
  let last = 0;
  let match = re.exec(tmpl);
  while (match) {
    tokens.push({ type: 'lit', value: tmpl.slice(last, match.index) });
    tokens.push({ type: 'var', name: String(match[1] || '').trim() });
    last = match.index + match[0].length;
    match = re.exec(tmpl);
  }
  tokens.push({ type: 'lit', value: tmpl.slice(last) });

  /** @type {Record<string, string>} */
  const vars = {};
  let pos = 0;
  let pending = '';
  for (const tok of tokens) {
    if (tok.type === 'var') {
      if (pending) return null;
      pending = tok.name;
      continue;
    }
    const lit = tok.value;
    if (!lit) continue;
    const at = text.indexOf(lit, pos);
    if (at < 0) return null;
    if (pending) {
      vars[pending] = text.slice(pos, at);
      pending = '';
    }
    pos = at + lit.length;
  }
  if (pending) vars[pending] = text.slice(pos);
  return vars;
}

/**
 * @param {string} value
 * @returns {string}
 */
function noteFromBlock(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^旁注：\s*([\s\S]*)$/);
  return match ? match[1].trim() : text;
}

/**
 * @param {Record<string, string>} vars
 * @returns {{ scene: string; frame: import('./frame').CopyFrame }}
 */
function varsToSceneFrame(vars) {
  const scene = typeof vars.scene === 'string' ? vars.scene.trim() : '';
  /** @type {Record<string, unknown>} */
  const frame = {};
  for (const [name, value] of Object.entries(vars)) {
    if (name === 'scene') continue;
    if (name === 'noteBlock') {
      frame.note = noteFromBlock(value);
      continue;
    }
    if (name.endsWith('Block')) continue;
    frame[name] = String(value || '').trim();
  }
  return { scene, frame: /** @type {import('./frame').CopyFrame} */ (frame) };
}

/**
 * 从存盘全文反解第 11 槽与策划帧。对不上则返回 null。
 * @param {string} prompt
 * @param {string} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {{ scene: string; frame: import('./frame').CopyFrame } | null}
 */
function decodeFilledPrompt(prompt, album, promptsDir, userAlbumsDir) {
  const text = String(prompt || '').trim();
  if (!text) return null;
  if (!isAlbum(album, promptsDir, userAlbumsDir)) return null;
  let template = '';
  try {
    template = readAlbumPromptText(promptsDir, album, userAlbumsDir);
  } catch {
    return null;
  }
  const vars = extractTemplateVars(template, text);
  if (!vars) return null;
  const decoded = varsToSceneFrame(vars);
  if (!decoded.scene) return null;
  return decoded;
}

/**
 * 只切第 11 槽正文，给换册时「能留则留」用。
 * @param {string} prompt
 * @returns {string}
 */
function extractSceneFromPrompt(prompt) {
  const text = String(prompt || '');
  const start = text.indexOf(THEME_SLOT);
  if (start < 0) return '';
  let index = start + THEME_SLOT.length;
  if (text[index] === '：' || text[index] === ':') index += 1;
  const rest = text.slice(index);
  const end = rest.search(
    /\n\s*\n|\n(?:图片必须准确呈现的中文文案|本次主题内容|主标题|副标题|底部要点|栏目标签|总结金句|栏目署名|文案必须完整、准确|生成要求：)/,
  );
  return (end >= 0 ? rest.slice(0, end) : rest).trim();
}

/**
 * 目标册 copySchema 必填字段，当前每张已定帧都能取到非空值。
 * @param {import('./frame').CopyFrame[]} frames
 * @param {string} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {boolean}
 */
function copyFramesFitSchema(frames, album, promptsDir, userAlbumsDir) {
  if (!Array.isArray(frames) || frames.length === 0) return false;
  if (!isAlbum(album, promptsDir, userAlbumsDir)) return false;
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(album);
  const schema = meta.copySchema;
  const fields = schemaFieldNames(schema);
  if (fields.length === 0) return false;
  return frames.every((frame) => {
    if (!frame || typeof frame !== 'object') return false;
    const bag = /** @type {Record<string, unknown>} */ (frame);
    return fields.every((name) => {
      if (isOptionalSchemaField(schema, name)) return true;
      const value = bag[name];
      if (typeof value === 'string') return Boolean(value.trim());
      if (Array.isArray(value)) return value.length > 0;
      return false;
    });
  });
}

module.exports = {
  albumLabelShort,
  copyFramesFitSchema,
  decodeFilledPrompt,
  embedEditablePrompt,
  extractEditablePrompt,
  extractSceneFromPrompt,
};
