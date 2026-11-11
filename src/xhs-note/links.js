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
 *   contentMd5?: string;
 * }} XhsLearnedAlbum
 * @typedef {{
 *   articleSampleId: string;
 *   articleTextHash?: string;
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
 *   learnedAt: number;
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
  let articleTextHash = '';
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const bag = /** @type {Record<string, unknown>} */ (raw);
    if (typeof bag.articleSampleId === 'string' && bag.articleSampleId.trim()) {
      articleSampleId = bag.articleSampleId.trim();
    }
    if (typeof bag.articleTextHash === 'string' && bag.articleTextHash.trim()) {
      articleTextHash = bag.articleTextHash.trim();
    }
    if (Array.isArray(bag.albums)) {
      for (const item of bag.albums) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const row = /** @type {Record<string, unknown>} */ (item);
        const albumId = typeof row.albumId === 'string' ? row.albumId.trim() : '';
        const role = typeof row.role === 'string' ? row.role.trim() : '';
        const contentMd5 = typeof row.contentMd5 === 'string' ? row.contentMd5.trim() : '';
        if (!albumId) continue;
        /** @type {XhsLearnedAlbum} */
        const next = { albumId, role: role || 'image' };
        if (contentMd5) next.contentMd5 = contentMd5;
        albums.push(next);
      }
    }
  }
  /** @type {XhsNoteLearned} */
  const learned = { articleSampleId, albums };
  if (articleTextHash) learned.articleTextHash = articleTextHash;
  return learned;
}

/**
 * @param {unknown} raw
 * @returns {XhsNoteLinkMeta | null}
 */
