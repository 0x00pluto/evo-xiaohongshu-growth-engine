'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assignGalleryRoles,
  fillPrompt,
  formatGallerySlots,
  parseArtText,
  parseCoverTypeText,
  parseDraftText,
  assignStoryRoles,
  parsePlanText,
  parseSetTypeText,
  readPromptFile,
  renderSheet,
  seriesPromptNames,
} = require('../../src/prompts/fill');

const promptsDir = path.join(__dirname, '../../assets/prompts/one-post');

test('成稿和系列提示词能装填，长提示词不在 src 里', () => {
  const draft = fillPrompt(readPromptFile(promptsDir, 'draft.md'), {
    business: '卖给上班的人',
    article: '',
  });
  const names = seriesPromptNames('breakdown');
  const tone = readPromptFile(promptsDir, 'cover/tone-amateur.md');
  const plan = fillPrompt(readPromptFile(promptsDir, names.plan), {
    title: '标题',
    body: '正文',
    topics: '甲、乙、丙',
    tone,
    imageCount: '3',
    slots: formatGallerySlots(assignStoryRoles(2)),
    seriesPoint: readPromptFile(promptsDir, names.point),
    seriesSummary: readPromptFile(promptsDir, names.summary),
  });
  const art = fillPrompt(readPromptFile(promptsDir, 'sets/art.md'), {
    title: '标题',
    body: '正文',
    topics: '甲、乙、丙',
    plannedLines: '分这一句\n回到整件事',
    tone,
    readingHint: '前后接成一个故事。',
  });
  const sheet = renderSheet(promptsDir, {
    look: 'magazine',
    background: '奶油米白 #F2F0E6，纸面干净',
    colors: '标题和图形是深炭黑 #2B2B2B，关键词和标记是活力橙红 #E4572E',
  }, '一个人站在只占画面一角的几何台阶上', '分这一句');
  assert.match(draft, /开头钩子/);
  assert.doesNotMatch(draft, /coverLine/);
  assert.match(plan, /1 opening\n2 point\n3 summary/);
  assert.match(plan, /只写这一拍/);
  assert.match(plan, /回到整件事/);
  assert.match(plan, /不要写画面/);
  assert.match(art, /分这一句/);
  assert.match(art, /magazine/);
  assert.match(art, /scrapbook/);
  assert.match(art, /conceptual/);
  assert.match(art, /card/);
  assert.match(art, /奶油米白 #F2F0E6/);
  assert.match(art, /深炭黑 #2B2B2B/);
  assert.match(art, /活力橙红 #E4572E/);
  assert.match(art, /前后接成一个故事/);
  assert.match(art, /主题绘画/);
  assert.doesNotMatch(art, /不要写字号百分比/);
  assert.doesNotMatch(art, /种草|引流|素人/);
  assert.doesNotMatch(art, /85%/);
  assert.match(sheet.prompt, /1\. 背景/);
  assert.match(sheet.prompt, /4\. 字号：主标题采用超大字号，约占画面顶部两成到四分之一/);
  assert.match(sheet.prompt, /11\. 主题绘画内容：一个人站在只占画面一角的几何台阶上/);
  assert.match(sheet.prompt, /12\. 系列统一规则/);
  assert.match(sheet.prompt, /图片准确文案：\n分这一句/);
  assert.match(sheet.prompt, /奶油米白 #F2F0E6/);
  assert.match(sheet.prompt, /避免传统商务 PPT/);
  assert.doesNotMatch(sheet.prompt, /不写百分比/);
  assert.doesNotMatch(sheet.prompt, /%/);
  assert.doesNotMatch(sheet.prompt, /文字是第一视觉主体/);
  assert.equal(sheet.style.includes('杂志编辑风，大字报，带概念插画'), true);
  assert.doesNotMatch(draft, /\{\{/);
  assert.doesNotMatch(plan, /\{\{/);
  assert.doesNotMatch(art, /\{\{/);
  assert.doesNotMatch(sheet.prompt, /\{\{/);
  assert.equal(fs.existsSync(path.join(promptsDir, 'gallery.md')), false);
  assert.throws(() => readPromptFile(promptsDir, 'gallery.md'), /未知提示词文件/);
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
  assert.equal(source.includes('只写这一拍'), false);
  assert.equal(source.includes('回到整件事'), false);
  assert.equal(source.includes('不得编造稿面和封面那句话里没有的数字、人名、头衔'), false);
  assert.equal(source.includes('src/studio'), false);
});

test('条数不对的画面算失败', () => {
  const palette = {
    look: 'magazine',
    background: '奶油米白 #F2F0E6',
    colors: '深炭黑 #2B2B2B，活力橙红 #E4572E',
  };
  assert.throws(
    () => parseArtText(JSON.stringify({ ...palette, scenes: ['只有一张'] }), ['甲', '乙']),
    /画面应为 2 张/,
  );
  const parsed = parseArtText(JSON.stringify({
    ...palette,
    scenes: ['画甲', '画乙', '画丙'],
  }), ['甲', '乙', '丙']);
  assert.equal(parsed.scenes.length, 3);
  assert.equal(parsed.look, 'magazine');
});

test('系列槽位按张数排，句子空、重复或没写进提示词都失败', () => {
  assert.deepEqual(assignGalleryRoles(0), []);
  assert.deepEqual(assignGalleryRoles(1), ['summary']);
  const eight = assignGalleryRoles(8);
  assert.equal(eight.length, 8);
  assert.deepEqual(eight.slice(0, 7), Array.from({ length: 7 }, () => 'point'));
  assert.equal(eight[7], 'summary');
  assert.equal(formatGallerySlots(assignGalleryRoles(3)), '1 point\n2 point\n3 summary');
  assert.throws(() => parseSetTypeText('{"type":"steps"}'), /系列类型不在允许列表/);
  assert.throws(() => parseSetTypeText('{"type":""}'), /系列类型不在允许列表/);
  assert.throws(
    () => parsePlanText('{"lines":["封面","  "]}', 1, '正文'),
    /策划那一句是空的/,
  );
  assert.throws(
    () => parsePlanText('{"lines":["封面","甲","甲"]}', 2, '正文'),
    /策划那一句重复了/,
  );
  assert.throws(
    () => parsePlanText('{"lines":["封面","正文"]}', 1, '第一句\nㅤ\n正文'),
    /最后一句不要照抄正文结尾/,
  );
  assert.deepEqual(parsePlanText('{"lines":["封面一句"]}', 0, '正文'), ['封面一句']);
  const palette = {
    look: 'magazine',
    background: '奶油米白 #F2F0E6',
    colors: '深炭黑 #2B2B2B，活力橙红 #E4572E',
  };
  assert.throws(
    () => parseArtText(JSON.stringify({ ...palette, scenes: [''] }), ['甲']),
    /这一张的画面是空的/,
  );
  assert.throws(
    () => parseArtText(JSON.stringify({ ...palette, scenes: ['甲'] }), ['甲']),
    /这一张的画面不能只是文案/,
  );
  assert.throws(
    () => parseArtText(JSON.stringify({ ...palette, scenes: ['同一张', '同一张'] }), ['甲', '乙']),
    /这一张的画面重复了/,
  );
  assert.deepEqual(
    parseArtText(JSON.stringify({ ...palette, scenes: ['画甲'] }), ['甲']).scenes,
    ['画甲'],
  );
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

test('封面语气和句子分文件装填，配色要色名加色号', () => {
  const tone = readPromptFile(promptsDir, 'cover/tone-amateur.md');
  const shared = { title: '标题', body: '正文', topics: '甲、乙、丙' };
  const sentence = fillPrompt(readPromptFile(promptsDir, 'cover/sentence.md'), { ...shared, tone });
  const choose = fillPrompt(readPromptFile(promptsDir, 'cover/choose-type.md'), { ...shared, coverLine: '一句' });
  const story = readPromptFile(promptsDir, 'cover/types/story.md');
  const compare = readPromptFile(promptsDir, 'cover/types/compare.md');
  const sheet = readPromptFile(promptsDir, 'sets/sheet.md');
  assert.match(tone, /像一个普通人在分享自己刚弄明白的事/);
  assert.match(sentence, /像一个普通人在分享自己刚弄明白的事/);
  assert.doesNotMatch(story, /\{\{largeType\}\}/);
  assert.doesNotMatch(compare, /\{\{largeType\}\}/);
  assert.doesNotMatch(readPromptFile(promptsDir, 'sets/art.md'), /\{\{largeType\}\}/);
  assert.doesNotMatch(sheet, /\{\{largeType\}\}/);
  assert.doesNotMatch(sheet, /%/);
  assert.match(sheet, /12\. 系列统一规则/);
  assert.doesNotMatch(sheet, /13\. 这一张的画面/);
  assert.doesNotMatch(readPromptFile(promptsDir, 'cover/sentence.md'), /\{\{largeType\}\}/);
  assert.doesNotMatch(readPromptFile(promptsDir, 'sets/breakdown/point.md'), /\{\{largeType\}\}/);
  assert.doesNotMatch(readPromptFile(promptsDir, 'draft.md'), /\{\{largeType\}\}/);
  assert.doesNotMatch(readPromptFile(promptsDir, 'cover/sentence.md'), /\{\{coverLine\}\}/);
  assert.doesNotMatch(choose, /像一个普通人在分享自己刚弄明白的事/);
  assert.match(story, /一个主体/);
  assert.match(story, /奶油米白 #F2F0E6/);
  assert.doesNotMatch(story, /不要写暖米、米白/);
  assert.doesNotMatch(story, /种草|引流|素人/);
  assert.doesNotMatch(compare, /种草|引流|素人/);
  assert.match(compare, /两个状态/);
  assert.doesNotMatch(sentence, /\{\{/);
  assert.doesNotMatch(choose, /\{\{/);
  assert.throws(() => parseCoverTypeText('{"type":"poster"}'), /封面类型不在允许列表/);
  const lines = ['一句'];
  assert.throws(
    () => parseArtText(JSON.stringify({
      look: 'poster',
      background: '奶油米白 #F2F0E6',
      colors: '深炭黑 #2B2B2B，活力橙红 #E4572E',
      scenes: ['画着台阶'],
    }), lines),
    /风格不在允许列表/,
  );
  assert.throws(
    () => parseArtText(JSON.stringify({
      look: 'magazine',
      background: '#F2F0E6',
      colors: '深炭黑 #2B2B2B，活力橙红 #E4572E',
      scenes: ['画着台阶'],
    }), lines),
    /配色要写色名加色号/,
  );
  assert.throws(
    () => parseArtText(JSON.stringify({
      look: 'magazine',
      background: '奶油米白 #112233',
      colors: '深炭黑 #445566，活力橙红 #778899',
      scenes: ['画着台阶'],
    }), lines),
    /配色不要照抄示例/,
  );
  assert.throws(
    () => parseArtText(JSON.stringify({
      look: 'magazine',
      background: '奶油米白 #F2F0E6',
      colors: '深炭黑 #2B2B2B',
      scenes: ['画着台阶'],
    }), lines),
    /配色要写色名加色号/,
  );
  const accepted = parseArtText(JSON.stringify({
    look: 'magazine',
    background: '奶油米白 #F2F0E6，纸面干净',
    colors: '标题和图形是深炭黑 #2B2B2B，关键词和标记是活力橙红 #E4572E',
    scenes: ['画着台阶'],
  }), lines);
  assert.equal(accepted.background.includes('奶油米白'), true);
  assert.equal(accepted.scenes[0], '画着台阶');
});
