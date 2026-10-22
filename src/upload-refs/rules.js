// @ts-check
'use strict';

/** 篇内可囤的上传参考上限（池） */
const MAX_UPLOAD_REFS_PER_POST = 48;
/** 单槽（封面/某张配图）最多勾选进生图的张数 */
const MAX_APPLIED_UPLOAD_REFS = 9;
const MAX_USAGE_CHARS = 240;
const NON_SUBJECT_MARKER = '角落小标，不占主体';
const USAGE_PLACEHOLDER = '人物照片。按 Hero 放在画面中央，锁脸。';
const APPLY_LIMIT_MESSAGE = `一张图最多勾 ${MAX_APPLIED_UPLOAD_REFS} 张上传参考`;

/**
 * @typedef {{ id: string; fileName: string; usage: string; libraryId?: string }} UploadRefItem
 * @typedef {{ materialIds: string[]; overrides: Record<string, string> }} SlotPick
 * @typedef {{ cover: SlotPick; gallery: SlotPick[] }} PicksState
 */

/**
 * @returns {SlotPick}
 */
function emptySlotPick() {
  return { materialIds: [], overrides: {} };
}

/**
 * @param {number} [galleryCount]
 * @returns {PicksState}
 */
function emptyPicks(galleryCount) {
  const raw = Number(galleryCount);
  const count = Number.isInteger(raw) && raw >= 0 ? raw : 0;
  /** @type {SlotPick[]} */
  const gallery = [];
  for (let i = 0; i < count; i += 1) gallery.push(emptySlotPick());
  return { cover: emptySlotPick(), gallery };
}

/**
 * @param {unknown} usage
 * @returns {{ ok: true; usage: string } | { ok: false; message: string }}
 */
function validateUsage(usage) {
  if (typeof usage !== 'string') {
    return { ok: false, message: '请写上用法句' };
  }
  const text = usage.trim();
  if (!text) return { ok: false, message: '请写上用法句' };
  if (text.length > MAX_USAGE_CHARS) {
    return { ok: false, message: `用法句最多 ${MAX_USAGE_CHARS} 字` };
  }
  return { ok: true, usage: text };
}

/**
 * 用法句含「角落小标，不占主体」则不占主体；否则占主体。
 * @param {unknown} usage
 * @returns {boolean}
 */
function occupiesSubject(usage) {
  const text = typeof usage === 'string' ? usage : '';
  return !text.includes(NON_SUBJECT_MARKER);
}

/**
 * @param {unknown} raw
 * @returns {UploadRefItem[]}
 */
function normalizeUploadRefs(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {UploadRefItem[]} */
  const list = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const bag = /** @type {Record<string, unknown>} */ (item);
    const id = typeof bag.id === 'string' ? bag.id.trim() : '';
    const fileName = typeof bag.fileName === 'string' ? bag.fileName.trim() : '';
    const usage = typeof bag.usage === 'string' ? bag.usage.trim() : '';
    if (!id || !fileName || !usage) continue;
    // 只接受服务端生成的文件名
    if (!/^m-[a-z0-9]+\.(jpg|jpeg|png|webp)$/i.test(fileName)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    /** @type {UploadRefItem} */
    const entry = { id, fileName, usage };
    const libraryId = typeof bag.libraryId === 'string' ? bag.libraryId.trim() : '';
    if (libraryId) entry.libraryId = libraryId;
    list.push(entry);
    if (list.length >= MAX_UPLOAD_REFS_PER_POST) break;
  }
  return list;
}

/**
 * 读旧稿：优先 uploadRefs，其次 materials / genRefs。
 * @param {Record<string, unknown>} source
 * @returns {UploadRefItem[]}
 */
function readUploadRefsFromDraft(source) {
  if (Array.isArray(source.uploadRefs)) return normalizeUploadRefs(source.uploadRefs);
  if (Array.isArray(source.genRefs)) return normalizeUploadRefs(source.genRefs);
  if (Array.isArray(source.materials)) return normalizeUploadRefs(source.materials);
  return [];
}

/**
 * @param {unknown} raw
 * @returns {SlotPick}
 */
function normalizeSlotPick(raw) {
  const empty = emptySlotPick();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const bag = /** @type {Record<string, unknown>} */ (raw);
  /** @type {string[]} */
  const materialIds = [];
  const seen = new Set();
  if (Array.isArray(bag.materialIds)) {
    for (const id of bag.materialIds) {
      if (typeof id !== 'string') continue;
      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      materialIds.push(trimmed);
      if (materialIds.length >= MAX_APPLIED_UPLOAD_REFS) break;
    }
  }
  /** @type {Record<string, string>} */
  const overrides = {};
  if (bag.overrides && typeof bag.overrides === 'object' && !Array.isArray(bag.overrides)) {
    const map = /** @type {Record<string, unknown>} */ (bag.overrides);
    for (const [key, value] of Object.entries(map)) {
      if (typeof value !== 'string') continue;
      const text = value.trim();
      if (!text) continue;
      if (!materialIds.includes(key)) continue;
      overrides[key] = text;
    }
  }
  return { materialIds, overrides };
}

/**
 * @param {unknown} raw
 * @param {number} [galleryCount]
 * @returns {PicksState}
 */
