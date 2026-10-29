'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BUSY_MESSAGE, createRunner } = require('../../src/one-post/run');

const face = {
  title: '标题',
  body: '正文',
  topics: ['甲', '乙', '丙'],
  coverLine: '一句',
};
const STYLE = '杂志编辑风，高辨识度大字报，概念插画';
const ALBUM_MAGAZINE = '000001.magazine.dazibao';
const ALBUM_SCRAPBOOK = '000002.scrapbook.handnote';
const ALBUM_CONCEPTUAL = '000003.conceptual.viewpoint';
const ALBUM_CARD = '000004.card.knowledge';
const ALBUM_INFOGRAPHIC = '000005.infographic.modules';
const ALL_ALBUMS = [ALBUM_MAGAZINE, ALBUM_SCRAPBOOK, ALBUM_CONCEPTUAL, ALBUM_CARD, ALBUM_INFOGRAPHIC];

function albumKindOf(album) {
  return String(album).split('.')[1] || album;
}

function assertCover(prompt, line = '一句', album = ALBUM_MAGAZINE) {
  const kind = albumKindOf(album);
  assert.match(prompt, /1\. 背景/);
  assert.match(prompt, /11\. 主题绘画内容/);
  assert.match(prompt, /11\. 主题绘画内容：第1格画着相连的一件事/);
  assert.equal(prompt.includes(line), true);
  assert.ok(prompt.includes('11. 主题绘画内容'));
  assert.ok(!prompt.includes('系列统一规则'));
  assert.doesNotMatch(prompt, /85%/);
  assert.doesNotMatch(prompt, /LARGE/);
  if (kind === 'magazine') {
    assert.match(prompt, /#F2F0E6/);
    assert.match(prompt, /图片必须准确呈现的中文文案/);
    assert.doesNotMatch(prompt, /本次主题内容/);
  } else if (kind === 'conceptual') {
    assert.match(prompt, /#E8EEF2/);
    assert.match(prompt, /本次主题内容/);
    assert.match(prompt, /主标题/);
    assert.match(prompt, /副标题/);
    assert.doesNotMatch(prompt, /图片必须准确呈现的中文文案/);
  } else if (kind === 'scrapbook') {
    assert.match(prompt, /#F7E8C8/);
    assert.match(prompt, /图片必须准确呈现的中文文案/);
  } else if (kind === 'card') {
    assert.match(prompt, /#FFF8F0/);
    assert.match(prompt, /底部要点/);
  }
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-run-'));
}

function albumSlots(id) {
  const kind = albumKindOf(id);
  const colors = {
    magazine: ['#F2F0E6', '#2B2B2B', '#E4572E'],
    scrapbook: ['#F7E8C8', '#2C2416', '#C45C6A'],
    conceptual: ['#E8EEF2', '#1B2430', '#3D8BFF'],
    card: ['#FFF8F0', '#111111', '#FF4D00'],
    infographic: ['#F2F0E6', '#2B2B2B', '#E4572E'],
  }[kind];
  const head = [
    `竖版 3:4，测试 ${id}。`,
    `1. 背景：底色固定为 ${colors[0]}`,
    `2. 色彩：主色 ${colors[1]}，强调色 ${colors[2]}`,
    '3. 字体：思源黑体',
    '4. 字号：超大标题',
    '5. 字重：特粗体',
    '6. 文字排版：按语义断行',
    '7. 文字位置：标题是主视觉',
    '8. 构图布局：可以偏心',
    '9. 视觉风格：测试图册',
    '10. 光影与质感：平面插画',
    '11. 主题绘画内容：{{scene}}',
    '',
  ];
  if (kind === 'conceptual') {
    return head.concat([
      '本次主题内容：',
      '{{theme}}',
      '',
      '主标题：',
      '{{mainTitle}}',
      '',
      '副标题：',
      '{{subTitle}}',
      '',
      '文案必须完整、准确。',
    ]).join('\n');
  }
  if (kind === 'card') {
    return head.concat([
      '主标题：',
      '{{mainTitle}}',
      '',
      '底部要点：',
      '{{point}}',
      '',
      '文案必须完整、准确。',
    ]).join('\n');
  }
  if (kind === 'scrapbook') {
    return head.concat([
      '图片必须准确呈现的中文文案：',
      '{{line}}',
      '{{noteBlock}}',
      '文案必须完整、准确。',
    ]).join('\n');
  }
  if (kind === 'infographic') {
    return head.concat([
      '栏目标签：',
      '{{seriesLabel}}',
      '',
      '本次主题内容：',
      '{{theme}}',
      '',
      '主标题：',
      '{{mainTitle}}',
      '',
      '副标题：',
      '{{subTitle}}',
      '',
      '{{modulesBlock}}',
      '',
      '{{stepsBlock}}',
      '',
      '总结金句：',
      '{{summary}}',
      '',
      '栏目署名：',
      '{{credit}}',
      '',
      '文案必须完整、准确。',
    ]).join('\n');
  }
  return head.concat([
    '图片必须准确呈现的中文文案：',
    '{{line}}',
    '',
    '文案必须完整、准确。',
  ]).join('\n');
}

function writeAlbum(dir, name) {
  const pack = path.join(dir, 'albums', name);
  fs.mkdirSync(pack, { recursive: true });
  fs.writeFileSync(path.join(pack, 'prompt.md'), albumSlots(name));
}

/** @type {Record<string, { hint: string; label: string; copySchema: string; legacyIds: string[]; constraints?: object }>} */
const ALBUM_META = {
  [ALBUM_MAGAZINE]: {
    hint: '杂志编辑风，高辨识度大字报，概念插画',
    label: '杂志编辑风，高辨识度大字报，概念插画',
    copySchema: '大字报一行。每一项对象字段：\n- line：须准确上图的一句中文（非空）\n返回形状：{"frames":[{"line":"..."}]}',
    legacyIds: ['magazine'],
  },
  [ALBUM_SCRAPBOOK]: {
    hint: '手帐拼贴，马克笔笔记感，少装饰纸面',
    label: '手帐拼贴风',
    copySchema: '手帐便签式。每一项对象字段：\n- line：须准确上图的一句中文（非空）\n- note：可选短旁注\n返回形状：{"frames":[{"line":"...","note":""}]}',
    legacyIds: ['scrapbook'],
  },
  [ALBUM_CONCEPTUAL]: {
    hint: '潮流概念插画，几何隐喻，文字优先',
    label: '潮流概念插画风',
    copySchema: '上下观点。每一项对象字段：\n- theme：本次主题内容\n- mainTitle：主标题\n- subTitle：副标题\n返回形状：{"frames":[{"theme":"...","mainTitle":"...","subTitle":"..."}]}',
    legacyIds: ['conceptual'],
  },
  [ALBUM_CARD]: {
    hint: '强对比知识卡片，干货短句，模块图形',
    label: '强对比知识卡片风',
    copySchema: '卡片上下。每一项对象字段：\n- mainTitle：主标题\n- point：底部要点\n返回形状：{"frames":[{"mainTitle":"...","point":"..."}]}',
    legacyIds: ['card'],
  },
  [ALBUM_INFOGRAPHIC]: {
    hint: '暖米色知识信息图，模块卡片与步骤流，大标题',
    label: '暖米色知识信息图',
    copySchema: [
      '知识信息图 layout。每一项对象字段：',
      '- seriesLabel：栏目标签（非空）',
      '- theme：本次主题内容（非空）',
      '- mainTitle：主标题（非空）',
      '- subTitle：副标题（非空）',
      '- modules：数组，长度 2～6',
      '- stepsBar：步骤区标题条（非空）',
      '- steps：数组，长度 3～7',
      '- summary：总结金句（非空）',
      '- credit：栏目署名（非空）',
      '返回外壳：{"frames":[{...}]}',
    ].join('\n'),
    legacyIds: ['infographic'],
    constraints: {
      modules: { min: 2, max: 6 },
      steps: { min: 3, max: 7 },
    },
  },
};

function writeAlbumMeta(dir, id) {
  const kind = albumKindOf(id);
  const slug = String(id).split('.')[2] || kind;
  const meta = ALBUM_META[id];
  const pack = path.join(dir, 'albums', id);
  fs.mkdirSync(pack, { recursive: true });
  fs.writeFileSync(path.join(pack, 'album.json'), `${JSON.stringify({
    id,
    kind,
    slug,
    hint: meta.hint,
    label: meta.label,
    copySchema: meta.copySchema,
    legacyIds: meta.legacyIds,
    enabled: true,
    promptSheetVersion: 2,
    ...(meta.constraints ? { constraints: meta.constraints } : {}),
  }, null, 2)}\n`);
}

function writePrompts(dir) {
  const { clearAlbumCatalogCache } = require('../../src/prompts/fill');
  clearAlbumCatalogCache(dir);
  fs.mkdirSync(path.join(dir, 'article', 'article-types'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'article', 'article-voices'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'article', 'article-rules'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'article-image', 'lines'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'albums'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'article', 'shell.md'), 'DRAFT {{voice}}\n{{skeleton}}\n{{emojiRules}}');
  fs.writeFileSync(path.join(dir, 'article', 'article-rules', 'emoji.md'), 'EMOJI 规则');
  fs.writeFileSync(path.join(dir, 'article', 'article-voices', 'amateur.md'), '人设素人');
  fs.writeFileSync(path.join(dir, 'article', 'article-voices', 'koc.md'), '人设KOC');
  fs.writeFileSync(path.join(dir, 'article', 'article-voices', 'expert.md'), '人设达人');
  fs.writeFileSync(path.join(dir, 'article', 'article-voices', 'brand.md'), '人设官号');
  fs.writeFileSync(path.join(dir, 'article', 'article-voices', 'founder.md'), '人设创始人');
  fs.writeFileSync(path.join(dir, 'article', 'article-voices', 'shop.md'), '人设店主');
  fs.writeFileSync(path.join(dir, 'article', 'article-voices', 'employee.md'), '人设员工');
  fs.writeFileSync(path.join(dir, 'article', 'article-types', 'growth.md'), '骨架涨粉');
  fs.writeFileSync(path.join(dir, 'article', 'article-types', 'seed.md'), '骨架种草');
  fs.writeFileSync(path.join(dir, 'article', 'article-types', 'lead.md'), '骨架引流');
  fs.writeFileSync(path.join(dir, 'article', 'article-types', 'awareness.md'), '骨架曝光');
  fs.writeFileSync(path.join(dir, 'article', 'article-types', 'seo.md'), '骨架搜索');
  fs.writeFileSync(path.join(dir, 'article', 'article-types', 'conversion.md'), '骨架转化');
  fs.writeFileSync(path.join(dir, 'article-image', 'tone.md'), 'TONE 中性');
  fs.writeFileSync(
    path.join(dir, 'article-image', 'lines', 'process.md'),
    'PLAN {{slots}}\nSCHEMA:{{copySchema}}\n{{tone}}\nCOUNT:{{imageCount}}',
  );
  fs.writeFileSync(
    path.join(dir, 'article-image', 'lines', 'contrast.md'),
    'COMPAREPLAN {{slots}}\nSCHEMA:{{copySchema}}\n{{tone}}\nCOUNT:{{imageCount}}',
  );
  fs.writeFileSync(
    path.join(dir, 'article-image', 'scenes.md'),
    'SCENES\nCOUNT:{{sceneCount}}\nHINT:{{albumHint}}\nLINES:{{plannedLines}}\n{{tone}}\n{{storyHint}}',
  );
  fs.writeFileSync(
    path.join(dir, 'article-image', 'image-refs.md'),
    [
      '## template',
      '',
      '版式模板参考图，不是成稿。锁定底色、配色关系。',
      '',
      '## product',
      '',
      '产品参考图。',
      '',
      '## logo',
      '',
      '品牌标识参考图。',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'article-image', 'subject-slot.md'),
    '【主体空位】\n用上传主体换掉模板假人；不要两个主角并排。',
  );
  fs.mkdirSync(path.join(dir, 'material-usage'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'material-usage', 'system.md'),
    '请返回 JSON：{"usage":"一句用法"}',
  );
  for (const id of ALL_ALBUMS) {
    writeAlbum(dir, id);
    writeAlbumMeta(dir, id);
    fs.writeFileSync(
      path.join(dir, 'albums', id, 'copy-sample.md'),
      '以下为「仅示例」。禁止照抄示例文案。\n',
    );
  }
}

function planFrames(prompt, imageCount) {
  const lines = ['一句', ...Array.from({ length: imageCount - 1 }, (_, index) => `第${index + 1}拍`)];
  if (prompt.includes('上下观点')) {
    return {
      frames: lines.map((line, index) => ({
        theme: `主题${index + 1}`,
        mainTitle: line,
        subTitle: `副题${index + 1}`,
      })),
    };
  }
  if (prompt.includes('卡片上下')) {
    return {
      frames: lines.map((line) => ({ mainTitle: line, point: '要点一句' })),
    };
  }
  if (prompt.includes('手帐便签')) {
    return { frames: lines.map((line) => ({ line, note: '' })) };
  }
  if (prompt.includes('知识信息图')) {
    return {
      frames: lines.map((line, index) => ({
        seriesLabel: `★ 测试 · 0${index + 1}`,
        theme: `主题${index + 1}`,
        mainTitle: line,
        subTitle: `副题${index + 1}`,
        modules: [
          { title: '模块甲', body: '说明甲', note: '', icon: '图标甲' },
          { title: '模块乙', body: '说明乙', note: '旁注', icon: '图标乙' },
        ],
        stepsBar: '三步走',
        steps: [
          { name: '一步', body: '做一', icon: '标一' },
          { name: '二步', body: '做二', icon: '标二' },
          { name: '三步', body: '做三', icon: '标三' },
        ],
        summary: '先对再久。',
        credit: '测试笔记',
      })),
    };
  }
  return { frames: lines.map((line) => ({ line })) };
}

/** @param {unknown} prompt */
function isTextPrompt(prompt) {
  return typeof prompt === 'string';
}

/** @param {unknown} prompt @param {string} prefix */
function promptStartsWith(prompt, prefix) {
  return isTextPrompt(prompt) && prompt.startsWith(prefix);
}

/** @param {unknown[]} seen @param {string} prefix */
function seenHasPrefix(seen, prefix) {
  return seen.some((prompt) => promptStartsWith(prompt, prefix));
}

/** @param {unknown[]} seen @param {string} prefix */
function seenFindPrefix(seen, prefix) {
  return seen.find((prompt) => promptStartsWith(prompt, prefix));
}

/** @param {unknown[]} seen @param {string} prefix */
function seenFilterPrefix(seen, prefix) {
  return seen.filter((prompt) => promptStartsWith(prompt, prefix));
}

function responseFor(prompt, galleryCount) {
  if (
    prompt
    && typeof prompt === 'object'
    && typeof prompt.system === 'string'
    && prompt.system.startsWith('DRAFT')
  ) {
    return JSON.stringify({ title: '标题', body: '正文', topics: ['甲', '乙', '丙'] });
  }
  if (typeof prompt !== 'string') {
    throw new Error(`意外的提示词：${JSON.stringify(prompt)}`);
  }
  if (prompt.startsWith('PLAN') || prompt.startsWith('COMPAREPLAN')) {
    const imageCount = Number((prompt.match(/COUNT:(\d+)/) || [])[1] || (galleryCount + 1));
    return JSON.stringify(planFrames(prompt, imageCount));
  }
  if (prompt.startsWith('SCENES')) {
    const count = Number((prompt.match(/COUNT:(\d+)/) || [])[1] || 0);
    const body = prompt.split('LINES:')[1] || '';
    const lines = body.split('\n').map((item) => item.trim()).filter((item) => {
      if (!item || item === 'TONE 中性') return false;
      if (item.startsWith('前后接成') || item.startsWith('每一张画面')) return false;
      if (item.startsWith('上一轮返回了')) return false;
      return true;
    });
    const size = count > 0 ? count : lines.length;
    return JSON.stringify({
      scenes: Array.from({ length: size }, (_, index) => `第${index + 1}格画着相连的一件事`),
    });
  }
  throw new Error(`意外的提示词：${prompt}`);
}

/** 固定抽到目录第一项：process、magazine */
function firstPick() {
  return 0;
}

/** 固定抽到 contrast + conceptual（五册时 0.55 → 故事第 2 项、图册第 3 项） */
function contrastPick() {
  return 0.55;
}

function draftArgs(extra = {}) {
  return {
    business: '卖课',
    sampleBody: '',
    references: [],
    galleryCount: 0,
    articleType: '涨粉',
    persona: '素人',
    ...extra,
  };
}

async function untilIdle(runner) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    const latest = runner.loadLatest();
    if (!latest.job.running) return latest;
  }
  throw new Error('任务没有结束');
}

/**
 * @param {ReturnType<typeof createRunner>} runner
 * @param {Record<string, unknown>} [payload]
 */
async function stampAndDraw(runner, payload = { slot: 'cover' }) {
  const started = await runner.generateImages(payload);
  assert.equal(started.ok, true, started.message || 'generateImages');
  return untilIdle(runner);
}

test('空业务一句和超长文章都不会调用模型', async () => {
  const promptsDir = path.join(tempDir(), 'prompts');
  writePrompts(promptsDir);
  let calls = 0;
  let gates = 0;
  const runner = createRunner({
    postsDir: path.join(tempDir(), 'latest'),
    promptsDir,
    random: firstPick,
    requireEntitlement: async () => {
      gates += 1;
    },
    complete: async () => {
      calls += 1;
      return '{}';
    },
  });

  const empty = await runner.generateDraft(draftArgs({ business: '  ', sampleBody: '有文章', galleryCount: 1 }));
  assert.equal(empty.ok, false);
  assert.equal(empty.field, 'business');

  const tooLong = await runner.generateDraft(draftArgs({
    sampleBody: '字'.repeat(8001),
    galleryCount: 1,
  }));
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.field, 'sampleBody');
  assert.equal(runner.loadLatest().id, '');
  assert.equal(calls, 0);
  assert.equal(gates, 0);
});

test('配图张数为 0 时不读配图提示词，重跑成稿仍留着旧图', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  const postsDir = path.join(root, 'latest');
  writePrompts(promptsDir);
  const seen = [];
  const runner = createRunner({
    postsDir,
    promptsDir,
    random: firstPick,
    complete: async (prompt) => {
      seen.push(prompt);
      return responseFor(prompt, 0);
    },
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });

  assert.equal((await runner.generateDraft(draftArgs())).ok, true);
  const drafted = await untilIdle(runner);
  assert.equal(drafted.draft.title, '标题');
  assert.equal(drafted.draft.coverLine, '');
  assert.equal(drafted.articleType, '涨粉');
  assert.equal(drafted.persona, '素人');
  assert.equal(drafted.prompts.cover, '');
  assert.equal(drafted.prompts.look, '');
  assert.equal(drafted.job.running, false);
  assert.equal(seenHasPrefix(seen, 'PLAN'), false);
  assert.equal(seenHasPrefix(seen, 'SCENES'), false);

  assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
  const imaged = await untilIdle(runner);
  assert.equal(imaged.draft.coverLine, '一句');
  assert.equal(imaged.prompts.storyType, 'process');
  assert.equal(imaged.prompts.look, ALBUM_MAGAZINE);
  assertCover(imaged.prompts.cover);
  assert.equal(imaged.prompts.style, STYLE);
  assert.deepEqual(imaged.prompts.gallery, []);
  assert.deepEqual(imaged.prompts.galleryLines, []);
  assert.deepEqual(imaged.prompts.galleryRoles, []);
  assert.equal(seenHasPrefix(seen, 'PLAN'), true);
  assert.equal(seenHasPrefix(seen, 'COMPAREPLAN'), false);
  const art = seenFindPrefix(seen, 'SCENES');
  assert.equal(art.includes('HINT:杂志编辑风，高辨识度大字报，概念插画'), true);
  assert.equal(art.includes('TONE 中性'), true);
  assert.doesNotMatch(art, /手帐拼贴|潮流概念|知识卡片/);
  assert.match(art, /字段只有 scenes|HINT:/);
  assert.doesNotMatch(art, /\{\{background\}\}|\{\{colors\}\}/);
  assert.equal(imaged.job.error, '');
  assert.equal(imaged.images.cover.status, '成功');
  assert.equal(imaged.images.cover.path, 'cover-1.png');
  assert.equal(fs.existsSync(path.join(runner.loadLatest().directory, 'cover-1.png')), true);
  assert.equal(fs.readdirSync(runner.loadLatest().directory).some((name) => name.startsWith('gallery-')), false);

  assert.equal((await runner.generateDraft(draftArgs({ sampleBody: '补充' }))).ok, true);
  assert.equal(fs.existsSync(path.join(runner.loadLatest().directory, 'cover-1.png')), true);
  const again = await untilIdle(runner);
  assert.equal(fs.existsSync(path.join(runner.loadLatest().directory, 'cover-1.png')), true);
  assert.equal(again.images.cover.status, '成功');
  assert.equal(again.images.cover.path, 'cover-1.png');
});

