'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  albumLabelShort,
  copyFramesFitSchema,
  decodeFilledPrompt,
  embedEditablePrompt,
  extractEditablePrompt,
  extractSceneFromPrompt,
  renderAlbumPrompt,
} = require('../../../src/prompts/fill');

const promptsDir = path.join(__dirname, '../../../assets/prompts/one-post');
const ALBUM_MAGAZINE = '000001.magazine.dazibao';
const ALBUM_SCRAPBOOK = '000002.scrapbook.handnote';
const ALBUM_INFOGRAPHIC = '000005.infographic.modules';

function magazinePrompt(scene = '画面甲', line = '一句上图') {
  return renderAlbumPrompt(promptsDir, ALBUM_MAGAZINE, scene, { line }).prompt;
}

test('抽出可改段不含 1–10 与开场套话，含第 11 槽和画面文案', () => {
  const full = magazinePrompt();
  const edit = extractEditablePrompt(full);
  assert.match(edit, /11\. 主题绘画内容：画面甲/);
  assert.match(edit, /图片必须准确呈现的中文文案/);
  assert.match(edit, /一句上图/);
  assert.doesNotMatch(edit, /1\. 背景/);
  assert.doesNotMatch(edit, /10\. 光影与质感/);
  assert.doesNotMatch(edit, /竖版 3:4/);
  assert.doesNotMatch(edit, /文案必须完整、准确/);
});

test('嵌回可改段只改第 11 槽和画面文案，1–10 不动', () => {
  const full = magazinePrompt();
  const next = embedEditablePrompt(
    full,
    '11. 主题绘画内容：画面乙\n\n图片必须准确呈现的中文文案：\n新的一句',
  );
  assert.match(next, /1\. 背景：底色固定为 #F2F0E6/);
  assert.match(next, /11\. 主题绘画内容：画面乙/);
  assert.match(next, /新的一句/);
  assert.doesNotMatch(next, /画面甲/);
  assert.doesNotMatch(next, /一句上图/);
  assert.match(next, /文案必须完整、准确/);
});

test('可改段删空则该槽存成空字符串', () => {
  assert.equal(embedEditablePrompt(magazinePrompt(), '  '), '');
  assert.equal(extractEditablePrompt(''), '');
});

test('反解杂志帧后，手帐结构对得上、信息图对不上', () => {
  const full = magazinePrompt('画面甲', '一句上图');
  const decoded = decodeFilledPrompt(full, ALBUM_MAGAZINE, promptsDir);
  assert.ok(decoded);
  assert.equal(decoded.scene, '画面甲');
  assert.equal(decoded.frame.line, '一句上图');
  assert.equal(copyFramesFitSchema([decoded.frame], ALBUM_SCRAPBOOK, promptsDir), true);
  assert.equal(copyFramesFitSchema([decoded.frame], ALBUM_INFOGRAPHIC, promptsDir), false);
  assert.equal(extractSceneFromPrompt(full), '画面甲');
});

test('图册短名取逗号或顿号前第一段', () => {
  assert.equal(albumLabelShort('杂志编辑风，高辨识度大字报，概念插画'), '杂志编辑风');
  assert.equal(albumLabelShort('手帐拼贴风'), '手帐拼贴风');
  assert.equal(albumLabelShort(''), '');
});
