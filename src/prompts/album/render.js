// @ts-check
'use strict';

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
/** @type {typeof import('./frame')} */
const frameModule = require('./frame');
/** @type {typeof import('./refs')} */
const refsModule = require('./refs');
/** @type {typeof import('./sheet')} */
const sheetModule = require('./sheet');
/** @type {typeof import('../template')} */
const templateModule = require('../template');

const {
  albumLabel,
  isAlbum,
  loadAlbumCatalog,
  readAlbumPromptText,
} = catalogModule;
const { formatFlexibleBlock, formatModulesBlock, formatStepsBlock, frameDisplayLine } = frameModule;
const { TEXT_ONLY_LOCK } = refsModule;
const {
  PROMPT_SHEET_VERSION,
  SHEET_SLOTS,
  assertCurrentPromptSheetVersion,
  assertPromptSheet,
} = sheetModule;
const { fillPrompt } = templateModule;

/**
 * @param {string} template
 * @returns {string[]}
 */
function extractPlaceholders(template) {
  /** @type {string[]} */
  const names = [];
  const re = /\{\{([^{}]+)\}\}/g;
  let match = re.exec(template);
  while (match) {
    const name = String(match[1] || '').trim();
    if (name && !names.includes(name)) names.push(name);
    match = re.exec(template);
  }
  return names;
}

/**
 * 按占位符名把数组帧格式化成题词块（不按 album kind）。
 * @param {string} name
 * @param {Record<string, unknown>} bag
 * @returns {string}
 */
function formatNamedBlock(name, bag) {
  if (name === 'noteBlock') {
    const note = bag.note;
    return typeof note === 'string' && note ? `旁注：${note}\n` : '';
  }
  if (name === 'modulesBlock') {
    const modules = bag.modules;
    return formatModulesBlock(Array.isArray(modules) ? modules : []);
  }
  if (name === 'stepsBlock') {
    const stepsBar = typeof bag.stepsBar === 'string' ? bag.stepsBar : '';
    const steps = Array.isArray(bag.steps) ? bag.steps : [];
    return formatStepsBlock(stepsBar, /** @type {import('./frame').InfographicStep[]} */ (steps));
  }
  const base = name.slice(0, -5);
  const raw = bag[base];
  if (Array.isArray(raw)) return formatFlexibleBlock(raw);
  if (typeof raw === 'string') return raw;
  return '';
}

/**
 * 按题词占位符从策划帧装填；缺的填空串。出厂册与自学册同一条路。
 * @param {string} template
 * @param {Record<string, unknown>} bag
 * @param {string} display
 * @param {string} picture
 * @returns {import('../template').PromptVars}
 */
function fillGenericVars(template, bag, display, picture) {
  /** @type {import('../template').PromptVars} */
  const vars = { scene: picture };
  for (const name of extractPlaceholders(template)) {
    if (name === 'scene') continue;
    if (name.endsWith('Block')) {
      vars[name] = formatNamedBlock(name, bag);
      continue;
    }
    const value = bag[name];
    if (typeof value === 'string') {
      vars[name] = value;
      continue;
    }
    vars[name] = '';
  }
  if (Object.prototype.hasOwnProperty.call(vars, 'line') && !vars.line) {
    vars.line = (typeof bag.line === 'string' && bag.line) || display;
  }
  return vars;
}

/**
 * 只装填 v2（11 槽）题词；参考图说明与纯文字禁插画在发模型前由 composeImagePrompt 拼接。
 * @param {string} promptsDir
 * @param {unknown} album
 * @param {unknown} scene
 * @param {unknown} frame
 * @param {string} [userAlbumsDir]
 * @returns {{ prompt: string; style: string }}
 */
function renderAlbumPrompt(promptsDir, album, scene, frame, userAlbumsDir) {
  const picture = typeof scene === 'string' ? scene.trim() : '';
  if (!picture) throw new Error('这一张的画面是空的');
  if (!isAlbum(album, promptsDir, userAlbumsDir)) throw new Error('图册不在允许列表');
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
    throw new Error('这一张的文案是空的');
  }
  const albumId = String(album || '').trim();
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(albumId);
  assertCurrentPromptSheetVersion(meta.promptSheetVersion);
  const copy = /** @type {import('./frame').CopyFrame} */ (frame);
  const display = frameDisplayLine(album, copy, promptsDir, userAlbumsDir);
  if (!display) throw new Error('这一张的文案是空的');
  const template = readAlbumPromptText(promptsDir, album, userAlbumsDir);
  assertPromptSheet(template);

  const vars = fillGenericVars(
    template,
    /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (copy)),
    display,
    picture,
  );

  // 文案区口号由题词自定；不按出厂原句拦截，避免自学册措辞略异就卡死生图
  const prompt = fillPrompt(template, vars).trim();
  return {
    prompt,
    style: albumLabel(album, promptsDir, userAlbumsDir),
  };
}

module.exports = {
  PROMPT_SHEET_VERSION,
  SHEET_SLOTS,
  TEXT_ONLY_LOCK,
  extractPlaceholders,
  fillGenericVars,
  renderAlbumPrompt,
};
