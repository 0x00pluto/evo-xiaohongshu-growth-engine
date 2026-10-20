// @ts-check
'use strict';

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
const { albumKind, isAlbum, loadAlbumCatalog } = catalogModule;

/**
 * @typedef {{ title: string; body: string; note: string; icon: string; head?: string }} InfographicModule
 * @typedef {{ name: string; body: string; icon: string }} InfographicStep
 * @typedef {{
 *   line?: string;
 *   note?: string;
 *   theme?: string;
 *   mainTitle?: string;
 *   subTitle?: string;
 *   point?: string;
 *   seriesLabel?: string;
 *   summary?: string;
 *   credit?: string;
 *   stepsBar?: string;
 *   modules?: InfographicModule[];
 *   steps?: InfographicStep[];
 * }} CopyFrame
 */

/**
 * @param {string} promptsDir
 * @param {string} album
 * @param {string} [userAlbumsDir]
 * @returns {{ modules: { min: number; max: number }; steps: { min: number; max: number } }}
 */
function infographicConstraints(promptsDir, album, userAlbumsDir) {
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(album);
  const modules = meta.constraints.modules || { min: 2, max: 6 };
  const steps = meta.constraints.steps || { min: 3, max: 7 };
  return { modules, steps };
}

/**
 * @param {unknown} list
 * @param {string} promptsDir
 * @param {string} album
 * @param {string} [userAlbumsDir]
 * @returns {InfographicModule[]}
 */
function normalizeInfographicModules(list, promptsDir, album, userAlbumsDir) {
  if (!Array.isArray(list)) throw new Error('策划字段不完整');
  const range = infographicConstraints(promptsDir, album, userAlbumsDir).modules;
  if (list.length < range.min || list.length > range.max) {
    throw new Error(`知识模块应为 ${range.min} 到 ${range.max} 条`);
  }
  return list.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('策划字段不完整');
    }
    const source = /** @type {Record<string, unknown>} */ (item);
    const title = typeof source.title === 'string' ? source.title.trim() : '';
    const body = typeof source.body === 'string' ? source.body.trim() : '';
    const note = typeof source.note === 'string' ? source.note.trim() : '';
    const icon = typeof source.icon === 'string' ? source.icon.trim() : '';
    if (!title || !body || !icon) throw new Error('策划字段不完整');
    return { title, body, note, icon };
  });
}

/**
 * @param {unknown} list
 * @param {string} promptsDir
 * @param {string} album
 * @param {string} [userAlbumsDir]
 * @returns {InfographicStep[]}
 */
function normalizeInfographicSteps(list, promptsDir, album, userAlbumsDir) {
  if (!Array.isArray(list)) throw new Error('策划字段不完整');
  const range = infographicConstraints(promptsDir, album, userAlbumsDir).steps;
  if (list.length < range.min || list.length > range.max) {
    throw new Error(`步骤应为 ${range.min} 到 ${range.max} 条`);
  }
  return list.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('策划字段不完整');
    }
    const source = /** @type {Record<string, unknown>} */ (item);
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    const body = typeof source.body === 'string' ? source.body.trim() : '';
    const icon = typeof source.icon === 'string' ? source.icon.trim() : '';
    if (!name || !body || !icon) throw new Error('策划字段不完整');
    return { name, body, icon };
  });
}

/**
 * @param {InfographicModule[]} modules
 * @returns {string}
 */
