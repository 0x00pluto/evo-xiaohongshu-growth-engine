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
const STYLE = '杂志编辑风，大字报，带概念插画；奶油米白 #F2F0E6；深炭黑 #2B2B2B，活力橙红 #E4572E';

function assertCover(prompt, line = '一句') {
  assert.match(prompt, /1\. 背景/);
  assert.match(prompt, /11\. 主题绘画内容：第1格画着相连的一件事/);
  assert.match(prompt, /12\. 系列统一规则/);
  assert.match(prompt, /奶油米白 #F2F0E6/);
  assert.equal(prompt.includes(line), true);
  assert.doesNotMatch(prompt, /85%/);
  assert.doesNotMatch(prompt, /LARGE/);
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-run-'));
}

function writePrompts(dir, { gallery = true, story = true, compare = true, plan = true, contrast = false } = {}) {
  fs.mkdirSync(path.join(dir, 'cover', 'types'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'sets', 'looks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sets', 'art.md'), 'ART\nLINES:{{plannedLines}}\n{{tone}}\n{{readingHint}}');
  fs.writeFileSync(path.join(dir, 'sets', 'sheet.md'), [
    '竖版 3:4，小红书图文，{{label}}。',
    '1. 背景：{{background}}',
    '2. 色彩：{{colors}}',
    '3. 字体：{{font}}',
    '4. 字号：{{size}}',
    '5. 字重：主标题特粗',
    '6. 文字排版：{{typesetting}}',
    '7. 文字位置：{{placement}}',
    '8. 构图布局：{{composition}}',
    '9. 视觉风格：{{style}}',
    '10. 光影与质感：{{light}}',
    '11. 主题绘画内容：{{scene}}',
    '12. 系列统一规则：每张只换画面和文案',
    '图片准确文案：',
    '{{line}}',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'sets', 'looks', 'magazine.md'), [
    'label: 杂志编辑风，大字报，带概念插画',
    'font: 思源黑体，无衬线',
    'size: 主标题约占画面顶部两成到四分之一',
    'typesetting: 按语义断行',
    'placement: 标题是主视觉',
    'composition: 可以偏心',
    'style: 杂志编辑风，标题先被看见',
    'light: 平面插画',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'draft.md'), 'DRAFT {{business}} {{article}}');
  fs.writeFileSync(path.join(dir, 'cover', 'tone-amateur.md'), 'TONE 素人');
  fs.writeFileSync(path.join(dir, 'cover', 'large-type.md'), 'LARGE 文字是第一视觉主体');
  fs.writeFileSync(path.join(dir, 'cover', 'choose-type.md'), 'CHOOSE {{title}} {{body}} {{topics}} {{coverLine}}');
  if (story) {
    fs.writeFileSync(path.join(dir, 'cover', 'types', 'story.md'), 'STORY {{type}} {{title}} {{tone}}\n{{largeType}}\nLINE:{{coverLine}}');
  }
  if (compare) {
    fs.writeFileSync(path.join(dir, 'cover', 'types', 'compare.md'), 'COMPARE {{type}} {{title}} {{tone}}\nLINE:{{coverLine}}');
  }
  if (plan) {
    fs.mkdirSync(path.join(dir, 'sets', 'breakdown'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'sets', 'breakdown', 'plan.md'),
      'PLAN {{slots}}\n{{seriesPoint}}\n{{seriesSummary}}\n{{tone}}\nCOUNT:{{imageCount}}',
    );
    fs.writeFileSync(path.join(dir, 'sets', 'breakdown', 'point.md'), 'POINT 只写这一拍');
    fs.writeFileSync(path.join(dir, 'sets', 'breakdown', 'summary.md'), 'SUMMARY 回到整件事');
  }
  if (gallery) {
    fs.mkdirSync(path.join(dir, 'sets', 'types'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sets', 'choose-type.md'), 'SETCHOOSE {{title}} {{coverLine}} {{galleryCount}}');
    fs.writeFileSync(path.join(dir, 'sets', 'breakdown', 'shared.md'), 'SHARED 竖图');
    fs.writeFileSync(
      path.join(dir, 'sets', 'types', 'breakdown.md'),
      'BREAKDOWN\nLINES:{{plannedLines}}\n{{seriesShared}}\n{{tone}}\nCOUNT:{{galleryCount}}\nLINE:{{coverLine}}',
    );
  }
  if (contrast) {
    fs.mkdirSync(path.join(dir, 'sets', 'compare'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sets', 'types'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'sets', 'compare', 'plan.md'),
      'COMPAREPLAN {{slots}}\n{{tone}}\nCOUNT:{{imageCount}}',
    );
    fs.writeFileSync(path.join(dir, 'sets', 'compare', 'shared.md'), 'COMPARESHARED 对照');
    fs.writeFileSync(
      path.join(dir, 'sets', 'types', 'compare.md'),
      'COMPARESET\nLINES:{{plannedLines}}\n{{seriesShared}}\n{{tone}}\nLINE:{{coverLine}}',
    );
  }
}

function responseFor(prompt, galleryCount, galleryBody) {
  if (prompt.startsWith('DRAFT')) {
    return JSON.stringify({ title: '标题', body: '正文', topics: ['甲', '乙', '丙'] });
  }
  if (prompt.startsWith('PLAN') || prompt.startsWith('COMPAREPLAN')) {
    const imageCount = Number((prompt.match(/COUNT:(\d+)/) || [])[1] || (galleryCount + 1));
    const lines = ['一句', ...Array.from({ length: imageCount - 1 }, (_, index) => `第${index + 1}拍`)];
    return JSON.stringify({ lines });
  }
  if (prompt.startsWith('ART')) {
    const body = prompt.split('LINES:')[1] || '';
    const lines = body.split('\n').map((item) => item.trim()).filter((item) => {
      if (!item || item === 'TONE 素人') return false;
      if (item.startsWith('前后接成') || item.startsWith('每一张画面')) return false;
      return true;
    });
    return JSON.stringify({
      look: 'magazine',
      background: '奶油米白 #F2F0E6',
      colors: '深炭黑 #2B2B2B，活力橙红 #E4572E',
      scenes: lines.map((_, index) => `第${index + 1}格画着相连的一件事`),
    });
  }
  if (prompt.startsWith('CHOOSE')) return JSON.stringify({ type: 'story' });
  if (prompt.startsWith('COMPARESET')) {
    const lines = (prompt.split('LINES:')[1] || '').split('\n').map((item) => item.trim()).filter((item) => item && !item.startsWith('COMPARESHARED') && !item.startsWith('TONE') && !item.startsWith('LINE:'));
    return JSON.stringify({ prompts: lines.map((line) => `对照 ${line} ${STYLE}`) });
  }
  if (prompt.startsWith('STORY') || prompt.startsWith('COMPARE')) {
    const line = (prompt.split('LINE:')[1] || '').trim();
    return JSON.stringify({ prompt: `封面画面 ${line} ${STYLE}`, style: STYLE });
  }
  if (prompt.startsWith('SETCHOOSE')) return JSON.stringify({ type: 'breakdown' });
  if (prompt.startsWith('BREAKDOWN')) {
    const lines = Array.isArray(galleryBody)
      ? galleryBody
      : (prompt.split('LINES:')[1] || '').split('\n').map((item) => item.trim()).filter((item) => item && !item.startsWith('SHARED') && !item.startsWith('TONE') && !item.startsWith('LARGE') && !item.startsWith('COUNT:') && !item.startsWith('LINE:'));
    return JSON.stringify({
      prompts: lines.map((line) => `画面 ${line} ${STYLE}`),
    });
  }
  throw new Error(`意外的提示词：${prompt}`);
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
    complete: async () => {
      calls += 1;
      return '{}';
    },
  });

  const empty = runner.generateDraft({ business: '  ', article: '有文章', galleryCount: 1 });
  assert.equal(empty.ok, false);
  assert.equal(empty.field, 'business');

  const tooLong = runner.generateDraft({
    business: '卖课',
    article: '字'.repeat(8001),
    galleryCount: 1,
  });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.field, 'article');
  assert.equal(runner.loadLatest().id, '');
  assert.equal(calls, 0);
});

