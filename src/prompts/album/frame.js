// @ts-check
'use strict';

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
const { albumKind, isAlbum, loadAlbumCatalog } = catalogModule;

/**
 * @typedef {{ title: string; body: string; note: string; icon: string }} InfographicModule
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
 * @returns {{ modules: { min: number; max: number }; steps: { min: number; max: number } }}
 */
function infographicConstraints(promptsDir, album) {
  const meta = loadAlbumCatalog(promptsDir).get(album);
  const modules = meta.constraints.modules || { min: 2, max: 6 };
  const steps = meta.constraints.steps || { min: 3, max: 7 };
  return { modules, steps };
}

/**
 * @param {unknown} list
 * @param {string} promptsDir
 * @param {string} album
 * @returns {InfographicModule[]}
 */
function normalizeInfographicModules(list, promptsDir, album) {
  if (!Array.isArray(list)) throw new Error('策划字段不完整');
  const range = infographicConstraints(promptsDir, album).modules;
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
 * @returns {InfographicStep[]}
 */
function normalizeInfographicSteps(list, promptsDir, album) {
  if (!Array.isArray(list)) throw new Error('策划字段不完整');
  const range = infographicConstraints(promptsDir, album).steps;
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
    lines.push(`第${index + 1}张卡片：`);
    lines.push(`标题：${item.title}`);
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
 * @returns {string}
 */
function frameDisplayLine(album, frame, promptsDir) {
  if (!isAlbum(album, promptsDir) || !frame || typeof frame !== 'object') return '';
  const kind = albumKind(album, promptsDir);
  if (kind === 'magazine' || kind === 'scrapbook') {
    return typeof frame.line === 'string' ? frame.line.trim() : '';
  }
  if (typeof frame.mainTitle !== 'string') return '';
  // 信息图主标题可含换行；摘要与去重用首行，避免把整段多行当一行
  const title = frame.mainTitle.replace(/\\n/g, '\n').trim();
  const first = title.split(/\n/)[0] || '';
  return first.trim() || title;
}

/**
 * @param {CopyFrame[]} frames
 * @param {unknown} album
 * @param {string} promptsDir
 * @returns {string}
 */
function formatPlannedLines(frames, album, promptsDir) {
  if (!Array.isArray(frames)) return '';
  return frames.map((frame) => frameDisplayLine(album, frame, promptsDir)).join('\n');
}

/**
 * @param {unknown} raw
 * @param {string} album
 * @param {string} promptsDir
 * @returns {CopyFrame}
 */
function normalizeFrame(raw, album, promptsDir) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('策划那一项不是对象');
  }
  const kind = albumKind(album, promptsDir);
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
    frame.modules = normalizeInfographicModules(source.modules, promptsDir, album);
    frame.steps = normalizeInfographicSteps(source.steps, promptsDir, album);
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
  throw new Error('图册 kind 不在允许列表');
}

module.exports = {
  formatModulesBlock,
  formatPlannedLines,
  formatStepsBlock,
  frameDisplayLine,
  normalizeFrame,
};
