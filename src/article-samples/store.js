// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BODY_LIMIT = 8000;
const EMPTY_TITLE = '请写上标题';
const EMPTY_BODY = '请写上正文';
const BODY_TOO_LONG = '贴进来的原文太长了，先删到 8000 字以内。';

/**
 * @typedef {{ id: string; title: string; body: string; updatedAt: number }} ArticleSampleMeta
 */

/**
 * @param {string} text
 * @returns {number}
 */
function charLength(text) {
  return Array.from(text).length;
}

/**
 * @returns {string}
 */
function newArticleSampleId() {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * @param {string} libraryDir
 * @param {string} id
 * @returns {string}
 */
function entryDir(libraryDir, id) {
  return path.join(libraryDir, id);
}

/**
 * @param {string} libraryDir
 * @param {string} id
 * @returns {string}
 */
function metaPath(libraryDir, id) {
  return path.join(entryDir(libraryDir, id), 'meta.json');
}

/**
 * @param {unknown} title
 * @param {unknown} body
 * @returns {{ ok: true; title: string; body: string } | { ok: false; message: string; field?: string }}
 */
function validateSampleFields(title, body) {
  const nextTitle = typeof title === 'string' ? title.trim() : '';
  const nextBody = typeof body === 'string' ? body.trim() : '';
  if (!nextTitle) return { ok: false, message: EMPTY_TITLE, field: 'title' };
  if (!nextBody) return { ok: false, message: EMPTY_BODY, field: 'body' };
  if (charLength(nextBody) > BODY_LIMIT) {
    return { ok: false, message: BODY_TOO_LONG, field: 'body' };
  }
  return { ok: true, title: nextTitle, body: nextBody };
}

/**
 * @param {unknown} raw
 * @returns {ArticleSampleMeta | null}
 */
function parseMeta(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bag = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof bag.id === 'string' ? bag.id.trim() : '';
  const title = typeof bag.title === 'string' ? bag.title.trim() : '';
  const body = typeof bag.body === 'string' ? bag.body : '';
  const updatedAt = Number(bag.updatedAt);
  if (!id || !title || !String(body).trim()) return null;
  return {
    id,
    title,
    body,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

/**
 * @param {string} libraryDir
 * @returns {ArticleSampleMeta[]}
 */
function listArticleSamples(libraryDir) {
  if (!libraryDir || !fs.existsSync(libraryDir)) return [];
  /** @type {ArticleSampleMeta[]} */
  const list = [];
  for (const name of fs.readdirSync(libraryDir).sort()) {
    const file = metaPath(libraryDir, name);
    if (!fs.existsSync(file)) continue;
    try {
      const meta = parseMeta(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (meta) list.push(meta);
    } catch {
      // 坏条目跳过
    }
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
}

/**
 * @param {string} libraryDir
 * @param {string} id
 * @returns {ArticleSampleMeta | null}
 */
function readArticleSample(libraryDir, id) {
  const safe = String(id || '').trim();
  if (!safe || !libraryDir) return null;
  const file = metaPath(libraryDir, safe);
  if (!fs.existsSync(file)) return null;
  try {
    return parseMeta(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * @param {string} libraryDir
 * @param {{ id?: string; title: unknown; body: unknown }} input
 * @returns {ArticleSampleMeta}
 */
function saveArticleSample(libraryDir, input) {
  if (!libraryDir) throw new Error('缺少范文库目录');
  const checked = validateSampleFields(input.title, input.body);
  if (!checked.ok) throw new Error(checked.message);
  const existingId = typeof input.id === 'string' ? input.id.trim() : '';
  const id = existingId || newArticleSampleId();
  if (existingId) {
    const prev = readArticleSample(libraryDir, existingId);
    if (!prev) throw new Error('库里没有这篇范文');
  }
  /** @type {ArticleSampleMeta} */
  const meta = {
    id,
    title: checked.title,
    body: checked.body,
    updatedAt: Date.now(),
  };
  const dir = entryDir(libraryDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(metaPath(libraryDir, id), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

/**
 * @param {string} libraryDir
 * @param {string} id
 */
function deleteArticleSample(libraryDir, id) {
  const safe = String(id || '').trim();
  if (!safe || !libraryDir) throw new Error('库里没有这篇范文');
  const dir = entryDir(libraryDir, safe);
  if (!fs.existsSync(dir)) throw new Error('库里没有这篇范文');
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * 整篇粘贴：第一行当标题，其余当正文；无换行则正文=全文、标题取前 20 字。
 * @param {unknown} paste
 * @returns {{ title: string; body: string }}
 */
function splitPasteToSample(paste) {
  const raw = String(paste || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return { title: '', body: '' };
  const nl = raw.indexOf('\n');
  if (nl < 0) {
    const title = Array.from(raw).slice(0, 20).join('');
    return { title, body: raw };
  }
  const title = raw.slice(0, nl).trim();
  const body = raw.slice(nl + 1).trim();
  return {
    title: title || Array.from(body).slice(0, 20).join(''),
    body: body || title,
  };
}

/**
 * @param {ArticleSampleMeta} meta
 * @returns {{ id: string; title: string; updatedAt: number; preview: string }}
 */
function publicListItem(meta) {
  // 保留换行供缩略预览排版；只压连续空格/制表，不压成单行
  const preview = String(meta.body || '')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 400);
  return {
    id: meta.id,
    title: meta.title,
    updatedAt: meta.updatedAt,
    preview,
  };
}

module.exports = {
  BODY_LIMIT,
  BODY_TOO_LONG,
  EMPTY_BODY,
  EMPTY_TITLE,
  deleteArticleSample,
  listArticleSamples,
  newArticleSampleId,
  publicListItem,
  readArticleSample,
  saveArticleSample,
  splitPasteToSample,
  validateSampleFields,
};