test('配图张数为 0 时不读配图提示词，重跑成稿仍留着旧图', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  const postsDir = path.join(root, 'latest');
  writePrompts(promptsDir, { gallery: false });
  const seen = [];
  const runner = createRunner({
    postsDir,
    promptsDir,
    complete: async (prompt) => {
      seen.push(prompt);
      return responseFor(prompt, 0);
    },
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });

  assert.equal(runner.generateDraft({ business: '卖课', article: '', galleryCount: 0 }).ok, true);
  const drafted = await untilIdle(runner);
  assert.equal(drafted.draft.title, '标题');
  assert.equal(drafted.draft.coverLine, '一句');
  assert.equal(drafted.prompts.coverType, 'story');
  assertCover(drafted.prompts.cover);
  assert.equal(drafted.prompts.style, STYLE);
  assert.equal(drafted.prompts.setType, '');
  assert.deepEqual(drafted.prompts.gallery, []);
  assert.deepEqual(drafted.prompts.galleryLines, []);
  assert.deepEqual(drafted.prompts.galleryRoles, []);
  assert.equal(seen.some((prompt) => prompt.startsWith('GALLERY')), false);
  assert.equal(seen.some((prompt) => prompt.startsWith('SETCHOOSE')), false);
  assert.equal(seen.some((prompt) => prompt.startsWith('BREAKDOWN')), false);
  assert.equal(seen.some((prompt) => prompt.startsWith('PLAN')), true);
  assert.equal(seen.some((prompt) => prompt.startsWith('COVER')), false);
  assert.equal(seen.some((prompt) => prompt.startsWith('CHOOSE')), false);
  assert.equal(seen.some((prompt) => prompt.startsWith('STORY')), false);
  const art = seen.find((prompt) => prompt.startsWith('ART'));
  assert.equal(art.includes('TONE 素人'), true);
  assert.equal(art.includes('LARGE'), false);
  assert.equal(drafted.job.error, '');

  assert.equal(runner.generateImages({ slot: 'cover' }).ok, true);
  const imaged = await untilIdle(runner);
  assert.equal(imaged.images.cover.status, '成功');
  assert.equal(imaged.images.cover.path, 'cover-1.png');
  assert.equal(fs.existsSync(path.join(runner.loadLatest().directory, 'cover-1.png')), true);
  assert.equal(fs.readdirSync(runner.loadLatest().directory).some((name) => name.startsWith('gallery-')), false);

  assert.equal(runner.generateDraft({ business: '卖课', article: '补充', galleryCount: 0 }).ok, true);
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
  const runner = createRunner({
    postsDir: path.join(root, 'latest'),
    promptsDir,
    complete: async (prompt) => {
      if (prompt.startsWith('ART')) {
        return JSON.stringify({
          look: 'magazine',
          background: '奶油米白 #F2F0E6',
          colors: '深炭黑 #2B2B2B，活力橙红 #E4572E',
          scenes: ['只有一张'],
        });
      }
      return responseFor(prompt, 2);
    },
    generateImage: async () => {
      images += 1;
    },
  });
  runner.generateDraft({ business: '卖课', article: '一篇短文', galleryCount: 2 });
  const latest = await untilIdle(runner);
  assert.match(latest.job.error, /画面应为 3 张/);
  assert.equal(latest.draft.title, '标题');
  assert.equal(images, 0);
  assert.equal(runner.generateImages({ slot: 'cover' }).ok, false);
});

