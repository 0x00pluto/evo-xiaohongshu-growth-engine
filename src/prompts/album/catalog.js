// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {ReadonlyArray<string>} */
const ALBUM_KINDS = ['magazine', 'scrapbook', 'conceptual', 'card', 'infographic'];
/** @type {ReadonlySet<string>} */
const ALBUM_KIND_SET = new Set(ALBUM_KINDS);
/** 用户自加图册从这个序号起；更小的序号整段系统预留（含出厂五本） */
const USER_ALBUM_SEQ_START = 100000;
/** @type {ReadonlyArray<string>} */
const SAMPLE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * kind / slug：小写英文开头，其后为小写英文、数字或连字符。
 * @param {string} value
 * @returns {boolean}
 */
function isAlbumToken(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
}

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
 *   source: 'factory' | 'user';
 *   home: string;
 * }} AlbumMeta
 * @typedef {{
 *   promptsDir: string;
 *   userAlbumsDir: string;
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
  const kind = requireNonEmptyString(source.kind).toLowerCase();
  if (!isAlbumToken(kind)) {
    throw new Error(`图册 kind 不合法：${id}`);
  }
  const idParts = id.split('.');
  if (idParts.length !== 3 || !/^\d{6}$/.test(idParts[0] || '')) {
    throw new Error(`图册 id 形状不合法：${id}`);
  }
  const idKind = idParts[1] || '';
  if (idKind !== kind) {
    throw new Error(`图册 id 中的 kind 与字段不一致：${id}`);
  }
  const slug = requireNonEmptyString(source.slug).toLowerCase();
  if (!isAlbumToken(slug)) {
    throw new Error(`图册 slug 不合法：${id}`);
  }
  if ((idParts[2] || '') !== slug) {
    throw new Error(`图册 id 中的 slug 与字段不一致：${id}`);
  }
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
    source: 'factory',
    home: '',
  };
}

/**
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function catalogCacheKey(promptsDir, userAlbumsDir) {
  const factory = path.resolve(promptsDir);
  const user = typeof userAlbumsDir === 'string' && userAlbumsDir.trim()
    ? path.resolve(userAlbumsDir.trim())
    : '';
  return `${factory}::${user}`;
}

/**
 * @param {AlbumMeta} meta
 * @returns {string}
 */
function albumFilesDir(meta) {
  return meta.source === 'user' ? meta.home : path.join(meta.home, 'albums');
}

/**
 * @param {AlbumMeta} meta
 * @returns {string}
 */
function albumSamplesDir(meta) {
  return path.join(meta.home, 'samples');
}

/**
 * @param {string} dir
 * @param {'factory' | 'user'} source
 * @param {string} home
 * @param {Map<string, string>} legacyMap
 * @returns {AlbumMeta[]}
 */
