// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('./rules')} */
const rulesModule = require('./rules');

const { newUploadRefId, validateUsage } = rulesModule;

/**
 * @typedef {{ bytes: Buffer; ext: string; mime: string; dataUrl: string }} NormalizedImage
 * @typedef {{ id: string; fileName: string; usage: string; libraryId?: string }} UploadRefItem
 * @typedef {{ id: string; usage: string; fileName: string; createdAt: number }} LibraryUploadRefMeta
 */

/**
 * @param {string} ext
 * @returns {string}
 */
function normalizeExt(ext) {
  const lower = String(ext || '').toLowerCase();
  if (lower === '.jpeg') return '.jpg';
  if (lower === '.jpg' || lower === '.png' || lower === '.webp') return lower;
  return '.jpg';
}

/**
 * 篇内：materials/upload-refs/
 * @param {string} postDir
 * @returns {string}
 */
function postUploadRefsDir(postDir) {
  return path.join(postDir, 'materials', 'upload-refs');
}

/**
 * @param {string} postDir
 * @param {string} fileName
 * @returns {string}
 */
function postUploadRefPath(postDir, fileName) {
  return path.join(postUploadRefsDir(postDir), fileName);
}

/**
 * 把旧篇内 materials/<file> 迁到 materials/upload-refs/。
 * @param {string} postDir
 */
function migratePostUploadRefsLayout(postDir) {
  if (!postDir) return;
  const legacyDir = path.join(postDir, 'materials');
  const nextDir = postUploadRefsDir(postDir);
  if (!fs.existsSync(legacyDir)) return;
  const names = fs.readdirSync(legacyDir);
  for (const name of names) {
    if (name === 'upload-refs') continue;
    const abs = path.join(legacyDir, name);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (!/^m-[a-z0-9]+\.(jpg|jpeg|png|webp)$/i.test(name)) continue;
    fs.mkdirSync(nextDir, { recursive: true });
    const dest = path.join(nextDir, name);
    if (fs.existsSync(dest)) {
      fs.rmSync(abs, { force: true });
      continue;
    }
    try {
      fs.renameSync(abs, dest);
    } catch {
      fs.copyFileSync(abs, dest);
      fs.rmSync(abs, { force: true });
    }
  }
}

/**
 * 库根应为 runtime/materials/upload-refs；若扁平安在 materials 根下则迁入。
 * @param {string} libraryDir
 */