test('进行中的第二次调用被拒绝', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir, { gallery: false });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'latest'),
    promptsDir,
    complete: async (prompt) => {
      calls += 1;
      if (calls === 1) await gate;
      return responseFor(prompt, 0);
    },
  });
  const first = runner.generateDraft({ business: '卖课', article: '', galleryCount: 0 });
  const second = runner.generateDraft({ business: '卖课', article: '', galleryCount: 0 });
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

  runner.generateDraft({ business: '卖课', article: '素材', galleryCount: 1 });
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
  writePrompts(promptsDir, { gallery: false });
  const runner = createRunner({
    postsDir,
    promptsDir,
    complete: async (prompt) => responseFor(prompt, 0),
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 0 });
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
  writePrompts(promptsDir, { gallery: false });
  let fetched = false;
  const runner = createRunner({
    postsDir,
    promptsDir,
    env: {},
    fetch: () => {
      fetched = true;
      throw new Error('不应请求');
    },
    complete: async (prompt) => responseFor(prompt, 0),
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 0 });
  const drafted = await untilIdle(runner);
  assert.equal(drafted.draft.title, '标题');

  const blocked = createRunner({
    postsDir,
    promptsDir,
    env: {},
    fetch: () => {
      fetched = true;
      throw new Error('不应请求');
    },
  });
  const failed = blocked.generateDraft({ business: '卖课', article: '', galleryCount: 0 });
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
  writePrompts(promptsDir, { gallery: false });
  let tick = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    now: () => new Date(Date.UTC(2026, 9, 12, 8, 0, tick++)),
    complete: async (prompt) => responseFor(prompt, 0),
  });
  runner.generateDraft({ business: '第一篇', article: '', galleryCount: 0 });
  const first = await untilIdle(runner);
  runner.startNew();
  const blank = runner.loadLatest();
  assert.equal(blank.id, '');
  assert.equal(blank.draft, null);
  runner.generateDraft({ business: '第二篇', article: '', galleryCount: 0 });
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
  writePrompts(promptsDir, { gallery: false });
  const seen = [];
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    complete: async (prompt) => {
      seen.push(prompt);
      return responseFor(prompt, 0);
    },
  });

  runner.generateDraft({
    business: '卖课',
    article: '',
    galleryCount: 0,
    coverLineSpecified: '  我指定的  ',
  });
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
    complete: async (prompt) => responseFor(prompt, 1),
    generateImage: async ({ prompt, outputPath }) => {
      seen.push(prompt);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, prompt);
    },
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 1 });
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

