'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createLlm } = require('../llm/client');
const { generatePng } = require('../image/generate');
const {
  faceVars,
  fillPrompt,
  parseCoverText,
  parseDraftText,
  parseGalleryText,
  readPromptFile,
} = require('../prompts/fill');
const { createStore, emptyState, galleryFile } = require('../draft/store');
const {
  basisEqual,
  basisFrom,
  validateDraftFace,
  validateGalleryCount,
  validateInputs,
  normalizeFace,
} = require('../draft/validate');
const {
  allocatePost,
  hasPost,
  importLegacy,
  listPosts,
  touchPost,
} = require('./posts');

const BUSY_MESSAGE = '正在生成，请等这一轮结束';

function slotFile(slot, index) {
  if (slot === 'cover') return 'cover.png';
  if (slot === 'gallery' && Number.isInteger(index) && index >= 1 && index <= 9) return galleryFile(index);
  return '';
}

function promptsBlockReason(state) {
  if (!state.draft) return '还没有稿面';
  const current = basisFrom(state.draft, state.galleryCount);
  if (state.prompts.stale || !basisEqual(state.prompts.basis, current)) return '提示词待重算';
  if (!state.prompts.cover.trim()) return '封面提示词是空的';
  if (state.prompts.gallery.length !== state.galleryCount) return '提示词条数和配图张数不一致';
  if (state.prompts.gallery.some((item) => !String(item).trim())) return '有配图提示词是空的';
  return '';
}