function formatModulesBlock(modules) {
  const lines = ['核心信息模块：'];
  modules.forEach((item, index) => {
    const title = (item.title || item.head || '').trim();
    lines.push(`第${index + 1}张卡片：`);
    lines.push(`标题：${title}`);
    lines.push(`说明：${item.body}`);
    if (item.note) lines.push(`补充说明：${item.note}`);
    lines.push(`图标：${item.icon}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

/**
 * @param {string} stepsBar
 * @param {InfographicStep[]} steps
 * @returns {string}
 */
function formatStepsBlock(stepsBar, steps) {
  const lines = [
    '步骤流程：',
    `流程标题条：${stepsBar}`,
    '',
  ];
  steps.forEach((item, index) => {
    lines.push(`步骤 ${index + 1}：${item.name}`);
    lines.push(`说明：${item.body}`);
    lines.push(`图标：${item.icon}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

/**
 * @param {unknown} album
 * @param {CopyFrame} frame
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function frameDisplayLine(album, frame, promptsDir, userAlbumsDir) {
  if (!isAlbum(album, promptsDir, userAlbumsDir) || !frame || typeof frame !== 'object') return '';
  const kind = albumKind(album, promptsDir, userAlbumsDir);
  if (kind === 'magazine' || kind === 'scrapbook') {
    return typeof frame.line === 'string' ? frame.line.trim() : '';
  }
  if (kind === 'conceptual' || kind === 'card' || kind === 'infographic') {
    if (typeof frame.mainTitle !== 'string') return '';
    // 信息图主标题可含换行；摘要与去重用首行，避免把整段多行当一行
    const title = frame.mainTitle.replace(/\\n/g, '\n').trim();
    const first = title.split(/\n/)[0] || '';
    return first.trim() || title;
  }
  // 新 kind：用 line 作上图展示句
  return typeof frame.line === 'string' ? frame.line.trim() : '';
}

/**
 * @param {CopyFrame[]} frames
 * @param {unknown} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {string}
 */
function formatPlannedLines(frames, album, promptsDir, userAlbumsDir) {
  if (!Array.isArray(frames)) return '';
  return frames.map((frame) => frameDisplayLine(album, frame, promptsDir, userAlbumsDir)).join('\n');
}

/**
 * @param {unknown} raw
 * @param {string} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir]
 * @returns {CopyFrame}
 */
function normalizeFrame(raw, album, promptsDir, userAlbumsDir) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('策划那一项不是对象');
  }
  const kind = albumKind(album, promptsDir, userAlbumsDir);
  const source = /** @type {Record<string, unknown>} */ (raw);
  /** @type {CopyFrame} */
  const frame = {};
  if (kind === 'magazine') {
    frame.line = typeof source.line === 'string' ? source.line.trim() : '';
    if (!frame.line) throw new Error('策划那一句是空的');
    return frame;
  }
  if (kind === 'scrapbook') {
    frame.line = typeof source.line === 'string' ? source.line.trim() : '';
    frame.note = typeof source.note === 'string' ? source.note.trim() : '';
    if (!frame.line) throw new Error('策划那一句是空的');
    return frame;
  }
  if (kind === 'conceptual') {
    frame.theme = typeof source.theme === 'string' ? source.theme.trim() : '';
    frame.mainTitle = typeof source.mainTitle === 'string' ? source.mainTitle.trim() : '';
    frame.subTitle = typeof source.subTitle === 'string' ? source.subTitle.trim() : '';
    if (!frame.theme || !frame.mainTitle || !frame.subTitle) throw new Error('策划字段不完整');
    return frame;
  }
  if (kind === 'card') {
    frame.mainTitle = typeof source.mainTitle === 'string' ? source.mainTitle.trim() : '';
    frame.point = typeof source.point === 'string' ? source.point.trim() : '';
    if (!frame.mainTitle || !frame.point) throw new Error('策划字段不完整');
    return frame;
  }
  if (kind === 'infographic') {
    frame.seriesLabel = typeof source.seriesLabel === 'string' ? source.seriesLabel.trim() : '';
    frame.theme = typeof source.theme === 'string' ? source.theme.trim() : '';
    frame.mainTitle = typeof source.mainTitle === 'string'
      ? source.mainTitle.replace(/\\n/g, '\n').trim()
      : '';
    frame.subTitle = typeof source.subTitle === 'string' ? source.subTitle.trim() : '';
    frame.stepsBar = typeof source.stepsBar === 'string' ? source.stepsBar.trim() : '';
    frame.summary = typeof source.summary === 'string' ? source.summary.trim() : '';
    frame.credit = typeof source.credit === 'string' ? source.credit.trim() : '';
    frame.modules = normalizeInfographicModules(source.modules, promptsDir, album, userAlbumsDir);
    frame.steps = normalizeInfographicSteps(source.steps, promptsDir, album, userAlbumsDir);
    if (
      !frame.seriesLabel
      || !frame.theme
      || !frame.mainTitle
      || !frame.subTitle
      || !frame.stepsBar
      || !frame.summary
      || !frame.credit
    ) {
      throw new Error('策划字段不完整');
    }
    return frame;
  }
  // 新 kind：按 copySchema 声明的扁平字段校验；必须有非空 line
  return normalizeGenericFrame(source, /** @type {string} */ (album), promptsDir, userAlbumsDir);
}

/**
 * 从 copySchema 正文里抽出 `- field：` / `- field:` 行声明的字段名。
 * @param {string} schema
 * @returns {string[]}
 */
function schemaFieldNames(schema) {
  /** @type {string[]} */
  const names = [];
  const re = /(?:^|\n)\s*-\s*([a-zA-Z][a-zA-Z0-9_]*)\s*[：:]/g;
  let match = re.exec(schema);
  while (match) {
    const name = match[1];
    if (!names.includes(name)) names.push(name);
    match = re.exec(schema);
  }
  return names;
}

/**
 * 新 kind 数组字段：每项只留字符串叶子，条数默认 1～8（册上 constraints 优先）。
 * @param {unknown} list
 * @param {string} promptsDir
 * @param {string} album
 * @param {string} fieldName
 * @param {string} [userAlbumsDir='']
 * @returns {Record<string, string>[]}
 */
function normalizeFlexibleArray(list, promptsDir, album, fieldName, userAlbumsDir = '') {
  if (!Array.isArray(list)) throw new Error('策划字段不完整');
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(album);
  const bag = /** @type {Record<string, { min: number; max: number } | undefined>} */ (
    meta.constraints || {}
  );
  const range = bag[fieldName] || { min: 1, max: 8 };
  if (list.length < range.min || list.length > range.max) {
    throw new Error(`${fieldName} 应为 ${range.min} 到 ${range.max} 条`);
  }
  return list.map((item) => {
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) throw new Error('策划字段不完整');
      return { value: text };
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('策划字段不完整');
    }
    /** @type {Record<string, string>} */
    const out = {};
    for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (item))) {
      if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    }
    if (Object.keys(out).length === 0) throw new Error('策划字段不完整');
    return out;
  });
}

