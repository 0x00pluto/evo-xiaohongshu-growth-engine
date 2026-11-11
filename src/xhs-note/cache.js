// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extForMime, guessMime } = require('./download-image');

/** 成功取回后的复用窗口（毫秒） */
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @returns {string}
 */
function noteCacheDir(cacheRoot, noteId) {
  return path.join(cacheRoot, String(noteId || '').trim());
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @returns {string}
 */
function payloadPath(cacheRoot, noteId) {
  return path.join(noteCacheDir(cacheRoot, noteId), 'payload.json');
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @returns {string}
 */
function metaPath(cacheRoot, noteId) {
  return path.join(noteCacheDir(cacheRoot, noteId), 'cache-meta.json');
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @returns {string}
 */
function imagesDir(cacheRoot, noteId) {
  return path.join(noteCacheDir(cacheRoot, noteId), 'images');
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @param {number} [fetchedAtMs]
 */
function writeCacheMeta(cacheRoot, noteId, fetchedAtMs) {
  const id = String(noteId || '').trim();
  if (!cacheRoot || !id) return;
  const dir = noteCacheDir(cacheRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  const ms = Number.isFinite(fetchedAtMs) ? Number(fetchedAtMs) : Date.now();
  fs.writeFileSync(metaPath(cacheRoot, id), `${JSON.stringify({ fetchedAtMs: ms }, null, 2)}\n`);
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @returns {number | null}
 */
function readFetchedAtMs(cacheRoot, noteId) {
  const id = String(noteId || '').trim();
  if (!cacheRoot || !id) return null;
  const file = metaPath(cacheRoot, id);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ms = raw && typeof raw === 'object' ? Number(/** @type {Record<string, unknown>} */ (raw).fetchedAtMs) : NaN;
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @param {number} [nowMs]
 * @returns {boolean}
 */
function isCacheFresh(cacheRoot, noteId, nowMs) {
  const fetchedAt = readFetchedAtMs(cacheRoot, noteId);
  if (fetchedAt == null) return false;
  const now = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  return now - fetchedAt < CACHE_TTL_MS;
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @param {unknown} note
 * @returns {string} abs path of payload.json
 */
function writeNotePayload(cacheRoot, noteId, note) {
  const id = String(noteId || '').trim();
  if (!cacheRoot || !id) throw new Error('缺少笔记缓存目录或 noteId');
  const dir = noteCacheDir(cacheRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = payloadPath(cacheRoot, id);
  fs.writeFileSync(file, `${JSON.stringify(note, null, 2)}\n`);
  writeCacheMeta(cacheRoot, id, Date.now());
  return file;
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @returns {unknown | null}
 */
function readNotePayload(cacheRoot, noteId) {
  const id = String(noteId || '').trim();
  if (!cacheRoot || !id) return null;
  const file = payloadPath(cacheRoot, id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} dataUrl
 * @returns {{ mime: string; bytes: Buffer } | null}
 */
function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i.exec(raw);
  if (!match) return null;
  const mime = guessMime('', match[1] || 'image/jpeg') || 'image/jpeg';
  if (!extForMime(mime)) return null;
  try {
    const bytes = Buffer.from(match[2] || '', 'base64');
    if (!bytes.length) return null;
    return { mime, bytes };
  } catch {
    return null;
  }
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @param {string} basename 如 cover / inner-0
 * @param {string} dataUrl
 * @returns {string | null} 写入的文件路径
 */
function writeImageDataUrl(cacheRoot, noteId, basename, dataUrl) {
  const id = String(noteId || '').trim();
  const name = String(basename || '').trim();
  if (!cacheRoot || !id || !name) return null;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const ext = extForMime(parsed.mime);
  if (!ext) return null;
  const dir = imagesDir(cacheRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}${ext}`);
  fs.writeFileSync(file, parsed.bytes);
  return file;
}

/**
 * @param {string} cacheRoot
 * @param {string} noteId
 * @param {string} basename
 * @returns {string} dataUrl 或空串
 */
function readImageDataUrl(cacheRoot, noteId, basename) {
  const id = String(noteId || '').trim();
  const name = String(basename || '').trim();
  if (!cacheRoot || !id || !name) return '';
  const dir = imagesDir(cacheRoot, id);
  if (!fs.existsSync(dir)) return '';
  /** @type {string[]} */
  const candidates = ['.jpg', '.jpeg', '.png', '.webp'];
  for (const ext of candidates) {
    const file = path.join(dir, `${name}${ext === '.jpeg' ? '.jpg' : ext}`);
    // also try .jpeg literally
    const alt = path.join(dir, `${name}${ext}`);
    const hit = fs.existsSync(file) ? file : (fs.existsSync(alt) ? alt : '');
    if (!hit) continue;
    try {
      const bytes = fs.readFileSync(hit);
      const mime = guessMime(hit, '') || 'image/jpeg';
      return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * 从 dataUrl / 已有缓存 / 远程 URL 解析出 dataUrl（优先本地）。
 * @param {{
 *   cacheRoot: string;
 *   noteId: string;
 *   basename: string;
 *   dataUrl?: string;
 *   remoteUrl?: string;
 *   mime?: string;
 *   downloadFn: (url: string, options?: { mime?: string }) => Promise<{ dataUrl: string } | null>;
 * }} args
 * @returns {Promise<string>}
 */
async function resolveImageDataUrl(args) {
  const fromClient = typeof args.dataUrl === 'string' ? args.dataUrl.trim() : '';
  if (fromClient.startsWith('data:')) {
    writeImageDataUrl(args.cacheRoot, args.noteId, args.basename, fromClient);
    return fromClient;
  }
  const cached = readImageDataUrl(args.cacheRoot, args.noteId, args.basename);
  if (cached) return cached;
  const remote = typeof args.remoteUrl === 'string' ? args.remoteUrl.trim() : '';
  if (!remote) return '';
  const downloaded = await args.downloadFn(remote, { mime: args.mime });
  if (!downloaded || !downloaded.dataUrl) return '';
  writeImageDataUrl(args.cacheRoot, args.noteId, args.basename, downloaded.dataUrl);
  return downloaded.dataUrl;
}

module.exports = {
  CACHE_TTL_MS,
  imagesDir,
  isCacheFresh,
  metaPath,
  noteCacheDir,
  parseDataUrl,
  payloadPath,
  readFetchedAtMs,
  readImageDataUrl,
  readNotePayload,
  resolveImageDataUrl,
  writeCacheMeta,
  writeImageDataUrl,
  writeNotePayload,
};
