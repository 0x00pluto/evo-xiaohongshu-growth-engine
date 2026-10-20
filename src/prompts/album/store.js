// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
/** @type {typeof import('./learn')} */
const learnModule = require('./learn');

const {
  USER_ALBUM_SEQ_START,
  albumSampleFile,
  clearAlbumCatalogCache,
  isAlbum,
  isBuiltinAlbum,
  loadAlbumCatalog,
} = catalogModule;
const { isBuiltinAlbumId } = learnModule;

/**
 * @typedef {import('./learn').AlbumDraft} AlbumDraft
 */

/**
 * @param {string} file
 */
function unlinkQuiet(file) {
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    // 回滚尽力删
  }
}

/**
 * @param {string} src
 * @param {string} dest
 */
function moveFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

/**
 * 把 assets 里序号 ≥ 100000 的用户册迁到 runtime/albums。
 * @param {string} promptsDir
 * @param {string} userAlbumsDir
 * @returns {string[]} 迁走的 id 列表
 */
function migrateUserAlbumsFromAssets(promptsDir, userAlbumsDir) {
  if (typeof promptsDir !== 'string' || !promptsDir) return [];
  if (typeof userAlbumsDir !== 'string' || !userAlbumsDir.trim()) return [];
  const factoryAlbums = path.join(promptsDir, 'albums');
  const factorySamples = path.join(promptsDir, 'samples');
  const userRoot = path.resolve(userAlbumsDir.trim());
  if (!fs.existsSync(factoryAlbums)) return [];

  /** @type {string[]} */
  const moved = [];
  for (const name of fs.readdirSync(factoryAlbums)) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -'.json'.length);
    const seq = Number(id.slice(0, 6));
    if (!Number.isInteger(seq) || seq < USER_ALBUM_SEQ_START) continue;

    const destJson = path.join(userRoot, `${id}.json`);
    if (fs.existsSync(destJson)) {
      // 目标已有则只清资产侧副本
      for (const suffix of ['.json', '.md', '.copy-sample.md']) {
        unlinkQuiet(path.join(factoryAlbums, `${id}${suffix}`));
      }
      for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
        unlinkQuiet(path.join(factorySamples, `${id}${ext}`));
      }
      moved.push(id);
      continue;
    }

    fs.mkdirSync(userRoot, { recursive: true });
    fs.mkdirSync(path.join(userRoot, 'samples'), { recursive: true });
    for (const suffix of ['.json', '.md', '.copy-sample.md']) {
      const src = path.join(factoryAlbums, `${id}${suffix}`);
      if (fs.existsSync(src)) {
        moveFile(src, path.join(userRoot, `${id}${suffix}`));
      }
    }
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      const src = path.join(factorySamples, `${id}${ext}`);
      if (fs.existsSync(src)) {
        moveFile(src, path.join(userRoot, 'samples', `${id}${ext}`));
        break;
      }
    }
    moved.push(id);
  }
  if (moved.length > 0) {
    clearAlbumCatalogCache(promptsDir, userRoot);
  }
  return moved;
}

/**
 * @param {string} userAlbumsDir
 * @param {AlbumDraft} draft
 * @param {string} [promptsDir] 用于写入后校验合并目录
 * @returns {{ id: string }}
 */
function commitAlbumDraft(userAlbumsDir, draft, promptsDir) {
  if (!draft || typeof draft !== 'object') {
    throw new Error('没有可写入的草稿');
  }
  const id = String(draft.id || '').trim();
  if (!id) throw new Error('草稿 id 不完整');
  if (typeof userAlbumsDir !== 'string' || !userAlbumsDir.trim()) {
    throw new Error('缺少用户图册目录');
  }
  const albumsDir = path.resolve(userAlbumsDir.trim());
  const samplesDir = path.join(albumsDir, 'samples');
  fs.mkdirSync(albumsDir, { recursive: true });
  fs.mkdirSync(samplesDir, { recursive: true });

  const jsonPath = path.join(albumsDir, `${id}.json`);
  const mdPath = path.join(albumsDir, `${id}.md`);
  const sampleMdPath = path.join(albumsDir, `${id}.copy-sample.md`);
  const ext = typeof draft.sampleExt === 'string' && draft.sampleExt.startsWith('.')
    ? draft.sampleExt
    : '.jpg';
  const samplePath = path.join(samplesDir, `${id}${ext}`);

  if (
    fs.existsSync(jsonPath)
    || fs.existsSync(mdPath)
    || fs.existsSync(sampleMdPath)
    || fs.existsSync(samplePath)
  ) {
    throw new Error('图册文件已存在，请放弃后重新学习');
  }

  /** @type {string[]} */
  const written = [];
  try {
    const meta = {
      id,
      kind: draft.kind,
      slug: draft.slug,
      hint: draft.hint,
      label: draft.label,
      copySchema: draft.copySchema,
      legacyIds: [],
      enabled: true,
    };
    fs.writeFileSync(jsonPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    written.push(jsonPath);
    fs.writeFileSync(mdPath, `${String(draft.promptMd).trim()}\n`, 'utf8');
    written.push(mdPath);
    fs.writeFileSync(sampleMdPath, `${String(draft.copySample).trim()}\n`, 'utf8');
    written.push(sampleMdPath);
    fs.writeFileSync(samplePath, draft.sampleBytes);
    written.push(samplePath);
  } catch (err) {
    for (const file of written) unlinkQuiet(file);
    throw err instanceof Error ? err : new Error('写入图册失败');
  }

  const factoryDir = typeof promptsDir === 'string' ? promptsDir : '';
  clearAlbumCatalogCache(factoryDir || albumsDir, albumsDir);
  if (factoryDir) {
    try {
      loadAlbumCatalog(factoryDir, albumsDir).get(id);
    } catch (err) {
      for (const file of written) unlinkQuiet(file);
      clearAlbumCatalogCache(factoryDir, albumsDir);
      throw err instanceof Error ? err : new Error('写入后图册校验失败');
    }
  }
  return { id };
}

/**
 * @param {string} promptsDir
 * @param {string} userAlbumsDir
 * @param {string} id
 */
function deleteAlbumFiles(promptsDir, userAlbumsDir, id) {
  const albumId = String(id || '').trim();
  if (!albumId) throw new Error('要指明图册');
  if (isBuiltinAlbum(albumId) || isBuiltinAlbumId(albumId)) {
    throw new Error('出厂图册不能删除');
  }
  if (!isAlbum(albumId, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(albumId);
  if (meta.source !== 'user') {
    throw new Error('出厂图册不能删除');
  }

  const albumsDir = meta.home;
  /** @type {string[]} */
  const targets = [
    path.join(albumsDir, `${albumId}.json`),
    path.join(albumsDir, `${albumId}.md`),
    path.join(albumsDir, `${albumId}.copy-sample.md`),
  ];
  const sampleAbs = albumSampleFile(promptsDir, albumId, userAlbumsDir);
  if (fs.existsSync(sampleAbs)) targets.push(sampleAbs);

  for (const file of targets) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  clearAlbumCatalogCache(promptsDir, userAlbumsDir);
}

module.exports = {
  commitAlbumDraft,
  deleteAlbumFiles,
  migrateUserAlbumsFromAssets,
};