function migrateLibraryUploadRefsLayout(libraryDir) {
  if (!libraryDir) return;
  const leaf = path.resolve(libraryDir);
  const parent = path.dirname(leaf);
  if (path.basename(leaf) !== 'upload-refs') return;
  if (!fs.existsSync(parent)) return;
  fs.mkdirSync(leaf, { recursive: true });
  for (const name of fs.readdirSync(parent)) {
    if (name === 'upload-refs') continue;
    const abs = path.join(parent, name);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const metaPath = path.join(abs, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    const dest = path.join(leaf, name);
    if (fs.existsSync(dest)) {
      fs.rmSync(abs, { recursive: true, force: true });
      continue;
    }
    try {
      fs.renameSync(abs, dest);
    } catch {
      fs.cpSync(abs, dest, { recursive: true });
      fs.rmSync(abs, { recursive: true, force: true });
    }
  }
}

/**
 * @param {string} libraryDir
 * @param {string} id
 * @returns {string}
 */
function libraryEntryDir(libraryDir, id) {
  return path.join(libraryDir, id);
}

/**
 * @param {string} libraryDir
 * @param {string} id
 * @returns {string}
 */
function libraryMetaPath(libraryDir, id) {
  return path.join(libraryEntryDir(libraryDir, id), 'meta.json');
}

/**
 * @param {string} libraryDir
 * @param {string} id
 * @param {string} fileName
 * @returns {string}
 */
function libraryImagePath(libraryDir, id, fileName) {
  return path.join(libraryEntryDir(libraryDir, id), fileName);
}

/**
 * @param {string} postDir
 * @param {NormalizedImage} image
 * @param {string} usage
 * @returns {UploadRefItem}
 */
function writePostUploadRef(postDir, image, usage) {
  const checked = validateUsage(usage);
  if (!checked.ok) throw new Error(checked.message);
  const id = newUploadRefId();
  const ext = normalizeExt(image.ext);
  const fileName = `m-${id}${ext}`;
  const dir = postUploadRefsDir(postDir);
  fs.mkdirSync(dir, { recursive: true });
  const abs = postUploadRefPath(postDir, fileName);
  fs.writeFileSync(abs, image.bytes);
  return { id, fileName, usage: checked.usage };
}

/**
 * @param {string} postDir
 * @param {string} fileName
 */
function deletePostUploadRefFile(postDir, fileName) {
  const abs = postUploadRefPath(postDir, fileName);
  if (fs.existsSync(abs)) fs.rmSync(abs, { force: true });
  // 兼容未迁完的旧路径
  const legacy = path.join(postDir, 'materials', fileName);
  if (fs.existsSync(legacy)) fs.rmSync(legacy, { force: true });
}

/**
 * @param {string} postDir
 * @param {string} fileName
 * @returns {{ mime: string; dataUrl: string } | null}
 */
function readPostUploadRefPreview(postDir, fileName) {
  let abs = postUploadRefPath(postDir, fileName);
  if (!fs.existsSync(abs)) {
    abs = path.join(postDir, 'materials', fileName);
  }
  if (!fs.existsSync(abs)) return null;
  const bytes = fs.readFileSync(abs);
  const ext = path.extname(fileName).toLowerCase();
  const mime = ext === '.png'
    ? 'image/png'
    : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
  return { mime, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
}

/**
 * @param {string} libraryDir
 * @returns {LibraryUploadRefMeta[]}
 */
function listLibraryUploadRefs(libraryDir) {
  if (!libraryDir || !fs.existsSync(libraryDir)) return [];
  /** @type {LibraryUploadRefMeta[]} */
  const list = [];
  const names = fs.readdirSync(libraryDir).sort();
  for (const name of names) {
    const metaPath = libraryMetaPath(libraryDir, name);
    if (!fs.existsSync(metaPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const bag = /** @type {Record<string, unknown>} */ (raw);
      const id = typeof bag.id === 'string' ? bag.id.trim() : '';
      const usage = typeof bag.usage === 'string' ? bag.usage.trim() : '';
      const fileName = typeof bag.fileName === 'string' ? bag.fileName.trim() : '';
      const createdAt = Number(bag.createdAt);
      if (!id || !usage || !fileName) continue;
      const imageAbs = libraryImagePath(libraryDir, id, fileName);
      if (!fs.existsSync(imageAbs)) continue;
      list.push({
        id,
        usage,
        fileName,
        createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      });
    } catch {
      // 坏条目跳过
    }
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  return list;
}

/**
 * 直接把归一化图写入账号级上传参考库（不依赖某篇笔记）。
 * @param {string} libraryDir
 * @param {NormalizedImage} image
 * @param {string} usage
 * @returns {LibraryUploadRefMeta}
 */
function writeLibraryUploadRef(libraryDir, image, usage) {
  if (!libraryDir) throw new Error('缺少上传参考库目录');
  const checked = validateUsage(usage);
  if (!checked.ok) throw new Error(checked.message);
  if (!image || !Buffer.isBuffer(image.bytes) || !image.bytes.length) {
    throw new Error('上传参考图不合格');
  }
  const id = newUploadRefId();
  const ext = normalizeExt(image.ext);
  const fileName = `image${ext}`;
  const dir = libraryEntryDir(libraryDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(libraryImagePath(libraryDir, id, fileName), image.bytes);
  /** @type {LibraryUploadRefMeta} */
  const meta = {
    id,
    usage: checked.usage,
    fileName,
    createdAt: Date.now(),
  };
  fs.writeFileSync(libraryMetaPath(libraryDir, id), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

/**
 * @param {string} libraryDir
 * @param {string} postDir
 * @param {UploadRefItem} ref
 * @returns {LibraryUploadRefMeta}
 */
function saveUploadRefToLibrary(libraryDir, postDir, ref) {
  const checked = validateUsage(ref.usage);
  if (!checked.ok) throw new Error(checked.message);
  let src = postUploadRefPath(postDir, ref.fileName);
  if (!fs.existsSync(src)) src = path.join(postDir, 'materials', ref.fileName);
  if (!fs.existsSync(src)) throw new Error('找不到这篇里的上传参考文件');
  const bytes = fs.readFileSync(src);
  const ext = normalizeExt(path.extname(ref.fileName));
  return writeLibraryUploadRef(libraryDir, {
    bytes,
    ext,
    mime: ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg'),
    dataUrl: '',
  }, checked.usage);
}

/**
 * @param {string} libraryDir
 * @param {string} postDir
 * @param {string} libraryId
 * @returns {UploadRefItem}
 */
function pickLibraryUploadRefIntoPost(libraryDir, postDir, libraryId) {
  const id = String(libraryId || '').trim();
  const metaPath = libraryMetaPath(libraryDir, id);
  if (!fs.existsSync(metaPath)) throw new Error('库里没有这条上传参考');
  const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('库里没有这条上传参考');
  }
  const bag = /** @type {Record<string, unknown>} */ (raw);
  const usage = typeof bag.usage === 'string' ? bag.usage : '';
  const fileName = typeof bag.fileName === 'string' ? bag.fileName : '';
  const checked = validateUsage(usage);
  if (!checked.ok) throw new Error(checked.message);
  if (!fileName) throw new Error('库里没有这条上传参考');
  const src = libraryImagePath(libraryDir, id, fileName);
  if (!fs.existsSync(src)) throw new Error('库里没有这条上传参考');
  const bytes = fs.readFileSync(src);
  const ext = normalizeExt(path.extname(fileName));
  const postId = newUploadRefId();
  const postFile = `m-${postId}${ext}`;
  const dir = postUploadRefsDir(postDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(postUploadRefPath(postDir, postFile), bytes);
  return {
    id: postId,
    fileName: postFile,
    usage: checked.usage,
    libraryId: id,
  };
}

/**
 * @param {string} libraryDir
 * @param {string} id
 */
function deleteLibraryUploadRef(libraryDir, id) {
  const dir = libraryEntryDir(libraryDir, String(id || '').trim());
  if (!fs.existsSync(dir)) throw new Error('库里没有这条上传参考');
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * @param {string} libraryDir
 * @param {string} id
 * @returns {{ mime: string; dataUrl: string; usage: string } | null}
 */
function readLibraryUploadRefPreview(libraryDir, id) {
  const trimmed = String(id || '').trim();
  const metaPath = libraryMetaPath(libraryDir, trimmed);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const bag = /** @type {Record<string, unknown>} */ (raw);
    const fileName = typeof bag.fileName === 'string' ? bag.fileName : '';
    const usage = typeof bag.usage === 'string' ? bag.usage : '';
    if (!fileName) return null;
    const abs = libraryImagePath(libraryDir, trimmed, fileName);
    if (!fs.existsSync(abs)) return null;
    const bytes = fs.readFileSync(abs);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === '.png'
      ? 'image/png'
      : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
    return {
      mime,
      usage,
      dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} promptsDir
 * @returns {string}
 */
function readUploadRefUsageSystemPrompt(promptsDir) {
  const file = path.join(promptsDir, 'material-usage', 'system.md');
  if (!fs.existsSync(file)) {
    throw new Error('找不到上传参考用法识图提示词');
  }
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) throw new Error('上传参考用法识图提示词是空的');
  return text;
}

module.exports = {
  deleteLibraryUploadRef,
  deletePostUploadRefFile,
  libraryEntryDir,
  libraryImagePath,
  libraryMetaPath,
  listLibraryUploadRefs,
  migrateLibraryUploadRefsLayout,
  migratePostUploadRefsLayout,
  normalizeExt,
  pickLibraryUploadRefIntoPost,
  postUploadRefPath,
  postUploadRefsDir,
  readLibraryUploadRefPreview,
  readPostUploadRefPreview,
  readUploadRefUsageSystemPrompt,
  saveUploadRefToLibrary,
  writeLibraryUploadRef,
  writePostUploadRef,
};
