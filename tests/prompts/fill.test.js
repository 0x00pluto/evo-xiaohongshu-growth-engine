'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ARTICLE_TYPES,
  STORY_TYPES,
  albumHint,
  albumKind,
  albumSampleFile,
  albumSamplePath,
  assignGalleryRoles,
  assignStoryRoles,
  buildDraftPrompt,
  copySchema,
  fillPrompt,
  formatGallerySlots,
  listAlbums,
  migrateAlbumId,
  parseDraftText,
  parsePlanText,
  parseScenesText,
  pickAlbum,
  pickStoryType,
  readPromptFile,
  renderAlbumPrompt,
} = require('../../src/prompts/fill');

const promptsDir = path.join(__dirname, '../../assets/prompts/one-post');
const ALBUMS = listAlbums(promptsDir);

test('成稿和图册提示词能装填，长提示词不在 src 里', () => {
  const draft = buildDraftPrompt(promptsDir, '素人', {
    business: '卖给上班的人',
    article: '',
  });
  const tone = readPromptFile(promptsDir, 'tone.md');
  const plan = fillPrompt(readPromptFile(promptsDir, 'lines/process.md'), {
    title: '标题',
    body: '正文',
    topics: '甲、乙、丙',
    tone,
    albumHint: albumHint(promptsDir, '000001.magazine.dazibao'),
    copySchema: copySchema('000001.magazine.dazibao', promptsDir),
    imageCount: '3',
    slots: formatGallerySlots(assignStoryRoles(2)),
  });
  assert.match(plan, /仅示例/);
  assert.match(plan, /禁止照抄/);
  assert.match(plan, /"line"/);
  const scenesPrompt = fillPrompt(readPromptFile(promptsDir, 'scenes.md'), {
    title: '标题',
    body: '正文',
    topics: '甲、乙、丙',
    plannedLines: '分这一句\n回到整件事',
    tone,
    albumHint: albumHint(promptsDir, '000001.magazine.dazibao'),
    storyHint: '前后接成一个故事。',
    sceneCount: '2',
  });
  assert.match(scenesPrompt, /正好等于 2/);
  const sheet = renderAlbumPrompt(
    promptsDir,
    '000001.magazine.dazibao',
    '一个人站在只占画面一角的几何台阶上',
    { line: '分这一句' },
  );
  const conceptual = renderAlbumPrompt(
    promptsDir,
    '000003.conceptual.viewpoint',
    '几何块托起一个箭头',
    { theme: '女性自我成长', mainTitle: '女生旺自己', subTitle: '60个方法' },
  );
  assert.match(draft, /开头钩子/);
  assert.match(plan, /1 opening\n2 point\n3 summary/);
  assert.match(plan, /大字报一行/);
  assert.match(scenesPrompt, /分这一句/);
  assert.match(scenesPrompt, /杂志编辑风/);
  assert.match(scenesPrompt, /字段只有 scenes/);
  assert.match(scenesPrompt, /不要返回 look、background、colors/);
  assert.doesNotMatch(scenesPrompt, /\{\{background\}\}|\{\{colors\}\}/);
  assert.doesNotMatch(scenesPrompt, /scrapbook|conceptual|card/);
  assert.match(sheet.prompt, /1\. 背景/);
  assert.match(sheet.prompt, /#F2F0E6/);
  assert.match(sheet.prompt, /#2B2B2B/);
  assert.match(sheet.prompt, /#E4572E/);
  assert.match(sheet.prompt, /11\. 系列统一规则/);
  assert.match(sheet.prompt, /12\. 主题绘画内容：一个人站在只占画面一角的几何台阶上/);
  assert.match(sheet.prompt, /图片必须准确呈现的中文文案：\n分这一句/);
  assert.doesNotMatch(sheet.prompt, /本次主题内容/);
  assert.ok(sheet.prompt.indexOf('11. 系列统一规则') < sheet.prompt.indexOf('12. 主题绘画内容'));
  assert.equal(sheet.style.includes('杂志编辑风'), true);
  assert.match(conceptual.prompt, /#E8EEF2/);
  assert.match(conceptual.prompt, /#3D8BFF/);
  assert.match(conceptual.prompt, /本次主题内容：\n女性自我成长/);
  assert.match(conceptual.prompt, /主标题：\n女生旺自己/);
  assert.match(conceptual.prompt, /副标题：\n60个方法/);
  assert.doesNotMatch(conceptual.prompt, /图片必须准确呈现的中文文案/);
  assert.match(renderAlbumPrompt(promptsDir, '000002.scrapbook.handnote', '便签旁一支笔', { line: '记一句', note: '圈一下' }).prompt, /#F7E8C8/);
  assert.match(renderAlbumPrompt(promptsDir, '000002.scrapbook.handnote', '便签旁一支笔', { line: '记一句', note: '圈一下' }).prompt, /#C45C6A/);
  assert.match(renderAlbumPrompt(promptsDir, '000004.card.knowledge', '模块箭头', { mainTitle: '先装命令', point: '再装插件' }).prompt, /#FFF8F0/);
  assert.match(renderAlbumPrompt(promptsDir, '000004.card.knowledge', '模块箭头', { mainTitle: '先装命令', point: '再装插件' }).prompt, /#FF4D00/);
  for (const album of ALBUMS) {
    const schema = copySchema(album, promptsDir);
    assert.match(schema, /仅示例/);
    assert.match(schema, /禁止照抄/);
    assert.equal(albumSamplePath(album, promptsDir), `samples/${album}.jpg`);
    assert.equal(albumSampleFile(promptsDir, album), path.join(promptsDir, `samples/${album}.jpg`));
    assert.equal(fs.existsSync(path.join(promptsDir, 'albums', `${album}.json`)), true);
  }
  assert.equal(albumKind('000004.card.knowledge', promptsDir), 'card');
  assert.equal(migrateAlbumId('magazine', promptsDir), '000001.magazine.dazibao');
  assert.equal(migrateAlbumId('000005.infographic.modules', promptsDir), '000005.infographic.modules');
  assert.equal(migrateAlbumId('unknown', promptsDir), '');
  const infoSchema = copySchema('000005.infographic.modules', promptsDir);
  assert.match(infoSchema, /modules/);
  const albumBody = readPromptFile(promptsDir, 'albums/000005.infographic.modules.md');
  assert.doesNotMatch(albumBody, /做个人IP/);
  assert.doesNotMatch(albumBody, /超哥IP笔记/);
  const infoFrame = {
    seriesLabel: '★ 测试栏目 · 01',
    theme: '讲清一件事的顺序',
    mainTitle: '顺序要对\n再谈努力',
    subTitle: '先定方法，再堆动作。',
    modules: [
      { title: '误区甲', body: '说明甲', note: '补充甲', icon: '图标甲' },
      { title: '误区乙', body: '说明乙', note: '', icon: '图标乙' },
      { title: '误区丙', body: '说明丙', note: '补充丙', icon: '图标丙' },
      { title: '误区丁', body: '说明丁', note: '', icon: '图标丁' },
    ],
    stepsBar: '四步走',
    steps: [
      { name: '一步', body: '做一', icon: '标一' },
      { name: '二步', body: '做二', icon: '标二' },
      { name: '三步', body: '做三', icon: '标三' },
      { name: '四步', body: '做四', icon: '标四' },
    ],
    summary: '先对再久。',
    credit: '测试笔记',
  };
  const info = renderAlbumPrompt(promptsDir, '000005.infographic.modules', '统一线面图标，不盖过标题', infoFrame);
  assert.match(info.prompt, /#F2F0E6/);
  assert.match(info.prompt, /核心信息模块/);
  assert.match(info.prompt, /第4张卡片/);
  assert.match(info.prompt, /步骤 4：四步/);
  assert.match(info.prompt, /栏目标签：\n★ 测试栏目 · 01/);
  for (const id of [
    '000001.magazine.dazibao',
    '000002.scrapbook.handnote',
    '000003.conceptual.viewpoint',
    '000004.card.knowledge',
    '000005.infographic.modules',
  ]) {
    assert.equal(fs.existsSync(path.join(promptsDir, 'samples', `${id}.jpg`)), true);
  }
  assert.throws(
    () => parsePlanText(JSON.stringify({
      frames: [{
        ...infoFrame,
        modules: infoFrame.modules.slice(0, 1),
      }],
    }), 0, '正文', '000005.infographic.modules', promptsDir),
    /知识模块应为 2 到 6 条/,
  );
  assert.doesNotMatch(draft, /\{\{/);
  assert.doesNotMatch(plan, /\{\{/);
  assert.doesNotMatch(scenesPrompt, /\{\{/);
  assert.doesNotMatch(sheet.prompt, /\{\{/);
  assert.equal(fs.existsSync(path.join(promptsDir, 'looks')), false);
  assert.equal(fs.existsSync(path.join(promptsDir, 'scene.md')), false);
  assert.equal(fs.existsSync(path.join(promptsDir, 'sheet.md')), false);
  assert.throws(() => readPromptFile(promptsDir, 'sheet.md'), /未知提示词文件/);

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

test('代码随机抽故事类型和图册，不靠模型选题', () => {
  assert.deepEqual([...ARTICLE_TYPES], ['种草', '引流', '素人']);
  assert.deepEqual(STORY_TYPES, ['process', 'contrast']);
  assert.deepEqual(listAlbums(promptsDir), [
    '000001.magazine.dazibao',
    '000002.scrapbook.handnote',
    '000003.conceptual.viewpoint',
    '000004.card.knowledge',
    '000005.infographic.modules',
  ]);
  assert.equal(pickStoryType(() => 0), 'process');
  assert.equal(pickAlbum(promptsDir, () => 0), '000001.magazine.dazibao');
  assert.equal(pickAlbum(promptsDir, () => 0.75), '000004.card.knowledge');
  assert.equal(pickAlbum(promptsDir, () => 0.9), '000005.infographic.modules');
});

test('条数不对的画面算失败', () => {
  assert.throws(
    () => parseScenesText(JSON.stringify({ scenes: ['只有一张'] }), ['甲', '乙'], '000001.magazine.dazibao', promptsDir),
    /画面应为 2 张，模型返回了 1 张/,
  );
  const parsed = parseScenesText(JSON.stringify({
    scenes: ['画甲', '画乙', '画丙'],
  }), ['甲', '乙', '丙'], '000001.magazine.dazibao', promptsDir);
  assert.equal(parsed.scenes.length, 3);
  assert.equal(parsed.album, '000001.magazine.dazibao');
});

test('系列槽位按张数排，句子空、重复都失败', () => {
  assert.deepEqual(assignGalleryRoles(0), []);
  assert.deepEqual(assignGalleryRoles(1), ['summary']);
  assert.equal(formatGallerySlots(assignGalleryRoles(3)), '1 point\n2 point\n3 summary');
  assert.throws(
    () => parsePlanText('{"lines":["封面","  "]}', 1, '正文', '000001.magazine.dazibao', promptsDir),
    /策划那一句是空的/,
  );
  assert.throws(
    () => parsePlanText(JSON.stringify({
      frames: [{ theme: '题', mainTitle: '主', subTitle: '' }],
    }), 0, '正文', '000003.conceptual.viewpoint', promptsDir),
    /策划字段不完整/,
  );
  assert.throws(
    () => parseScenesText(JSON.stringify({ scenes: ['甲'] }), ['甲'], '000001.magazine.dazibao', promptsDir),
    /这一张的画面不能只是文案/,
  );
  assert.throws(
    () => parseScenesText(JSON.stringify({ scenes: ['同一张', '同一张'] }), ['甲', '乙'], '000001.magazine.dazibao', promptsDir),
    /这一张的画面重复了/,
  );
});

test('成稿缺字段时不收下半截结果', () => {
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
});

test('图册非法或文案为空时拼装失败', () => {
  assert.throws(
    () => parseScenesText(JSON.stringify({ scenes: ['画着台阶'] }), ['一句'], 'poster', promptsDir),
    /图册不在允许列表/,
  );
  assert.throws(
    () => renderAlbumPrompt(promptsDir, '000001.magazine.dazibao', '', { line: '一句' }),
    /这一张的画面是空的/,
  );
  assert.throws(
    () => renderAlbumPrompt(promptsDir, '000001.magazine.dazibao', '画着台阶', { line: '' }),
    /这一张的文案是空的/,
  );
});
