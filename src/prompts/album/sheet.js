// @ts-check
'use strict';

/** 绘图题词槽位合同版本；v1=含系列统一规则+12.主题；v2=无系列统一、11.主题 */
const PROMPT_SHEET_VERSION = 2;

/** @type {ReadonlyArray<string>} */
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
  '11. 主题绘画内容',
];

const THEME_SLOT = '11. 主题绘画内容';
const LEGACY_SERIES_SLOT = '系列统一规则';

/**
 * @param {string} promptMd
 */
function assertPromptSheet(promptMd) {
  const text = String(promptMd || '');
  if (text.includes(LEGACY_SERIES_SLOT)) {
    throw new Error('绘图题词是旧结构（含系列统一规则），请按题词结构 v2 重写或重新学习');
  }
  for (const slot of SHEET_SLOTS) {
    if (!text.includes(slot)) {
      throw new Error(`绘图题词缺了 ${slot}`);
    }
  }
  if (!text.includes('{{scene}}')) {
    throw new Error('绘图题词缺了 {{scene}}');
  }
  const themeAt = text.indexOf(THEME_SLOT);
  if (themeAt < 0) {
    throw new Error('绘图题词槽序不对');
  }
}

/**
 * @param {unknown} version
 * @returns {number}
 */
function normalizePromptSheetVersion(version) {
  if (version === undefined || version === null) return 1;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('图册 promptSheetVersion 不合法');
  }
  return n;
}

/**
 * @param {number} version
 */
function assertCurrentPromptSheetVersion(version) {
  if (version !== PROMPT_SHEET_VERSION) {
    throw new Error(
      `图册题词结构是 v${version}，当前只支持 v${PROMPT_SHEET_VERSION}；请按 v${PROMPT_SHEET_VERSION} 改题词或重新学习`,
    );
  }
}

module.exports = {
  PROMPT_SHEET_VERSION,
  SHEET_SLOTS,
  THEME_SLOT,
  assertPromptSheet,
  normalizePromptSheetVersion,
  assertCurrentPromptSheetVersion,
};
