// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BODY_LIMIT = 8000;
const EMPTY_NAME = '请写上名称';
const EMPTY_BODY = '请写上正文';
const BODY_TOO_LONG = '贴进来的原文太长了，先删到 8000 字以内。';

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   body: string;
 *   updatedAt: number;
 * }} ReferenceDocMeta
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
function newReferenceDocId() {
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
 * @param {unknown} name
 * @param {unknown} body
 * @returns {{ ok: true; name: string; body: string } | { ok: false; message: string; field?: string }}
 */
function validateDocFields(name, body) {
  const nextName = typeof name === 'string' ? name.trim() : '';
  const nextBody = typeof body === 'string' ? body.trim() : '';
  if (!nextName) return { ok: false, message: EMPTY_NAME, field: 'name' };
  if (!nextBody) return { ok: false, message: EMPTY_BODY, field: 'body' };
  if (charLength(nextBody) > BODY_LIMIT) {
    return { ok: false, message: BODY_TOO_LONG, field: 'body' };
  }
  return { ok: true, name: nextName, body: nextBody };
}

/**
 * @param {unknown} raw
 * @returns {ReferenceDocMeta | null}
 */
function parseMeta(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bag = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof bag.id === 'string' ? bag.id.trim() : '';
  const name = typeof bag.name === 'string' ? bag.name.trim() : '';
  const body = typeof bag.body === 'string' ? bag.body : '';
  const updatedAt = Number(bag.updatedAt);
  if (!id || !name || !String(body).trim()) return null;
  return {
    id,
    name,
    body,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

/**
 * @param {string} libraryDir
 * @returns {ReferenceDocMeta[]}
 */
function listReferenceDocs(libraryDir) {
  if (!libraryDir || !fs.existsSync(libraryDir)) return [];
  /** @type {ReferenceDocMeta[]} */
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
 * @returns {ReferenceDocMeta | null}
 */
function readReferenceDoc(libraryDir, id) {
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
 * 新建时按 trim 后正文全等复用已有条目，不写第二份。
 * @param {string} libraryDir
 * @param {{ id?: string; name: unknown; body: unknown }} input
 * @returns {ReferenceDocMeta}
 */
function saveReferenceDoc(libraryDir, input) {
  if (!libraryDir) throw new Error('缺少参考资料库目录');
  const checked = validateDocFields(input.name, input.body);
  if (!checked.ok) throw new Error(checked.message);
  const existingId = typeof input.id === 'string' ? input.id.trim() : '';
  if (!existingId) {
    const dup = listReferenceDocs(libraryDir).find((item) => item.body.trim() === checked.body);
    if (dup) return dup;
  }
  const id = existingId || newReferenceDocId();
  if (existingId) {
    const prev = readReferenceDoc(libraryDir, existingId);
    if (!prev) throw new Error('库里没有这条参考资料');
  }
  /** @type {ReferenceDocMeta} */
  const meta = {
    id,
    name: checked.name,
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
function deleteReferenceDoc(libraryDir, id) {
  const safe = String(id || '').trim();
  if (!safe || !libraryDir) throw new Error('库里没有这条参考资料');
  const dir = entryDir(libraryDir, safe);
  if (!fs.existsSync(dir)) throw new Error('库里没有这条参考资料');
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * 整篇粘贴：第一行当名称，其余当正文；无换行则正文=全文、名称取前 20 字。
 * @param {unknown} paste
 * @returns {{ name: string; body: string }}
 */
function splitPasteToDoc(paste) {
  const raw = String(paste || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return { name: '', body: '' };
  const nl = raw.indexOf('\n');
  if (nl < 0) {
    const name = Array.from(raw).slice(0, 20).join('');
    return { name, body: raw };
  }
  const name = raw.slice(0, nl).trim();
  const body = raw.slice(nl + 1).trim();
  return {
    name: name || Array.from(body).slice(0, 20).join(''),
    body: body || name,
  };
}

/**
 * @param {ReferenceDocMeta} meta
 * @returns {{ id: string; name: string; body: string; updatedAt: number; preview: string }}
 */
function publicListItem(meta) {
  const body = String(meta.body || '');
  const preview = body
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 400);
  return {
    id: meta.id,
    name: meta.name,
    body,
    updatedAt: meta.updatedAt,
    preview,
  };
}

module.exports = {
  BODY_LIMIT,
  BODY_TOO_LONG,
  EMPTY_BODY,
  EMPTY_NAME,
  deleteReferenceDoc,
  listReferenceDocs,
  newReferenceDocId,
  publicListItem,
  readReferenceDoc,
  saveReferenceDoc,
  splitPasteToDoc,
  validateDocFields,
};