test('提示词条数不对时不生图', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let images = 0;
  let scenesCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'latest'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => {
      if (promptStartsWith(prompt, 'SCENES')) {
        scenesCalls += 1;
        return JSON.stringify({
          scenes: ['只有一张'],
        });
      }
      return responseFor(prompt, 2);
    },
    generateImage: async () => {
      images += 1;
    },
  });
  await runner.generateDraft(draftArgs({ sampleBody: '一篇短文', galleryCount: 2 }));
  await untilIdle(runner);
  assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
  const latest = await untilIdle(runner);
  assert.match(latest.job.error, /画面应为 3 张，模型返回了 1 张/);
  assert.ok(scenesCalls >= 2);
  assert.equal(latest.draft.title, '标题');
  assert.equal(latest.prompts.cover, '');
  assert.equal(images, 0);
});

test('画面条数第一次错、第二次对齐后提示词成功', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let scenesCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'latest'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => {
      if (promptStartsWith(prompt, 'SCENES')) {
        scenesCalls += 1;
        if (scenesCalls === 1) {
          return JSON.stringify({
            scenes: ['多一', '多二', '多三', '多四', '多五', '多六'],
          });
        }
      }
      return responseFor(prompt, 1);
    },
  });
  await runner.generateDraft(draftArgs({ sampleBody: '一篇短文', galleryCount: 1 }));
  await untilIdle(runner);
  runner.generatePrompts();
  const latest = await untilIdle(runner);
  assert.equal(latest.job.error, '');
  assert.equal(scenesCalls, 2);
  assert.equal(latest.prompts.gallery.length, 1);
  assert.match(latest.prompts.cover, /第1格/);
});