function normalizePicks(raw, galleryCount) {
  const size = typeof galleryCount === 'number' ? galleryCount : undefined;
  const base = emptyPicks(size);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const bag = /** @type {Record<string, unknown>} */ (raw);
  base.cover = normalizeSlotPick(bag.cover);
  if (Array.isArray(bag.gallery)) {
    base.gallery = bag.gallery.map((item) => normalizeSlotPick(item));
  }
  const count = typeof size === 'number' && Number.isInteger(size) && size >= 0
    ? size
    : base.gallery.length;
  while (base.gallery.length < count) base.gallery.push(emptySlotPick());
  if (base.gallery.length > count) base.gallery = base.gallery.slice(0, count);
  return base;
}

/**
 * 从所有槽位勾选与覆盖句中去掉某上传参考 id。
 * @param {PicksState} picks
 * @param {string} refId
 * @returns {PicksState}
 */
function removeUploadRefFromPicks(picks, refId) {
  const id = String(refId || '').trim();
  /**
   * @param {SlotPick} pick
   * @returns {SlotPick}
   */
  const scrub = (pick) => {
    const materialIds = pick.materialIds.filter((item) => item !== id);
    /** @type {Record<string, string>} */
    const overrides = {};
    for (const [key, value] of Object.entries(pick.overrides)) {
      if (key === id) continue;
      if (!materialIds.includes(key)) continue;
      overrides[key] = value;
    }
    return { materialIds, overrides };
  };
  return {
    cover: scrub(picks.cover),
    gallery: picks.gallery.map((pick) => scrub(pick)),
  };
}

/**
 * @param {string} refId
 * @param {SlotPick} pick
 * @param {UploadRefItem | undefined} ref
 * @returns {string}
 */
function effectiveUsage(refId, pick, ref) {
  const override = pick.overrides[refId];
  if (typeof override === 'string' && override.trim()) return override.trim();
  return ref && typeof ref.usage === 'string' ? ref.usage.trim() : '';
}

/**
 * 生图时篇内全部上传参考都带上（列表序）。保留供迁移/测试；生图改回读槽位 picks。
 * @param {UploadRefItem[]} refs
 * @returns {SlotPick}
 */
function pickAllUploadRefs(refs) {
  /** @type {string[]} */
  const materialIds = [];
  if (Array.isArray(refs)) {
    for (const item of refs) {
      if (!item || typeof item.id !== 'string') continue;
      const id = item.id.trim();
      if (!id || materialIds.includes(id)) continue;
      materialIds.push(id);
      if (materialIds.length >= MAX_APPLIED_UPLOAD_REFS) break;
    }
  }
  return { materialIds, overrides: {} };
}

/**
 * @param {SlotPick} pick
 * @param {string} id
 * @returns {SlotPick}
 */
function addIdToSlotPick(pick, id) {
  const materialIds = Array.isArray(pick.materialIds) ? pick.materialIds.slice() : [];
  if (
    id
    && !materialIds.includes(id)
    && materialIds.length < MAX_APPLIED_UPLOAD_REFS
  ) {
    materialIds.push(id);
  }
  const overrides = pick.overrides && typeof pick.overrides === 'object' ? { ...pick.overrides } : {};
  return { materialIds, overrides };
}

/**
 * 新上传 / 从库挑：默认勾进封面与全部配图槽。
 * @param {PicksState} picks
 * @param {string} id
 * @returns {PicksState}
 */
function addUploadRefToAllPicks(picks, id) {
  const refId = typeof id === 'string' ? id.trim() : '';
  if (!refId) return picks;
  return {
    cover: addIdToSlotPick(picks.cover || emptySlotPick(), refId),
    gallery: Array.isArray(picks.gallery)
      ? picks.gallery.map((pick) => addIdToSlotPick(pick || emptySlotPick(), refId))
      : [],
  };
}

/**
 * @param {UploadRefItem[]} refs
 * @param {SlotPick} pick
 * @returns {UploadRefItem[]}
 */
function selectedUploadRefs(refs, pick) {
  /** @type {Map<string, UploadRefItem>} */
  const byId = new Map();
  for (const item of refs) byId.set(item.id, item);
  /** @type {UploadRefItem[]} */
  const list = [];
  for (const id of pick.materialIds) {
    const item = byId.get(id);
    if (item) list.push(item);
  }
  return list;
}

/**
 * 产品改口：用法句不硬拦。保留函数供旧调用方；恒返回空串。
 * @param {boolean} [_textOnly]
 * @param {UploadRefItem[]} [_refs]
 * @param {SlotPick} [_pick]
 * @returns {string}
 */
function textOnlyPickBlockReason(_textOnly, _refs, _pick) {
  return '';
}

/**
 * @param {unknown} id
 * @returns {boolean}
 */
function isUploadRefId(id) {
  return typeof id === 'string' && /^[a-z0-9]{6,32}$/i.test(id.trim());
}

/**
 * @returns {string}
 */
function newUploadRefId() {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}${rand}`.slice(0, 24);
}

module.exports = {
  APPLY_LIMIT_MESSAGE,
  MAX_APPLIED_UPLOAD_REFS,
  MAX_UPLOAD_REFS_PER_POST,
  MAX_USAGE_CHARS,
  NON_SUBJECT_MARKER,
  USAGE_PLACEHOLDER,
  addUploadRefToAllPicks,
  effectiveUsage,
  emptyPicks,
  emptySlotPick,
  isUploadRefId,
  newUploadRefId,
  normalizePicks,
  normalizeSlotPick,
  normalizeUploadRefs,
  occupiesSubject,
  pickAllUploadRefs,
  readUploadRefsFromDraft,
  removeUploadRefFromPicks,
  selectedUploadRefs,
  textOnlyPickBlockReason,
  validateUsage,
};
