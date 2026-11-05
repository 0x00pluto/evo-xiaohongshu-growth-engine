// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalExploreUrl, extractXhsNoteId } = require('./note-id');

/**
 * @typedef {{
 *   albumId: string;
 *   role: string;
 * }} XhsLearnedAlbum
 * @typedef {{
 *   articleSampleId: string;
 *   albums: XhsLearnedAlbum[];
 * }} XhsNoteLearned
 * @typedef {{
 *   id: string;
 *   noteId: string;
 *   sourceUrl: string;
 *   inputUrls: string[];
 *   title: string;
 *   fetchedAt: string;
 *   learned: XhsNoteLearned;
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
 * @returns {XhsNoteLearned}
 */
function normalizeLearned(raw) {
  /** @type {XhsLearnedAlbum[]} */
  const albums = [];
  let articleSampleId = '';
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const bag = /** @type {Record<string, unknown>} */ (raw);
    if (typeof bag.articleSampleId === 'string' && bag.articleSampleId.trim()) {
      articleSampleId = bag.articleSampleId.trim();
    }
    if (Array.isArray(bag.albums)) {
      for (const item of bag.albums) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const row = /** @type {Record<string, unknown>} */ (item);
        const albumId = typeof row.albumId === 'string' ? row.albumId.trim() : '';
        const role = typeof row.role === 'string' ? row.role.trim() : '';
        if (!albumId) continue;
        albums.push({ albumId, role: role || 'image' });
      }
    }
  }
  return { articleSampleId, albums };
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
  const noteId = typeof bag.noteId === 'string' && bag.noteId.trim()
    ? bag.noteId.trim()
    : extractXhsNoteId(sourceUrl);
  const updatedAt = Number(bag.updatedAt);
  return {
    id,
    noteId,
    sourceUrl,
    inputUrls,
    title: typeof bag.title === 'string' ? bag.title : '',
    fetchedAt: typeof bag.fetchedAt === 'string' ? bag.fetchedAt : '',
    learned: normalizeLearned(bag.learned),
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
 * @param {string} libraryDir
 * @param {string} noteId
 * @returns {XhsNoteLinkMeta | null}
 */
function findXhsNoteLinkByNoteId(libraryDir, noteId) {
  const needle = String(noteId || '').trim();
  if (!needle) return null;
  for (const meta of listXhsNoteLinks(libraryDir)) {
    if (meta.noteId === needle) return meta;
  }
  return null;
}

/**
 * 按 noteId（优先）或粘贴串 / sourceUrl 全等命中。
 * @param {string} libraryDir
 * @param {string} url
 * @returns {XhsNoteLinkMeta | null}
 */
function findXhsNoteLinkByUrl(libraryDir, url) {
  const needle = trimUrl(url);
  if (!needle) return null;
  const noteId = extractXhsNoteId(needle);
  if (noteId) {
    const byId = findXhsNoteLinkByNoteId(libraryDir, noteId);
    if (byId) return byId;
  }
  for (const meta of listXhsNoteLinks(libraryDir)) {
    if (meta.sourceUrl === needle) return meta;
    if (meta.inputUrls.includes(needle)) return meta;
    if (noteId && extractXhsNoteId(meta.sourceUrl) === noteId) return meta;
  }
  return null;
}

/**
 * @param {string} libraryDir
 * @param {XhsNoteLinkMeta} meta
 */
function writeMetaFile(libraryDir, meta) {
  const dir = entryDir(libraryDir, meta.id);
  fs.mkdirSync(dir, { recursive: true });
  /** @type {Record<string, unknown>} */
  const out = {
    id: meta.id,
    noteId: meta.noteId,
    sourceUrl: meta.sourceUrl,
    inputUrls: meta.inputUrls,
    title: meta.title,
    fetchedAt: meta.fetchedAt,
    learned: {
      articleSampleId: meta.learned.articleSampleId || '',
      albums: meta.learned.albums.map((row) => ({
        albumId: row.albumId,
        role: row.role,
      })),
    },
    updatedAt: meta.updatedAt,
  };
  fs.writeFileSync(metaPath(libraryDir, meta.id), `${JSON.stringify(out, null, 2)}\n`);
}

/**
 * @param {string} libraryDir
 * @param {{
 *   id?: string;
 *   noteId?: string;
 *   sourceUrl: string;
 *   inputUrl?: string;
 *   title?: string;
 *   fetchedAt?: string;
 *   learned?: unknown;
 * }} input
 * @returns {XhsNoteLinkMeta}
 */
function saveXhsNoteLink(libraryDir, input) {
  if (!libraryDir) throw new Error('缺少小红书链接库目录');
  const sourceUrlRaw = trimUrl(input.sourceUrl);
  if (!sourceUrlRaw) throw new Error('缺少解析后的笔记链接');
  const noteId = (typeof input.noteId === 'string' && input.noteId.trim())
    || extractXhsNoteId(sourceUrlRaw);
  if (!noteId) throw new Error('无法从链接识别小红书笔记 ID');
  const sourceUrl = canonicalExploreUrl(sourceUrlRaw) || sourceUrlRaw;

  const existingId = typeof input.id === 'string' ? input.id.trim() : '';
  const byNote = findXhsNoteLinkByNoteId(libraryDir, noteId)
    || findXhsNoteLinkByUrl(libraryDir, sourceUrlRaw);
  const id = existingId || (byNote && byNote.id) || newLinkId();
  const prev = readXhsNoteLink(libraryDir, id) || byNote;

  /** @type {string[]} */
  const inputUrls = prev ? [...prev.inputUrls] : [];
  const pasted = trimUrl(input.inputUrl);
  if (pasted && !inputUrls.includes(pasted)) inputUrls.push(pasted);
  if (!inputUrls.includes(sourceUrl)) inputUrls.push(sourceUrl);
  if (sourceUrlRaw !== sourceUrl && !inputUrls.includes(sourceUrlRaw)) {
    inputUrls.push(sourceUrlRaw);
  }

  /** @type {XhsNoteLinkMeta} */
  const meta = {
    id,
    noteId,
    sourceUrl,
    inputUrls,
    title: typeof input.title === 'string' ? input.title : (prev ? prev.title : ''),
    fetchedAt: typeof input.fetchedAt === 'string' && input.fetchedAt
      ? input.fetchedAt
      : (prev ? prev.fetchedAt : ''),
    learned: input.learned !== undefined
      ? normalizeLearned(input.learned)
      : (prev ? prev.learned : { articleSampleId: '', albums: [] }),
    updatedAt: Date.now(),
  };
  writeMetaFile(libraryDir, meta);
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
    noteId: existing.noteId,
    sourceUrl: existing.sourceUrl,
    inputUrl,
    title: existing.title,
    fetchedAt: existing.fetchedAt,
    learned: existing.learned,
  });
}

