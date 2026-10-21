// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
/** @type {typeof import('../parse')} */
const parseModule = require('../parse');
/** @type {typeof import('../../upload-refs/rules')} */
const uploadRefRules = require('../../upload-refs/rules');
/** @type {typeof import('../../upload-refs/files')} */
const uploadRefFiles = require('../../upload-refs/files');

const IMAGE_REFS_REL = 'image-refs.md';
const TEXT_ONLY_LOCK = '纯文字图：只画背景、文案和题词已写明的固定装饰，禁止人物、物体、场景和概念插画。';
/** 有上传参考时追加，避免模型只跟版式模板忽略后面的图 */
const UPLOAD_REFS_MUST_USE = '必须使用【参考图】中版式模板之后列出的上传参考图，不得因版式模板忽略它们。';

/** @type {ReadonlyArray<string>} */
const CN_ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * @typedef {{ role: string; path: string; usage?: string }} ImageReference
 * @typedef {{ id: string; fileName: string; usage: string; libraryId?: string }} UploadRefItem
 * @typedef {{ materialIds: string[]; overrides: Record<string, string> }} SlotPick
 */

/**
 * 本轮只挂图册样图为 template；日后可追加 logo 或用户包里的角色。
 * @param {unknown} look
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {ImageReference[]}
 */
function imageReferencesFor(look, promptsDir, userAlbumsDir) {
  if (!catalogModule.isAlbum(look, promptsDir, userAlbumsDir)) return [];
  const abs = catalogModule.albumSampleFile(promptsDir, look, userAlbumsDir);
  if (!fs.existsSync(abs)) return [];
  return [{ role: 'template', path: abs }];
}

/**
 * @param {number} index 0-based
 * @returns {string}
 */
function ordinalLabel(index) {
  const word = CN_ORDINALS[index];
  if (word) return `第${word}张`;
  return `第${index + 1}张`;
}

/**
 * @param {string} text
 * @returns {Map<string, string>}
 */
function parseRoleSections(text) {
  /** @type {Map<string, string>} */
  const sections = new Map();
  const lines = String(text || '').split(/\r?\n/);
  /** @type {string | null} */
  let current = null;
  /** @type {string[]} */
  let buf = [];
  const flush = () => {
    if (!current) return;
    const body = buf.join('\n').trim();
    if (body) sections.set(current, body);
    current = null;
    buf = [];
  };
  for (const line of lines) {
    const match = line.match(/^##\s+([a-z][a-z0-9-]*)\s*$/i);
    if (match) {
      flush();
      current = match[1].toLowerCase();
      continue;
    }
    if (current) buf.push(line);
  }
  flush();
  return sections;
}

/**
 * @param {Map<string, string>} target
 * @param {Map<string, string>} source
 */
function mergeRoleSections(target, source) {
  for (const [role, body] of source) {
    target.set(role, body);
  }
}

/**
 * 出厂 image-refs.md + runtime/image-refs/*.md；同名 role 用户包覆盖出厂。
 * @param {string} promptsDir
 * @param {string} [userImageRefsDir]
 * @returns {Map<string, string>}
 */
function loadRoleSections(promptsDir, userImageRefsDir) {
  const file = path.join(promptsDir, IMAGE_REFS_REL);
  if (!fs.existsSync(file)) {
    throw new Error(`找不到 ${IMAGE_REFS_REL}`);
  }
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) throw new Error(`${IMAGE_REFS_REL} 是空的`);
  /** @type {Map<string, string>} */
  const sections = parseRoleSections(text);

  const userRoot = typeof userImageRefsDir === 'string' && userImageRefsDir.trim()
    ? path.resolve(userImageRefsDir.trim())
    : '';
  if (!userRoot || !fs.existsSync(userRoot)) return sections;

  const names = fs.readdirSync(userRoot)
    .filter((name) => name.endsWith('.md'))
    .sort();
  for (const name of names) {
    const packPath = path.join(userRoot, name);
    if (!fs.statSync(packPath).isFile()) continue;
    const packText = fs.readFileSync(packPath, 'utf8').trim();
    if (!packText) continue;
    mergeRoleSections(sections, parseRoleSections(packText));
  }
  return sections;
}

/**
 * @param {unknown} raw
 * @returns {ImageReference[]}
 */
function normalizeImageReferences(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  /** @type {ImageReference[]} */
  const list = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const bag = /** @type {Record<string, unknown>} */ (item);
    const role = typeof bag.role === 'string' ? bag.role.trim().toLowerCase() : '';
    const filePath = typeof bag.path === 'string' ? bag.path.trim() : '';
    if (!role || !filePath) continue;
    const usage = typeof bag.usage === 'string' ? bag.usage.trim() : '';
    /** @type {ImageReference} */
    const ref = { role, path: filePath };
    if (usage) ref.usage = usage;
    list.push(ref);
  }
  return list;
}

