'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATUSES = new Set(['空', '生成中', '成功', '失败', '作废']);

function galleryFile(index) {
  return `gallery-${String(index).padStart(2, '0')}.png`;
}

function imagePrefix(slot, index) {
  if (slot === 'cover') return 'cover';
  return galleryFile(index).replace(/\.png$/, '');
}

function safeImageName(filePath) {
  if (typeof filePath !== 'string') return '';
  return /^(?:cover|gallery-\d{2})(?:-\d+)?\.png$/.test(filePath) ? filePath : '';
}

function nextImageFile(slot, index, versions) {
  const prefix = imagePrefix(slot, index);
  let max = 0;
  for (const item of versions || []) {
    const filePath = item && item.path;
    if (filePath === `${prefix}.png`) max = Math.max(max, 1);
    const match = typeof filePath === 'string' ? filePath.match(new RegExp(`^${prefix}-(\\d+)\\.png$`)) : null;
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}.png`;
}

function emptySlot() {
  return { status: '空', path: '', selected: 0, revisedAt: 0, versions: [] };
}

function emptyState() {
  return {
    business: '',
    article: '',
    coverLineSpecified: '',
    galleryCount: 1,
    draft: null,
    prompts: {
      cover: '',
      coverType: '',
      setType: '',
      gallery: [],
      galleryLines: [],
      galleryRoles: [],
      style: '',
      stale: false,
      basis: null,
    },
    images: { cover: emptySlot(), gallery: [] },
    job: { running: false, step: '', error: '' },
  };
}

function versionStamp(value) {
  const revised = Number(value);
  return Number.isInteger(revised) && revised > 0 ? revised : 0;
}

function normalizeSlot(slot) {
  const status = slot && STATUSES.has(slot.status) ? slot.status : '空';
  const versions = [];
  const seen = new Set();
  const pushVersion = (filePath, revisedAt) => {
    const safe = safeImageName(filePath);
    if (!safe || seen.has(safe)) return;
    seen.add(safe);
    versions.push({ path: safe, revisedAt: versionStamp(revisedAt) });
  };
  if (slot && Array.isArray(slot.versions)) {
    for (const item of slot.versions) pushVersion(item && item.path, item && item.revisedAt);
  }
  // 旧稿只有一个路径。它算这个位置的第 1 张，文件名不改。
  pushVersion(slot && slot.path, slot && slot.revisedAt);
  let selected = Number(slot && slot.selected);
  if (!Number.isInteger(selected) || selected < 1 || selected > versions.length) {
    const legacy = safeImageName(slot && slot.path);
    const found = legacy ? versions.findIndex((item) => item.path === legacy) : -1;
    selected = found >= 0 ? found + 1 : (versions.length > 0 ? versions.length : 0);
  }
  const chosen = selected > 0 ? versions[selected - 1] : null;
  return {
    status,
    path: chosen ? chosen.path : '',
    selected,
    revisedAt: chosen ? chosen.revisedAt : 0,
    versions,
  };
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
    coverLineSpecified: typeof basis.coverLineSpecified === 'string' ? basis.coverLineSpecified : '',
    galleryCount: count,
    coverRules: typeof basis.coverRules === 'string' ? basis.coverRules : '',
    setRules: typeof basis.setRules === 'string' ? basis.setRules : '',
  };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function normalizeGalleryRoles(value) {
  const roles = normalizeStringList(value);
  if (roles.some((role) => role !== 'point' && role !== 'summary' && role !== 'contrast')) return [];
  return roles;
}

function normalize(raw) {
  const base = emptyState();
  const source = raw && typeof raw === 'object' ? raw : {};
  base.business = typeof source.business === 'string' ? source.business : '';
  base.article = typeof source.article === 'string' ? source.article : '';
  base.coverLineSpecified = typeof source.coverLineSpecified === 'string' ? source.coverLineSpecified : '';
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
    coverType: prompts.coverType === 'story' || prompts.coverType === 'compare' ? prompts.coverType : '',
    setType: prompts.setType === 'breakdown' || prompts.setType === 'compare' ? prompts.setType : '',
    gallery: normalizeStringList(prompts.gallery),
    galleryLines: normalizeStringList(prompts.galleryLines),
    galleryRoles: normalizeGalleryRoles(prompts.galleryRoles),
    style: typeof prompts.style === 'string' ? prompts.style : '',
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

  return { exists, file, read, write };
}

module.exports = {
  createStore,
  emptyState,
  galleryFile,
  nextImageFile,
  normalize,
};