test('类型不在允许列表时不写封面提示词，也不生图', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir, { gallery: false });
  let images = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    complete: async (prompt) => responseFor(prompt, 0),
    generateImage: async () => {
      images += 1;
    },
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 0 });
  const drafted = await untilIdle(runner);
  const rejected = runner.reinterpret({ reading: 'poster' });
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /解读不在允许列表/);
  assert.equal(runner.loadLatest().prompts.cover, drafted.prompts.cover);
  assert.equal(runner.loadLatest().job.running, false);
  assert.equal(images, 0);
});

test('已有封面时非法类型不覆盖上一份提示词', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    complete: async (prompt) => responseFor(prompt, 1),
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 1 });
  await untilIdle(runner);
  assert.equal(runner.generateImages({ slot: 'cover' }).ok, true);
  const imaged = await untilIdle(runner);
  const rejected = runner.reinterpret({ reading: 'poster' });
  assert.equal(rejected.ok, false);
  assert.equal(runner.loadLatest().prompts.cover, imaged.prompts.cover);
  assert.equal(fs.existsSync(path.join(imaged.directory, 'cover-1.png')), true);
});

test('对比封面只读对比规则，配图张数为 0 时仍有封面', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir, { gallery: false, contrast: true });
  const seen = [];
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    complete: async (prompt) => {
      seen.push(prompt);
      return responseFor(prompt, 0);
    },
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 0 });
  await untilIdle(runner);
  assert.equal(runner.generateImages({ slot: 'cover' }).ok, true);
  const imaged = await untilIdle(runner);
  seen.length = 0;
  runner.reinterpret({ reading: 'compare' });
  const drafted = await untilIdle(runner);
  assert.equal(drafted.prompts.coverType, 'compare');
  assertCover(drafted.prompts.cover);
  assert.equal(drafted.prompts.style, STYLE);
  assert.equal(drafted.prompts.setType, '');
  assert.equal(drafted.draft.title, '标题');
  assert.equal(drafted.draft.coverLine, '一句');
  assert.equal(seen.some((prompt) => prompt.startsWith('COMPAREPLAN')), true);
  assert.equal(seen.some((prompt) => prompt.startsWith('STORY')), false);
  assert.equal(seen.some((prompt) => prompt.includes('LARGE 文字是第一视觉主体')), false);
  assert.equal(fs.existsSync(path.join(imaged.directory, 'cover-1.png')), true);
  assert.equal(drafted.images.cover.status, '成功');
  assert.equal(drafted.prompts.gallery.length, 0);
});

test('换成对比后配图是对照，已经生成的图还在', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir, { contrast: true });
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    complete: async (prompt) => responseFor(prompt, 1),
    generateImage: async ({ outputPath }) => {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'png');
    },
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 1 });
  await untilIdle(runner);
  assert.equal(runner.generateImages({ slot: 'gallery', index: 1 }).ok, true);
  const imaged = await untilIdle(runner);
  runner.reinterpret({ reading: 'compare' });
  const next = await untilIdle(runner);
  assert.equal(next.prompts.setType, 'compare');
  assert.equal(next.prompts.coverType, 'compare');
  assert.deepEqual(next.prompts.galleryRoles, ['contrast']);
  assert.equal(next.prompts.gallery[0].includes(next.prompts.galleryLines[0]), true);
  assert.equal(next.draft.title, '标题');
  assert.equal(next.images.gallery[0].status, '成功');
  assert.equal(fs.existsSync(path.join(imaged.directory, 'gallery-01-1.png')), true);
});