test('画面第一次重复、第二次各不相同后提示词成功', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let scenesCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'latest'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => {
      if (promptStartsWith(prompt, 'SCENES')) {
        scenesCalls += 1;
        if (scenesCalls === 1) {
          return JSON.stringify({
            scenes: ['同一张画面', '同一张画面'],
          });
        }
        assert.match(prompt, /每一条画面都不能相同/);
      }
      return responseFor(prompt, 1);
    },
  });
  await runner.generateDraft(draftArgs({ sampleBody: '一篇短文', galleryCount: 1 }));
  await untilIdle(runner);
  runner.generatePrompts();
  const latest = await untilIdle(runner);
  assert.equal(latest.job.error, '');
  assert.equal(scenesCalls, 2);
  assert.equal(latest.prompts.gallery.length, 1);
  assert.match(latest.prompts.cover, /第1格/);
});

test('进行中的第二次调用被拒绝', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'latest'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => {
      calls += 1;
      if (calls === 1) await gate;
      return responseFor(prompt, 0);
    },
  });
  const first = await runner.generateDraft(draftArgs());
  const second = await runner.generateDraft(draftArgs());
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.message, BUSY_MESSAGE);
  assert.equal(second.id, first.id);
  assert.equal(second.job.running, true);
  const started = runner.startNew();
  assert.equal(started.ok, false);
  assert.equal(started.message, BUSY_MESSAGE);
  assert.equal(started.id, first.id);
  assert.equal(started.job.running, true);
  assert.equal(calls, 1);
  release();
  await untilIdle(runner);
});

test('失败的一张可以单独重试，另一张文件不变', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  const postsDir = path.join(root, 'latest');
  writePrompts(promptsDir);
  let coverAttempts = 0;
  const runner = createRunner({
    postsDir,
    promptsDir,
    random: firstPick,
    complete: async (prompt) => responseFor(prompt, 1),
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      if (path.basename(outputPath) === 'cover-1.png') {
        coverAttempts += 1;
        if (coverAttempts === 1) throw new Error('封面失败');
        fs.writeFileSync(outputPath, 'cover-2');
        return;
      }
      fs.writeFileSync(outputPath, 'gallery-bytes');
    },
  });

  await runner.generateDraft(draftArgs({ sampleBody: '素材', galleryCount: 1 }));
  await untilIdle(runner);
  await runner.generateImages({ slot: 'gallery', index: 1 });
  await untilIdle(runner);
  await runner.generateImages({ slot: 'cover' });
  const partial = await untilIdle(runner);
  assert.equal(partial.images.cover.status, '失败');
  assert.equal(partial.images.gallery[0].status, '成功');
  assert.equal(fs.readFileSync(path.join(runner.loadLatest().directory, 'gallery-01-1.png'), 'utf8'), 'gallery-bytes');

  const rejected = await runner.retryImage({ slot: 'gallery', index: 1 });
  assert.equal(rejected.ok, false);

  await runner.retryImage({ slot: 'cover' });
  const retried = await untilIdle(runner);
  assert.equal(retried.images.cover.status, '成功');
  assert.equal(fs.readFileSync(path.join(runner.loadLatest().directory, 'cover-1.png'), 'utf8'), 'cover-2');
  assert.equal(fs.readFileSync(path.join(runner.loadLatest().directory, 'gallery-01-1.png'), 'utf8'), 'gallery-bytes');
  assert.equal(coverAttempts, 2);
});

test('改稿面不删图，也不标成待重算', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  const postsDir = path.join(root, 'latest');
  writePrompts(promptsDir);
  const runner = createRunner({
    postsDir,
    promptsDir,
    random: firstPick,
    complete: async (prompt) => responseFor(prompt, 0),
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  await runner.generateDraft(draftArgs());
  await untilIdle(runner);
  const coverPath = path.join(runner.loadLatest().directory, 'cover-1.png');
  fs.writeFileSync(coverPath, 'old');
  const saved = runner.saveEditor({
    draft: { ...face, title: '新标题' },
  });
  assert.equal(saved.ok, true);
  const edited = runner.loadLatest();
  assert.equal(edited.draft.title, '新标题');
  assert.equal(edited.prompts.stale, false);
  assert.equal(fs.existsSync(coverPath), true);
  assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
});

test('缺密钥时停在对应步骤，稿面还在', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  const postsDir = path.join(root, 'latest');
  writePrompts(promptsDir);
  let fetched = false;
  const runner = createRunner({
    postsDir,
    promptsDir,
    random: firstPick,
    env: {},
    fetch: () => {
      fetched = true;
      throw new Error('不应请求');
    },
    complete: async (prompt) => responseFor(prompt, 0),
  });
  await runner.generateDraft(draftArgs());
  const drafted = await untilIdle(runner);
  assert.equal(drafted.draft.title, '标题');

  const blocked = createRunner({
    postsDir,
    promptsDir,
    random: firstPick,
    env: {},
    fetch: () => {
      fetched = true;
      throw new Error('不应请求');
    },
  });
  assert.equal((await blocked.generateDraft(draftArgs())).ok, true);
  const after = await untilIdle(blocked);
  assert.match(after.job.error, /DEX_BUDDY_API_KEY/);
  assert.equal(after.job.running, false);
  assert.equal(fetched, false);

  fetched = false;
  assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
  const kept = await untilIdle(runner);
  assert.match(kept.job.error, /DEX_BUDDY_API_KEY/);
  assert.equal(kept.draft.title, '标题');
  assertCover(kept.prompts.cover);
  assert.equal(fetched, false);
});

test('成稿、提示词和生图带稳定步骤键，再抽追加 retry', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  /** @type {string[]} */
  const chatKeys = [];
  /** @type {string[]} */
  const imageKeys = [];
  const runner = createRunner({
    postsDir: path.join(root, 'latest'),
    promptsDir,
    random: firstPick,
    complete: async (prompt, options) => {
      chatKeys.push(String(options && options.idempotencyKey || ''));
      return responseFor(prompt, 0);
    },
    generateImage: async ({ outputPath, idempotencyKey }) => {
      imageKeys.push(String(idempotencyKey || ''));
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
      return outputPath;
    },
  });
  await runner.generateDraft(draftArgs());
  await untilIdle(runner);
  assert.match(chatKeys[0], /:copy$/);
  assert.equal(chatKeys.some((key) => key.endsWith(':prompts:plan')), false);
  assert.equal(chatKeys.some((key) => key.endsWith(':prompts:scenes')), false);

  await runner.generateImages({ slot: 'cover' });
  await untilIdle(runner);
  assert.equal(chatKeys.some((key) => key.endsWith(':prompts:plan')), true);
  assert.equal(chatKeys.some((key) => key.endsWith(':prompts:scenes')), true);
  assert.equal(chatKeys.some((key) => key.includes(':retry-')), false);
  assert.match(imageKeys[0], /:cover$/);

  await runner.generateImages({ slot: 'cover' });
  await untilIdle(runner);
  assert.match(imageKeys[1], /:cover:retry-1$/);
});

