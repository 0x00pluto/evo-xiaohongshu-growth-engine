// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {ReadonlyArray<string>} */
const ALBUM_KINDS = ['magazine', 'scrapbook', 'conceptual', 'card', 'infographic'];
/** @type {ReadonlySet<string>} */
const ALBUM_KIND_SET = new Set(ALBUM_KINDS);

/**
 * @typedef {{ min: number; max: number }} RangeConstraint
 * @typedef {{
 *   modules?: RangeConstraint;
 *   steps?: RangeConstraint;
 * }} AlbumConstraints
 * @typedef {{
 *   id: string;
 *   kind: string;
 *   slug: string;
 *   hint: string;
 *   label: string;
 *   copySchema: string;
 *   legacyIds: string[];
 *   enabled: boolean;
 *   constraints: AlbumConstraints;
 * }} AlbumMeta
 * @typedef {{
 *   promptsDir: string;
 *   ids: () => string[];
 *   list: () => AlbumMeta[];
 *   get: (id: string) => AlbumMeta;
 *   has: (id: string) => boolean;
 *   migrateLook: (look: unknown) => string;
 *   pick: (random?: () => number) => string;
 * }} AlbumCatalog
 */

/** @type {Map<string, AlbumCatalog>} */
const CACHE = new Map();

/**
 * @param {unknown} value
 * @returns {string}
 */
function requireNonEmptyString(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('图册元数据字段不完整');
  }
  return value.trim();
}

/**
 * @param {unknown} raw
 * @returns {RangeConstraint | undefined}
 */
function readRange(raw) {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('图册 constraints 不合法');
  }
  const source = /** @type {Record<string, unknown>} */ (raw);
  const min = Number(source.min);
  const max = Number(source.max);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new Error('图册 constraints 不合法');
  }
  return { min, max };
}

/**
 * @param {unknown} raw
 * @param {string} fileId
 * @returns {AlbumMeta}
 */
function normalizeMeta(raw, fileId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`图册元数据不是对象：${fileId}`);
  }
  const source = /** @type {Record<string, unknown>} */ (raw);
  const id = requireNonEmptyString(source.id);
  if (id !== fileId) {
    throw new Error(`图册 id 与文件名不一致：${fileId}`);
  }
  const kind = requireNonEmptyString(source.kind);
  if (!ALBUM_KIND_SET.has(kind)) {
    throw new Error(`图册 kind 不在允许列表：${id}`);
  }
  const idKind = id.split('.')[1] || '';
  if (idKind !== kind) {
    throw new Error(`图册 id 中的 kind 与字段不一致：${id}`);
  }
  const slug = requireNonEmptyString(source.slug);
  const hint = requireNonEmptyString(source.hint);
  const label = requireNonEmptyString(source.label);
  const copySchema = requireNonEmptyString(source.copySchema);
  const enabled = source.enabled !== false;
  /** @type {string[]} */
  const legacyIds = [];
  if (source.legacyIds !== undefined) {
    if (!Array.isArray(source.legacyIds)) {
      throw new Error(`图册 legacyIds 不合法：${id}`);
    }
    for (const item of source.legacyIds) {
      if (typeof item !== 'string' || !item.trim()) {
        throw new Error(`图册 legacyIds 不合法：${id}`);
      }
      legacyIds.push(item.trim());
    }
  }
  /** @type {AlbumConstraints} */
  const constraints = {};
  if (source.constraints !== undefined) {
    if (!source.constraints || typeof source.constraints !== 'object' || Array.isArray(source.constraints)) {
      throw new Error(`图册 constraints 不合法：${id}`);
    }
    const bag = /** @type {Record<string, unknown>} */ (source.constraints);
    const modules = readRange(bag.modules);
    const steps = readRange(bag.steps);
    if (modules) constraints.modules = modules;
    if (steps) constraints.steps = steps;
  }
  return {
    id,
    kind,
    slug,
    hint,
    label,
    copySchema,
    legacyIds,
    enabled,
    constraints,
  };
}