test('旧规则版本的封面打开时不删图，也不标成待重算', () => {
  const root = tempDir();
  const postsDir = path.join(root, 'posts');
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
    promptsDir: tempDir(),
    complete: async () => '{}',
  });
  const opened = runner.openPost({ id });
  assert.equal(opened.prompts.stale, false);
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
    complete: async (prompt) => {
      seen.push(prompt);
      return responseFor(prompt, 1);
    },
  });
  writePrompts(promptsDir);
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 1 });
  const one = await untilIdle(runner);
  assert.equal(one.prompts.coverType, 'story');
  assert.equal(one.prompts.setType, 'breakdown');
  assert.deepEqual(one.prompts.galleryRoles, ['summary']);
  assert.equal(one.prompts.galleryLines.length, 1);
  assert.notEqual(one.prompts.galleryLines[0], one.draft.coverLine);
  assert.equal(one.prompts.gallery[0].includes(one.prompts.galleryLines[0]), true);
  const plan = seen.filter((prompt) => prompt.startsWith('PLAN'));
  assert.equal(plan.length, 1);
  assert.match(plan[0], /1 opening\n2 summary/);
  assert.match(plan[0], /POINT 只写这一拍/);
  assert.match(plan[0], /SUMMARY 回到整件事/);
  assert.match(plan[0], /TONE 素人/);
  const artCalls = seen.filter((prompt) => prompt.startsWith('ART'));
  assert.equal(artCalls.length, 1);
  assert.match(artCalls[0], /第1拍/);
  assert.doesNotMatch(artCalls[0], /POINT 只写这一拍/);
  assert.match(artCalls[0], /前后接成一个故事/);
  assert.match(artCalls[0], /TONE 素人/);
  assert.doesNotMatch(artCalls[0], /LARGE 文字是第一视觉主体/);
  assert.equal(seen.some((prompt) => prompt.startsWith('SETCHOOSE')), false);
  assert.equal(seen.some((prompt) => prompt.startsWith('CHOOSE')), false);

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
  assert.equal(seen.filter((prompt) => prompt.startsWith('ART')).length, 1);
});

test('系列类型不在允许列表时不写成功提示词，也不生图', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let images = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    complete: async (prompt) => responseFor(prompt, 1),
    generateImage: async () => {
      images += 1;
    },
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 1 });
  const drafted = await untilIdle(runner);
  assertCover(drafted.prompts.cover);
  assert.equal(drafted.prompts.style, STYLE);
  assert.equal(drafted.prompts.setType, 'breakdown');

  runner.reinterpret({ reading: 'compare' });
  const failed = await untilIdle(runner);
  assert.match(failed.job.error, /找不到提示词文件/);
  assertCover(failed.prompts.cover);
  assert.equal(failed.prompts.coverType, 'story');
  assert.equal(failed.prompts.setType, 'breakdown');
  assert.equal(failed.draft.title, '标题');
  assert.equal(images, 0);
});

test('第一次系列失败时不把未完成的头图写成成功结果', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  fs.rmSync(path.join(promptsDir, 'sets', 'art.md'));
  let images = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir,
    complete: async (prompt) => {
      if (prompt.startsWith('SETCHOOSE')) return JSON.stringify({ type: 'steps' });
      return responseFor(prompt, 1);
    },
    generateImage: async () => {
      images += 1;
    },
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 1 });
  const failed = await untilIdle(runner);
  assert.match(failed.job.error, /找不到提示词文件/);
  assert.equal(failed.draft.title, '标题');
  assert.equal(failed.prompts.cover, '');
  assert.equal(failed.prompts.coverType, '');
  assert.equal(failed.prompts.setType, '');
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
      complete: async (prompt) => {
        if (prompt.startsWith('PLAN') && body.lines) return JSON.stringify(body);
        if (prompt.startsWith('ART') && body.scenes) {
          return JSON.stringify({
            look: 'magazine',
            background: '奶油米白 #F2F0E6',
            colors: '深炭黑 #2B2B2B，活力橙红 #E4572E',
            scenes: body.scenes,
          });
        }
        return responseFor(prompt, galleryCount);
      },
      generateImage: async () => {
        throw new Error('不应生图');
      },
    });
    runner.generateDraft({ business: '卖课', article: '', galleryCount });
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
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 2 });
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

  runner.generateDraft({ business: '卖课', article: '', galleryCount: 0 });
  await untilIdle(runner);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-01-1.png')), true);
  assert.equal(fs.existsSync(path.join(dir, 'gallery-02-1.png')), true);
  assert.equal(runner.loadLatest().images.gallery[0].path, 'gallery-01-1.png');
});