/**
 * 新 kind 把对象数组打成多行文本，不假设字段名。
 * @param {unknown} items
 * @returns {string}
 */
function formatFlexibleBlock(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items.map((item, index) => {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
    const lines = [`第${index + 1}项：`];
    for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (item))) {
      if (typeof value === 'string' && value) lines.push(`${key}：${value}`);
    }
    return lines.join('\n');
  }).filter(Boolean).join('\n\n');
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} album
 * @param {string} promptsDir
 * @param {string} [userAlbumsDir='']
 * @returns {CopyFrame}
 */
function normalizeGenericFrame(source, album, promptsDir, userAlbumsDir = '') {
  const meta = loadAlbumCatalog(promptsDir, userAlbumsDir).get(album);
  const fields = schemaFieldNames(meta.copySchema);
  if (!fields.includes('line')) {
    throw new Error('新 kind 的 copySchema 须声明 line 字段');
  }
  /** @type {CopyFrame & Record<string, unknown>} */
  const frame = {};
  for (const name of fields) {
    const value = source[name];
    if (Array.isArray(value)) {
      frame[name] = normalizeFlexibleArray(value, promptsDir, album, name, userAlbumsDir);
      continue;
    }
    frame[name] = typeof value === 'string' ? value.trim() : '';
  }
  if (typeof frame.line !== 'string' || !frame.line) throw new Error('策划那一句是空的');
  return /** @type {CopyFrame} */ (frame);
}

module.exports = {
  formatFlexibleBlock,
  formatModulesBlock,
  formatPlannedLines,
  formatStepsBlock,
  frameDisplayLine,
  normalizeFrame,
  schemaFieldNames,
};