/**
 * @template T
 * @param {ReadonlyArray<T>} list
 * @param {() => number} [random]
 * @returns {T}
 */
function pickOne(list, random = Math.random) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('没有可抽的项');
  }
  const index = Math.floor(Number(random()) * list.length);
  const safe = Number.isInteger(index) && index >= 0 && index < list.length ? index : 0;
  return list[safe];
}

/**
 * 从 albums/*.json 扫描图册；同接口以后可换成 SQLite。
 * @param {string} promptsDir
 * @returns {AlbumCatalog}
 */
function loadAlbumCatalog(promptsDir) {
  if (typeof promptsDir !== 'string' || !promptsDir) {
    throw new Error('读取图册需要提示词目录');
  }
  const root = path.resolve(promptsDir);
  const cached = CACHE.get(root);
  if (cached) return cached;

  const albumsDir = path.join(root, 'albums');
  if (!fs.existsSync(albumsDir)) {
    throw new Error('找不到图册目录 albums');
  }
  const names = fs.readdirSync(albumsDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  /** @type {AlbumMeta[]} */
  const metas = [];
  /** @type {Map<string, string>} */
  const legacyMap = new Map();

  for (const name of names) {
    const fileId = name.slice(0, -'.json'.length);
    const file = path.join(albumsDir, name);
    /** @type {unknown} */
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw new Error(`图册元数据不是合法 JSON：${fileId}`);
    }
    const meta = normalizeMeta(raw, fileId);
    if (!meta.enabled) continue;
    const md = path.join(albumsDir, `${meta.id}.md`);
    const sample = path.join(albumsDir, `${meta.id}.copy-sample.md`);
    if (!fs.existsSync(md)) {
      throw new Error(`找不到图册题词 ${meta.id}.md`);
    }
    if (!fs.existsSync(sample)) {
      throw new Error(`找不到图册抽取示例 ${meta.id}.copy-sample.md`);
    }
    for (const legacy of meta.legacyIds) {
      if (legacyMap.has(legacy)) {
        throw new Error(`图册 legacyId 重复：${legacy}`);
      }
      legacyMap.set(legacy, meta.id);
    }
    metas.push(meta);
  }

  metas.sort((left, right) => left.id.localeCompare(right.id));
  if (metas.length === 0) {
    throw new Error('图册目录里没有可用图册');
  }

  /** @type {Map<string, AlbumMeta>} */
  const byId = new Map(metas.map((item) => [item.id, item]));
  const idList = metas.map((item) => item.id);

  /** @type {AlbumCatalog} */
  const catalog = {
    promptsDir: root,
    ids: () => idList.slice(),
    list: () => metas.slice(),
    get: (id) => {
      const meta = byId.get(id);
      if (!meta) throw new Error('图册不在允许列表');
      return meta;
    },
    has: (id) => byId.has(id),
    migrateLook: (look) => {
      if (typeof look !== 'string' || !look) return '';
      if (byId.has(look)) return look;
      const mapped = legacyMap.get(look);
      return typeof mapped === 'string' ? mapped : '';
    },
    pick: (random) => pickOne(idList, random),
  };

  CACHE.set(root, catalog);
  return catalog;
}

/**
 * @param {string} [promptsDir]
 */
function clearAlbumCatalogCache(promptsDir) {
  if (typeof promptsDir === 'string' && promptsDir) {
    CACHE.delete(path.resolve(promptsDir));
    return;
  }
  CACHE.clear();
}

/**
 * @param {string} promptsDir
 * @returns {string[]}
 */
function listAlbums(promptsDir) {
  return loadAlbumCatalog(promptsDir).ids();
}

/**
 * @param {unknown} album
 * @param {string} promptsDir
 * @returns {album is string}
 */
function isAlbum(album, promptsDir) {
  return typeof album === 'string' && loadAlbumCatalog(promptsDir).has(album);
}

/**
 * @param {unknown} album
 * @param {string} promptsDir
 * @returns {string}
 */
