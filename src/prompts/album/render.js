// @ts-check
'use strict';

/** @type {typeof import('./catalog')} */
const catalogModule = require('./catalog');
/** @type {typeof import('./frame')} */
const frameModule = require('./frame');
/** @type {typeof import('./refs')} */
const refsModule = require('./refs');
/** @type {typeof import('../template')} */
const templateModule = require('../template');

const { ALBUM_KIND_SET, albumKind, albumLabel, isAlbum, readAlbumPromptText } = catalogModule;
const { formatFlexibleBlock, formatModulesBlock, formatStepsBlock, frameDisplayLine } = frameModule;
const { TEXT_ONLY_LOCK } = refsModule;
const { fillPrompt } = templateModule;

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
 * 新 kind：按题词占位符从策划帧自动装填；缺的填空串，不拦学习产物。
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
    const value = bag[name];
    if (typeof value === 'string') {
      vars[name] = value;
      continue;
    }
    if (name.endsWith('Block')) {
      const base = name.slice(0, -5);
      const raw = bag[base];
      if (Array.isArray(raw)) {
        vars[name] = formatFlexibleBlock(raw);
      } else if (typeof raw === 'string') {
        vars[name] = raw
          ? (base === 'note' ? `旁注：${raw}\n` : raw)
          : '';
      } else {
        vars[name] = '';
      }
      continue;
    }
    vars[name] = '';
  }
  if (!vars.line) vars.line = (typeof bag.line === 'string' && bag.line) || display;
  return vars;
}

/**
 * 只装填 12 槽题词；参考图说明与纯文字禁插画在发模型前由 composeImagePrompt 拼接。
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
  const copy = /** @type {import('./frame').CopyFrame} */ (frame);
  const display = frameDisplayLine(album, copy, promptsDir, userAlbumsDir);
  if (!display) throw new Error('这一张的文案是空的');
  const kind = albumKind(album, promptsDir, userAlbumsDir);
  const template = readAlbumPromptText(promptsDir, album, userAlbumsDir);

  /** @type {import('../template').PromptVars} */
  let vars = { scene: picture };
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
  } else {
    vars = fillGenericVars(
      template,
      /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (copy)),
      display,
      picture,
    );
  }

  const prompt = fillPrompt(template, vars).trim();
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
  } else if (!ALBUM_KIND_SET.has(kind)) {
    // 通用槽：展示句已写入 prompt（上方统一检查）
  }
  const seriesAt = prompt.indexOf('11. 系列统一规则');
  const sceneAt = prompt.indexOf('12. 主题绘画内容');
  if (seriesAt < 0 || sceneAt < 0 || seriesAt > sceneAt) {
    throw new Error('绘图提示词槽序不对');
  }
  return {
    prompt,
    style: albumLabel(album, promptsDir, userAlbumsDir),
  };
}

module.exports = {
  SHEET_SLOTS,
  TEXT_ONLY_LOCK,
  extractPlaceholders,
  fillGenericVars,
  renderAlbumPrompt,
};
