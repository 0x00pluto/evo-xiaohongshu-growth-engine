// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
const { ALBUM_KIND_SET } = catalogModule;

const LEARN_PROMPT_REL = 'learn-album/system.md';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** 用户自加图册序号起点；000001～099999 系统预留 */
const USER_ALBUM_SEQ_START = 100000;
const SHEET_SLOTS = [
  '1. 背景',
  '2. 色彩',
  '3. 字体',
  '4. 字号',
  '5. 字重',
  '6. 文字排版',
  '7. 文字位置',
  '8. 构图布局',
  '9. 视觉风格',
  '10. 光影与质感',
  '11. 系列统一规则',
  '12. 主题绘画内容',
];

/**
 * @typedef {{
 *   draftId: string;
 *   id: string;
 *   kind: string;
 *   slug: string;
 *   label: string;
 *   hint: string;
 *   copySchema: string;
 *   promptMd: string;
 *   copySample: string;
 *   sampleExt: string;
 *   sampleMime: string;
 *   sampleBytes: Buffer;
 *   sampleDataUrl: string;
 * }} AlbumDraft
 */

/**
 * @param {string} promptsDir
 * @returns {string}
 */
function learnSystemPromptPath(promptsDir) {
  return path.join(promptsDir, LEARN_PROMPT_REL);
}

/**
 * 每次学习现读，不进图册缓存。
 * @param {string} promptsDir
 * @returns {string}
 */
