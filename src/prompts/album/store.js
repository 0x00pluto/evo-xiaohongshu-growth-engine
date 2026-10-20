// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
/** @type {typeof import('./learn')} */
const learnModule = require('./learn');

const {
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
 * @param {string} promptsDir
 * @param {AlbumDraft} draft
 * @returns {{ id: string }}
 */
function commitAlbumDraft(promptsDir, draft) {
  if (!draft || typeof draft !== 'object') {
    throw new Error('没有可写入的草稿');
  }
  const id = String(draft.id || '').trim();
  if (!id) throw new Error('草稿 id 不完整');
  const albumsDir = path.join(promptsDir, 'albums');
  const samplesDir = path.join(promptsDir, 'samples');
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

  clearAlbumCatalogCache(promptsDir);
  try {
    loadAlbumCatalog(promptsDir).get(id);
  } catch (err) {
    for (const file of written) unlinkQuiet(file);
    clearAlbumCatalogCache(promptsDir);
    throw err instanceof Error ? err : new Error('写入后图册校验失败');
  }
  return { id };
}

/**
 * @param {string} promptsDir
 * @param {string} id
 */
function deleteAlbumFiles(promptsDir, id) {
  const albumId = String(id || '').trim();
  if (!albumId) throw new Error('要指明图册');
  if (isBuiltinAlbum(albumId) || isBuiltinAlbumId(albumId)) {
    throw new Error('出厂图册不能删除');
  }
  if (!isAlbum(albumId, promptsDir)) {
    throw new Error('图册不在允许列表');
  }

  const albumsDir = path.join(promptsDir, 'albums');
  /** @type {string[]} */
  const targets = [
    path.join(albumsDir, `${albumId}.json`),
    path.join(albumsDir, `${albumId}.md`),
    path.join(albumsDir, `${albumId}.copy-sample.md`),
  ];
  const sampleAbs = albumSampleFile(promptsDir, albumId);
  if (fs.existsSync(sampleAbs)) targets.push(sampleAbs);

  for (const file of targets) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  clearAlbumCatalogCache(promptsDir);
}

module.exports = {
  commitAlbumDraft,
  deleteAlbumFiles,
};
