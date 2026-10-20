// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('../draft/store')} */
const storeModule = require('../draft/store');
/** @type {typeof import('../draft/validate')} */
const validateModule = require('../draft/validate');
const { createStore } = storeModule;
const { formatPost } = validateModule;

const ID_PATTERN = /^[0-9]{8}-[0-9]{6}(?:-[0-9]+)?$/;

/**
 * @typedef {{ id: string; createdAt: string; updatedAt: string; title: string }} PostIndexItem
 * @typedef {{ posts: PostIndexItem[] }} PostIndex
 * @typedef {{
 *   id: string;
 *   createdAt: string;
 *   updatedAt: string;
 *   title: string;
 *   postText: string;
 * }} ListedPost
 */

/**
 * @param {Date} date
 * @returns {string}
 */
function formatId(date) {
  /**
   * @param {number} value
   * @returns {string}
   */
  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  ].join('-');
}

/**
 * @param {string} postsDir
 * @returns {string}
 */
function indexFile(postsDir) {
  return path.join(postsDir, 'index.json');
}

/**
 * @param {string} postsDir
 * @returns {PostIndex}
 */
function readIndex(postsDir) {
  const file = indexFile(postsDir);
  if (!fs.existsSync(file)) return { posts: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const posts = Array.isArray(raw.posts)
      ? raw.posts.filter((/** @type {unknown} */ item) => {
        if (!item || typeof item !== 'object') return false;
        const row = /** @type {Record<string, unknown>} */ (item);
        return typeof row.id === 'string' && ID_PATTERN.test(row.id);
      }).map((/** @type {Record<string, unknown>} */ item) => ({
        id: String(item.id),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
        title: typeof item.title === 'string' ? item.title : '',
      }))
      : [];
    return { posts };
  } catch {
    return { posts: [] };
  }
}

/**
 * @param {string} postsDir
 * @param {PostIndex} index
 */
function writeIndex(postsDir, index) {
  fs.mkdirSync(postsDir, { recursive: true });
  const file = indexFile(postsDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ posts: index.posts }, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/**
 * @param {import('../draft/store').DraftState} state
 * @returns {string}
 */
function titleOf(state) {
  const fromDraft = state.draft && String(state.draft.title || '').trim();
  if (fromDraft) return fromDraft;
  const business = String(state.business || '').trim();
  return business || '未命名';
}

/**
 * @param {string} postsDir
 * @param {Date} date
 * @returns {string}
 */
function uniqueId(postsDir, date) {
  const base = formatId(date);
  let id = base;
  let suffix = 2;
  while (fs.existsSync(path.join(postsDir, id))) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

/**
 * @param {string} postsDir
 * @param {string} id
 * @param {import('../draft/store').DraftState} state
 */
function touchPost(postsDir, id, state) {
  const index = readIndex(postsDir);
  const found = index.posts.find((item) => item.id === id);
  if (!found) return;
  found.updatedAt = new Date().toISOString();
  found.title = titleOf(state);
  writeIndex(postsDir, index);
}

/**
 * @param {string} postsDir
 * @param {Date} date
 * @returns {string}
 */
function allocatePost(postsDir, date) {
  const createdAt = date.toISOString();
  const id = uniqueId(postsDir, date);
  const index = readIndex(postsDir);
  index.posts.unshift({
    id,
    createdAt,
    updatedAt: createdAt,
    title: '未命名',
  });
  writeIndex(postsDir, index);
  return id;
}

/**
 * @param {string} postsDir
 * @param {string} [promptsDir]
 */
/**
 * @param {string} postsDir
 * @param {string} [promptsDir]
 * @param {string} [userAlbumsDir]
 */
function importLegacy(postsDir, promptsDir, userAlbumsDir) {
  const latestDir = path.join(path.dirname(postsDir), 'latest');
  if (path.resolve(latestDir) === path.resolve(postsDir)) return;
  const legacyFile = path.join(latestDir, 'draft.json');
  if (!fs.existsSync(legacyFile)) return;
  if (readIndex(postsDir).posts.length > 0) return;
  const when = fs.statSync(legacyFile).mtime;
  const id = uniqueId(postsDir, when);
  const dest = path.join(postsDir, id);
  fs.cpSync(latestDir, dest, { recursive: true });
  const state = createStore(dest, { promptsDir, userAlbumsDir }).read();
  const createdAt = when.toISOString();
  writeIndex(postsDir, {
    posts: [{
      id,
      createdAt,
      updatedAt: createdAt,
      title: titleOf(state),
    }],
  });
  fs.rmSync(latestDir, { recursive: true, force: true });
}

/**
 * @param {string} postsDir
 * @param {string} [promptsDir]
 * @param {string} [userAlbumsDir]
 * @returns {ListedPost[]}
 */
function listPosts(postsDir, promptsDir, userAlbumsDir) {
  const posts = readIndex(postsDir).posts.map((item) => {
    const state = createStore(path.join(postsDir, item.id), { promptsDir, userAlbumsDir }).read();
    const draftTitle = state.draft && String(state.draft.title || '').trim();
    return {
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      title: draftTitle || item.title || titleOf(state),
      postText: formatPost(state.draft),
    };
  });
  posts.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  return posts;
}

/**
 * @param {string} postsDir
 * @param {string} id
 * @returns {boolean}
 */
function hasPost(postsDir, id) {
  return ID_PATTERN.test(id) && readIndex(postsDir).posts.some((item) => item.id === id);
}

module.exports = {
  allocatePost,
  hasPost,
  importLegacy,
  listPosts,
  touchPost,
};