function albumKind(album, promptsDir) {
  if (!isAlbum(album, promptsDir)) {
    throw new Error('图册不在允许列表');
  }
  return loadAlbumCatalog(promptsDir).get(album).kind;
}

/**
 * @param {unknown} look
 * @param {string} [promptsDir]
 * @returns {string}
 */
function migrateAlbumId(look, promptsDir) {
  if (typeof look !== 'string' || !look) return '';
  if (typeof promptsDir === 'string' && promptsDir) {
    return loadAlbumCatalog(promptsDir).migrateLook(look);
  }
  // 无目录时只认「已是新 id」形状，旧短名无法映射则清空。
  const parts = look.split('.');
  if (
    parts.length === 3
    && /^\d{6}$/.test(parts[0] || '')
    && ALBUM_KIND_SET.has(parts[1] || '')
    && parts[2]
  ) {
    return look;
  }
  return '';
}

/**
 * @param {string} promptsDir
 * @param {() => number} [random]
 * @returns {string}
 */
function pickAlbum(promptsDir, random) {
  return loadAlbumCatalog(promptsDir).pick(random);
}

/** @deprecated 兼容旧名 */
const pickLook = pickAlbum;

/**
 * @param {string} promptsDir
 * @param {unknown} album
 * @returns {string}
 */
function albumHint(promptsDir, album) {
  if (!isAlbum(album, promptsDir)) {
    throw new Error('图册不在允许列表');
  }
  return loadAlbumCatalog(promptsDir).get(album).hint;
}

/**
 * @param {unknown} album
 * @param {string} promptsDir
 * @returns {string}
 */
function albumPromptName(album, promptsDir) {
  if (!isAlbum(album, promptsDir)) {
    throw new Error('图册不在允许列表');
  }
  return `albums/${album}.md`;
}

/**
 * @param {unknown} album
 * @param {string} promptsDir
 * @returns {string}
 */
function albumSamplePath(album, promptsDir) {
  if (!isAlbum(album, promptsDir)) {
    throw new Error('图册不在允许列表');
  }
  return `samples/${album}.jpg`;
}

/**
 * @param {string} promptsDir
 * @param {unknown} album
 * @returns {string}
 */
function albumSampleFile(promptsDir, album) {
  return path.join(promptsDir, albumSamplePath(album, promptsDir));
}

/**
 * schema 正文来自 JSON，再拼 copy-sample（给策划模型 few-shot）。
 * @param {unknown} album
 * @param {string} promptsDir
 * @returns {string}
 */
function copySchema(album, promptsDir) {
  if (!isAlbum(album, promptsDir)) {
    throw new Error('图册不在允许列表');
  }
  const meta = loadAlbumCatalog(promptsDir).get(album);
  const samplePath = path.join(promptsDir, 'albums', `${album}.copy-sample.md`);
  if (!fs.existsSync(samplePath)) {
    throw new Error(`找不到图册抽取示例 ${album}.copy-sample.md`);
  }
  const sample = fs.readFileSync(samplePath, 'utf8').trim();
  return `${meta.copySchema}\n\n${sample}`;
}

/**
 * @param {unknown} album
 * @param {string} promptsDir
 * @returns {string}
 */
function albumLabel(album, promptsDir) {
  if (!isAlbum(album, promptsDir)) {
    throw new Error('图册不在允许列表');
  }
  return loadAlbumCatalog(promptsDir).get(album).label;
}

/** @deprecated 兼容旧名 */
const isLook = isAlbum;

module.exports = {
  ALBUM_KINDS,
  ALBUM_KIND_SET,
  albumHint,
  albumKind,
  albumLabel,
  albumPromptName,
  albumSampleFile,
  albumSamplePath,
  clearAlbumCatalogCache,
  copySchema,
  isAlbum,
  isLook,
  listAlbums,
  loadAlbumCatalog,
  migrateAlbumId,
  pickAlbum,
  pickLook,
  pickOne,
};
