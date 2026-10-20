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
  fs.writeFileSync(path.join(dir, 'albums', `${name}.md`), albumSlots(name));
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
  fs.writeFileSync(path.join(dir, 'albums', `${id}.json`), `${JSON.stringify({
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
  fs.mkdirSync(path.join(dir, 'article'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'lines'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'albums'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'article', 'shell.md'), 'DRAFT {{skeleton}}\n{{business}} {{article}}');
  fs.writeFileSync(path.join(dir, 'article', 'amateur.md'), '骨架素人');
  fs.writeFileSync(path.join(dir, 'article', 'seed.md'), '骨架种草');
  fs.writeFileSync(path.join(dir, 'article', 'lead.md'), '骨架引流');
  fs.writeFileSync(path.join(dir, 'tone.md'), 'TONE 素人');
  fs.writeFileSync(
    path.join(dir, 'lines', 'process.md'),
    'PLAN {{slots}}\nSCHEMA:{{copySchema}}\n{{tone}}\nCOUNT:{{imageCount}}',
  );
  fs.writeFileSync(
    path.join(dir, 'lines', 'contrast.md'),
    'COMPAREPLAN {{slots}}\nSCHEMA:{{copySchema}}\n{{tone}}\nCOUNT:{{imageCount}}',
  );
  fs.writeFileSync(
    path.join(dir, 'scenes.md'),
    'SCENES\nCOUNT:{{sceneCount}}\nHINT:{{albumHint}}\nLINES:{{plannedLines}}\n{{tone}}\n{{storyHint}}',
  );
  fs.writeFileSync(
    path.join(dir, 'image-refs.md'),
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
  for (const id of ALL_ALBUMS) {
    writeAlbum(dir, id);
    writeAlbumMeta(dir, id);
    fs.writeFileSync(
      path.join(dir, 'albums', `${id}.copy-sample.md`),
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

function responseFor(prompt, galleryCount) {
  if (prompt.startsWith('DRAFT')) {
    return JSON.stringify({ title: '标题', body: '正文', topics: ['甲', '乙', '丙'] });
  }
  if (prompt.startsWith('PLAN') || prompt.startsWith('COMPAREPLAN')) {
    const imageCount = Number((prompt.match(/COUNT:(\d+)/) || [])[1] || (galleryCount + 1));
    return JSON.stringify(planFrames(prompt, imageCount));
  }
  if (prompt.startsWith('SCENES')) {
    const count = Number((prompt.match(/COUNT:(\d+)/) || [])[1] || 0);
    const body = prompt.split('LINES:')[1] || '';
    const lines = body.split('\n').map((item) => item.trim()).filter((item) => {
      if (!item || item === 'TONE 素人') return false;
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
  return { business: '卖课', article: '', galleryCount: 0, articleType: '素人', ...extra };
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

test('空业务一句和超长文章都不会调用模型', async () => {
  const promptsDir = path.join(tempDir(), 'prompts');
  writePrompts(promptsDir);
  let calls = 0;
  const runner = createRunner({
    postsDir: path.join(tempDir(), 'latest'),
    promptsDir,
    random: firstPick,
    complete: async () => {
      calls += 1;
      return '{}';
    },
  });

  const empty = runner.generateDraft(draftArgs({ business: '  ', article: '有文章', galleryCount: 1 }));
  assert.equal(empty.ok, false);
  assert.equal(empty.field, 'business');

  const tooLong = runner.generateDraft(draftArgs({
    article: '字'.repeat(8001),
    galleryCount: 1,
  }));
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.field, 'article');
  assert.equal(runner.loadLatest().id, '');
  assert.equal(calls, 0);
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

  assert.equal(runner.generateDraft(draftArgs()).ok, true);
  const drafted = await untilIdle(runner);
  assert.equal(drafted.draft.title, '标题');
  assert.equal(drafted.draft.coverLine, '一句');
  assert.equal(drafted.articleType, '素人');
  assert.equal(drafted.prompts.storyType, 'process');
  assert.equal(drafted.prompts.look, ALBUM_MAGAZINE);
  assertCover(drafted.prompts.cover);
  assert.equal(drafted.prompts.style, STYLE);
  assert.deepEqual(drafted.prompts.gallery, []);
  assert.deepEqual(drafted.prompts.galleryLines, []);
  assert.deepEqual(drafted.prompts.galleryRoles, []);
  assert.equal(seen.some((prompt) => prompt.startsWith('PLAN')), true);
  assert.equal(seen.some((prompt) => prompt.startsWith('COMPAREPLAN')), false);
  const art = seen.find((prompt) => prompt.startsWith('SCENES'));
  assert.equal(art.includes('HINT:杂志编辑风，高辨识度大字报，概念插画'), true);
  assert.equal(art.includes('TONE 素人'), true);
  assert.doesNotMatch(art, /手帐拼贴|潮流概念|知识卡片/);
  assert.match(art, /字段只有 scenes|HINT:/);
  assert.doesNotMatch(art, /\{\{background\}\}|\{\{colors\}\}/);
  assert.equal(drafted.job.error, '');

  assert.equal(runner.generateImages({ slot: 'cover' }).ok, true);
  const imaged = await untilIdle(runner);
  assert.equal(imaged.images.cover.status, '成功');
  assert.equal(imaged.images.cover.path, 'cover-1.png');
  assert.equal(fs.existsSync(path.join(runner.loadLatest().directory, 'cover-1.png')), true);
  assert.equal(fs.readdirSync(runner.loadLatest().directory).some((name) => name.startsWith('gallery-')), false);

  assert.equal(runner.generateDraft(draftArgs({ article: '补充' })).ok, true);
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
      if (prompt.startsWith('SCENES')) {
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
  runner.generateDraft(draftArgs({ article: '一篇短文', galleryCount: 2 }));
  const latest = await untilIdle(runner);
  assert.match(latest.job.error, /画面应为 3 张，模型返回了 1 张/);
  assert.ok(scenesCalls >= 2);
  assert.equal(latest.draft.title, '标题');
  assert.equal(images, 0);
  assert.equal(runner.generateImages({ slot: 'cover' }).ok, false);
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
      if (prompt.startsWith('SCENES')) {
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
  runner.generateDraft(draftArgs({ article: '一篇短文', galleryCount: 1 }));
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
      if (prompt.startsWith('SCENES')) {
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
  runner.generateDraft(draftArgs({ article: '一篇短文', galleryCount: 1 }));
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
  const first = runner.generateDraft(draftArgs());
  const second = runner.generateDraft(draftArgs());
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.message, BUSY_MESSAGE);
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

  runner.generateDraft(draftArgs({ article: '素材', galleryCount: 1 }));
  await untilIdle(runner);
  runner.generateImages({ slot: 'gallery', index: 1 });
  await untilIdle(runner);
  runner.generateImages({ slot: 'cover' });
  const partial = await untilIdle(runner);
  assert.equal(partial.images.cover.status, '失败');
  assert.equal(partial.images.gallery[0].status, '成功');
  assert.equal(fs.readFileSync(path.join(runner.loadLatest().directory, 'gallery-01-1.png'), 'utf8'), 'gallery-bytes');

  const rejected = runner.retryImage({ slot: 'gallery', index: 1 });
  assert.equal(rejected.ok, false);

  runner.retryImage({ slot: 'cover' });
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
  runner.generateDraft(draftArgs());
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
  assert.equal(runner.generateImages({ slot: 'cover' }).ok, true);
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
  runner.generateDraft(draftArgs());
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
  const failed = blocked.generateDraft(draftArgs());
  assert.equal(failed.ok, true);
  const after = await untilIdle(blocked);
  assert.match(after.job.error, /缺少 DEEPSEEK_API_KEY/);
  assert.equal(after.business, '卖课');
  assert.equal(fetched, false);

  fetched = false;
  runner.generateImages({ slot: 'cover' });
  const imaged = await untilIdle(runner);
  assert.match(imaged.job.error, /缺少 REPLICATE_API_TOKEN/);
  assert.equal(imaged.draft.title, '标题');
  assertCover(imaged.prompts.cover);
  assert.equal(fetched, false);
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
  runner.generateDraft(draftArgs({ business: '第一篇' }));
  const first = await untilIdle(runner);
  runner.startNew();
  const blank = runner.loadLatest();
  assert.equal(blank.id, '');
  assert.equal(blank.draft, null);
  runner.generateDraft(draftArgs({ business: '第二篇' }));
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

  runner.generateDraft(draftArgs({
    coverLineSpecified: '  我指定的  ',
  }));
  const drafted = await untilIdle(runner);
  assert.equal(drafted.coverLineSpecified, '我指定的');
  assert.equal(drafted.draft.coverLine, '一句');
  assertCover(drafted.prompts.cover);
  assert.equal(drafted.prompts.style, STYLE);
  assert.equal(seen.some((prompt) => prompt.startsWith('PLAN')), true);
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
  runner.generateDraft(draftArgs({ galleryCount: 1 }));
  await untilIdle(runner);
  const missing = runner.generateImages({});
  assert.equal(missing.ok, false);
  assert.equal(missing.message, '要指明封面或配图序号');

  runner.generateImages({ slot: 'gallery', index: 1 });
  await untilIdle(runner);
  runner.generateImages({ slot: 'cover' });
  const first = await untilIdle(runner);
  assert.equal(first.images.cover.status, '成功');
  assert.equal(first.images.gallery[0].status, '成功');
  const galleryBytes = fs.readFileSync(path.join(first.directory, 'gallery-01-1.png'), 'utf8');
  const coverBytes = fs.readFileSync(path.join(first.directory, 'cover-1.png'), 'utf8');

  const cleared = runner.saveEditor({
    prompts: { cover: first.prompts.cover, gallery: [''] },
  });
  assert.equal(cleared.ok, true);
  const emptyGallery = runner.generateImages({ slot: 'gallery', index: 1 });
  assert.equal(emptyGallery.ok, false);
  assert.equal(emptyGallery.message, '还没有这一张的提示词');
  const coverStill = runner.generateImages({
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

test('文章类型不在允许列表时不调用模型', async () => {
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
  const rejected = runner.generateDraft(draftArgs({ articleType: '官号' }));
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /文章类型不在允许列表/);
  assert.equal(calls, 0);
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
  runner.generateDraft(draftArgs());
  const drafted = await untilIdle(runner);
  assert.equal(drafted.prompts.storyType, 'contrast');
  assert.equal(drafted.prompts.look, ALBUM_CONCEPTUAL);
  assertCover(drafted.prompts.cover, '一句', ALBUM_CONCEPTUAL);
  assert.equal(drafted.prompts.style.includes('潮流概念插画风'), true);
  assert.equal(drafted.draft.title, '标题');
  assert.equal(drafted.draft.coverLine, '一句');
  assert.equal(seen.some((prompt) => prompt.startsWith('COMPAREPLAN')), true);
  assert.equal(seen.some((prompt) => prompt.startsWith('PLAN')), false);
  assert.equal(drafted.prompts.gallery.length, 0);
  assert.equal(runner.generateImages({ slot: 'cover' }).ok, true);
  const imaged = await untilIdle(runner);
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
  runner.generateDraft(draftArgs({ galleryCount: 1 }));
  const next = await untilIdle(runner);
  assert.equal(next.prompts.storyType, 'contrast');
  assert.deepEqual(next.prompts.galleryRoles, ['contrast']);
  assert.equal(next.prompts.gallery[0].includes(next.prompts.galleryLines[0]), true);
  assert.equal(next.draft.title, '标题');
  assert.equal(runner.generateImages({ slot: 'gallery', index: 1 }).ok, true);
  const imaged = await untilIdle(runner);
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
  withSample.generateDraft(draftArgs({ galleryCount: 0 }));
  await untilIdle(withSample);
  assert.equal(withSample.generateImages({ slot: 'cover' }).ok, true);
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
  noSample.generateDraft(draftArgs({ galleryCount: 0 }));
  await untilIdle(noSample);
  assert.equal(noSample.generateImages({ slot: 'cover' }).ok, true);
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

  runner.generateDraft(draftArgs({ galleryCount: 1 }));
  const first = await untilIdle(runner);
  assert.equal(first.prompts.look, ALBUM_INFOGRAPHIC);

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
  runner.generateDraft(draftArgs({ galleryCount: 1 }));
  const one = await untilIdle(runner);
  assert.equal(one.prompts.storyType, 'process');
  assert.equal(one.prompts.look, ALBUM_MAGAZINE);
  assert.deepEqual(one.prompts.galleryRoles, ['summary']);
  assert.equal(one.prompts.galleryLines.length, 1);
  assert.notEqual(one.prompts.galleryLines[0], one.draft.coverLine);
  assert.equal(one.prompts.gallery[0].includes(one.prompts.galleryLines[0]), true);
  const plan = seen.filter((prompt) => prompt.startsWith('PLAN'));
  assert.equal(plan.length, 1);
  assert.match(plan[0], /1 opening\n2 summary/);
  assert.match(plan[0], /TONE 素人/);
  assert.match(plan[0], /大字报一行/);
  const artCalls = seen.filter((prompt) => prompt.startsWith('SCENES'));
  assert.equal(artCalls.length, 1);
  assert.match(artCalls[0], /第1拍/);
  assert.match(artCalls[0], /HINT:杂志编辑风/);
  assert.match(artCalls[0], /前后接成一个故事/);
  assert.match(artCalls[0], /TONE 素人/);
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
  const slots = seen.find((prompt) => prompt.startsWith('PLAN'));
  assert.match(slots, /1 opening\n2 point\n3 point\n4 point\n5 point\n6 point\n7 point\n8 point\n9 summary/);
  assert.equal(seen.filter((prompt) => prompt.startsWith('SCENES')).length, 1);
});

test('第一次 scenes 失败时不把未完成的头图写成成功结果', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  fs.rmSync(path.join(promptsDir, 'scenes.md'));
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
  runner.generateDraft(draftArgs({ galleryCount: 1 }));
  const failed = await untilIdle(runner);
  assert.match(failed.job.error, /找不到提示词文件|未知提示词文件/);
  assert.equal(failed.draft.title, '标题');
  assert.equal(failed.prompts.cover, '');
  assert.equal(failed.prompts.storyType, '');
  assert.equal(failed.prompts.look, '');
  assert.equal(failed.prompts.stale, false);
  assert.equal(images, 0);
  assert.equal(runner.generateImages({ slot: 'cover' }).ok, false);
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
        if (prompt.startsWith('PLAN') && body.lines) return JSON.stringify(body);
        if (prompt.startsWith('SCENES') && body.scenes) {
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
    runner.generateDraft(draftArgs({ galleryCount }));
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
  runner.generateDraft(draftArgs({ galleryCount: 2 }));
  await untilIdle(runner);
  runner.generateImages({ slot: 'gallery', index: 1 });
  await untilIdle(runner);
  runner.generateImages({ slot: 'gallery', index: 2 });
  const imaged = await untilIdle(runner);
  const dir = imaged.directory;
  assert.equal(fs.existsSync(path.join(dir, 'gallery-01-1.png')), true);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-02-1.png')), true);

  const saved = runner.saveEditor({ galleryCount: 0 });
  assert.equal(saved.ok, true);
  assert.equal(runner.loadLatest().prompts.stale, false);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-01-1.png')), true);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-02-1.png')), true);

  runner.generateDraft(draftArgs());
  await untilIdle(runner);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-01-1.png')), true);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-02-1.png')), true);
  assert.equal(runner.loadLatest().images.gallery[0].path, 'gallery-01-1.png');
});
