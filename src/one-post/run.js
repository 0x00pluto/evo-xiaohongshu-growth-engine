'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createLlm } = require('../llm/client');
const { generatePng } = require('../image/generate');
const {
  READINGS,
  assignContrastSlots,
  assignGalleryRoles,
  assignStoryRoles,
  fillPrompt,
  formatGallerySlots,
  parseArtText,
  parseDraftText,
  parsePlanText,
  readPromptFile,
  renderSheet,
  seriesPromptNames,
} = require('../prompts/fill');
const { createStore, emptyState, nextImageFile } = require('../draft/store');
const {
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

function promptsBlockReason(state) {
  if (!state.draft) return '还没有稿面';
  if (!state.prompts.cover.trim()) return '封面提示词是空的';
  if (state.prompts.gallery.some((item) => !String(item).trim())) return '有配图提示词是空的';
  return '';
}

function requestedSlot(source) {
  const slot = source && source.slot;
  const index = Number(source && source.index);
  if (slot === 'cover') return { slot: 'cover', index: 0 };
  if (slot === 'gallery' && Number.isInteger(index) && index >= 1 && index <= 9) {
    return { slot: 'gallery', index };
  }
  return null;
}

function slotPromptText(state, only) {
  if (only.slot === 'cover') return String(state.prompts.cover || '').trim();
  const item = state.prompts.gallery[only.index - 1];
  return typeof item === 'string' ? item.trim() : '';
}

function slotBlockReason(state, only) {
  if (!state.draft) return '还没有稿面';
  if (only.slot === 'gallery' && only.index > state.prompts.gallery.length) return '还没有这一张的提示词';
  if (!slotPromptText(state, only)) return '还没有这一张的提示词';
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

  function stopGenerating(slot) {
    if (!slot || slot.status !== '生成中') return slot;
    const hasVersion = Array.isArray(slot.versions) && slot.versions.length > 0;
    return { ...slot, status: hasVersion ? '成功' : '失败' };
  }

  function markJobFailed(message) {
    const state = store.read();
    state.images.cover = stopGenerating(state.images.cover);
    state.images.gallery = state.images.gallery.map((slot) => stopGenerating(slot));
    state.prompts.stale = false;
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

  async function producePrompts(face, galleryCount, reading) {
    // 人选解读。过程说明的头图才填大字规则，配图和对比不再套封面大字。
    const setKey = reading === 'compare' ? 'compare' : 'breakdown';
    if (!Object.prototype.hasOwnProperty.call(READINGS, setKey)) {
      throw new Error('解读不在允许列表');
    }
    const coverType = READINGS[setKey];
    const tone = readPromptFile(promptsDir, 'cover/tone-amateur.md');
    const names = seriesPromptNames(setKey);
    const shared = {
      title: face.title,
      body: face.body,
      topics: face.topics.join('、'),
    };
    const slots = setKey === 'compare' ? assignContrastSlots(galleryCount) : assignStoryRoles(galleryCount);
    const planVars = {
      ...shared,
      tone,
      imageCount: String(galleryCount + 1),
      slots: formatGallerySlots(slots),
    };
    if (setKey === 'breakdown') {
      planVars.seriesPoint = readPromptFile(promptsDir, names.point);
      planVars.seriesSummary = readPromptFile(promptsDir, names.summary);
    }
    const planned = parsePlanText(
      await complete(fillPrompt(readPromptFile(promptsDir, names.plan), planVars)),
      galleryCount,
      face.body,
    );
    const art = parseArtText(await complete(fillPrompt(readPromptFile(promptsDir, 'sets/art.md'), {
      ...shared,
      tone,
      plannedLines: planned.join('\n'),
      readingHint: setKey === 'compare'
        ? '每一张画面仍是一个对照，前后接成一个故事。'
        : '前后接成一个故事。',
    })), planned);
    const rendered = planned.map((line, index) => renderSheet(promptsDir, art, art.scenes[index], line));
    const galleryRoles = galleryCount === 0
      ? []
      : (setKey === 'compare'
        ? Array.from({ length: galleryCount }, () => 'contrast')
        : assignGalleryRoles(galleryCount));
    return {
      cover: rendered[0].prompt,
      coverType,
      coverLine: planned[0],
      setType: galleryCount === 0 ? '' : setKey,
      gallery: rendered.slice(1).map((item) => item.prompt),
      galleryLines: planned.slice(1),
      galleryRoles,
      style: rendered[0].style,
    };
  }

  function commitPrompts(face, galleryCount, produced) {
    const state = store.read();
    const nextFace = { ...face, coverLine: produced.coverLine };
    state.draft = nextFace;
    state.galleryCount = galleryCount;
    state.prompts = {
      cover: produced.cover,
      coverType: produced.coverType,
      setType: produced.setType,
      gallery: produced.gallery,
      galleryLines: produced.galleryLines,
      galleryRoles: produced.galleryRoles,
      style: produced.style,
      stale: false,
      basis: basisFrom(nextFace, galleryCount, state.coverLineSpecified),
    };
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
      drafted.prompts.stale = false;
      drafted.job = { running: true, step: '提示词', error: '' };
      store.write(drafted);
      let produced;
      try {
        produced = await producePrompts(face, checked.galleryCount, 'breakdown');
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
      const reading = state.prompts.coverType === 'compare' ? 'compare' : 'breakdown';
      let produced;
      try {
        produced = await producePrompts(face, galleryCount, reading);
      } catch (err) {
        markJobFailed(err.message || '提示词失败');
        return;
      }
      commitPrompts(face, galleryCount, produced);
    } catch (err) {
      markJobFailed(err.message || '提示词失败');
    }
  }

  let imageStamp = 0;

  function nextRevisedAt() {
    const now = Date.now();
    imageStamp = Math.max(imageStamp + 1, now);
    return imageStamp;
  }

  function readImageSlot(state, slot, index) {
    if (slot === 'cover') return state.images.cover;
    return state.images.gallery[index - 1] || {
      status: '空',
      path: '',
      selected: 0,
      revisedAt: 0,
      versions: [],
    };
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
      const jobs = [{ slot: 'cover', index: 0, prompt: initial.prompts.cover, label: '封面' }];
      initial.prompts.gallery.forEach((prompt, index) => {
        const number = index + 1;
        jobs.push({
          slot: 'gallery',
          index: number,
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
        const previous = readImageSlot(current, job.slot, job.index);
        const file = nextImageFile(job.slot, job.index, previous.versions);
        setImageSlot(current, job.slot, job.index, { ...previous, status: '生成中' });
        current.job = { running: true, step: job.label, error: '' };
        store.write(current);
        const outputPath = path.join(currentDir, file);
        try {
          await generateImage({ prompt: job.prompt, outputPath });
          const done = store.read();
          const base = readImageSlot(done, job.slot, job.index);
          const revisedAt = nextRevisedAt();
          const versions = base.versions.concat([{ path: file, revisedAt }]);
          setImageSlot(done, job.slot, job.index, {
            status: '成功',
            path: file,
            selected: versions.length,
            revisedAt,
            versions,
          });
          done.job = { running: true, step: job.label, error: '' };
          store.write(done);
        } catch (err) {
          failed += 1;
          lastError = err && err.message ? err.message : '生图失败';
          fs.rmSync(outputPath, { force: true });
          const failedState = store.read();
          const base = readImageSlot(failedState, job.slot, job.index);
          setImageSlot(failedState, job.slot, job.index, {
            ...base,
            status: base.versions.length > 0 ? '成功' : '失败',
          });
          failedState.job = { running: true, step: job.label, error: '' };
          store.write(failedState);
        }
      }
      const finished = store.read();
      finished.job = {
        running: false,
        step: '',
        error: failed > 0 ? `${lastError}。可以再抽这一张` : '',
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
      state.images.cover = stopGenerating(state.images.cover);
      state.images.gallery = state.images.gallery.map((slot) => stopGenerating(slot));
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
    if (typeof source.coverLineSpecified === 'string') {
      state.coverLineSpecified = source.coverLineSpecified.trim();
    }
    if (source.galleryCount != null) {
      const count = validateGalleryCount(source.galleryCount);
      if (!count.ok) return count;
      state.galleryCount = count.galleryCount;
    }
    applyDraftText(state, source);
    applyPromptText(state, source);
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
    if (typeof payload.coverLineSpecified === 'string') {
      state.coverLineSpecified = payload.coverLineSpecified.trim();
    }
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
    if (typeof source.coverLineSpecified === 'string') {
      state.coverLineSpecified = source.coverLineSpecified.trim();
    }
    if (!state.draft) return { ok: false, message: '还没有稿面' };
    const faceMessage = validateDraftFace(state.draft);
    if (faceMessage) return { ok: false, message: faceMessage };
    state.draft = normalizeFace(state.draft);
    lock = 'generatePrompts';
    state.job = { running: true, step: '提示词', error: '' };
    store.write(state);
    runGeneratePrompts().finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  async function runReinterpret(reading) {
    try {
      const state = store.read();
      const face = state.draft;
      let produced;
      try {
        produced = await producePrompts(face, state.galleryCount, reading);
      } catch (err) {
        markJobFailed(err.message || '提示词失败');
        return;
      }
      commitPrompts(face, state.galleryCount, produced);
    } catch (err) {
      markJobFailed(err.message || '提示词失败');
    }
  }

  function reinterpret(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const reading = payload && payload.reading;
    if (reading !== 'breakdown' && reading !== 'compare') {
      return { ok: false, message: '解读不在允许列表' };
    }
    const state = store.read();
    if (!state.draft) return { ok: false, message: '还没有稿面' };
    const faceMessage = validateDraftFace(state.draft);
    if (faceMessage) return { ok: false, message: faceMessage };
    state.draft = normalizeFace(state.draft);
    lock = 'reinterpret';
    state.job = { running: true, step: '提示词', error: '' };
    store.write(state);
    runReinterpret(reading).finally(() => {
      lock = null;
    });
    return { ok: true, accepted: true };
  }

  function generateImages(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const only = requestedSlot(source);
    if (!only) return { ok: false, message: '要指明封面或配图序号' };
    const state = store.read();
    applyPromptText(state, source);
    const reason = slotBlockReason(state, only);
    if (reason) {
      store.write(state);
      return { ok: false, message: reason };
    }
    lock = 'generateImages';
    state.job = {
      running: true,
      step: only.slot === 'cover' ? '封面' : `配图 ${only.index}`,
      error: '',
    };
    store.write(state);
    runImages(only).finally(() => {
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
    const blocked = promptsBlockReason(state);
    if (blocked) return { ok: false, message: blocked };
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

  function imageFileFor(source) {
    if (!store) return '';
    const only = requestedSlot(source);
    if (!only) return '';
    const state = store.read();
    const image = only.slot === 'cover'
      ? state.images.cover
      : state.images.gallery[only.index - 1];
    if (!image) return '';
    const version = Number(source.version);
    if (Number.isInteger(version) && version >= 1) {
      const item = image.versions[version - 1];
      return item ? item.path : '';
    }
    return image.path || '';
  }

  function chooseImage(payload) {
    if (!store) return { ok: false, message: '没有这一篇' };
    if (lock) return busy();
    const source = payload && typeof payload === 'object' ? payload : {};
    const only = requestedSlot(source);
    if (!only) return { ok: false, message: '要指明封面或配图序号' };
    const version = Number(source.version);
    const state = store.read();
    const image = only.slot === 'cover'
      ? state.images.cover
      : state.images.gallery[only.index - 1];
    if (!image || !Number.isInteger(version) || version < 1 || version > image.versions.length) {
      return { ok: false, message: '没有这一张' };
    }
    const chosen = image.versions[version - 1];
    setImageSlot(state, only.slot, only.index, {
      ...image,
      status: '成功',
      selected: version,
      path: chosen.path,
      revisedAt: chosen.revisedAt,
    });
    store.write(state);
    return { ok: true };
  }

  function previewImage(payload) {
    if (!currentDir) return { ok: false, message: '没有这张图' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const file = imageFileFor(source);
    if (!file) return { ok: false, message: '没有这张图' };
    const abs = path.join(currentDir, file);
    if (!fs.existsSync(abs)) return { ok: false, message: '图片不在' };
    const bytes = fs.readFileSync(abs);
    return { ok: true, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` };
  }

  function revealImage(payload) {
    if (!currentDir) return { ok: false, message: '没有这张图' };
    const source = payload && typeof payload === 'object' ? payload : {};
    const file = imageFileFor(source);
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
    chooseImage,
    generateDraft,
    generateImages,
    generatePrompts,
    listPosts: catalog,
    reinterpret,
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