test('readEnv 在建 runner 时不读，下一轮写稿用新密钥', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  const postsDir = path.join(root, 'latest');
  writePrompts(promptsDir);
  /** @type {Record<string, string>} */
  let env = {};
  let readCalls = 0;
  /** @type {string[]} */
  const auths = [];
  const runner = createRunner({
    postsDir,
    promptsDir,
    random: firstPick,
    readEnv: () => {
      readCalls += 1;
      return env;
    },
    fetch: async (url, options) => {
      auths.push(String(options && options.headers && options.headers.Authorization || ''));
      const u = String(url);
      if (u.includes('/v1/models')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: [{ id: 'dexbuddy-chat', kind: 'chat' }] }),
        };
      }
      if (u.includes('/v1/billing/quote')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            kind: 'chat',
            estimate: '0.0100',
            enough: true,
            balance: '10.0000',
            model: 'dexbuddy-chat',
          }),
        };
      }
      const body = JSON.parse(String(options && options.body || '{}'));
      const messages = Array.isArray(body.messages) ? body.messages : [];
      /** @type {string | { system: string; user: string }} */
      let prompt = '';
      if (messages[0] && messages[0].role === 'system') {
        prompt = {
          system: String(messages[0].content || ''),
          user: String(messages[1] && messages[1].content || ''),
        };
      } else {
        prompt = messages[0] ? String(messages[0].content || '') : '';
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: responseFor(prompt, 0) } }],
        }),
      };
    },
  });
  assert.equal(readCalls, 0);

  assert.equal((await runner.generateDraft(draftArgs())).ok, true);
  const missing = await untilIdle(runner);
  assert.match(missing.job.error, /DEX_BUDDY_API_KEY/);
  assert.ok(readCalls >= 1);
  assert.deepEqual(auths, []);

  const readsBeforeOk = readCalls;
  env = { DEX_BUDDY_API_KEY: 'fresh-key' };
  const started = await runner.generateDraft(draftArgs());
  assert.equal(started.ok, true);
  const ok = await untilIdle(runner);
  assert.equal(ok.draft.title, '标题');
  assert.ok(readCalls > readsBeforeOk);
  assert.ok(auths.length >= 1);
  assert.ok(auths.every((item) => item === 'Bearer fresh-key'));
});

test('打开这一篇时把中断的生成中改成失败，空态不读它', () => {
  const root = tempDir();
  const postsDir = path.join(root, 'posts');
  const id = '20261012-120000';
  const dir = path.join(postsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify({
    business: '卖课',
    article: '',
    galleryCount: 1,
    draft: face,
    prompts: { cover: '封面', gallery: ['配图'], stale: false, basis: { ...face, galleryCount: 1 } },
    images: {
      cover: { status: '生成中', path: '' },
      gallery: [{ status: '成功', path: 'gallery-01.png' }],
    },
    job: { running: true, step: '封面', error: '' },
  }));
  fs.writeFileSync(path.join(postsDir, 'index.json'), JSON.stringify({
    posts: [{ id, createdAt: '2026-10-12T04:00:00.000Z', updatedAt: '2026-10-12T04:00:00.000Z', title: '标题' }],
  }));
  const runner = createRunner({
    postsDir,
    promptsDir: tempDir(),
    complete: async () => '{}',
  });
  const blank = runner.loadLatest();
  assert.equal(blank.id, '');
  assert.equal(blank.draft, null);
  const opened = runner.openPost({ id });
  assert.equal(opened.job.running, false);
  assert.match(opened.job.error, /中断/);
  assert.equal(opened.images.cover.status, '失败');
  assert.equal(opened.images.gallery[0].status, '成功');
});

test('已有 latest 在历史为空时导入一次，打开页面仍是空态', () => {
  const root = tempDir();
  const latestDir = path.join(root, 'latest');
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(path.join(latestDir, 'draft.json'), JSON.stringify({
    business: '旧业务',
    article: '',
    galleryCount: 1,
    draft: face,
  }));
  fs.writeFileSync(path.join(latestDir, 'cover.png'), 'old-cover');
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: tempDir(),
    complete: async () => '{}',
  });
  assert.equal(fs.existsSync(latestDir), false);
  const listed = runner.listPosts();
  assert.equal(listed.posts.length, 1);
  assert.equal(listed.posts[0].postText.startsWith('标题'), true);
  const blank = runner.loadLatest();
  assert.equal(blank.id, '');
  assert.equal(blank.draft, null);
  const opened = runner.openPost({ id: listed.posts[0].id });
  assert.equal(opened.business, '旧业务');
  assert.equal(fs.readFileSync(path.join(opened.directory, 'cover.png'), 'utf8'), 'old-cover');
  const again = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: tempDir(),
    complete: async () => '{}',
  });
  assert.equal(again.listPosts().posts.length, 1);
});

