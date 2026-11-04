// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * @typedef {{
 *   url: string;
 *   mime?: string;
 *   role?: string;
 * }} XhsNoteImage
 * @typedef {{
 *   id: string;
 *   sourceUrl: string;
 *   inputUrls: string[];
 *   title: string;
 *   body: string;
 *   tags: string[];
 *   images: XhsNoteImage[];
 *   fetchedAt: string;
 *   updatedAt: number;
 * }} XhsNoteLinkMeta
 */

/**
 * @param {unknown} text
 * @returns {string}
 */
function trimUrl(text) {
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * @returns {string}
 */
function newLinkId() {
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
 * @param {unknown} raw
 * @returns {XhsNoteImage[]}
 */
function normalizeImages(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {XhsNoteImage[]} */
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const bag = /** @type {Record<string, unknown>} */ (item);
    const url = trimUrl(bag.url);
    if (!url) continue;
    /** @type {XhsNoteImage} */
    const row = { url };
    if (typeof bag.mime === 'string' && bag.mime.trim()) row.mime = bag.mime.trim();
    if (typeof bag.role === 'string' && bag.role.trim()) row.role = bag.role.trim();
    out.push(row);
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {XhsNoteLinkMeta | null}
 */
function parseMeta(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bag = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof bag.id === 'string' ? bag.id.trim() : '';
  const sourceUrl = trimUrl(bag.sourceUrl);
  if (!id || !sourceUrl) return null;
  /** @type {string[]} */
  const inputUrls = [];
  if (Array.isArray(bag.inputUrls)) {
    for (const item of bag.inputUrls) {
      const u = trimUrl(item);
      if (u && !inputUrls.includes(u)) inputUrls.push(u);
    }
  }
  const tags = Array.isArray(bag.tags)
    ? bag.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => String(t).trim())
    : [];
  const updatedAt = Number(bag.updatedAt);
  return {
    id,
    sourceUrl,
    inputUrls,
    title: typeof bag.title === 'string' ? bag.title : '',
    body: typeof bag.body === 'string' ? bag.body : '',
    tags,
    images: normalizeImages(bag.images),
    fetchedAt: typeof bag.fetchedAt === 'string' ? bag.fetchedAt : '',
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

/**
 * @param {string} libraryDir
 * @returns {XhsNoteLinkMeta[]}
 */
function listXhsNoteLinks(libraryDir) {
  if (!libraryDir || !fs.existsSync(libraryDir)) return [];
  /** @type {XhsNoteLinkMeta[]} */
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
 * @returns {XhsNoteLinkMeta | null}
 */
function readXhsNoteLink(libraryDir, id) {
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
 * 粘贴串或 sourceUrl 是否已收录（trim 后全等）。
 * @param {string} libraryDir
 * @param {string} url
 * @returns {XhsNoteLinkMeta | null}
 */
function findXhsNoteLinkByUrl(libraryDir, url) {
  const needle = trimUrl(url);
  if (!needle) return null;
  for (const meta of listXhsNoteLinks(libraryDir)) {
    if (meta.sourceUrl === needle) return meta;
    if (meta.inputUrls.includes(needle)) return meta;
  }
  return null;
}

/**
 * @param {string} libraryDir
 * @param {{
 *   id?: string;
 *   sourceUrl: string;
 *   inputUrl?: string;
 *   title?: string;
 *   body?: string;
 *   tags?: string[];
 *   images?: unknown;
 *   fetchedAt?: string;
 * }} input
 * @returns {XhsNoteLinkMeta}
 */
function saveXhsNoteLink(libraryDir, input) {
  if (!libraryDir) throw new Error('缺少小红书链接库目录');
  const sourceUrl = trimUrl(input.sourceUrl);
  if (!sourceUrl) throw new Error('缺少解析后的笔记链接');
  const existingId = typeof input.id === 'string' ? input.id.trim() : '';
  const bySource = findXhsNoteLinkByUrl(libraryDir, sourceUrl);
  const id = existingId || (bySource && bySource.id) || newLinkId();
  const prev = readXhsNoteLink(libraryDir, id) || bySource;
  /** @type {string[]} */
  const inputUrls = prev ? [...prev.inputUrls] : [];
  const pasted = trimUrl(input.inputUrl);
  if (pasted && !inputUrls.includes(pasted)) inputUrls.push(pasted);
  if (!inputUrls.includes(sourceUrl)) {
    // sourceUrl 本身也记一笔，方便直接贴 explore 链接命中
    inputUrls.push(sourceUrl);
  }
  /** @type {XhsNoteLinkMeta} */
  const meta = {
    id,
    sourceUrl,
    inputUrls,
    title: typeof input.title === 'string' ? input.title : (prev ? prev.title : ''),
    body: typeof input.body === 'string' ? input.body : (prev ? prev.body : ''),
    tags: Array.isArray(input.tags)
      ? input.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => String(t).trim())
      : (prev ? prev.tags : []),
    images: input.images !== undefined ? normalizeImages(input.images) : (prev ? prev.images : []),
    fetchedAt: typeof input.fetchedAt === 'string' && input.fetchedAt
      ? input.fetchedAt
      : (prev ? prev.fetchedAt : ''),
    updatedAt: Date.now(),
  };
  const dir = entryDir(libraryDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(metaPath(libraryDir, id), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

/**
 * 已收录时只把粘贴串补进 inputUrls。
 * @param {string} libraryDir
 * @param {string} sourceUrl
 * @param {string} inputUrl
 * @returns {XhsNoteLinkMeta | null}
 */
function rememberInputUrl(libraryDir, sourceUrl, inputUrl) {
  const existing = findXhsNoteLinkByUrl(libraryDir, sourceUrl)
    || findXhsNoteLinkByUrl(libraryDir, inputUrl);
  if (!existing) return null;
  return saveXhsNoteLink(libraryDir, {
    id: existing.id,
    sourceUrl: existing.sourceUrl,
    inputUrl,
    title: existing.title,
    body: existing.body,
    tags: existing.tags,
    images: existing.images,
    fetchedAt: existing.fetchedAt,
  });
}

module.exports = {
  findXhsNoteLinkByUrl,
  listXhsNoteLinks,
  parseMeta,
  readXhsNoteLink,
  rememberInputUrl,
  saveXhsNoteLink,
  trimUrl,
};