function parseMeta(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bag = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof bag.id === 'string' ? bag.id.trim() : '';
  const sourceUrlRaw = trimUrl(bag.sourceUrl);
  if (!id || !sourceUrlRaw) return null;
  const sourceUrl = canonicalExploreUrl(sourceUrlRaw) || sourceUrlRaw;
  /** @type {string[]} */
  const inputUrls = [];
  if (Array.isArray(bag.inputUrls)) {
    for (const item of bag.inputUrls) {
      const u = trimUrl(item);
      if (u && !inputUrls.includes(u)) inputUrls.push(u);
    }
  }
  if (sourceUrlRaw !== sourceUrl && !inputUrls.includes(sourceUrlRaw)) {
    inputUrls.push(sourceUrlRaw);
  }
  const noteId = typeof bag.noteId === 'string' && bag.noteId.trim()
    ? bag.noteId.trim()
    : extractXhsNoteId(sourceUrl);
  const updatedAt = Number(bag.updatedAt);
  const learnedAt = Number(bag.learnedAt);
  return {
    id,
    noteId,
    sourceUrl,
    inputUrls,
    title: typeof bag.title === 'string' ? bag.title : '',
    fetchedAt: typeof bag.fetchedAt === 'string' ? bag.fetchedAt : '',
    learned: normalizeLearned(bag.learned),
    learnedAt: Number.isFinite(learnedAt) ? learnedAt : 0,
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
    const raw = /** @type {Record<string, unknown>} */ (JSON.parse(fs.readFileSync(file, 'utf8')));
    const meta = parseMeta(raw);
    if (!meta) return null;
    const diskUrl = trimUrl(raw.sourceUrl);
    // 盘上仍带 xsec_token 等 query：写回规范链，避免浮层展示脏链
    if (diskUrl && diskUrl !== meta.sourceUrl) {
      return saveXhsNoteLink(libraryDir, {
        id: meta.id,
        noteId: meta.noteId,
        sourceUrl: meta.sourceUrl,
        title: meta.title,
        fetchedAt: meta.fetchedAt,
        learned: meta.learned,
        learnedAt: meta.learnedAt,
      });
    }
    return meta;
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
  const learnedOut = {
    articleSampleId: meta.learned.articleSampleId || '',
    albums: meta.learned.albums.map((row) => {
      /** @type {Record<string, string>} */
      const album = { albumId: row.albumId, role: row.role };
      if (row.contentMd5) album.contentMd5 = row.contentMd5;
      return album;
    }),
  };
  if (meta.learned.articleTextHash) {
    learnedOut.articleTextHash = meta.learned.articleTextHash;
  }
  /** @type {Record<string, unknown>} */
  const out = {
    id: meta.id,
    noteId: meta.noteId,
    sourceUrl: meta.sourceUrl,
    inputUrls: meta.inputUrls,
    title: meta.title,
    fetchedAt: meta.fetchedAt,
    learned: learnedOut,
    learnedAt: meta.learnedAt || 0,
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
 *   learnedAt?: number;
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

  const learnedAtInput = Number(input.learnedAt);
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
    learnedAt: Number.isFinite(learnedAtInput)
      ? learnedAtInput
      : (prev ? prev.learnedAt : 0),
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
 * @param {string} [articleTextHash]
 * @returns {XhsNoteLinkMeta | null}
 */
function attachLearnedArticle(libraryDir, linkId, articleSampleId, articleTextHash) {
  const prev = readXhsNoteLink(libraryDir, linkId);
  if (!prev) return null;
  const sampleId = String(articleSampleId || '').trim();
  if (!sampleId) return prev;
  const hash = typeof articleTextHash === 'string' ? articleTextHash.trim() : '';
  /** @type {XhsNoteLearned} */
  const learned = {
    articleSampleId: sampleId,
    albums: prev.learned.albums,
  };
  if (hash) learned.articleTextHash = hash;
  else if (prev.learned.articleTextHash) learned.articleTextHash = prev.learned.articleTextHash;
  return saveXhsNoteLink(libraryDir, {
    id: prev.id,
    noteId: prev.noteId,
    sourceUrl: prev.sourceUrl,
    title: prev.title,
    fetchedAt: prev.fetchedAt,
    learned,
    learnedAt: Date.now(),
  });
}

/**
 * @param {string} libraryDir
 * @param {string} linkId
 * @param {string} albumId
 * @param {string} role
 * @param {string} [contentMd5]
 * @returns {XhsNoteLinkMeta | null}
 */
function attachLearnedAlbum(libraryDir, linkId, albumId, role, contentMd5) {
  const prev = readXhsNoteLink(libraryDir, linkId);
  if (!prev) return null;
  const id = String(albumId || '').trim();
  if (!id) return prev;
  const nextRole = String(role || '').trim() || 'image';
  const md5 = typeof contentMd5 === 'string' ? contentMd5.trim() : '';
  /** @type {XhsLearnedAlbum[]} */
  const albums = prev.learned.albums.filter((row) => (
    row.albumId !== id && row.role !== nextRole
  ));
  /** @type {XhsLearnedAlbum} */
  const row = { albumId: id, role: nextRole };
  if (md5) row.contentMd5 = md5;
  albums.push(row);
  /** @type {XhsNoteLearned} */
  const learned = {
    articleSampleId: prev.learned.articleSampleId,
    albums,
  };
  if (prev.learned.articleTextHash) learned.articleTextHash = prev.learned.articleTextHash;
  return saveXhsNoteLink(libraryDir, {
    id: prev.id,
    noteId: prev.noteId,
    sourceUrl: prev.sourceUrl,
    title: prev.title,
    fetchedAt: prev.fetchedAt,
    learned,
    learnedAt: Date.now(),
  });
}

/**
 * 只补指纹，不改柜子里的图文内容。
 * @param {string} libraryDir
 * @param {string} linkId
 * @param {{ articleTextHash?: string; albums?: { albumId: string; role: string; contentMd5?: string }[] }} patch
 * @returns {XhsNoteLinkMeta | null}
 */
function patchLearnedFingerprints(libraryDir, linkId, patch) {
  const prev = readXhsNoteLink(libraryDir, linkId);
  if (!prev) return null;
  /** @type {XhsNoteLearned} */
  const learned = {
    articleSampleId: prev.learned.articleSampleId,
    albums: prev.learned.albums.map((row) => ({ ...row })),
  };
  if (typeof patch.articleTextHash === 'string' && patch.articleTextHash.trim()) {
    learned.articleTextHash = patch.articleTextHash.trim();
  } else if (prev.learned.articleTextHash) {
    learned.articleTextHash = prev.learned.articleTextHash;
  }
  if (Array.isArray(patch.albums)) {
    for (const item of patch.albums) {
      if (!item || !item.albumId) continue;
      const role = item.role || 'image';
      const idx = learned.albums.findIndex((row) => row.albumId === item.albumId || row.role === role);
      if (idx >= 0) {
        learned.albums[idx] = {
          albumId: item.albumId,
          role,
          contentMd5: item.contentMd5 || learned.albums[idx].contentMd5,
        };
      } else {
        /** @type {XhsLearnedAlbum} */
        const next = { albumId: item.albumId, role };
        if (item.contentMd5) next.contentMd5 = item.contentMd5;
        learned.albums.push(next);
      }
    }
  }
  return saveXhsNoteLink(libraryDir, {
    id: prev.id,
    noteId: prev.noteId,
    sourceUrl: prev.sourceUrl,
    title: prev.title,
    fetchedAt: prev.fetchedAt,
    learned,
    learnedAt: Date.now(),
  });
}

/**
 * @param {string} libraryDir
 * @param {string} id
 * @returns {boolean}
 */
function deleteXhsNoteLink(libraryDir, id) {
  const safe = String(id || '').trim();
  if (!safe || !libraryDir) return false;
  const dir = entryDir(libraryDir, safe);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/**
 * 详情「打开原帖」用：仅返回带 xsec_token 的原粘贴串；没有则空串（前端不做成可点链接）。
 * @param {{ sourceUrl?: string; inputUrls?: string[] } | null | undefined} meta
 * @returns {string}
 */
function pickOpenableXhsUrl(meta) {
  if (!meta || typeof meta !== 'object') return '';
  /** @type {string[]} */
  const inputs = Array.isArray(meta.inputUrls)
    ? meta.inputUrls.map((u) => trimUrl(u)).filter(Boolean)
    : [];
  // 从后往前：偏最近粘贴；无 token 的 explore/短链点开也看不了，不返回
  for (let i = inputs.length - 1; i >= 0; i -= 1) {
    const url = inputs[i];
    if (url && /[?&]xsec_token=/i.test(url)) return url;
  }
  return '';
}

module.exports = {
  attachLearnedAlbum,
  attachLearnedArticle,
  deleteXhsNoteLink,
  findXhsNoteLinkByNoteId,
  findXhsNoteLinkByUrl,
  listXhsNoteLinks,
  normalizeLearned,
  parseMeta,
  patchLearnedFingerprints,
  pickOpenableXhsUrl,
  readXhsNoteLink,
  rememberInputUrl,
  saveXhsNoteLink,
  trimUrl,
};
