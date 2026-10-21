// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
/** @type {typeof import('./learn')} */
const learnModule = require('./learn');
/** @type {typeof import('./sheet')} */
const sheetModule = require('./sheet');

const {
  SAMPLE_EXTS,
  USER_ALBUM_SEQ_START,
  albumCopySamplePath,
  albumMetaPath,
  albumPackDir,
  albumPromptPath,
  clearAlbumCatalogCache,
  isAlbum,
  isBuiltinAlbum,
  loadAlbumCatalog,
} = catalogModule;
const { assertPromptPlaceholders, assertPromptSheet, isBuiltinAlbumId } = learnModule;
const { PROMPT_SHEET_VERSION } = sheetModule;

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
 * @param {string} root
 * @param {string} id
 * @returns {string | null}
 */
function findLegacySample(root, id) {
  const samplesDir = path.join(root, 'samples');
  for (const ext of SAMPLE_EXTS) {
    const candidate = path.join(samplesDir, `${id}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * 把扁平四件套迁进 <id>/ 包目录（可重复跑）。
 * @param {string} albumsRoot factory albums 或 runtime/albums
 * @returns {string[]}
 */
function migrateFlatAlbumsInRoot(albumsRoot) {
  if (!albumsRoot || !fs.existsSync(albumsRoot)) return [];
  /** @type {string[]} */
  const moved = [];
  for (const name of fs.readdirSync(albumsRoot)) {
    if (!name.endsWith('.json')) continue;
    if (name === 'album.json') continue;
    const id = name.slice(0, -'.json'.length);
    if (!/^\d{6}\./.test(id)) continue;
    const pack = path.join(albumsRoot, id);
    const destMeta = albumMetaPath(pack);
    if (fs.existsSync(destMeta)) {
      // 已是包结构：清掉旁路扁平残留
      for (const suffix of ['.json', '.md', '.copy-sample.md']) {
        unlinkQuiet(path.join(albumsRoot, `${id}${suffix}`));
      }
      const legacySample = findLegacySample(albumsRoot, id);
      if (legacySample) unlinkQuiet(legacySample);
      continue;
    }
    const srcJson = path.join(albumsRoot, `${id}.json`);
    const srcMd = path.join(albumsRoot, `${id}.md`);
    const srcCopy = path.join(albumsRoot, `${id}.copy-sample.md`);
    if (!fs.existsSync(srcJson) || !fs.existsSync(srcMd) || !fs.existsSync(srcCopy)) {
      continue;
    }
    fs.mkdirSync(pack, { recursive: true });
    moveFile(srcJson, destMeta);
    moveFile(srcMd, albumPromptPath(pack));
    moveFile(srcCopy, albumCopySamplePath(pack));
    const legacySample = findLegacySample(albumsRoot, id);
    if (legacySample) {
      const ext = path.extname(legacySample).toLowerCase();
      const safeExt = ext === '.jpeg' ? '.jpg' : ext;
      moveFile(legacySample, path.join(pack, `sample${safeExt}`));
    }
    moved.push(id);
  }
  return moved;
}

/**
 * 把 assets 里序号 ≥ 100000 的用户册迁到 runtime/albums（包目录）。
 * @param {string} promptsDir
 * @param {string} userAlbumsDir
 * @returns {string[]} 迁走的 id 列表
 */
function migrateUserAlbumsFromAssets(promptsDir, userAlbumsDir) {
  if (typeof promptsDir !== 'string' || !promptsDir) return [];
  if (typeof userAlbumsDir !== 'string' || !userAlbumsDir.trim()) return [];
  const factoryAlbums = path.join(promptsDir, 'albums');
  const userRoot = path.resolve(userAlbumsDir.trim());
  if (!fs.existsSync(factoryAlbums)) return [];

  // 先把两边扁平结构收成包
  migrateFlatAlbumsInRoot(factoryAlbums);
  migrateFlatAlbumsInRoot(userRoot);

  /** @type {string[]} */
  const moved = [];
  for (const name of fs.readdirSync(factoryAlbums)) {
    const pack = path.join(factoryAlbums, name);
    let stat;
    try {
      stat = fs.statSync(pack);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if (!fs.existsSync(albumMetaPath(pack))) continue;
    const id = name;
    const seq = Number(id.slice(0, 6));
    if (!Number.isInteger(seq) || seq < USER_ALBUM_SEQ_START) continue;

    const destPack = path.join(userRoot, id);
    if (fs.existsSync(albumMetaPath(destPack))) {
      fs.rmSync(pack, { recursive: true, force: true });
      moved.push(id);
      continue;
    }

    fs.mkdirSync(userRoot, { recursive: true });
    try {
      fs.renameSync(pack, destPack);
    } catch {
      fs.cpSync(pack, destPack, { recursive: true });
      fs.rmSync(pack, { recursive: true, force: true });
    }
    moved.push(id);
  }
  if (moved.length > 0) {
    clearAlbumCatalogCache(promptsDir, userRoot);
  }
  return moved;
}

/**
 * 启动时把用户 runtime 扁平册收成包。
 * @param {string} userAlbumsDir
 * @param {string} [promptsDir]
 * @returns {string[]}
 */
function migrateUserAlbumPacks(userAlbumsDir, promptsDir) {
  if (typeof userAlbumsDir !== 'string' || !userAlbumsDir.trim()) return [];
  const userRoot = path.resolve(userAlbumsDir.trim());
  const moved = migrateFlatAlbumsInRoot(userRoot);
  if (moved.length > 0) {
    clearAlbumCatalogCache(
      typeof promptsDir === 'string' ? promptsDir : userRoot,
      userRoot,
    );
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
  const pack = path.join(albumsDir, id);
  fs.mkdirSync(albumsDir, { recursive: true });

  const jsonPath = albumMetaPath(pack);
  const mdPath = albumPromptPath(pack);
  const sampleMdPath = albumCopySamplePath(pack);
  const ext = typeof draft.sampleExt === 'string' && draft.sampleExt.startsWith('.')
    ? (draft.sampleExt === '.jpeg' ? '.jpg' : draft.sampleExt)
    : '.jpg';
  const samplePath = path.join(pack, `sample${ext}`);

  if (
    fs.existsSync(jsonPath)
    || fs.existsSync(mdPath)
    || fs.existsSync(sampleMdPath)
    || fs.existsSync(samplePath)
    || fs.existsSync(pack)
  ) {
    if (fs.existsSync(pack) && fs.readdirSync(pack).length > 0) {
      throw new Error('图册文件已存在，请放弃后重新学习');
    }
  }

  /** @type {string[]} */
  const written = [];
  try {
    fs.mkdirSync(pack, { recursive: true });
    const meta = {
      id,
      kind: draft.kind,
      slug: draft.slug,
      hint: draft.hint,
      label: draft.label,
      copySchema: draft.copySchema,
      legacyIds: [],
      enabled: true,
      promptSheetVersion: PROMPT_SHEET_VERSION,
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
    try {
      if (fs.existsSync(pack) && fs.readdirSync(pack).length === 0) {
        fs.rmdirSync(pack);
      }
    } catch {
      // ignore
    }
    throw err instanceof Error ? err : new Error('写入图册失败');
  }

  const factoryDir = typeof promptsDir === 'string' ? promptsDir : '';
  clearAlbumCatalogCache(factoryDir || albumsDir, albumsDir);
  if (factoryDir) {
    try {
      loadAlbumCatalog(factoryDir, albumsDir).get(id);
    } catch (err) {
      for (const file of written) unlinkQuiet(file);
      try {
        fs.rmSync(pack, { recursive: true, force: true });
      } catch {
        // ignore
      }
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

  const pack = albumPackDir(meta);
  if (fs.existsSync(pack)) {
    fs.rmSync(pack, { recursive: true, force: true });
  }
  clearAlbumCatalogCache(promptsDir, userAlbumsDir);
}

/**
 * 覆盖用户图册绘图题词（仅 runtime 用户册）。
 * @param {string} promptsDir
 * @param {string} userAlbumsDir
 * @param {string} id
 * @param {string} promptMd
 * @returns {{ id: string }}
 */
function updateAlbumPromptMd(promptsDir, userAlbumsDir, id, promptMd) {
  const albumId = String(id || '').trim();
  if (!albumId) throw new Error('要指明图册');
  if (isBuiltinAlbum(albumId) || isBuiltinAlbumId(albumId)) {
    throw new Error('出厂图册不能修改');
  }
  if (!isAlbum(albumId, promptsDir, userAlbumsDir)) {
    throw new Error('图册不在允许列表');
  }
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(albumId);
  if (meta.source !== 'user') {
    throw new Error('出厂图册不能修改');
  }
  const text = String(promptMd || '').trim();
  if (!text) throw new Error('绘图题词是空的');
  assertPromptSheet(text);
  assertPromptPlaceholders(meta.kind, text, meta.copySchema);
  if (meta.promptSheetVersion !== PROMPT_SHEET_VERSION) {
    throw new Error(
      `图册题词结构是 v${meta.promptSheetVersion}，当前只支持 v${PROMPT_SHEET_VERSION}；请重新学习或改 JSON 的 promptSheetVersion`,
    );
  }
  const mdPath = albumPromptPath(albumPackDir(meta));
  if (!fs.existsSync(mdPath)) {
    throw new Error(`找不到图册题词 ${albumId}/prompt.md`);
  }
  fs.writeFileSync(mdPath, `${text}\n`, 'utf8');
  clearAlbumCatalogCache(promptsDir, userAlbumsDir);
  return { id: albumId };
}

module.exports = {
  commitAlbumDraft,
  deleteAlbumFiles,
  migrateFlatAlbumsInRoot,
  migrateUserAlbumPacks,
  migrateUserAlbumsFromAssets,
  updateAlbumPromptMd,
};