function readLearnSystemPrompt(promptsDir) {
  const file = learnSystemPromptPath(promptsDir);
  if (!fs.existsSync(file)) {
    throw new Error('找不到学习提示词 learn-album/system.md');
  }
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) throw new Error('学习提示词是空的');
  return text;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function requireTrimmed(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}不完整`);
  }
  return value.trim();
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isKindOrSlug(value) {
  return /^[a-z][a-z0-9-]*$/.test(value);
}

/**
 * @param {Buffer} bytes
 * @returns {{ ext: string; mime: string } | null}
 */
function detectImageKind(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }
  if (
    bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) {
    return { ext: '.png', mime: 'image/png' };
  }
  // RIFF....WEBP
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }
  return null;
}

/**
 * @param {unknown} source
 * @returns {{ bytes: Buffer; ext: string; mime: string; dataUrl: string }}
 */
function normalizeReferenceImage(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('请选择一张参考图');
  }
  const bag = /** @type {Record<string, unknown>} */ (source);
  /** @type {Buffer | null} */
  let bytes = null;
  if (typeof bag.dataUrl === 'string' && bag.dataUrl.trim()) {
    const match = bag.dataUrl.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) throw new Error('参考图格式不对');
    bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  } else if (typeof bag.base64 === 'string' && bag.base64.trim()) {
    bytes = Buffer.from(bag.base64.replace(/\s+/g, ''), 'base64');
  } else if (Buffer.isBuffer(bag.bytes)) {
    bytes = bag.bytes;
  }
  if (!bytes || bytes.length === 0) throw new Error('请选择一张参考图');
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error('参考图太大，请换一张不超过 8MB 的图');
  }
  const kind = detectImageKind(bytes);
  if (!kind) throw new Error('只支持 JPEG、PNG、WebP 参考图');
  const dataUrl = `data:${kind.mime};base64,${bytes.toString('base64')}`;
  return { bytes, ext: kind.ext, mime: kind.mime, dataUrl };
}

/**
 * @param {string} promptMd
 */
function assertPromptSheet(promptMd) {
  for (const slot of SHEET_SLOTS) {
    if (!promptMd.includes(slot)) {
      throw new Error(`绘图题词缺了 ${slot}`);
    }
  }
  if (!promptMd.includes('{{scene}}')) {
    throw new Error('绘图题词缺了 {{scene}}');
  }
  const seriesAt = promptMd.indexOf('11. 系列统一规则');
  const sceneAt = promptMd.indexOf('12. 主题绘画内容');
  if (seriesAt < 0 || sceneAt < 0 || seriesAt > sceneAt) {
    throw new Error('绘图题词槽序不对');
  }
}

/**
 * @param {string} kind
 * @param {string} promptMd
 * @param {string} copySchema
 */
function assertPromptPlaceholders(kind, promptMd, copySchema) {
  if (kind === 'magazine') {
    if (!promptMd.includes('{{line}}')) throw new Error('绘图题词缺了 {{line}}');
    return;
  }
  if (kind === 'scrapbook') {
    if (!promptMd.includes('{{line}}')) throw new Error('绘图题词缺了 {{line}}');
    return;
  }
  if (kind === 'conceptual') {
    for (const name of ['theme', 'mainTitle', 'subTitle']) {
      if (!promptMd.includes(`{{${name}}}`)) throw new Error(`绘图题词缺了 {{${name}}}`);
    }
    return;
  }
  if (kind === 'card') {
    for (const name of ['mainTitle', 'point']) {
      if (!promptMd.includes(`{{${name}}}`)) throw new Error(`绘图题词缺了 {{${name}}}`);
    }
    return;
  }
  if (kind === 'infographic') {
    for (const name of ['seriesLabel', 'theme', 'mainTitle', 'subTitle', 'summary', 'credit']) {
      if (!promptMd.includes(`{{${name}}}`)) throw new Error(`绘图题词缺了 {{${name}}}`);
    }
    return;
  }
  // 新 kind：至少要有 {{line}}，且 copySchema 声明了 line
  if (!promptMd.includes('{{line}}')) {
    throw new Error('新 kind 绘图题词须含 {{line}}');
  }
  if (!/(?:^|\n)\s*-\s*line\s*[：:]/m.test(copySchema)) {
    throw new Error('新 kind 的 copySchema 须声明 line 字段');
  }
}

/**
 * @param {unknown} raw
 * @returns {{
 *   kind: string;
 *   slug: string;
 *   label: string;
 *   hint: string;
 *   copySchema: string;
 *   promptMd: string;
 *   copySample: string;
 * }}
 */
function parseLearnResult(raw) {
  /** @type {unknown} */
  let data = raw;
  if (typeof raw === 'string') {
    let text = raw.replace(/^\uFEFF/, '').trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenced) text = fenced[1].trim();
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('学习结果不是合法 JSON');
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('学习结果不是对象');
  }
  const source = /** @type {Record<string, unknown>} */ (data);
  const kind = requireTrimmed(source.kind, 'kind').toLowerCase();
  const slug = requireTrimmed(source.slug, 'slug').toLowerCase();
  if (!isKindOrSlug(kind)) throw new Error('kind 只能是小写英文与连字符');
  if (!isKindOrSlug(slug)) throw new Error('slug 只能是小写英文与连字符');
  const label = requireTrimmed(source.label, '名称');
  const hint = requireTrimmed(source.hint, '说明');
  const copySchema = requireTrimmed(source.copySchema, 'copySchema');
  const promptMd = requireTrimmed(source.promptMd, '绘图题词');
  const copySample = requireTrimmed(source.copySample, '抽取示例');
  assertPromptSheet(promptMd);
  assertPromptPlaceholders(kind, promptMd, copySchema);
  return { kind, slug, label, hint, copySchema, promptMd, copySample };
}

/**
 * 只在用户带（>= 100000）里取下一个序号；出厂号不参与递增。
 * @param {string} promptsDir
 * @returns {number}
 */
function nextAlbumSequence(promptsDir) {
  const albumsDir = path.join(promptsDir, 'albums');
  let maxUser = USER_ALBUM_SEQ_START - 1;
  if (fs.existsSync(albumsDir)) {
    for (const name of fs.readdirSync(albumsDir)) {
      if (!name.endsWith('.json')) continue;
      const seq = Number(name.slice(0, 6));
      if (Number.isInteger(seq) && seq >= USER_ALBUM_SEQ_START && seq > maxUser) {
        maxUser = seq;
      }
    }
  }
  return maxUser + 1;
}

/**
 * @param {string} promptsDir
 * @param {{ kind: string; slug: string }} parts
 * @returns {string}
 */
function allocateAlbumId(promptsDir, parts) {
  let seq = nextAlbumSequence(promptsDir);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = `${String(seq).padStart(6, '0')}.${parts.kind}.${parts.slug}`;
    const jsonPath = path.join(promptsDir, 'albums', `${id}.json`);
    if (!fs.existsSync(jsonPath)) return id;
    seq += 1;
  }
  throw new Error('图册 id 已存在，请再试一次');
}

/**
 * @param {string} promptsDir
 * @param {unknown} learnRaw
 * @param {{ bytes: Buffer; ext: string; mime: string; dataUrl: string }} image
 * @param {string} draftId
 * @returns {AlbumDraft}
 */
function buildAlbumDraft(promptsDir, learnRaw, image, draftId) {
  const parsed = parseLearnResult(learnRaw);
  const id = allocateAlbumId(promptsDir, parsed);
  return {
    draftId,
    id,
    kind: parsed.kind,
    slug: parsed.slug,
    label: parsed.label,
    hint: parsed.hint,
    copySchema: parsed.copySchema,
    promptMd: parsed.promptMd,
    copySample: parsed.copySample,
    sampleExt: image.ext,
    sampleMime: image.mime,
    sampleBytes: image.bytes,
    sampleDataUrl: image.dataUrl,
  };
}

/**
 * @param {AlbumDraft} draft
 * @returns {Record<string, unknown>}
 */
function draftPublicView(draft) {
  return {
    draftId: draft.draftId,
    id: draft.id,
    kind: draft.kind,
    slug: draft.slug,
    label: draft.label,
    hint: draft.hint,
    copySchema: draft.copySchema,
    promptTemplate: draft.promptMd,
    copySample: draft.copySample,
    sampleDataUrl: draft.sampleDataUrl,
    builtin: false,
  };
}

/**
 * 系统预留带：序号小于 100000 不可删。
 * @param {string} id
 * @returns {boolean}
 */
function isBuiltinAlbumId(id) {
  const seq = Number(String(id || '').split('.')[0] || '');
  return Number.isInteger(seq) && seq >= 1 && seq < USER_ALBUM_SEQ_START;
}

module.exports = {
  ALBUM_KIND_SET,
  LEARN_PROMPT_REL,
  MAX_IMAGE_BYTES,
  USER_ALBUM_SEQ_START,
  allocateAlbumId,
  buildAlbumDraft,
  detectImageKind,
  draftPublicView,
  isBuiltinAlbumId,
  isKindOrSlug,
  learnSystemPromptPath,
  normalizeReferenceImage,
  parseLearnResult,
  readLearnSystemPrompt,
};
