'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('../draft/store');
const { formatPost } = require('../draft/validate');

const ID_PATTERN = /^[0-9]{8}-[0-9]{6}(?:-[0-9]+)?$/;

function formatId(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  ].join('-');
}

function indexFile(postsDir) {
  return path.join(postsDir, 'index.json');
}

function readIndex(postsDir) {
  const file = indexFile(postsDir);
  if (!fs.existsSync(file)) return { posts: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const posts = Array.isArray(raw.posts) ? raw.posts.filter((item) => item && ID_PATTERN.test(item.id)) : [];
    return { posts };
  } catch (err) {
    return { posts: [] };
  }
}

function writeIndex(postsDir, index) {
  fs.mkdirSync(postsDir, { recursive: true });
  const file = indexFile(postsDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ posts: index.posts }, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function titleOf(state) {
  const fromDraft = state.draft && String(state.draft.title || '').trim();
  if (fromDraft) return fromDraft;
  const business = String(state.business || '').trim();
  return business || '未命名';
}

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

function touchPost(postsDir, id, state) {
  const index = readIndex(postsDir);
  const found = index.posts.find((item) => item.id === id);
  if (!found) return;
  found.updatedAt = new Date().toISOString();
  found.title = titleOf(state);
  writeIndex(postsDir, index);
}

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

function importLegacy(postsDir) {
  const latestDir = path.join(path.dirname(postsDir), 'latest');
  if (path.resolve(latestDir) === path.resolve(postsDir)) return;
  const legacyFile = path.join(latestDir, 'draft.json');
  if (!fs.existsSync(legacyFile)) return;
  if (readIndex(postsDir).posts.length > 0) return;
  const when = fs.statSync(legacyFile).mtime;
  const id = uniqueId(postsDir, when);
  const dest = path.join(postsDir, id);
  fs.cpSync(latestDir, dest, { recursive: true });
  const state = createStore(dest).read();
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

function listPosts(postsDir) {
  const posts = readIndex(postsDir).posts.map((item) => {
    const state = createStore(path.join(postsDir, item.id)).read();
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