test('历史列表标 hasCover，previewPostCover 按篇读图且不切换当前稿', () => {
  const root = tempDir();
  const postsDir = path.join(root, 'posts');
  const id = '20261022-120000';
  const postDir = path.join(postsDir, id);
  fs.mkdirSync(postDir, { recursive: true });
  fs.writeFileSync(path.join(postDir, 'draft.json'), `${JSON.stringify({
    business: '带封面',
    galleryCount: 0,
    draft: face,
    images: {
      cover: { status: '成功', path: 'cover-1.png', selected: 1, versions: [{ path: 'cover-1.png', revisedAt: 1 }] },
      gallery: [],
    },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(postDir, 'cover-1.png'), 'cover-bytes');
  fs.writeFileSync(path.join(postsDir, 'index.json'), `${JSON.stringify({
    posts: [{ id, createdAt: '2026-10-22T12:00:00.000Z', updatedAt: '2026-10-22T12:00:00.000Z', title: '标题' }],
  }, null, 2)}\n`);
  const runner = createRunner({
    postsDir,
    promptsDir: tempDir(),
    complete: async () => '{}',
  });
  const listed = runner.listPosts();
  assert.equal(listed.posts.length, 1);
  assert.equal(listed.posts[0].hasCover, true);
  const before = runner.loadLatest();
  assert.equal(before.id, '');
  const preview = runner.previewPostCover({ id });
  assert.equal(preview.ok, true);
  assert.match(preview.dataUrl, /^data:image\/png;base64,/);
  const after = runner.loadLatest();
  assert.equal(after.id, '');
  assert.equal(runner.previewPostCover({ id: 'missing' }).ok, false);
});

test('previewHistoryPost 返回文案与图序，不切换当前稿', () => {
  const root = tempDir();
  const postsDir = path.join(root, 'posts');
  const id = '20261022-130000';
  const postDir = path.join(postsDir, id);
  fs.mkdirSync(postDir, { recursive: true });
  fs.writeFileSync(path.join(postDir, 'draft.json'), `${JSON.stringify({
    business: '详情',
    galleryCount: 1,
    draft: face,
    images: {
      cover: { status: '成功', path: 'cover-1.png', selected: 1, versions: [{ path: 'cover-1.png', revisedAt: 1 }] },
      gallery: [
        { status: '成功', path: 'gallery-01-1.png', selected: 1, versions: [{ path: 'gallery-01-1.png', revisedAt: 1 }] },
      ],
    },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(postDir, 'cover-1.png'), 'cover-bytes');
  fs.writeFileSync(path.join(postDir, 'gallery-01-1.png'), 'gallery-bytes');
  fs.writeFileSync(path.join(postsDir, 'index.json'), `${JSON.stringify({
    posts: [{ id, createdAt: '2026-10-22T13:00:00.000Z', updatedAt: '2026-10-22T13:00:00.000Z', title: '标题' }],
  }, null, 2)}\n`);
  const runner = createRunner({
    postsDir,
    promptsDir: tempDir(),
    complete: async () => '{}',
  });
  assert.equal(runner.loadLatest().id, '');
  const detail = runner.previewHistoryPost({ id });
  assert.equal(detail.ok, true);
  assert.equal(detail.title, '标题');
  assert.equal(detail.body, '正文');
  assert.deepEqual(detail.topics, ['甲', '乙', '丙']);
  assert.equal(detail.postText.startsWith('标题'), true);
  assert.equal(detail.createdAt, '2026-10-22T13:00:00.000Z');
  assert.equal(detail.images.length, 2);
  assert.equal(detail.images[0].key, 'cover');
  assert.equal(detail.images[1].key, 'gallery-1');
  assert.match(detail.images[0].dataUrl, /^data:image\/png;base64,/);
  assert.equal(runner.loadLatest().id, '');
  assert.equal(runner.previewHistoryPost({ id: 'missing' }).ok, false);
});

test('revealPost 按篇打开第一张图，不切换当前稿', () => {
  const root = tempDir();
  const postsDir = path.join(root, 'posts');
  const id = '20261022-130000';
  const emptyId = '20261022-140000';
  const postDir = path.join(postsDir, id);
  const emptyDir = path.join(postsDir, emptyId);
  fs.mkdirSync(postDir, { recursive: true });
  fs.mkdirSync(emptyDir, { recursive: true });
  fs.writeFileSync(path.join(postDir, 'draft.json'), `${JSON.stringify({
    business: '详情',
    galleryCount: 1,
    draft: face,
    images: {
      cover: { status: '成功', path: 'cover-1.png', selected: 1, versions: [{ path: 'cover-1.png', revisedAt: 1 }] },
      gallery: [
        { status: '成功', path: 'gallery-01-1.png', selected: 1, versions: [{ path: 'gallery-01-1.png', revisedAt: 1 }] },
      ],
    },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(postDir, 'cover-1.png'), 'cover-bytes');
  fs.writeFileSync(path.join(postDir, 'gallery-01-1.png'), 'gallery-bytes');
  fs.writeFileSync(path.join(emptyDir, 'draft.json'), `${JSON.stringify({
    business: '空图',
    galleryCount: 0,
    draft: face,
    images: { cover: { status: '空', path: '', selected: 0, versions: [] }, gallery: [] },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(postsDir, 'index.json'), `${JSON.stringify({
    posts: [
      { id, createdAt: '2026-10-22T13:00:00.000Z', updatedAt: '2026-10-22T13:00:00.000Z', title: '标题' },
      { id: emptyId, createdAt: '2026-10-22T14:00:00.000Z', updatedAt: '2026-10-22T14:00:00.000Z', title: '空图' },
    ],
  }, null, 2)}\n`);
  /** @type {string[]} */
  const revealed = [];
  const runner = createRunner({
    postsDir,
    promptsDir: tempDir(),
    complete: async () => '{}',
    revealFile: (absPath) => {
      revealed.push(absPath);
    },
  });
  assert.equal(runner.loadLatest().id, '');
  const shown = runner.revealPost({ id });
  assert.equal(shown.ok, true);
  assert.equal(shown.path, path.join(postDir, 'cover-1.png'));
  assert.deepEqual(revealed, [path.join(postDir, 'cover-1.png')]);
  assert.equal(runner.loadLatest().id, '');
  assert.equal(runner.revealPost({ id: 'missing' }).ok, false);
  const empty = runner.revealPost({ id: emptyId });
  assert.equal(empty.ok, false);
  assert.match(empty.message, /没有这张图/);
  assert.equal(revealed.length, 1);
});

test('连续生成两篇，空态不打开历史第一篇', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let tick = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    now: () => new Date(Date.UTC(2026, 9, 12, 8, 0, tick++)),
    complete: async (prompt) => responseFor(prompt, 0),
  });
  await runner.generateDraft(draftArgs({ business: '第一篇' }));
  const first = await untilIdle(runner);
  runner.startNew();
  const blank = runner.loadLatest();
  assert.equal(blank.id, '');
  assert.equal(blank.draft, null);
  await runner.generateDraft(draftArgs({ business: '第二篇' }));
  const second = await untilIdle(runner);
  assert.notEqual(first.id, second.id);
  assert.equal(second.business, '第二篇');
  const listed = runner.listPosts();
  assert.equal(listed.posts.length, 2);
  assert.equal(listed.posts[0].id, second.id);
  const opened = runner.openPost({ id: first.id });
  assert.equal(opened.draft.title, '标题');
  assert.equal(opened.business, '第一篇');
  assert.equal(fs.existsSync(path.join(root, 'posts', first.id, 'draft.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'posts', second.id, 'draft.json')), true);
});

test('稿里存着指定句时，封面那句话仍由策划写出', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const seen = [];
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => {
      seen.push(prompt);
      return responseFor(prompt, 0);
    },
  });

  await runner.generateDraft(draftArgs({
    coverLineSpecified: '  我指定的  ',
  }));
  const drafted = await untilIdle(runner);
  assert.equal(drafted.coverLineSpecified, '我指定的');
  assert.equal(drafted.draft.coverLine, '');
  assert.equal(seenHasPrefix(seen, 'PLAN'), false);
  runner.generatePrompts();
  const stamped = await untilIdle(runner);
  assert.equal(stamped.draft.coverLine, '一句');
  assertCover(stamped.prompts.cover);
  assert.equal(stamped.prompts.style, STYLE);
  assert.equal(seenHasPrefix(seen, 'PLAN'), true);
});

test('不带槽位不能生图，再抽只换这一张', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  const postsDir = path.join(root, 'posts');
  writePrompts(promptsDir);
  const seen = [];
  const runner = createRunner({
    postsDir,
    promptsDir,
    random: firstPick,
    complete: async (prompt) => responseFor(prompt, 1),
    generateImage: async ({ prompt, outputPath }) => {
      seen.push(prompt);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, prompt);
    },
  });
  await runner.generateDraft(draftArgs({ galleryCount: 1 }));
  await untilIdle(runner);
  const missing = await runner.generateImages({});
  assert.equal(missing.ok, false);
  assert.equal(missing.message, '要指明封面或配图序号');

  await runner.generateImages({ slot: 'gallery', index: 1 });
  await untilIdle(runner);
  await runner.generateImages({ slot: 'cover' });
  const first = await untilIdle(runner);
  assert.equal(first.images.cover.status, '成功');
  assert.equal(first.images.gallery[0].status, '成功');
  const galleryBytes = fs.readFileSync(path.join(first.directory, 'gallery-01-1.png'), 'utf8');
  const coverBytes = fs.readFileSync(path.join(first.directory, 'cover-1.png'), 'utf8');

  const cleared = runner.saveEditor({
    prompts: { cover: first.prompts.cover, gallery: [''] },
  });
  assert.equal(cleared.ok, true);
  const emptyGallery = await runner.generateImages({ slot: 'gallery', index: 1 });
  assert.equal(emptyGallery.ok, false);
  assert.equal(emptyGallery.message, '还没有这一张的提示词');
  const coverStill = await runner.generateImages({
    slot: 'cover',
    prompts: { cover: '改过的封面提示词', gallery: [''] },
  });
  assert.equal(coverStill.ok, true);
  const redrawn = await untilIdle(runner);
  assert.equal(redrawn.images.cover.status, '成功');
  assert.equal(redrawn.images.cover.path, 'cover-2.png');
  assert.equal(redrawn.images.cover.selected, 2);
  assert.equal(redrawn.images.cover.versions.length, 2);
  assert.ok(redrawn.images.cover.revisedAt > first.images.cover.revisedAt);
  assert.equal(fs.readFileSync(path.join(redrawn.directory, 'cover-1.png'), 'utf8'), coverBytes);
  assert.equal(fs.readFileSync(path.join(redrawn.directory, 'cover-2.png'), 'utf8'), '改过的封面提示词');
  assert.equal(fs.readFileSync(path.join(redrawn.directory, 'gallery-01-1.png'), 'utf8'), galleryBytes);
  const chosen = runner.chooseImage({ slot: 'cover', version: 1 });
  assert.equal(chosen.ok, true);
  const picked = runner.loadLatest();
  assert.equal(picked.images.cover.path, 'cover-1.png');
  assert.equal(picked.images.cover.selected, 1);
  assert.equal(picked.images.cover.versions.length, 2);
  assert.equal(seen.includes('改过的封面提示词'), true);
});

test('目的或人设不在允许列表时不调用模型', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let calls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    complete: async () => {
      calls += 1;
      return '{}';
    },
  });
  const rejected = await runner.generateDraft(draftArgs({ articleType: '官号', persona: '素人' }));
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /文章目的不在允许列表/);
  assert.equal(calls, 0);
  const badPersona = await runner.generateDraft(draftArgs({ articleType: '涨粉', persona: '营销号' }));
  assert.equal(badPersona.ok, false);
  assert.match(badPersona.message, /人设不在允许列表/);
});

test('抽到对比时用对比规则写句子，配图张数为 0 时仍有封面', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const seen = [];
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: contrastPick,
    complete: async (prompt) => {
      seen.push(prompt);
      return responseFor(prompt, 0);
    },
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  await runner.generateDraft(draftArgs());
  const drafted = await untilIdle(runner);
  assert.equal(drafted.draft.title, '标题');
  assert.equal(drafted.prompts.look, '');
  assert.equal(seenHasPrefix(seen, 'COMPAREPLAN'), false);
  assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
  const imaged = await untilIdle(runner);
  assert.equal(imaged.prompts.storyType, 'contrast');
  assert.equal(imaged.prompts.look, ALBUM_CONCEPTUAL);
  assertCover(imaged.prompts.cover, '一句', ALBUM_CONCEPTUAL);
  assert.equal(imaged.prompts.style.includes('潮流概念插画风'), true);
  assert.equal(imaged.draft.coverLine, '一句');
  assert.equal(seenHasPrefix(seen, 'COMPAREPLAN'), true);
  assert.equal(seenHasPrefix(seen, 'PLAN'), false);
  assert.equal(imaged.prompts.gallery.length, 0);
  assert.equal(imaged.images.cover.status, '成功');
  assert.equal(fs.existsSync(path.join(imaged.directory, 'cover-1.png')), true);
});

test('抽到对比后配图角色是对照', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: contrastPick,
    complete: async (prompt) => responseFor(prompt, 1),
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  await runner.generateDraft(draftArgs({ galleryCount: 1 }));
  const drafted = await untilIdle(runner);
  assert.equal(drafted.draft.title, '标题');
  assert.equal((await runner.generateImages({ slot: 'gallery', index: 1 })).ok, true);
  const imaged = await untilIdle(runner);
  assert.equal(imaged.prompts.storyType, 'contrast');
  assert.deepEqual(imaged.prompts.galleryRoles, ['contrast']);
  assert.equal(imaged.prompts.gallery[0].includes(imaged.prompts.galleryLines[0]), true);
  assert.equal(imaged.images.gallery[0].status, '成功');
  assert.equal(fs.existsSync(path.join(imaged.directory, 'gallery-01-1.png')), true);
});

