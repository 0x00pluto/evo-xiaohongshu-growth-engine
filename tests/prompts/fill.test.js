'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  faceVars,
  fillPrompt,
  parseCoverText,
  parseDraftText,
  parseGalleryText,
  readPromptFile,
} = require('../../src/prompts/fill');

const promptsDir = path.join(__dirname, '../../assets/prompts/one-post');

test('三个提示词文件能装填，长提示词不在 src 里', () => {
  const face = {
    title: '标题',
    body: '正文',
    topics: ['甲', '乙', '丙'],
    coverLine: '一句',
  };
  const draft = fillPrompt(readPromptFile(promptsDir, 'draft.md'), {
    business: '卖给上班的人',
    article: '',
  });
  const cover = fillPrompt(readPromptFile(promptsDir, 'cover.md'), faceVars(face, 1));
  const gallery = fillPrompt(readPromptFile(promptsDir, 'gallery.md'), faceVars(face, 2));
  assert.match(draft, /开头钩子/);
  assert.match(cover, /标题/);
  assert.match(gallery, /张数：2/);
  assert.doesNotMatch(draft, /\{\{/);
  assert.doesNotMatch(cover, /\{\{/);
  assert.doesNotMatch(gallery, /\{\{/);

  const srcDir = path.join(__dirname, '../../src');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(srcDir);
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.equal(source.includes('开头钩子'), false);
  assert.equal(source.includes('src/studio'), false);
});

test('条数不对的提示词算失败', () => {
  assert.throws(() => parseCoverText('{"prompt":"  "}'), /封面提示词不是 1 条/);
  assert.throws(() => parseGalleryText('{"prompts":["只有一条"]}', 2), /配图提示词应为 2 条/);
  assert.deepEqual(parseGalleryText('{"prompts":["甲","乙"]}', 2), ['甲', '乙']);
});

test('成稿缺字段时不收下半截结果', () => {
  assert.throws(
    () => parseDraftText('{"title":"有标题","body":"有正文","topics":["一"],"coverLine":"一句"}'),
    /话题要有 3 到 5 个/,
  );
  const face = parseDraftText(JSON.stringify({
    title: ' 标题 ',
    body: '正文',
    topics: [' 甲 ', '乙', '丙'],
    coverLine: '一句',
  }));
  assert.equal(face.title, '标题');
  assert.deepEqual(face.topics, ['甲', '乙', '丙']);
});
