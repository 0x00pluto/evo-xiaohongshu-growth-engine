// @ts-check
'use strict';

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
/** @type {typeof import('./frame')} */
const frameModule = require('./frame');
/** @type {typeof import('../template')} */
const templateModule = require('../template');

const { albumKind, albumLabel, albumPromptName, isAlbum } = catalogModule;
const { formatModulesBlock, formatStepsBlock, frameDisplayLine } = frameModule;
const { fillPrompt, readPromptFile } = templateModule;

const SHEET_SLOTS = [
  '1. 背景',
  '2. 色彩',
  '3. 字体',
  '4. 字号',
  '5. 字重',
  '6. 文字排版',
  '7. 文字位置',
  '8. 构图布局',
  '9. 视觉风格',
  '10. 光影与质感',
  '11. 系列统一规则',
  '12. 主题绘画内容',
];

/**
 * @param {string} promptsDir
 * @param {unknown} album
 * @param {unknown} scene
 * @param {unknown} frame
 * @returns {{ prompt: string; style: string }}
 */
function renderAlbumPrompt(promptsDir, album, scene, frame) {
  const picture = typeof scene === 'string' ? scene.trim() : '';
  if (!picture) throw new Error('这一张的画面是空的');
  if (!isAlbum(album, promptsDir)) throw new Error('图册不在允许列表');
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
    throw new Error('这一张的文案是空的');
  }
  const copy = /** @type {import('./frame').CopyFrame} */ (frame);
  const display = frameDisplayLine(album, copy, promptsDir);
  if (!display) throw new Error('这一张的文案是空的');
  const kind = albumKind(album, promptsDir);

  /** @type {import('../template').PromptVars} */
  const vars = { scene: picture };
  if (kind === 'magazine') {
    vars.line = copy.line || '';
  } else if (kind === 'scrapbook') {
    vars.line = copy.line || '';
    vars.noteBlock = copy.note ? `旁注：${copy.note}\n` : '';
  } else if (kind === 'conceptual') {
    vars.theme = copy.theme || '';
    vars.mainTitle = copy.mainTitle || '';
    vars.subTitle = copy.subTitle || '';
  } else if (kind === 'card') {
    vars.mainTitle = copy.mainTitle || '';
    vars.point = copy.point || '';
  } else if (kind === 'infographic') {
    vars.seriesLabel = copy.seriesLabel || '';
    vars.theme = copy.theme || '';
    vars.mainTitle = copy.mainTitle || '';
    vars.subTitle = copy.subTitle || '';
    vars.modulesBlock = formatModulesBlock(copy.modules || []);
    vars.stepsBlock = formatStepsBlock(copy.stepsBar || '', copy.steps || []);
    vars.summary = copy.summary || '';
    vars.credit = copy.credit || '';
  }

  const prompt = fillPrompt(readPromptFile(promptsDir, albumPromptName(album, promptsDir)), vars).trim();
  if (SHEET_SLOTS.some((slot) => !prompt.includes(slot)) || !prompt.includes(picture) || !prompt.includes(display)) {
    throw new Error('绘图提示词缺了一槽');
  }
  if (kind === 'magazine' || kind === 'scrapbook') {
    if (!prompt.includes('图片必须准确呈现的中文文案')) {
      throw new Error('绘图提示词缺了文案区');
    }
  } else if (kind === 'conceptual') {
    if (!prompt.includes('本次主题内容') || !prompt.includes('主标题') || !prompt.includes('副标题')) {
      throw new Error('绘图提示词缺了文案区');
    }
  } else if (kind === 'card') {
    if (!prompt.includes('主标题') || !prompt.includes('底部要点')) {
      throw new Error('绘图提示词缺了文案区');
    }
  } else if (kind === 'infographic') {
    if (
      !prompt.includes('栏目标签')
      || !prompt.includes('核心信息模块')
      || !prompt.includes('步骤流程')
      || !prompt.includes('总结金句')
    ) {
      throw new Error('绘图提示词缺了文案区');
    }
  }
  const seriesAt = prompt.indexOf('11. 系列统一规则');
  const sceneAt = prompt.indexOf('12. 主题绘画内容');
  if (seriesAt < 0 || sceneAt < 0 || seriesAt > sceneAt) {
    throw new Error('绘图提示词槽序不对');
  }
  return {
    prompt,
    style: albumLabel(album, promptsDir),
  };
}

module.exports = {
  SHEET_SLOTS,
  renderAlbumPrompt,
};