/**
 * 按 references 顺序拼「第 N 张是…」；与 input_images 同序。没有参考图则返回空串。
 * 上传参考角色用 usage 句子，不查 image-refs 角色表。
 * @param {string} promptsDir
 * @param {unknown} references
 * @param {string} [userImageRefsDir]
 * @returns {string}
 */
function formatImageRefsBlock(promptsDir, references, userImageRefsDir) {
  const list = normalizeImageReferences(references);
  if (list.length === 0) return '';
  const sections = loadRoleSections(promptsDir, userImageRefsDir);
  /** @type {string[]} */
  const lines = ['【参考图】'];
  let hasUploadRef = false;
  list.forEach((ref, index) => {
    if (ref.role === 'upload-ref' || ref.role === 'material') {
      hasUploadRef = true;
      const usage = typeof ref.usage === 'string' ? ref.usage.trim() : '';
      if (!usage) throw new Error('上传参考缺少用法句');
      lines.push(`${ordinalLabel(index)}是${usage}`);
      return;
    }
    const body = sections.get(ref.role);
    if (!body) {
      throw new Error(`参考图角色 ${ref.role} 没有说明`);
    }
    lines.push(`${ordinalLabel(index)}是${body}`);
  });
  if (hasUploadRef) lines.push(UPLOAD_REFS_MUST_USE);
  return lines.join('\n');
}

/**
 * @param {string} postDir
 * @param {UploadRefItem[]} uploadRefs
 * @param {SlotPick} pick
 * @returns {ImageReference[]}
 */
function uploadRefReferencesFor(postDir, uploadRefs, pick) {
  if (!postDir || typeof postDir !== 'string') return [];
  const selected = uploadRefRules.selectedUploadRefs(uploadRefs, pick);
  /** @type {ImageReference[]} */
  const list = [];
  for (const item of selected) {
    let abs = uploadRefFiles.postUploadRefPath(postDir, item.fileName);
    if (!fs.existsSync(abs)) {
      abs = path.join(postDir, 'materials', item.fileName);
    }
    if (!fs.existsSync(abs)) {
      throw new Error(`上传参考文件找不到：${item.fileName}`);
    }
    const usage = uploadRefRules.effectiveUsage(item.id, pick, item);
    if (!usage) {
      throw new Error('上传参考缺少用法句');
    }
    list.push({ role: 'upload-ref', path: abs, usage });
  }
  return list;
}

/**
 * 发模型前拼装：题词正文 +（有样图则参考图段）+（纯文字则禁插画）。
 * 上传参考只拼「第 N 张是」+ 用法句，不自动拼主体空位规则。
 * @param {unknown} basePrompt
 * @param {{
 *   promptsDir: string;
 *   look: unknown;
 *   userAlbumsDir?: string;
 *   userImageRefsDir?: string;
 *   postDir?: string;
 *   uploadRefs?: UploadRefItem[];
 *   materials?: UploadRefItem[];
 *   pick?: SlotPick;
 * }} options
 * @returns {{ prompt: string; references: ImageReference[] }}
 */
function composeImagePrompt(basePrompt, options) {
  const promptsDir = options && options.promptsDir;
  if (typeof promptsDir !== 'string' || !promptsDir) {
    throw new Error('缺少提示词目录');
  }
  const look = options.look;
  const userAlbumsDir = options.userAlbumsDir;
  const userImageRefsDir = options.userImageRefsDir;
  const base = typeof basePrompt === 'string' ? basePrompt.trim() : '';
  if (!base) throw new Error('提示词是空的');
  const uploadRefs = Array.isArray(options.uploadRefs)
    ? options.uploadRefs
    : (Array.isArray(options.materials) ? options.materials : []);
  const pick = options.pick && typeof options.pick === 'object'
    ? options.pick
    : uploadRefRules.emptySlotPick();
  const textOnly = parseModule.isTextOnlyAlbum(look, promptsDir, userAlbumsDir);
  const blocked = uploadRefRules.textOnlyPickBlockReason(textOnly, uploadRefs, pick);
  if (blocked) throw new Error(blocked);

  const references = imageReferencesFor(look, promptsDir, userAlbumsDir);
  const uploadList = uploadRefReferencesFor(
    typeof options.postDir === 'string' ? options.postDir : '',
    uploadRefs,
    pick,
  );
  for (const ref of uploadList) references.push(ref);

  /** @type {string[]} */
  const parts = [base];
  const refsBlock = formatImageRefsBlock(promptsDir, references, userImageRefsDir);
  if (refsBlock) parts.push(refsBlock);
  if (textOnly) {
    parts.push(TEXT_ONLY_LOCK);
  }
  return {
    prompt: parts.join('\n\n'),
    references,
  };
}

module.exports = {
  IMAGE_REFS_REL,
  TEXT_ONLY_LOCK,
  UPLOAD_REFS_MUST_USE,
  composeImagePrompt,
  formatImageRefsBlock,
  imageReferencesFor,
  loadRoleSections,
  mergeRoleSections,
  normalizeImageReferences,
  ordinalLabel,
  parseRoleSections,
  uploadRefReferencesFor,
};
