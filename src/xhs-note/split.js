// @ts-check
'use strict';

/**
 * @typedef {{ url: string; mime?: string; role?: string }} NoteImage
 * @typedef {{
 *   sourceUrl: string;
 *   title: string;
 *   body: string;
 *   tags: string[];
 *   images: NoteImage[];
 *   fetchedAt: string;
 *   author?: { name?: string; id?: string };
 * }} NoteImportPayload
 * @typedef {{
 *   title: string;
 *   body: string;
 *   cover: NoteImage | null;
 *   inners: NoteImage[];
 * }} SplitNoteParts
 */

/**
 * @param {unknown} raw
 * @returns {NoteImage[]}
 */
function readImages(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {NoteImage[]} */
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const bag = /** @type {Record<string, unknown>} */ (item);
    const url = typeof bag.url === 'string' ? bag.url.trim() : '';
    if (!url) continue;
    /** @type {NoteImage} */
    const row = { url };
    if (typeof bag.mime === 'string' && bag.mime.trim()) row.mime = bag.mime.trim();
    if (typeof bag.role === 'string' && bag.role.trim()) row.role = bag.role.trim();
    out.push(row);
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {NoteImportPayload | null}
 */
function normalizeNotePayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bag = /** @type {Record<string, unknown>} */ (raw);
  const sourceUrl = typeof bag.sourceUrl === 'string' ? bag.sourceUrl.trim() : '';
  if (!sourceUrl) return null;
  const title = typeof bag.title === 'string' ? bag.title : '';
  const body = typeof bag.body === 'string' ? bag.body : '';
  const tags = Array.isArray(bag.tags)
    ? bag.tags.filter((t) => typeof t === 'string' && String(t).trim()).map((t) => String(t).trim())
    : [];
  const images = readImages(bag.images);
  const fetchedAt = typeof bag.fetchedAt === 'string' ? bag.fetchedAt : '';
  /** @type {NoteImportPayload} */
  const out = { sourceUrl, title, body, tags, images, fetchedAt };
  if (bag.author && typeof bag.author === 'object' && !Array.isArray(bag.author)) {
    const author = /** @type {Record<string, unknown>} */ (bag.author);
    out.author = {
      name: typeof author.name === 'string' ? author.name : '',
      id: typeof author.id === 'string' ? author.id : '',
    };
  }
  return out;
}

/**
 * 正文进范文；首图 = cover；内页 = 非 cover。
 * @param {NoteImportPayload} payload
 * @returns {SplitNoteParts}
 */
function splitNoteParts(payload) {
  const images = Array.isArray(payload.images) ? payload.images : [];
  /** @type {NoteImage | null} */
  let cover = null;
  /** @type {NoteImage[]} */
  const inners = [];
  for (const img of images) {
    if (!cover && img.role === 'cover') {
      cover = img;
      continue;
    }
    if (img.role === 'cover') continue;
    inners.push(img);
  }
  // 无显式 cover 时，第一张当首图，其余当内页
  if (!cover && images.length > 0) {
    cover = images[0] || null;
    inners.length = 0;
    for (let i = 1; i < images.length; i += 1) {
      const row = images[i];
      if (row) inners.push(row);
    }
  }
  const title = String(payload.title || '').trim() || '未命名笔记';
  const body = String(payload.body || '').trim();
  return { title, body, cover, inners };
}

/**
 * @param {SplitNoteParts} parts
 * @param {number} innerIndex
 * @returns {NoteImage | null}
 */
function pickInnerImage(parts, innerIndex) {
  if (!parts.inners.length) return null;
  const index = Number.isInteger(innerIndex) ? innerIndex : 0;
  if (index < 0 || index >= parts.inners.length) return parts.inners[0] || null;
  return parts.inners[index] || null;
}

/**
 * 正文是否几乎只有话题标签（仍允许用户勾选学习）。
 * @param {unknown} body
 * @returns {boolean}
 */
function isTagOnlyBody(body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return false;
  const withoutTags = text
    .replace(/#[^\s#]+#?/g, ' ')
    .replace(/\s+/g, '')
    .trim();
  return withoutTags.length === 0;
}

module.exports = {
  isTagOnlyBody,
  normalizeNotePayload,
  pickInnerImage,
  splitNoteParts,
};
