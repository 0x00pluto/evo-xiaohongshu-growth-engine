'use strict';

const path = require('node:path');
const { fillMissingFromDotEnv } = require('./src/one-post/env');
const { createRunner } = require('./src/one-post/run');

function pluginRoot() {
  return __dirname;
}

function resolveEnv(ctx) {
  const base = ctx && typeof ctx.pluginEnv === 'function' ? { ...ctx.pluginEnv() } : {};
  return fillMissingFromDotEnv(base, path.join(pluginRoot(), '.env'));
}

function revealInFolder(absPath) {
  const { shell } = require('electron');
  shell.showItemInFolder(absPath);
}

function apply(ctx) {
  const dataDir = ctx && ctx.dirs && ctx.dirs.data ? ctx.dirs.data : pluginRoot();
  const runner = createRunner({
    postsDir: path.join(dataDir, 'output', 'one-post', 'posts'),
    promptsDir: path.join(pluginRoot(), 'assets', 'prompts', 'one-post'),
    env: resolveEnv(ctx),
    revealFile: revealInFolder,
  });
  ctx.registerService('onePost', {
    listPosts() {
      return runner.listPosts();
    },
    loadLatest() {
      return runner.loadLatest();
    },
    openPost(payload) {
      return runner.openPost(payload || {});
    },
    saveEditor(payload) {
      return runner.saveEditor(payload || {});
    },
    generateDraft(payload) {
      return runner.generateDraft(payload || {});
    },
    generatePrompts(payload) {
      return runner.generatePrompts(payload || {});
    },
    generateImages(payload) {
      return runner.generateImages(payload || {});
    },
    retryImage(payload) {
      return runner.retryImage(payload || {});
    },
    previewImage(payload) {
      return runner.previewImage(payload || {});
    },
    revealImage(payload) {
      return runner.revealImage(payload || {});
    },
    startNew() {
      return runner.startNew();
    },
  });
}

function dispose() {}

module.exports = { apply, dispose };
