// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('../prompts/fill')} */
const fillModule = require('../prompts/fill');
/** @type {typeof import('../upload-refs/rules')} */
const uploadRefRules = require('../upload-refs/rules');
const { migrateAlbumId } = fillModule;
const { emptyPicks, normalizePicks, readUploadRefsFromDraft } = uploadRefRules;

const STATUSES = new Set(['空', '生成中', '成功', '失败', '作废']);

/**
 * @typedef {{ path: string; revisedAt: number }} ImageVersion
 * @typedef {{
 *   status: string;
 *   path: string;
 *   selected: number;
 *   revisedAt: number;
 *   versions: ImageVersion[];
 * }} ImageSlot
 * @typedef {{
 *   cover: string;
 *   storyType: string;
 *   look: string;
 *   gallery: string[];
 *   galleryLines: string[];
 *   galleryRoles: string[];
 *   style: string;
 *   stale: boolean;
 *   basis: import('./validate').PromptBasis | null;
 * }} PromptsState
 * @typedef {{
 *   business: string;
 *   sampleTitle: string;
 *   sampleBody: string;
 *   references: string[];
 *   articleType: string;
 *   persona: string;
 *   coverLineSpecified: string;
 *   galleryCount: number;
 *   draft: import('./validate').DraftFace | null;
 *   prompts: PromptsState;
 *   images: { cover: ImageSlot; gallery: ImageSlot[] };
 *   uploadRefs: import('../upload-refs/rules').UploadRefItem[];
 *   picks: import('../upload-refs/rules').PicksState;
 *   job: { running: boolean; step: string; error: string };
 * }} DraftState
 * @typedef {{
 *   exists: () => boolean;
 *   file: string;
 *   read: () => DraftState;
 *   write: (state: DraftState) => void;
 * }} DraftStore
 */

/**
 * @param {number} index
 * @returns {string}
 */
function galleryFile(index) {
  return `gallery-${String(index).padStart(2, '0')}.png`;
}

/**
 * @param {string} slot
 * @param {number} index
 * @returns {string}
 */
function imagePrefix(slot, index) {
  if (slot === 'cover') return 'cover';
  return galleryFile(index).replace(/\.png$/, '');
}

/**
 * @param {unknown} filePath
 * @returns {string}
 */
function safeImageName(filePath) {
  if (typeof filePath !== 'string') return '';
  return /^(?:cover|gallery-\d{2})(?:-\d+)?\.png$/.test(filePath) ? filePath : '';
}

/**
 * @param {string} slot
 * @param {number} index
 * @param {ImageVersion[] | null | undefined} versions
 * @returns {string}
 */
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

/**
 * @returns {ImageSlot}
 */
function emptySlot() {
  return { status: '空', path: '', selected: 0, revisedAt: 0, versions: [] };
}

/**
 * @returns {DraftState}
 */