test('有样图时生图带上 template 参考路径；无样图不传 references', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const samplePath = path.join(promptsDir, 'samples', `${ALBUM_MAGAZINE}.jpg`);
  fs.mkdirSync(path.dirname(samplePath), { recursive: true });
  fs.writeFileSync(samplePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  /** @type {unknown[]} */
  const seen = [];
  const withSample = createRunner({
    postsDir: path.join(root, 'posts-a'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => responseFor(prompt, 0),
    generateImage: async (args) => {
      seen.push(args);
      fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
      fs.writeFileSync(args.outputPath, 'png');
    },
  });
  await withSample.generateDraft(draftArgs({ galleryCount: 0 }));
  await untilIdle(withSample);
  assert.equal((await withSample.generateImages({ slot: 'cover' })).ok, true);
  await untilIdle(withSample);
  assert.equal(seen.length, 1);
  const first = /** @type {{ references?: { role: string; path: string }[]; prompt: string }} */ (seen[0]);
  assert.deepEqual(first.references, [{ role: 'template', path: samplePath }]);
  assert.match(first.prompt, /第一张是版式模板参考图/);
  assert.doesNotMatch(first.prompt, /@template/);
  const drafted = withSample.loadLatest();
  assert.doesNotMatch(drafted.prompts.cover, /【参考图】|第一张是|@template/);

  fs.rmSync(samplePath, { force: true });
  seen.length = 0;
  const noSample = createRunner({
    postsDir: path.join(root, 'posts-b'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => responseFor(prompt, 0),
    generateImage: async (args) => {
      seen.push(args);
      fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
      fs.writeFileSync(args.outputPath, 'png');
    },
  });
  await noSample.generateDraft(draftArgs({ galleryCount: 0 }));
  await untilIdle(noSample);
  assert.equal((await noSample.generateImages({ slot: 'cover' })).ok, true);
  await untilIdle(noSample);
  assert.equal(seen.length, 1);
  const second = /** @type {{ references?: unknown; prompt: string }} */ (seen[0]);
  assert.equal(Object.prototype.hasOwnProperty.call(second, 'references'), false);
  assert.doesNotMatch(second.prompt, /【参考图】|第一张是/);
});

test('重算提示词可固定图册，并列出图册目录', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  fs.mkdirSync(path.join(promptsDir, 'samples'), { recursive: true });
  fs.writeFileSync(path.join(promptsDir, 'samples', `${ALBUM_INFOGRAPHIC}.jpg`), 'jpg');
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: () => 0.9,
    complete: async (prompt) => responseFor(prompt, 1),
  });
  const listed = runner.listAlbums();
  assert.equal(listed.ok, true);
  assert.equal(listed.albums.length, 5);
  assert.equal(listed.albums[0].id, ALBUM_MAGAZINE);
  assert.equal(listed.albums[4].hasSample, true);
  assert.equal(listed.albums[0].hasSample, false);
  const sample = runner.previewAlbumSample({ id: ALBUM_INFOGRAPHIC });
  assert.equal(sample.ok, true);
  assert.match(sample.dataUrl, /^data:image\/jpeg;base64,/);
  const detail = runner.getAlbumDetail({ id: ALBUM_CARD });
  assert.equal(detail.ok, true);
  assert.equal(detail.id, ALBUM_CARD);
  assert.equal(detail.label, '强对比知识卡片风');
  assert.match(detail.promptTemplate, /11\. 主题绘画内容/);
  assert.match(detail.promptTemplate, /\{\{mainTitle\}\}/);
  assert.equal(runner.getAlbumDetail({ id: 'nope' }).ok, false);

  await runner.generateDraft(draftArgs({ galleryCount: 1 }));
  const first = await untilIdle(runner);
  assert.equal(first.prompts.look, '');

  assert.equal(runner.generatePrompts({ look: 'not-an-album' }).ok, false);
  runner.generatePrompts({ look: ALBUM_CARD });
  const next = await untilIdle(runner);
  assert.equal(next.prompts.look, ALBUM_CARD);
  assert.equal(next.prompts.style, '强对比知识卡片风');
  assert.match(next.prompts.cover, /#FFF8F0/);
  assert.equal(next.draft.title, '标题');
});

test('旧规则版本的封面打开时不删图，也不标成待重算', () => {
  const root = tempDir();
  const postsDir = path.join(root, 'posts');
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const id = '20261013-181604';
  const dir = path.join(postsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'cover.png'), 'png');
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify({
    business: '卖课',
    article: '',
    galleryCount: 1,
    draft: face,
    prompts: {
      cover: '旧封面提示词',
      gallery: ['配图'],
      look: 'magazine',
      stale: false,
      basis: { ...face, coverLineSpecified: '', galleryCount: 1 },
    },
    images: {
      cover: { status: '成功', path: 'cover.png' },
      gallery: [{ status: '成功', path: 'gallery-01.png' }],
    },
    job: { running: false, step: '', error: '' },
  }));
  fs.writeFileSync(path.join(postsDir, 'index.json'), JSON.stringify({
    posts: [{ id, createdAt: '2026-10-13T10:00:00.000Z', updatedAt: '2026-10-13T10:00:00.000Z', title: '标题' }],
  }));
  const runner = createRunner({
    postsDir,
    promptsDir,
    complete: async () => '{}',
  });
  const opened = runner.openPost({ id });
  assert.equal(opened.prompts.stale, false);
  assert.equal(opened.prompts.look, ALBUM_MAGAZINE);
  assert.equal(opened.images.cover.status, '成功');
  assert.equal(fs.existsSync(path.join(dir, 'cover.png')), true);
  assert.equal(runner.loadLatest().images.cover.status, '成功');
});

test('一张系列图是总结，多张时前面是节拍且只调用一次系列', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  const seen = [];
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => {
      seen.push(prompt);
      return responseFor(prompt, 1);
    },
  });
  writePrompts(promptsDir);
  await runner.generateDraft(draftArgs({ galleryCount: 1 }));
  await untilIdle(runner);
  runner.generatePrompts();
  const one = await untilIdle(runner);
  assert.equal(one.prompts.storyType, 'process');
  assert.equal(one.prompts.look, ALBUM_MAGAZINE);
  assert.deepEqual(one.prompts.galleryRoles, ['summary']);
  assert.equal(one.prompts.galleryLines.length, 1);
  assert.notEqual(one.prompts.galleryLines[0], one.draft.coverLine);
  assert.equal(one.prompts.gallery[0].includes(one.prompts.galleryLines[0]), true);
  const plan = seenFilterPrefix(seen, 'PLAN');
  assert.equal(plan.length, 1);
  assert.match(plan[0], /1 opening\n2 summary/);
  assert.match(plan[0], /TONE 中性/);
  assert.match(plan[0], /大字报一行/);
  const artCalls = seenFilterPrefix(seen, 'SCENES');
  assert.equal(artCalls.length, 1);
  assert.match(artCalls[0], /第1拍/);
  assert.match(artCalls[0], /HINT:杂志编辑风/);
  assert.match(artCalls[0], /前后接成一个故事/);
  assert.match(artCalls[0], /TONE 中性/);
  assert.doesNotMatch(artCalls[0], /\{\{background\}\}|\{\{colors\}\}/);

  seen.length = 0;
  runner.generatePrompts({ galleryCount: 8 });
  const eight = await untilIdle(runner);
  assert.equal(eight.prompts.galleryRoles.length, 8);
  assert.deepEqual(eight.prompts.galleryRoles.slice(0, 7), Array.from({ length: 7 }, () => 'point'));
  assert.equal(eight.prompts.galleryRoles[7], 'summary');
  assert.equal(eight.prompts.gallery.length, 8);
  assert.equal(eight.prompts.galleryLines.length, 8);
  assert.equal(new Set(eight.prompts.galleryLines).size, 8);
  const slots = seenFindPrefix(seen, 'PLAN');
  assert.match(slots, /1 opening\n2 point\n3 point\n4 point\n5 point\n6 point\n7 point\n8 point\n9 summary/);
  assert.equal(seenFilterPrefix(seen, 'SCENES').length, 1);
});

test('第一次 scenes 失败时不把未完成的头图写成成功结果', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  fs.rmSync(path.join(promptsDir, 'article-image', 'scenes.md'));
  let images = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => responseFor(prompt, 1),
    generateImage: async () => {
      images += 1;
    },
  });
  await runner.generateDraft(draftArgs({ galleryCount: 1 }));
  await untilIdle(runner);
  assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
  const failed = await untilIdle(runner);
  assert.match(failed.job.error, /找不到提示词文件|未知提示词文件/);
  assert.equal(failed.draft.title, '标题');
  assert.equal(failed.prompts.cover, '');
  assert.equal(failed.prompts.storyType, '');
  assert.equal(failed.prompts.look, '');
  assert.equal(failed.prompts.stale, false);
  assert.equal(images, 0);
});

test('系列句子不合格时不生图', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const cases = [
    [{ lines: ['一句', ''] }, /策划那一句是空的/, 1],
    [{ lines: ['一句', '甲', '甲'] }, /策划那一句重复了/, 2],
    [{ lines: ['一句', '一句'] }, /策划那一句重复了/, 1],
    [{ scenes: ['有画', ''] }, /这一张的画面是空的/, 1],
  ];
  for (const [body, pattern, galleryCount] of cases) {
    const runner = createRunner({
      postsDir: path.join(tempDir(), 'posts'),
      promptsDir,
    random: firstPick,
      complete: async (prompt) => {
        if (promptStartsWith(prompt, 'PLAN') && body.lines) return JSON.stringify(body);
        if (promptStartsWith(prompt, 'SCENES') && body.scenes) {
          return JSON.stringify({
            scenes: body.scenes,
          });
        }
        return responseFor(prompt, galleryCount);
      },
      generateImage: async () => {
        throw new Error('不应生图');
      },
    });
    await runner.generateDraft(draftArgs({ galleryCount }));
    await untilIdle(runner);
    assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
    const failed = await untilIdle(runner);
    assert.match(failed.job.error, pattern);
    assert.equal(failed.prompts.cover, '');
  }
});

