'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  faceVars,
  fillPrompt,
  parseCoverText,
  parseCoverTypeText,
  parseDraftText,
  parseGalleryText,
  readPromptFile,
} = require('../../src/prompts/fill');

const promptsDir = path.join(__dirname, '../../assets/prompts/one-post');

test('成稿和配图提示词能装填，长提示词不在 src 里', () => {
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
  const gallery = fillPrompt(readPromptFile(promptsDir, 'gallery.md'), faceVars(face, 2));
  assert.match(draft, /开头钩子/);
  assert.doesNotMatch(draft, /coverLine/);
  assert.match(gallery, /张数：2/);
  assert.match(gallery, /不要要求图里出现可阅读的中文/);
  assert.doesNotMatch(draft, /\{\{/);
  assert.doesNotMatch(gallery, /\{\{/);
  assert.throws(() => readPromptFile(promptsDir, 'cover.md'), /未知提示词文件/);
  assert.equal(fs.existsSync(path.join(promptsDir, 'cover.md')), false);

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
  assert.equal(source.includes('不要排成一段新闻'), false);
  assert.equal(source.includes('不要为了用对比而硬拆'), false);
  assert.equal(source.includes('src/studio'), false);
});

test('条数不对的提示词算失败', () => {
  assert.throws(() => parseCoverText('{"prompt":"  "}'), /封面提示词不是 1 条/);
  assert.throws(() => parseGalleryText('{"prompts":["只有一条"]}', 2), /配图提示词应为 2 条/);
  assert.deepEqual(parseGalleryText('{"prompts":["甲","乙"]}', 2), ['甲', '乙']);
});

test('成稿缺字段时不收下半截结果，也不再收下封面那句话', () => {
  assert.throws(
    () => parseDraftText('{"title":"有标题","body":"有正文","topics":["一"]}'),
    /话题要有 3 到 5 个/,
  );
  const face = parseDraftText(JSON.stringify({
    title: ' 标题 ',
    body: '正文',
    topics: [' 甲 ', '乙', '丙'],
    coverLine: '模型不该写这个',
  }));
  assert.equal(face.title, '标题');
  assert.equal(face.coverLine, '');
  assert.deepEqual(face.topics, ['甲', '乙', '丙']);
});

test('封面语气、句子、选型和类型规则分文件装填', () => {
  const tone = readPromptFile(promptsDir, 'cover/tone-amateur.md');
  const largeType = readPromptFile(promptsDir, 'cover/large-type.md');
  const shared = { title: '标题', body: '正文', topics: '甲、乙、丙' };
  const sentence = fillPrompt(readPromptFile(promptsDir, 'cover/sentence.md'), { ...shared, tone });
  const choose = fillPrompt(readPromptFile(promptsDir, 'cover/choose-type.md'), { ...shared, coverLine: '一句' });
  const story = fillPrompt(readPromptFile(promptsDir, 'cover/types/story.md'), {
    ...shared,
    coverLine: '一句',
    tone,
    largeType,
    type: 'story',
  });
  const compare = fillPrompt(readPromptFile(promptsDir, 'cover/types/compare.md'), {
    ...shared,
    coverLine: '一句',
    tone,
    largeType,
    type: 'compare',
  });
  assert.match(tone, /像一个普通人在分享自己刚弄明白的事/);
  assert.match(largeType, /文字是第一视觉主体/);
  assert.match(largeType, /85%/);
  assert.match(sentence, /像一个普通人在分享自己刚弄明白的事/);
  assert.match(story, /像一个普通人在分享自己刚弄明白的事/);
  assert.match(compare, /像一个普通人在分享自己刚弄明白的事/);
  assert.match(story, /文字是第一视觉主体/);
  assert.match(story, /85%/);
  assert.match(compare, /文字是第一视觉主体/);
  assert.match(compare, /短标签/);
  assert.doesNotMatch(compare, /也可以再加一句总题/);
  assert.doesNotMatch(readPromptFile(promptsDir, 'cover/sentence.md'), /\{\{largeType\}\}/);
  assert.doesNotMatch(readPromptFile(promptsDir, 'gallery.md'), /\{\{largeType\}\}/);
  assert.doesNotMatch(readPromptFile(promptsDir, 'draft.md'), /\{\{largeType\}\}/);
  assert.doesNotMatch(readPromptFile(promptsDir, 'cover/sentence.md'), /\{\{coverLine\}\}/);
  assert.doesNotMatch(choose, /像一个普通人在分享自己刚弄明白的事/);
  assert.match(story, /一个主体/);
  assert.match(story, /不要排成一段新闻/);
  assert.match(compare, /两个状态/);
  assert.doesNotMatch(sentence, /\{\{/);
  assert.doesNotMatch(choose, /\{\{/);
  assert.doesNotMatch(story, /\{\{/);
  assert.doesNotMatch(compare, /\{\{/);
  assert.throws(() => parseCoverTypeText('{"type":"poster"}'), /封面类型不在允许列表/);
  assert.throws(
    () => parseCoverText('{"prompt":"只有画面"}', { type: 'story', coverLine: '一句' }),
    /故事句封面没有写上封面那句话/,
  );
  assert.equal(
    parseCoverText('{"prompt":"画面里写着一句"}', { type: 'story', coverLine: '一句' }),
    '画面里写着一句',
  );
  assert.equal(
    parseCoverText('{"prompt":"左没搞懂右弄明白"}', { type: 'compare', coverLine: '一句' }),
    '左没搞懂右弄明白',
  );
});