function emptyState() {
  return {
    business: '',
    sampleTitle: '',
    sampleBody: '',
    references: [],
    articleType: '涨粉',
    persona: '素人',
    coverLineSpecified: '',
    galleryCount: 1,
    draft: null,
    prompts: {
      cover: '',
      storyType: '',
      look: '',
      gallery: [],
      galleryLines: [],
      galleryRoles: [],
      style: '',
      stale: false,
      basis: null,
    },
    images: { cover: emptySlot(), gallery: [] },
    uploadRefs: [],
    picks: emptyPicks(1),
    job: { running: false, step: '', error: '' },
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizePersona(value) {
  if (
    value === '素人' || value === 'KOC' || value === '达人' || value === '官号'
    || value === '创始人' || value === '店主' || value === '员工'
  ) {
    return value;
  }
  return '素人';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeArticleType(value) {
  // 旧稿「素人」是类型；现拆成目的「涨粉」+ 人设「素人」。
  if (value === '素人') return '涨粉';
  if (
    value === '种草' || value === '引流' || value === '涨粉'
    || value === '曝光' || value === '搜索' || value === '转化'
  ) {
    return value;
  }
  return '涨粉';
}

/**
 * @param {Record<string, unknown>} prompts
 * @param {string} [promptsDir]
 * @param {string} [userAlbumsDir]
 * @returns {{ storyType: string; look: string }}
 */
function normalizePromptSlots(prompts, promptsDir, userAlbumsDir) {
  const look = migrateAlbumId(prompts.look, promptsDir, userAlbumsDir);
  if (prompts.storyType === 'process' || prompts.storyType === 'contrast') {
    return { storyType: prompts.storyType, look };
  }
  // 旧稿中文 id，或更早的 coverType / setType；look 仍按短名映射。
  if (prompts.storyType === '过程说明') {
    return { storyType: 'process', look };
  }
  if (prompts.storyType === '对比') {
    return { storyType: 'contrast', look };
  }
  if (prompts.coverType === 'compare' || prompts.setType === 'compare') {
    return { storyType: 'contrast', look };
  }
  if (prompts.coverType === 'story' || prompts.setType === 'breakdown') {
    return { storyType: 'process', look };
  }
  return { storyType: '', look };
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function versionStamp(value) {
  const revised = Number(value);
  return Number.isInteger(revised) && revised > 0 ? revised : 0;
}

/**
 * @param {unknown} slot
 * @returns {ImageSlot}
 */
function normalizeSlot(slot) {
  const source = slot && typeof slot === 'object' ? /** @type {Record<string, unknown>} */ (slot) : null;
  const status = source && typeof source.status === 'string' && STATUSES.has(source.status)
    ? source.status
    : '空';
  /** @type {ImageVersion[]} */
  const versions = [];
  const seen = new Set();
  /**
   * @param {unknown} filePath
   * @param {unknown} revisedAt
   */
  const pushVersion = (filePath, revisedAt) => {
    const safe = safeImageName(filePath);
    if (!safe || seen.has(safe)) return;
    seen.add(safe);
    versions.push({ path: safe, revisedAt: versionStamp(revisedAt) });
  };
  if (source && Array.isArray(source.versions)) {
    for (const item of source.versions) {
      const version = item && typeof item === 'object' ? /** @type {Record<string, unknown>} */ (item) : null;
      pushVersion(version && version.path, version && version.revisedAt);
    }
  }
  // 旧稿只有一个路径。它算这个位置的第 1 张，文件名不改。
  pushVersion(source && source.path, source && source.revisedAt);
  let selected = Number(source && source.selected);
  if (!Number.isInteger(selected) || selected < 1 || selected > versions.length) {
    const legacy = safeImageName(source && source.path);
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

/**
 * @param {unknown} basis
 * @returns {import('./validate').PromptBasis | null}
 */
function normalizeBasis(basis) {
  if (!basis || typeof basis !== 'object') return null;
  const source = /** @type {Record<string, unknown>} */ (basis);
  const count = Number(source.galleryCount);
  if (!Number.isInteger(count) || count < 0 || count > 9) return null;
  return {
    title: typeof source.title === 'string' ? source.title : '',
    body: typeof source.body === 'string' ? source.body : '',
    topics: Array.isArray(source.topics) ? source.topics.map((topic) => String(topic)) : [],
    coverLine: typeof source.coverLine === 'string' ? source.coverLine : '',
    coverLineSpecified: typeof source.coverLineSpecified === 'string' ? source.coverLineSpecified : '',
    galleryCount: count,
    coverRules: typeof source.coverRules === 'string' ? source.coverRules : '',
    setRules: typeof source.setRules === 'string' ? source.setRules : '',
  };
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeGalleryRoles(value) {
  const roles = normalizeStringList(value);
  if (roles.some((role) => role !== 'point' && role !== 'summary' && role !== 'contrast')) return [];
  return roles;
}

/**
 * @param {unknown} raw
 * @param {string} [promptsDir]
 * @param {string} [userAlbumsDir]
 * @returns {DraftState}
 */
function normalize(raw, promptsDir, userAlbumsDir) {
  const base = emptyState();
  const source = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  base.business = typeof source.business === 'string' ? source.business : '';
  base.sampleTitle = typeof source.sampleTitle === 'string' ? source.sampleTitle : '';
  if (typeof source.sampleBody === 'string') {
    base.sampleBody = source.sampleBody;
  } else if (typeof source.article === 'string' && source.article.trim()) {
    // 旧稿 article 迁成范文正文快照；写回时不再落 article。
    base.sampleBody = source.article;
  } else {
    base.sampleBody = '';
  }
  base.references = Array.isArray(source.references)
    ? source.references.map((item) => String(item))
    : [];
  base.articleType = normalizeArticleType(source.articleType);
  if (source.articleType === '素人' && (source.persona == null || source.persona === '')) {
    base.persona = '素人';
  } else {
    base.persona = normalizePersona(source.persona);
  }
  base.coverLineSpecified = typeof source.coverLineSpecified === 'string' ? source.coverLineSpecified : '';
  const count = Number(source.galleryCount);
  base.galleryCount = Number.isInteger(count) && count >= 0 && count <= 9 ? count : 1;
  if (source.draft && typeof source.draft === 'object') {
    const draft = /** @type {Record<string, unknown>} */ (source.draft);
    base.draft = {
      title: typeof draft.title === 'string' ? draft.title : '',
      body: typeof draft.body === 'string' ? draft.body : '',
      topics: Array.isArray(draft.topics) ? draft.topics.map((topic) => String(topic)) : [],
      coverLine: typeof draft.coverLine === 'string' ? draft.coverLine : '',
    };
  }
  const prompts = source.prompts && typeof source.prompts === 'object'
    ? /** @type {Record<string, unknown>} */ (source.prompts)
    : {};
  const slots = normalizePromptSlots(prompts, promptsDir, userAlbumsDir);
  base.prompts = {
    cover: typeof prompts.cover === 'string' ? prompts.cover : '',
    storyType: slots.storyType,
    look: slots.look,
    gallery: normalizeStringList(prompts.gallery),
    galleryLines: normalizeStringList(prompts.galleryLines),
    galleryRoles: normalizeGalleryRoles(prompts.galleryRoles),
    style: typeof prompts.style === 'string' ? prompts.style : '',
    stale: Boolean(prompts.stale),
    basis: normalizeBasis(prompts.basis),
  };
  const images = source.images && typeof source.images === 'object'
    ? /** @type {Record<string, unknown>} */ (source.images)
    : {};
  base.images = {
    cover: normalizeSlot(images.cover),
    gallery: Array.isArray(images.gallery) ? images.gallery.map((slot) => normalizeSlot(slot)) : [],
  };
  base.uploadRefs = readUploadRefsFromDraft(source);
  base.picks = normalizePicks(source.picks, base.galleryCount);
  const job = source.job && typeof source.job === 'object'
    ? /** @type {Record<string, unknown>} */ (source.job)
    : {};
  base.job = {
    running: Boolean(job.running),
    step: typeof job.step === 'string' ? job.step : '',
    error: typeof job.error === 'string' ? job.error : '',
  };
  return base;
}

/**
 * @param {string} latestDir
 * @param {{ promptsDir?: string; userAlbumsDir?: string }} [options]
 * @returns {DraftStore}
 */
function createStore(latestDir, options) {
  const promptsDir = options && typeof options.promptsDir === 'string' ? options.promptsDir : '';
  const userAlbumsDir = options && typeof options.userAlbumsDir === 'string' ? options.userAlbumsDir : '';
  const file = path.join(latestDir, 'draft.json');

  function exists() {
    return fs.existsSync(file);
  }

  /**
   * @returns {DraftState}
   */
  function read() {
    if (!exists()) return emptyState();
    try {
      return normalize(JSON.parse(fs.readFileSync(file, 'utf8')), promptsDir, userAlbumsDir);
    } catch {
      return emptyState();
    }
  }

  /**
   * @param {DraftState} state
   */
  function write(state) {
    // 先写临时文件再替换，轮询才不会读到半截 JSON。
    fs.mkdirSync(latestDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(normalize(state, promptsDir, userAlbumsDir), null, 2)}\n`);
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