test('张数变少后多出来的配图文件还留着', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    complete: async (prompt) => responseFor(prompt, 2),
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  await runner.generateDraft(draftArgs({ galleryCount: 2 }));
  await untilIdle(runner);
  await runner.generateImages({ slot: 'gallery', index: 1 });
  await untilIdle(runner);
  await runner.generateImages({ slot: 'gallery', index: 2 });
  const imaged = await untilIdle(runner);
  const dir = imaged.directory;
  assert.equal(fs.existsSync(path.join(dir, 'gallery-01-1.png')), true);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-02-1.png')), true);

  const saved = runner.saveEditor({ galleryCount: 0 });
  assert.equal(saved.ok, true);
  assert.equal(runner.loadLatest().prompts.stale, false);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-01-1.png')), true);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-02-1.png')), true);

  await runner.generateDraft(draftArgs());
  await untilIdle(runner);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-01-1.png')), true);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-02-1.png')), true);
  assert.equal(runner.loadLatest().images.gallery[0].path, 'gallery-01-1.png');
});

/** 过文件头校验的最小 JPEG（须 ≥12 字节） */
const TINY_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.alloc(20, 0),
  Buffer.from([0xff, 0xd9]),
]);

test('上传参考默认勾全槽；取消勾选后该槽不带；删除清文件不覆盖旧图', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const samplePath = path.join(promptsDir, 'albums', ALBUM_CONCEPTUAL, 'sample.jpg');
  fs.mkdirSync(path.dirname(samplePath), { recursive: true });
  fs.writeFileSync(samplePath, TINY_JPEG);
  /** @type {unknown[]} */
  const seen = [];
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    userUploadRefsDir: path.join(root, 'runtime', 'materials', 'upload-refs'),
    random: () => 0.5,
    complete: async (prompt) => responseFor(prompt, 0),
    generateImage: async (args) => {
      seen.push(args);
      fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
      fs.writeFileSync(args.outputPath, 'png');
    },
  });
  await runner.generateDraft(draftArgs({ galleryCount: 1 }));
  await untilIdle(runner);

  const emptyUsage = runner.addUploadRef({
    dataUrl: `data:image/jpeg;base64,${TINY_JPEG.toString('base64')}`,
    usage: '',
  });
  assert.equal(emptyUsage.ok, false);

  const added = runner.addUploadRef({
    dataUrl: `data:image/jpeg;base64,${TINY_JPEG.toString('base64')}`,
    usage: '人物照片。按 Hero 放在画面中央，锁脸。',
  });
  assert.equal(added.ok, true);
  const materialId = added.uploadRef.id;
  assert.deepEqual(added.picks.cover.materialIds, [materialId]);
  assert.deepEqual(added.picks.gallery[0].materialIds, [materialId]);
  const postDir = runner.loadLatest().directory;
  assert.equal(
    fs.existsSync(path.join(postDir, 'materials', 'upload-refs', added.uploadRef.fileName)),
    true,
  );

  assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
  await untilIdle(runner);
  assert.equal(seen.length, 1);
  const coverArgs = /** @type {{ references?: { role: string; path: string; usage?: string }[]; prompt: string }} */ (seen[0]);
  assert.equal(coverArgs.references && coverArgs.references.length, 2);
  assert.equal(coverArgs.references[0].role, 'template');
  assert.equal(coverArgs.references[1].role, 'upload-ref');
  assert.equal(coverArgs.references[1].usage, '人物照片。按 Hero 放在画面中央，锁脸。');
  assert.match(coverArgs.prompt, /第二张是人物照片。按 Hero 放在画面中央，锁脸。/);
  assert.match(coverArgs.prompt, /必须使用【参考图】中版式模板之后列出的上传参考图/);
  assert.doesNotMatch(coverArgs.prompt, /【主体空位】/);

  const afterCover = runner.loadLatest();
  const coverFile = afterCover.images.cover.path;
  assert.ok(coverFile);

  runner.setSlotPick({ slot: 'gallery', index: 1, materialIds: [], overrides: {} });
  seen.length = 0;
  assert.equal((await runner.generateImages({ slot: 'gallery', index: 1 })).ok, true);
  await untilIdle(runner);
  const galleryArgs = /** @type {{ references?: { role: string; usage?: string }[] }} */ (seen[0]);
  assert.equal(galleryArgs.references && galleryArgs.references.length, 1);
  assert.equal(galleryArgs.references[0].role, 'template');

  const still = runner.loadLatest();
  assert.equal(still.images.cover.path, coverFile);
  assert.equal(fs.existsSync(path.join(still.directory, coverFile)), true);

  const removed = runner.deleteUploadRef({ id: materialId });
  assert.equal(removed.ok, true);
  assert.equal(removed.uploadRefs.length, 0);
  assert.deepEqual(removed.picks.cover.materialIds, []);
  assert.equal(fs.existsSync(path.join(still.directory, 'materials', 'upload-refs', added.uploadRef.fileName)), false);
});

test('纯文字图册任意用法句可勾选并走 compose', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const metaPath = path.join(promptsDir, 'albums', ALBUM_MAGAZINE, 'album.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.hint = '纯文字，无插画，只排版。';
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  const { clearAlbumCatalogCache } = require('../../src/prompts/fill');
  clearAlbumCatalogCache(promptsDir);

  /** @type {string[]} */
  const seenPrompts = [];
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => responseFor(prompt, 0),
    generateImage: async ({ prompt, outputPath }) => {
      seenPrompts.push(String(prompt || ''));
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  await runner.generateDraft(draftArgs({ galleryCount: 0 }));
  await untilIdle(runner);

  const person = runner.addUploadRef({
    dataUrl: `data:image/jpeg;base64,${TINY_JPEG.toString('base64')}`,
    usage: '换成我的这个表情',
  });
  assert.equal(person.ok, true);
  const pickOk = runner.setSlotPick({
    slot: 'cover',
    materialIds: [person.uploadRef.id],
    overrides: {},
  });
  assert.equal(pickOk.ok, true);
  const allowed = await runner.generateImages({ slot: 'cover' });
  assert.equal(allowed.ok, true);
  await untilIdle(runner);
  assert.equal(runner.loadLatest().prompts.look, ALBUM_MAGAZINE);
  assert.ok(seenPrompts.length >= 1);
  assert.match(seenPrompts[seenPrompts.length - 1], /纯文字图：只画背景/);
  assert.match(seenPrompts[seenPrompts.length - 1], /换成我的这个表情/);
});
test('资料库可直建上传参考，不依赖当前篇', () => {
  const root = tempDir();
  const materialsDir = path.join(root, 'runtime', 'materials', 'upload-refs');
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: path.join(root, 'prompts'),
    userUploadRefsDir: materialsDir,
    complete: async () => '{}',
  });
  // 没有打开任何笔记时，篇内上传应失败，直写库应成功
  const needPost = runner.addUploadRef({
    dataUrl: `data:image/jpeg;base64,${TINY_JPEG.toString('base64')}`,
    usage: '实物照片。放在右下角。',
  });
  assert.equal(needPost.ok, false);
  const emptyUsage = runner.addLibraryUploadRef({
    dataUrl: `data:image/jpeg;base64,${TINY_JPEG.toString('base64')}`,
    usage: '',
  });
  assert.equal(emptyUsage.ok, false);
  const badImage = runner.addLibraryUploadRef({
    dataUrl: 'data:text/plain;base64,aGk=',
    usage: '实物照片。放在右下角。',
  });
  assert.equal(badImage.ok, false);
  const saved = runner.addLibraryUploadRef({
    dataUrl: `data:image/jpeg;base64,${TINY_JPEG.toString('base64')}`,
    usage: '实物照片。放在右下角。',
  });
  assert.equal(saved.ok, true);
  assert.ok(saved.id);
  const listed = runner.listLibraryUploadRefs();
  assert.equal(listed.ok, true);
  assert.equal(listed.uploadRefs.length, 1);
  assert.equal(listed.uploadRefs[0].id, saved.id);
  assert.equal(listed.uploadRefs[0].usage, '实物照片。放在右下角。');
  assert.equal(fs.existsSync(path.join(materialsDir, saved.id, 'meta.json')), true);
});

test('存进库与从库挑复制用法句，挑入后默认勾全槽', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  const materialsDir = path.join(root, 'runtime', 'materials', 'upload-refs');
  writePrompts(promptsDir);
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    userUploadRefsDir: materialsDir,
    complete: async (prompt) => responseFor(prompt, 0),
  });
  await runner.generateDraft(draftArgs({ galleryCount: 0 }));
  await untilIdle(runner);
  const added = runner.addUploadRef({
    dataUrl: `data:image/jpeg;base64,${TINY_JPEG.toString('base64')}`,
    usage: '实物照片。放在右下角。',
  });
  assert.equal(added.ok, true);
  const saved = runner.saveUploadRefToLibrary({ id: added.uploadRef.id });
  assert.equal(saved.ok, true);
  const listed = runner.listLibraryUploadRefs();
  assert.equal(listed.ok, true);
  assert.equal(listed.uploadRefs.length, 1);
  assert.equal(listed.uploadRefs[0].usage, '实物照片。放在右下角。');

  runner.startNew();
  await runner.generateDraft(draftArgs({ galleryCount: 0 }));
  await untilIdle(runner);
  const picked = runner.pickLibraryUploadRef({ id: saved.id });
  assert.equal(picked.ok, true);
  assert.equal(picked.uploadRef.usage, '实物照片。放在右下角。');
  assert.deepEqual(picked.picks.cover.materialIds, [picked.uploadRef.id]);
});

test('范文库可新建、列表与删除', () => {
  const root = tempDir();
  const samplesDir = path.join(root, 'runtime', 'materials', 'article-samples');
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: path.join(root, 'prompts'),
    userArticleSamplesDir: samplesDir,
    complete: async () => '{}',
  });
  writePrompts(path.join(root, 'prompts'));
  const saved = runner.saveLibraryArticleSample({
    title: '引流骨架',
    body: '钩子一句。\n三点干货。',
  });
  assert.equal(saved.ok, true);
  assert.ok(saved.sample.id);
  assert.equal(saved.sample.title, '引流骨架');
  const listed = runner.listLibraryArticleSamples();
  assert.equal(listed.ok, true);
  assert.equal(listed.samples.length, 1);
  const got = runner.getLibraryArticleSample({ id: saved.sample.id });
  assert.equal(got.ok, true);
  assert.match(got.sample.body, /钩子一句/);
  assert.equal(fs.existsSync(path.join(samplesDir, saved.sample.id, 'meta.json')), true);
  const deleted = runner.deleteLibraryArticleSample({ id: saved.sample.id });
  assert.equal(deleted.ok, true);
  assert.equal(runner.listLibraryArticleSamples().samples.length, 0);
});