function scanAlbumDir(dir, source, home, legacyMap) {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  /** @type {AlbumMeta[]} */
  const metas = [];
  for (const name of names) {
    const fileId = name.slice(0, -'.json'.length);
    const file = path.join(dir, name);
    /** @type {unknown} */
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw new Error(`图册元数据不是合法 JSON：${fileId}`);
    }
    const meta = normalizeMeta(raw, fileId);
    meta.source = source;
    meta.home = home;
    if (!meta.enabled) continue;
    const md = path.join(dir, `${meta.id}.md`);
    const sample = path.join(dir, `${meta.id}.copy-sample.md`);
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
  return metas;
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
 * 出厂图册在 promptsDir/albums；用户图册在 userAlbumsDir（runtime/albums）。
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {AlbumCatalog}
 */
function loadAlbumCatalog(promptsDir, userAlbumsDir) {
  if (typeof promptsDir !== 'string' || !promptsDir) {
    throw new Error('读取图册需要提示词目录');
  }
  const root = path.resolve(promptsDir);
  const userRoot = typeof userAlbumsDir === 'string' && userAlbumsDir.trim()
    ? path.resolve(userAlbumsDir.trim())
    : '';
  const key = catalogCacheKey(root, userRoot);
  const cached = CACHE.get(key);
  if (cached) return cached;

  const factoryAlbumsDir = path.join(root, 'albums');
  if (!fs.existsSync(factoryAlbumsDir)) {
    throw new Error('找不到图册目录 albums');
  }
  /** @type {Map<string, string>} */
  const legacyMap = new Map();
  /** @type {Map<string, AlbumMeta>} */
  const byId = new Map();

  for (const meta of scanAlbumDir(factoryAlbumsDir, 'factory', root, legacyMap)) {
    byId.set(meta.id, meta);
  }
  if (userRoot) {
    for (const meta of scanAlbumDir(userRoot, 'user', userRoot, legacyMap)) {
      byId.set(meta.id, meta);
    }
  }

  const metas = Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
  if (metas.length === 0) {
    throw new Error('图册目录里没有可用图册');
  }
  const idList = metas.map((item) => item.id);

  /** @type {AlbumCatalog} */
  const catalog = {
    promptsDir: root,
    userAlbumsDir: userRoot,
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

  CACHE.set(key, catalog);
  return catalog;
}

/**
 * @param {string} [promptsDir]
 * @param {string} [userAlbumsDir]
 */
function clearAlbumCatalogCache(promptsDir, userAlbumsDir) {
  if (typeof promptsDir === 'string' && promptsDir) {
    CACHE.delete(catalogCacheKey(promptsDir, userAlbumsDir));
    return;
  }
  CACHE.clear();
}

/**
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {string[]}
 */
function listAlbums(promptsDir, userAlbumsDir) {
  return loadAlbumCatalog(promptsDir, userAlbumsDir).ids();
}

/**
 * @param {unknown} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {album is string}
 */
function isAlbum(album, promptsDir, userAlbumsDir) {
  return typeof album === 'string' && loadAlbumCatalog(promptsDir, userAlbumsDir).has(album);
}

/**
 * @param {unknown} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function albumKind(album, promptsDir, userAlbumsDir) {
  if (!isAlbum(album, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  return loadAlbumCatalog(promptsDir, userAlbumsDir).get(album).kind;
}

/**
 * @param {unknown} look
 * @param {string} [promptsDir]
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function migrateAlbumId(look, promptsDir, userAlbumsDir) {
  if (typeof look !== 'string' || !look) return '';
  if (typeof promptsDir === 'string' && promptsDir) {
    return loadAlbumCatalog(promptsDir, userAlbumsDir).migrateLook(look);
  }
  // 无目录时只认「已是新 id」形状，旧短名无法映射则清空。
  const parts = look.split('.');
  if (
    parts.length === 3
    && /^\d{6}$/.test(parts[0] || '')
    && isAlbumToken(parts[1] || '')
    && isAlbumToken(parts[2] || '')
  ) {
    return look;
  }
  return '';
}

/**
 * 序号小于 100000 为系统预留，不可删。
 * @param {string} id
 * @returns {boolean}
 */
function isBuiltinAlbum(id) {
  const seq = Number(String(id || '').split('.')[0] || '');
  return Number.isInteger(seq) && seq >= 1 && seq < USER_ALBUM_SEQ_START;
}

/**
 * @param {string} promptsDir
 * @param {() => number} [random]
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function pickAlbum(promptsDir, random, userAlbumsDir) {
  return loadAlbumCatalog(promptsDir, userAlbumsDir).pick(random);
}

/** @deprecated 兼容旧名 */
const pickLook = pickAlbum;

/**
 * @param {string} promptsDir
 * @param {unknown} album
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function albumHint(promptsDir, album, userAlbumsDir) {
  if (!isAlbum(album, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  return loadAlbumCatalog(promptsDir, userAlbumsDir).get(album).hint;
}

/**
 * 出厂册相对 promptsDir；用户册返回绝对路径标记（供 readAlbumPromptText 使用）。
 * @param {unknown} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function albumPromptName(album, promptsDir, userAlbumsDir) {
  if (!isAlbum(album, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(/** @type {string} */ (album));
  if (meta.source === 'user') {
    return path.join(albumFilesDir(meta), `${meta.id}.md`);
  }
  return `albums/${album}.md`;
}