/**
 * @param {string} libraryDir
 * @param {string} linkId
 * @param {string} articleSampleId
 * @returns {XhsNoteLinkMeta | null}
 */
function attachLearnedArticle(libraryDir, linkId, articleSampleId) {
  const prev = readXhsNoteLink(libraryDir, linkId);
  if (!prev) return null;
  const sampleId = String(articleSampleId || '').trim();
  if (!sampleId) return prev;
  return saveXhsNoteLink(libraryDir, {
    id: prev.id,
    noteId: prev.noteId,
    sourceUrl: prev.sourceUrl,
    title: prev.title,
    fetchedAt: prev.fetchedAt,
    learned: {
      articleSampleId: sampleId,
      albums: prev.learned.albums,
    },
  });
}

/**
 * @param {string} libraryDir
 * @param {string} linkId
 * @param {string} albumId
 * @param {string} role
 * @returns {XhsNoteLinkMeta | null}
 */
function attachLearnedAlbum(libraryDir, linkId, albumId, role) {
  const prev = readXhsNoteLink(libraryDir, linkId);
  if (!prev) return null;
  const id = String(albumId || '').trim();
  if (!id) return prev;
  const nextRole = String(role || '').trim() || 'image';
  /** @type {XhsLearnedAlbum[]} */
  const albums = prev.learned.albums.filter((row) => row.albumId !== id);
  albums.push({ albumId: id, role: nextRole });
  return saveXhsNoteLink(libraryDir, {
    id: prev.id,
    noteId: prev.noteId,
    sourceUrl: prev.sourceUrl,
    title: prev.title,
    fetchedAt: prev.fetchedAt,
    learned: {
      articleSampleId: prev.learned.articleSampleId,
      albums,
    },
  });
}

module.exports = {
  attachLearnedAlbum,
  attachLearnedArticle,
  findXhsNoteLinkByNoteId,
  findXhsNoteLinkByUrl,
  listXhsNoteLinks,
  parseMeta,
  readXhsNoteLink,
  rememberInputUrl,
  saveXhsNoteLink,
  trimUrl,
};