test('一篇可囤超过 9 张；每槽勾选第 10 张被拒', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    complete: async (prompt) => responseFor(prompt, 0),
  });
  await runner.generateDraft(draftArgs({ galleryCount: 0 }));
  await untilIdle(runner);
  const dataUrl = `data:image/jpeg;base64,${TINY_JPEG.toString('base64')}`;
  /** @type {string[]} */
  const ids = [];
  for (let i = 0; i < 10; i += 1) {
    const added = runner.addUploadRef({
      dataUrl,
      usage: `参考 ${i + 1}。放在角落。`,
    });
    assert.equal(added.ok, true, `第 ${i + 1} 张应能囤进池`);
    ids.push(added.uploadRef.id);
  }
  assert.equal(runner.loadLatest().uploadRefs.length, 10);
  const nine = runner.setSlotPick({
    slot: 'cover',
    materialIds: ids.slice(0, 9),
  });
  assert.equal(nine.ok, true);
  const ten = runner.setSlotPick({
    slot: 'cover',
    materialIds: ids,
  });
  assert.equal(ten.ok, false);
  assert.match(ten.message, /最多勾 9/);
});

test('模型助手是 Dex Buddy SDK 1.0.0', () => {
  const sdk = require('../../lib/dex-buddy-sdk');
  assert.equal(sdk.SDK_VERSION, '1.0.0');
  assert.equal(typeof sdk.requireEntitlement, 'function');
  assert.equal(typeof sdk.bindModels, 'function');
});

test('未买断或未登录时写成笔记和刷图不进入进行中', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let gates = 0;
  let entitled = true;
  let failCode = 'NOT_ENTITLED';
  let failImage = false;
  let modelCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    requireEntitlement: async () => {
      gates += 1;
      if (entitled) return;
      const err = new Error(failCode === 'NOT_ENTITLED' ? '尚未买断该插件' : '未登录');
      /** @type {{ code?: string }} */ (err).code = failCode;
      throw err;
    },
    complete: async (prompt) => {
      modelCalls += 1;
      return responseFor(prompt, 0);
    },
    generateImage: async ({ outputPath }) => {
      modelCalls += 1;
      if (failImage) throw new Error('封面失败');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });

  entitled = false;
  const blockedDraft = await runner.generateDraft(draftArgs());
  assert.equal(blockedDraft.ok, false);
  assert.equal(blockedDraft.silenced, true);
  assert.equal(blockedDraft.message, undefined);
  assert.equal(runner.loadLatest().job.running, false);
  assert.equal(runner.loadLatest().id, '');
  assert.equal(modelCalls, 0);
  assert.equal(gates, 1);

  failCode = 'UNAUTHORIZED';
  const blockedLogin = await runner.generateDraft(draftArgs());
  assert.equal(blockedLogin.ok, false);
  assert.equal(blockedLogin.silenced, true);
  assert.equal(runner.loadLatest().job.running, false);
  assert.equal(modelCalls, 0);
  assert.equal(gates, 2);

  entitled = true;
  assert.equal((await runner.generateDraft(draftArgs())).ok, true);
  await untilIdle(runner);
  assert.equal(runner.loadLatest().job.running, false);
  assert.ok(modelCalls >= 1);

  const gatesAfterDraft = gates;
  const missingSlot = await runner.generateImages({});
  assert.equal(missingSlot.ok, false);
  assert.equal(gates, gatesAfterDraft);

  entitled = false;
  failCode = 'NOT_ENTITLED';
  const modelsBeforeImage = modelCalls;
  const blockedImage = await runner.generateImages({ slot: 'cover' });
  assert.equal(blockedImage.ok, false);
  assert.equal(blockedImage.silenced, true);
  assert.equal(runner.loadLatest().job.running, false);
  assert.notEqual(runner.loadLatest().images.cover.status, '生成中');
  assert.equal(modelCalls, modelsBeforeImage);

  entitled = true;
  failImage = true;
  assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
  await untilIdle(runner);
  assert.equal(runner.loadLatest().images.cover.status, '失败');

  entitled = false;
  failCode = 'UNAUTHORIZED';
  const modelsBeforeRetry = modelCalls;
  const blockedRetry = await runner.retryImage({ slot: 'cover' });
  assert.equal(blockedRetry.ok, false);
  assert.equal(blockedRetry.silenced, true);
  assert.equal(runner.loadLatest().job.running, false);
  assert.equal(runner.loadLatest().images.cover.status, '失败');
  assert.equal(modelCalls, modelsBeforeRetry);
});

test('独立运行时买断闸门直接通过', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => responseFor(prompt, 0),
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  assert.equal((await runner.generateDraft(draftArgs())).ok, true);
  await untilIdle(runner);
  assert.equal((await runner.generateImages({ slot: 'cover' })).ok, true);
  await untilIdle(runner);
  assert.equal(runner.loadLatest().job.running, false);
  assert.equal(runner.loadLatest().images.cover.status, '成功');
});

test('写成笔记只出文，刷新才套整套提示词并只画当前张', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  /** @type {string[]} */
  const chatKeys = [];
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    complete: async (prompt, options) => {
      chatKeys.push(String(options && options.idempotencyKey || ''));
      return responseFor(prompt, 1);
    },
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  await runner.generateDraft(draftArgs({ galleryCount: 1 }));
  const drafted = await untilIdle(runner);
  assert.equal(drafted.job.running, false);
  assert.equal(drafted.prompts.cover, '');
  assert.deepEqual(drafted.prompts.gallery, []);
  assert.equal(chatKeys.some((key) => key.endsWith(':prompts:plan')), false);
  assert.equal(chatKeys.some((key) => key.endsWith(':prompts:scenes')), false);
  assert.equal(drafted.editor.cover, '');

  const stamped = await stampAndDraw(runner, { slot: 'cover' });
  assert.ok(stamped.prompts.cover);
  assert.equal(stamped.prompts.gallery.length, 1);
  assert.ok(stamped.prompts.gallery[0]);
  assert.equal(stamped.images.cover.status, '成功');
  assert.equal(stamped.images.cover.path, 'cover-1.png');
  assert.equal(stamped.images.gallery.length === 0 || !stamped.images.gallery[0] || stamped.images.gallery[0].status !== '成功', true);
  assert.equal(fs.readdirSync(stamped.directory).some((name) => name.startsWith('gallery-')), false);
  assert.equal(chatKeys.some((key) => key.endsWith(':prompts:plan')), true);
  assert.doesNotMatch(stamped.editor.cover, /1\. 背景/);
  assert.match(stamped.editor.cover, /11\. 主题绘画内容/);
});

test('同风格再刷不调策划和第 11 槽模型', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let planCalls = 0;
  let sceneCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => {
      if (promptStartsWith(prompt, 'PLAN') || promptStartsWith(prompt, 'COMPAREPLAN')) planCalls += 1;
      if (promptStartsWith(prompt, 'SCENES')) sceneCalls += 1;
      return responseFor(prompt, 1);
    },
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  await runner.generateDraft(draftArgs({ galleryCount: 1 }));
  await untilIdle(runner);
  await stampAndDraw(runner, { slot: 'cover' });
  assert.equal(planCalls, 1);
  assert.equal(sceneCalls, 1);
  await stampAndDraw(runner, { slot: 'gallery', index: 1, look: ALBUM_MAGAZINE });
  assert.equal(planCalls, 1);
  assert.equal(sceneCalls, 1);
  const latest = runner.loadLatest();
  assert.equal(latest.images.gallery[0].status, '成功');
  assert.equal(latest.images.cover.status, '成功');
});

test('杂志换手帐本地重套，换信息图才再跑策划', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let planCalls = 0;
  let sceneCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    random: firstPick,
    complete: async (prompt) => {
      if (promptStartsWith(prompt, 'PLAN') || promptStartsWith(prompt, 'COMPAREPLAN')) planCalls += 1;
      if (promptStartsWith(prompt, 'SCENES')) sceneCalls += 1;
      return responseFor(prompt, 0);
    },
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  await runner.generateDraft(draftArgs({ galleryCount: 0 }));
  await untilIdle(runner);
  await stampAndDraw(runner, { slot: 'cover', look: ALBUM_MAGAZINE });
  assert.equal(planCalls, 1);
  assert.equal(sceneCalls, 1);
  const magazineCover = runner.loadLatest().prompts.cover;
  assert.match(magazineCover, /#F2F0E6/);
  const scene = magazineCover.match(/11\. 主题绘画内容：([^\n]+)/)[1];

  await stampAndDraw(runner, { slot: 'cover', look: ALBUM_SCRAPBOOK });
  assert.equal(planCalls, 1);
  assert.equal(sceneCalls, 1);
  const scrapbook = runner.loadLatest();
  assert.equal(scrapbook.prompts.look, ALBUM_SCRAPBOOK);
  assert.match(scrapbook.prompts.cover, /#F7E8C8/);
  assert.match(scrapbook.prompts.cover, new RegExp(`11\\. 主题绘画内容：${scene}`));
  assert.match(scrapbook.prompts.cover, /一句/);
  assert.doesNotMatch(scrapbook.prompts.cover, /#F2F0E6/);

  await stampAndDraw(runner, { slot: 'cover', look: ALBUM_INFOGRAPHIC });
  assert.equal(planCalls, 2);
  const info = runner.loadLatest();
  assert.equal(info.prompts.look, ALBUM_INFOGRAPHIC);
  assert.match(info.prompts.cover, /栏目标签/);
});
