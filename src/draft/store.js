'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATUSES = new Set(['空', '生成中', '成功', '失败', '作废']);

function galleryFile(index) {
  return `gallery-${String(index).padStart(2, '0')}.png`;
}

function emptySlot() {
  return { status: '空', path: '' };
}

function emptyState() {
  return {
    business: '',
    article: '',
    galleryCount: 1,
    draft: null,
    prompts: { cover: '', gallery: [], stale: false, basis: null },
    images: { cover: emptySlot(), gallery: [] },
    job: { running: false, step: '', error: '' },
  };
}

function normalizeSlot(slot) {
  const status = slot && STATUSES.has(slot.status) ? slot.status : '空';
  const filePath = slot && typeof slot.path === 'string' ? slot.path : '';
  return { status, path: filePath };
}

function normalizeBasis(basis) {
  if (!basis || typeof basis !== 'object') return null;
  const count = Number(basis.galleryCount);
  if (!Number.isInteger(count) || count < 0 || count > 9) return null;
  return {
    title: typeof basis.title === 'string' ? basis.title : '',
    body: typeof basis.body === 'string' ? basis.body : '',
    topics: Array.isArray(basis.topics) ? basis.topics.map((topic) => String(topic)) : [],
    coverLine: typeof basis.coverLine === 'string' ? basis.coverLine : '',
    galleryCount: count,
  };
}

function normalize(raw) {
  const base = emptyState();
  const source = raw && typeof raw === 'object' ? raw : {};
  base.business = typeof source.business === 'string' ? source.business : '';
  base.article = typeof source.article === 'string' ? source.article : '';
  const count = Number(source.galleryCount);
  base.galleryCount = Number.isInteger(count) && count >= 0 && count <= 9 ? count : 1;
  if (source.draft && typeof source.draft === 'object') {
    base.draft = {
      title: typeof source.draft.title === 'string' ? source.draft.title : '',
      body: typeof source.draft.body === 'string' ? source.draft.body : '',
      topics: Array.isArray(source.draft.topics) ? source.draft.topics.map((topic) => String(topic)) : [],
      coverLine: typeof source.draft.coverLine === 'string' ? source.draft.coverLine : '',
    };
  }
  const prompts = source.prompts && typeof source.prompts === 'object' ? source.prompts : {};
  base.prompts = {
    cover: typeof prompts.cover === 'string' ? prompts.cover : '',
    gallery: Array.isArray(prompts.gallery) ? prompts.gallery.map((item) => String(item)) : [],
    stale: Boolean(prompts.stale),
    basis: normalizeBasis(prompts.basis),
  };
  const images = source.images && typeof source.images === 'object' ? source.images : {};
  base.images = {
    cover: normalizeSlot(images.cover),
    gallery: Array.isArray(images.gallery) ? images.gallery.map((slot) => normalizeSlot(slot)) : [],
  };
  const job = source.job && typeof source.job === 'object' ? source.job : {};
  base.job = {
    running: Boolean(job.running),
    step: typeof job.step === 'string' ? job.step : '',
    error: typeof job.error === 'string' ? job.error : '',
  };
  return base;
}

function createStore(latestDir) {
  const file = path.join(latestDir, 'draft.json');

  function exists() {
    return fs.existsSync(file);
  }

  function read() {
    if (!exists()) return emptyState();
    try {
      return normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (err) {
      return emptyState();
    }
  }

  function write(state) {
    // 先写临时文件再替换，轮询才不会读到半截 JSON。
    fs.mkdirSync(latestDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(normalize(state), null, 2)}\n`);
    fs.renameSync(tmp, file);
  }

  function invalidateImages(state) {
    fs.rmSync(path.join(latestDir, 'cover.png'), { force: true });
    for (let index = 1; index <= 9; index += 1) {
      fs.rmSync(path.join(latestDir, galleryFile(index)), { force: true });
    }
    const coverHadFile = state.images.cover.status !== '空';
    state.images.cover = { status: coverHadFile ? '作废' : '空', path: '' };
    const next = [];
    for (let index = 0; index < state.galleryCount; index += 1) {
      const previous = state.images.gallery[index];
      const hadFile = previous && previous.status !== '空';
      next.push({ status: hadFile ? '作废' : '空', path: '' });
    }
    state.images.gallery = next;
  }

  return { exists, file, invalidateImages, read, write };
}

module.exports = {
  createStore,
  emptyState,
  galleryFile,
  normalize,
};