/**
 * @param {AlbumMeta} meta
 * @param {string} album
 * @returns {string}
 */
function resolveSampleAbs(meta, album) {
  const samplesDir = albumSamplesDir(meta);
  for (const ext of SAMPLE_EXTS) {
    const candidate = path.join(samplesDir, `${album}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (fs.existsSync(samplesDir)) {
    for (const name of fs.readdirSync(samplesDir)) {
      const ext = path.extname(name).toLowerCase();
      const base = path.basename(name, path.extname(name));
      if (base === album && SAMPLE_EXTS.includes(ext)) {
        return path.join(samplesDir, name);
      }
    }
  }
  return path.join(samplesDir, `${album}.jpg`);
}

/**
 * 样图相对路径（出厂相对 promptsDir；用户相对 userAlbumsDir）。
 * @param {unknown} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function albumSamplePath(album, promptsDir, userAlbumsDir) {
  if (!isAlbum(album, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(/** @type {string} */ (album));
  const abs = resolveSampleAbs(meta, /** @type {string} */ (album));
  if (meta.source === 'user') {
    return path.relative(meta.home, abs).split(path.sep).join('/');
  }
  return path.relative(meta.home, abs).split(path.sep).join('/');
}

/**
 * @param {string} promptsDir
 * @param {unknown} album
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function albumSampleFile(promptsDir, album, userAlbumsDir) {
  if (!isAlbum(album, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(/** @type {string} */ (album));
  return resolveSampleAbs(meta, /** @type {string} */ (album));
}

/**
 * @param {string} promptsDir
 * @param {unknown} album
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function readAlbumPromptText(promptsDir, album, userAlbumsDir) {
  if (!isAlbum(album, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(/** @type {string} */ (album));
  const file = path.join(albumFilesDir(meta), `${meta.id}.md`);
  if (!fs.existsSync(file)) {
    throw new Error(`找不到图册题词 ${meta.id}.md`);
  }
  return fs.readFileSync(file, 'utf8');
}

/**
 * schema 正文来自 JSON，再拼 copy-sample（给策划模型 few-shot）。
 * @param {unknown} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function copySchema(album, promptsDir, userAlbumsDir) {
  if (!isAlbum(album, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(/** @type {string} */ (album));
  const samplePath = path.join(albumFilesDir(meta), `${album}.copy-sample.md`);
  if (!fs.existsSync(samplePath)) {
    throw new Error(`找不到图册抽取示例 ${album}.copy-sample.md`);
  }
  const sample = fs.readFileSync(samplePath, 'utf8').trim();
  return `${meta.copySchema}\n\n${sample}`;
}

/**
 * @param {unknown} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function albumLabel(album, promptsDir, userAlbumsDir) {
  if (!isAlbum(album, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  return loadAlbumCatalog(promptsDir, userAlbumsDir).get(album).label;
}

/**
 * 兼容旧调用：出厂 samples 相对路径探测。
 * @param {string} promptsDir
 * @param {string} album
 * @returns {string}
 */
function resolveAlbumSampleRel(promptsDir, album) {
  return albumSamplePath(album, promptsDir, '');
}

/** @deprecated 兼容旧名 */
const isLook = isAlbum;

module.exports = {
  ALBUM_KINDS,
  ALBUM_KIND_SET,
  SAMPLE_EXTS,
  USER_ALBUM_SEQ_START,
  albumFilesDir,
  albumHint,
  albumKind,
  albumLabel,
  albumPromptName,
  albumSampleFile,
  albumSamplePath,
  albumSamplesDir,
  clearAlbumCatalogCache,
  copySchema,
  isAlbum,
  isAlbumToken,
  isBuiltinAlbum,
  isLook,
  listAlbums,
  loadAlbumCatalog,
  migrateAlbumId,
  pickAlbum,
  pickLook,
  pickOne,
  readAlbumPromptText,
  resolveAlbumSampleRel,
};
