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
/** @type {typeof import('../../image/aspect')} */
const aspectModule = require('../../image/aspect');

const {
  SAMPLE_EXTS,
  USER_ALBUM_SEQ_START,
  albumCopySamplePath,
  albumMetaPath,
  albumPackDir,
  albumPromptPath,
  albumSampleFile,
  clearAlbumCatalogCache,
  isAlbum,
  isBuiltinAlbum,
  loadAlbumCatalog,
} = catalogModule;
const {
  allocateAlbumId,
  assertPromptPlaceholders,
  assertPromptSheet,
  isBuiltinAlbumId,
} = learnModule;
const { PROMPT_SHEET_VERSION } = sheetModule;
const {
  DEFAULT_ASPECT_RATIO,
  applyFrameSentence,
  aspectRatioFromImage,
  normalizeAspectRatio,
} = aspectModule;

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
      const safeExt = (
        ext === '.jpeg' || ext === '.jpe' || ext === '.jfif' || ext === '.pjpeg'
      ) ? '.jpg' : ext;
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
    ? (
      draft.sampleExt === '.jpeg'
        || draft.sampleExt === '.jpe'
        || draft.sampleExt === '.jfif'
        || draft.sampleExt === '.pjpeg'
        ? '.jpg'
        : draft.sampleExt
    )
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

  const aspectRatio = normalizeAspectRatio(draft.aspectRatio)
    || aspectRatioFromImage(draft.sampleBytes)
    || DEFAULT_ASPECT_RATIO;
  const promptMd = applyFrameSentence(String(draft.promptMd).trim(), aspectRatio);

  /** @type {string[]} */
  const written = [];
  try {
    fs.mkdirSync(pack, { recursive: true });
    /** @type {Record<string, unknown>} */
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
      aspectRatio,
      // 新保存的册显式标记；历史册无此字段，读时视为 passed 且无脚标。
      safetyStatus: 'passed',
    };
    if (draft.learnedFrom && draft.learnedFrom.kind === 'xhs-note') {
      /** @type {Record<string, string>} */
      const source = {
        kind: draft.learnedFrom.kind,
        noteId: draft.learnedFrom.noteId,
        linkId: draft.learnedFrom.linkId,
      };
      if (draft.learnedFrom.role) source.role = draft.learnedFrom.role;
      // album.json 用 source 存小红书溯源；内存 AlbumMeta.source 仍是 factory|user
      meta.source = source;
    }
    fs.writeFileSync(jsonPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    written.push(jsonPath);
    fs.writeFileSync(mdPath, `${promptMd}\n`, 'utf8');
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

/** 审核未通过册的占位题词：仅满足目录扫描，不可用于生图。 */
function flaggedStubPromptMd() {
  return [
    '不可用于生图（样图未通过安全审核）。',
    '1. 背景：无',
    '2. 色彩：无',
    '3. 字体：无',
    '4. 字号：无',
    '5. 字重：无',
    '6. 文字排版：无',
    '7. 文字位置：无',
    '8. 构图布局：无',
    '9. 视觉风格：无',
    '10. 光影与质感：无',
    '11. 主题绘画内容：{{scene}}',
    '',
    '图片必须准确呈现的中文文案：',
    '{{line}}',
    '',
    '文案必须完整、准确。',
  ].join('\n');
}

/**
 * 探针 CONTENT_FLAGGED：落盘样图与元数据，不学提示词。
 * @param {string} userAlbumsDir
 * @param {{
 *   sampleBytes: Buffer;
 *   sampleExt: string;
 *   learnedFrom?: import('../../xhs-note/provenance').XhsNoteProvenance | null;
 * }} image
 * @param {string} promptsDir
 * @returns {{ id: string; label: string; safetyStatus: 'flagged' }}
 */
function commitFlaggedAlbumDraft(userAlbumsDir, image, promptsDir) {
  if (!image || typeof image !== 'object' || !Buffer.isBuffer(image.sampleBytes)) {
    throw new Error('缺少样图');
  }
  if (typeof userAlbumsDir !== 'string' || !userAlbumsDir.trim()) {
    throw new Error('缺少用户图册目录');
  }
  if (typeof promptsDir !== 'string' || !promptsDir.trim()) {
    throw new Error('缺少提示词目录');
  }
  const albumsDir = path.resolve(userAlbumsDir.trim());
  const factoryDir = path.resolve(promptsDir.trim());
  const id = allocateAlbumId(factoryDir, { kind: 'card', slug: 'safety-flagged' }, albumsDir);
  const pack = path.join(albumsDir, id);
  fs.mkdirSync(albumsDir, { recursive: true });

  const jsonPath = albumMetaPath(pack);
  const mdPath = albumPromptPath(pack);
  const sampleMdPath = albumCopySamplePath(pack);
  const rawExt = typeof image.sampleExt === 'string' && image.sampleExt.startsWith('.')
    ? image.sampleExt
    : '.jpg';
  const ext = rawExt === '.jpeg' || rawExt === '.jpe' || rawExt === '.jfif' || rawExt === '.pjpeg'
    ? '.jpg'
    : rawExt;
  const samplePath = path.join(pack, `sample${ext}`);
  if (fs.existsSync(pack) && fs.readdirSync(pack).length > 0) {
    throw new Error('图册文件已存在，请放弃后重新学习');
  }

  const aspectRatio = aspectRatioFromImage(image.sampleBytes) || DEFAULT_ASPECT_RATIO;
  const label = '未通过审核的风格';
  const hint = '这张图未通过安全审核，不能用于生图';
  const copySchema = [
    '占位。每一项对象字段：',
    '- line：一句中文（非空）',
    '返回形状：{"frames":[{"line":"..."}]}',
  ].join('\n');
  const copySample = '不可用。\n\n```json\n{"frames":[{"line":"不可用"}]}\n```';

  /** @type {string[]} */
  const written = [];
  try {
    fs.mkdirSync(pack, { recursive: true });
    /** @type {Record<string, unknown>} */
    const meta = {
      id,
      kind: 'card',
      slug: 'safety-flagged',
      hint,
      label,
      copySchema,
      legacyIds: [],
      enabled: true,
      promptSheetVersion: PROMPT_SHEET_VERSION,
      aspectRatio,
      safetyStatus: 'flagged',
    };
    if (image.learnedFrom && image.learnedFrom.kind === 'xhs-note') {
      /** @type {Record<string, string>} */
      const source = {
        kind: image.learnedFrom.kind,
        noteId: image.learnedFrom.noteId,
        linkId: image.learnedFrom.linkId,
      };
      if (image.learnedFrom.role) source.role = image.learnedFrom.role;
      meta.source = source;
    }
    fs.writeFileSync(jsonPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    written.push(jsonPath);
    fs.writeFileSync(mdPath, `${flaggedStubPromptMd()}\n`, 'utf8');
    written.push(mdPath);
    fs.writeFileSync(sampleMdPath, `${copySample}\n`, 'utf8');
    written.push(sampleMdPath);
    fs.writeFileSync(samplePath, image.sampleBytes);
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

  clearAlbumCatalogCache(factoryDir, albumsDir);
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
  return { id, label, safetyStatus: 'flagged' };
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

/**
 * 旧册缺 aspectRatio 时按样图补算并写回 album.json；样图丢失则兜底 3:4。
 * 出厂册只读内存，不写 assets。
 * @param {string} promptsDir
 * @param {string | undefined} userAlbumsDir
 * @param {string} albumId
 * @returns {string}
 */
function ensureAlbumAspectRatio(promptsDir, userAlbumsDir, albumId) {
  if (!isAlbum(albumId, promptsDir, userAlbumsDir)) {
    return DEFAULT_ASPECT_RATIO;
  }
  const catalog = loadAlbumCatalog(promptsDir, userAlbumsDir);
  const meta = catalog.get(albumId);
  const existing = normalizeAspectRatio(meta.aspectRatio);
  if (existing) return existing;

  const sampleAbs = albumSampleFile(promptsDir, albumId, userAlbumsDir);
  const ratio = fs.existsSync(sampleAbs)
    ? aspectRatioFromImage(sampleAbs)
    : DEFAULT_ASPECT_RATIO;

  if (meta.source === 'user') {
    const jsonPath = albumMetaPath(albumPackDir(meta));
    try {
      /** @type {Record<string, unknown>} */
      const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      raw.aspectRatio = ratio;
      fs.writeFileSync(jsonPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
      clearAlbumCatalogCache(promptsDir, userAlbumsDir);
    } catch {
      // 补算失败仍返回内存值，不阻断浏览
    }
  } else {
    // 出厂册：缓存里补上，避免反复读像素；不改仓库文件。
    meta.aspectRatio = ratio;
  }
  return ratio;
}

/**
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {void}
 */
function ensureAllAlbumAspectRatios(promptsDir, userAlbumsDir) {
  if (typeof promptsDir !== 'string' || !promptsDir) return;
  const ids = loadAlbumCatalog(promptsDir, userAlbumsDir).ids();
  for (const id of ids) {
    ensureAlbumAspectRatio(promptsDir, userAlbumsDir, id);
  }
}

module.exports = {
  commitAlbumDraft,
  commitFlaggedAlbumDraft,
  deleteAlbumFiles,
  ensureAlbumAspectRatio,
  ensureAllAlbumAspectRatios,
  migrateFlatAlbumsInRoot,
  migrateUserAlbumPacks,
  migrateUserAlbumsFromAssets,
  updateAlbumPromptMd,
};