function createRunner(options) {
  const postsDir = options.postsDir || options.latestDir;
  const promptsDir = options.promptsDir;
  const env = options.env || {};
  const fetchImpl = options.fetch;
  const now = options.now || (() => new Date());
  importLegacy(postsDir);
  let currentId = '';
  let currentDir = '';
  let store = null;
  const llm = createLlm(env, fetchImpl);
  const complete = options.complete || ((prompt) => llm.complete(prompt));
  const generateImage = options.generateImage || ((args) => generatePng({
    prompt: args.prompt,
    outputPath: args.outputPath,
    env,
    fetch: fetchImpl,
  }));
  const revealFile = options.revealFile || (() => {});
  let lock = null;

  function usePost(id) {
    currentId = id;
    currentDir = path.join(postsDir, id);
    store = createStore(currentDir);
    const writeFile = store.write;
    store.write = (state) => {
      writeFile(state);
      touchPost(postsDir, id, state);
    };
  }

  function blank() {
    return { ok: true, ...emptyState(), directory: '', id: '' };
  }

  function busy() {
    return { ok: false, message: BUSY_MESSAGE };
  }

  function markJobFailed(message) {
    const state = store.read();
    if (state.images.cover.status === '生成中') {
      state.images.cover = { status: '失败', path: '' };
    }
    state.images.gallery = state.images.gallery.map((slot) => (
      slot.status === '生成中' ? { status: '失败', path: '' } : slot
    ));
    state.job = { running: false, step: '', error: message || '没有完成' };
    store.write(state);
  }

  function applyPromptText(state, payload) {
    if (!payload || !payload.prompts) return;
    if (typeof payload.prompts.cover === 'string') state.prompts.cover = payload.prompts.cover;
    if (Array.isArray(payload.prompts.gallery)) {
      state.prompts.gallery = payload.prompts.gallery.map((item) => String(item));
    }
  }

  function applyDraftText(state, payload) {
    if (!payload || !payload.draft || typeof payload.draft !== 'object') return;
    state.draft = {
      title: typeof payload.draft.title === 'string' ? payload.draft.title : '',
      body: typeof payload.draft.body === 'string' ? payload.draft.body : '',
      topics: Array.isArray(payload.draft.topics) ? payload.draft.topics.map((topic) => String(topic)) : [],
      coverLine: typeof payload.draft.coverLine === 'string' ? payload.draft.coverLine : '',
    };
  }

  function markStaleIfNeeded(state) {
    if (!state.draft || !state.prompts.basis) return;
    const current = basisFrom(state.draft, state.galleryCount);
    if (basisEqual(state.prompts.basis, current)) {
      state.prompts.stale = false;
      return;
    }
    state.prompts.stale = true;
    store.invalidateImages(state);
  }

  async function producePrompts(face, galleryCount) {
    const vars = faceVars(face, galleryCount);
    const coverPrompt = fillPrompt(readPromptFile(promptsDir, 'cover.md'), vars);
    const cover = parseCoverText(await complete(coverPrompt));
    let gallery = [];
    if (galleryCount > 0) {
      const galleryPrompt = fillPrompt(readPromptFile(promptsDir, 'gallery.md'), vars);
      gallery = parseGalleryText(await complete(galleryPrompt), galleryCount);
    }
    return { cover, gallery };
  }

  function commitPrompts(face, galleryCount, produced) {
    const state = store.read();
    state.draft = face;
    state.galleryCount = galleryCount;
    state.prompts = {
      cover: produced.cover,
      gallery: produced.gallery,
      stale: false,
      basis: basisFrom(face, galleryCount),
    };
    store.invalidateImages(state);
    state.job = { running: false, step: '', error: '' };
    store.write(state);
  }

  async function runGenerateDraft(checked) {
    try {
      const draftPrompt = fillPrompt(readPromptFile(promptsDir, 'draft.md'), {
        business: checked.business,
        article: checked.article,
      });
      let face;
      try {
        face = parseDraftText(await complete(draftPrompt));
      } catch (err) {
        markJobFailed(err.message || '成稿失败');
        return;
      }
      const drafted = store.read();
      drafted.draft = face;
      drafted.prompts.stale = true;
      drafted.job = { running: true, step: '提示词', error: '' };
      store.write(drafted);
      let produced;
      try {
        produced = await producePrompts(face, checked.galleryCount);
      } catch (err) {
        markJobFailed(err.message || '提示词失败');
        return;
      }
      commitPrompts(face, checked.galleryCount, produced);
    } catch (err) {
      markJobFailed(err.message || '生成稿失败');
    }
  }

  async function runGeneratePrompts() {
    try {
      const state = store.read();
      const face = state.draft;
      const galleryCount = state.galleryCount;
      let produced;
      try {
        produced = await producePrompts(face, galleryCount);
      } catch (err) {
        markJobFailed(err.message || '提示词失败');
        return;
      }
      commitPrompts(face, galleryCount, produced);
    } catch (err) {
      markJobFailed(err.message || '提示词失败');
    }
  }

  function setImageSlot(state, slot, index, next) {
    if (slot === 'cover') {
      state.images.cover = next;
      return;
    }
    const gallery = state.images.gallery.slice();
    while (gallery.length < index) gallery.push({ status: '空', path: '' });
    gallery[index - 1] = next;
    state.images.gallery = gallery;
  }

  async function runImages(only) {
    try {
      const initial = store.read();
      const jobs = [{ slot: 'cover', index: 0, file: 'cover.png', prompt: initial.prompts.cover, label: '封面' }];
      initial.prompts.gallery.forEach((prompt, index) => {
        const number = index + 1;
        jobs.push({
          slot: 'gallery',
          index: number,
          file: galleryFile(number),
          prompt,
          label: `配图 ${number}`,
        });
      });
      const selected = only
        ? jobs.filter((job) => job.slot === only.slot && (only.slot === 'cover' || job.index === only.index))
        : jobs;
      let failed = 0;
      let lastError = '';
      for (const job of selected) {
        const current = store.read();
        setImageSlot(current, job.slot, job.index, { status: '生成中', path: '' });
        current.job = { running: true, step: job.label, error: '' };
        store.write(current);
        const outputPath = path.join(currentDir, job.file);
        try {
          await generateImage({ prompt: job.prompt, outputPath });
          const done = store.read();
          setImageSlot(done, job.slot, job.index, { status: '成功', path: job.file });
          done.job = { running: true, step: job.label, error: '' };
          store.write(done);
        } catch (err) {
          failed += 1;
          lastError = err && err.message ? err.message : '生图失败';
          fs.rmSync(outputPath, { force: true });
          const failedState = store.read();
          setImageSlot(failedState, job.slot, job.index, { status: '失败', path: '' });
          failedState.job = { running: true, step: job.label, error: '' };
          store.write(failedState);
        }
      }
      const finished = store.read();
      finished.job = {
        running: false,
        step: '',
        error: failed > 0 ? `${lastError}。可以只重试失败的那一张` : '',
      };
      store.write(finished);
    } catch (err) {
      markJobFailed(err.message || '生图失败');
    }
  }

  function loadLatest() {
    if (!store) return blank();
    const existed = store.exists();
    const state = store.read();
    if (existed && state.job.running && !lock) {
      state.job = {
        running: false,
        step: '',
        error: state.job.error || '上次生成中断，请重试',
      };
      if (state.images.cover.status === '生成中') {
        state.images.cover = { status: '失败', path: state.images.cover.path };
      }
      state.images.gallery = state.images.gallery.map((slot) => (
        slot.status === '生成中' ? { status: '失败', path: slot.path } : slot
      ));
      store.write(state);
    }
    return { ok: true, ...state, directory: currentDir, id: currentId };
  }

  function startNew() {
    if (lock) return busy();
    currentId = '';
    currentDir = '';
    store = null;
    return blank();
  }

  function openPost(payload) {
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const id = typeof source.id === 'string' ? source.id : '';
    if (!hasPost(postsDir, id)) return { ok: false, message: '没有这一篇' };
    usePost(id);
    return loadLatest();
  }

  function catalog() {
    return { ok: true, posts: listPosts(postsDir) };
  }

  function saveEditor(payload) {
    if (!store) return { ok: true, skipped: true };
    if (lock) return busy();
    const state = store.read();
    const source = payload && typeof payload === 'object' ? payload : {};
    if (typeof source.business === 'string') state.business = source.business;
    if (typeof source.article === 'string') state.article = source.article;
    if (source.galleryCount != null) {
      const count = validateGalleryCount(source.galleryCount);
      if (!count.ok) return count;
      state.galleryCount = count.galleryCount;
    }
    applyDraftText(state, source);
    applyPromptText(state, source);
    markStaleIfNeeded(state);
    store.write(state);
    return { ok: true };
  }

  function generateDraft(payload) {
    const checked = validateInputs(payload);
    if (!checked.ok) return checked;
    if (lock) return busy();
    if (!store) usePost(allocatePost(postsDir, now()));
    lock = 'generateDraft';
    const state = store.read();
    state.business = checked.business;
    state.article = checked.article;
    state.galleryCount = checked.galleryCount;
    store.invalidateImages(state);
    state.job = { running: true, step: '成稿', error: '' };
    store.write(state);
    runGenerateDraft(checked).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true, id: currentId };
  }

  function generatePrompts(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const state = store.read();
    const source = payload && typeof payload === 'object' ? payload : {};
    if (source.galleryCount != null) {
      const count = validateGalleryCount(source.galleryCount);
      if (!count.ok) return count;
      state.galleryCount = count.galleryCount;
    }
    applyDraftText(state, source);
    if (!state.draft) return { ok: false, message: '还没有稿面' };
    const faceMessage = validateDraftFace(state.draft);
    if (faceMessage) return { ok: false, message: faceMessage };
    state.draft = normalizeFace(state.draft);
    markStaleIfNeeded(state);
    lock = 'generatePrompts';
    state.job = { running: true, step: '提示词', error: '' };
    store.write(state);
    runGeneratePrompts().finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  function generateImages(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const state = store.read();
    applyPromptText(state, payload);
    const reason = promptsBlockReason(state);
    if (reason) {
      store.write(state);
      return { ok: false, message: reason };
    }
    lock = 'generateImages';
    state.job = { running: true, step: '封面', error: '' };
    store.write(state);
    runImages(null).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  function retryImage(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const slot = source.slot;
    const index = Number(source.index);
    if (slot !== 'cover' && slot !== 'gallery') {
      return { ok: false, message: '要指明封面或配图序号' };
    }
    if (slot === 'gallery' && (!Number.isInteger(index) || index < 1 || index > 9)) {
      return { ok: false, message: '要指明封面或配图序号' };
    }
    const state = store.read();
    if (promptsBlockReason(state)) return { ok: false, message: '提示词待重算' };
    const image = slot === 'cover' ? state.images.cover : state.images.gallery[index - 1];
    if (!image || image.status !== '失败') {
      return { ok: false, message: '只能重试失败的那一张' };
    }
    lock = 'retryImage';
    runImages({ slot, index: slot === 'cover' ? 0 : index }).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  function previewImage(payload) {
    if (!currentDir) return { ok: false, message: '没有这张图' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const file = slotFile(source.slot, Number(source.index));
    if (!file) return { ok: false, message: '没有这张图' };
    const abs = path.join(currentDir, file);
    if (!fs.existsSync(abs)) return { ok: false, message: '图片不在' };
    const bytes = fs.readFileSync(abs);
    return { ok: true, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` };
  }

  function revealImage(payload) {
    if (!currentDir) return { ok: false, message: '没有这张图' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const file = slotFile(source.slot, Number(source.index));
    if (!file) return { ok: false, message: '没有这张图' };
    const abs = path.join(currentDir, file);
    if (!fs.existsSync(abs)) return { ok: false, message: '图片不在' };
    try {
      revealFile(abs);
    } catch (err) {
      return { ok: true, path: abs };
    }
    return { ok: true, path: abs };
  }

  return {
    generateDraft,
    generateImages,
    generatePrompts,
    listPosts: catalog,
    loadLatest,
    openPost,
    previewImage,
    revealImage,
    retryImage,
    saveEditor,
    startNew,
  };
}

module.exports = {
  BUSY_MESSAGE,
  createRunner,
  promptsBlockReason,
};
