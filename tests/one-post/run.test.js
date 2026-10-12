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

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-run-'));
}

function writePrompts(dir, { gallery = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'draft.md'), 'DRAFT {{business}} {{article}}');
  fs.writeFileSync(path.join(dir, 'cover.md'), 'COVER {{title}} {{body}} {{topics}} {{coverLine}}');
  if (gallery) fs.writeFileSync(path.join(dir, 'gallery.md'), 'GALLERY {{galleryCount}} {{title}}');
}

function responseFor(prompt, galleryCount, galleryBody) {
  if (prompt.startsWith('DRAFT')) return JSON.stringify(face);
  if (prompt.startsWith('COVER')) return JSON.stringify({ prompt: '封面画面' });
  if (prompt.startsWith('GALLERY')) {
    return JSON.stringify({
      prompts: galleryBody || Array.from({ length: galleryCount }, (_, index) => `配图${index + 1}`),
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

test('配图张数为 0 时不读配图提示词，重跑成稿会删掉旧图', async () => {
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
  assert.equal(drafted.prompts.cover, '封面画面');
  assert.deepEqual(drafted.prompts.gallery, []);
  assert.equal(seen.some((prompt) => prompt.startsWith('GALLERY')), false);
  assert.equal(drafted.job.error, '');

  assert.equal(runner.generateImages({}).ok, true);
  const imaged = await untilIdle(runner);
  assert.equal(imaged.images.cover.status, '成功');
  assert.equal(fs.existsSync(path.join(runner.loadLatest().directory, 'cover.png')), true);
  assert.equal(fs.readdirSync(runner.loadLatest().directory).some((name) => name.startsWith('gallery-')), false);

  assert.equal(runner.generateDraft({ business: '卖课', article: '补充', galleryCount: 0 }).ok, true);
  assert.equal(fs.existsSync(path.join(runner.loadLatest().directory, 'cover.png')), false);
  const again = await untilIdle(runner);
  assert.equal(fs.existsSync(path.join(runner.loadLatest().directory, 'cover.png')), false);
  assert.equal(again.images.cover.status, '作废');
});

test('提示词条数不对时不生图', async () => {
  const root = tempDir();
  const promptsDir = path.join(root, 'prompts');
  writePrompts(promptsDir);
  let images = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'latest'),
    promptsDir,
    complete: async (prompt) => responseFor(prompt, 2, ['只有一条']),
    generateImage: async () => {
      images += 1;
    },
  });
  runner.generateDraft({ business: '卖课', article: '一篇短文', galleryCount: 2 });
  const latest = await untilIdle(runner);
  assert.match(latest.job.error, /配图提示词应为 2 条/);
  assert.equal(latest.draft.title, '标题');
  assert.equal(images, 0);
  assert.equal(runner.generateImages({}).ok, false);
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
      if (path.basename(outputPath) === 'cover.png') {
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
  runner.generateImages({});
  const partial = await untilIdle(runner);
  assert.equal(partial.images.cover.status, '失败');
  assert.equal(partial.images.gallery[0].status, '成功');
  assert.equal(fs.readFileSync(path.join(runner.loadLatest().directory, 'gallery-01.png'), 'utf8'), 'gallery-bytes');

  const rejected = runner.retryImage({ slot: 'gallery', index: 1 });
  assert.equal(rejected.ok, false);

  runner.retryImage({ slot: 'cover' });
  const retried = await untilIdle(runner);
  assert.equal(retried.images.cover.status, '成功');
  assert.equal(fs.readFileSync(path.join(runner.loadLatest().directory, 'cover.png'), 'utf8'), 'cover-2');
  assert.equal(fs.readFileSync(path.join(runner.loadLatest().directory, 'gallery-01.png'), 'utf8'), 'gallery-bytes');
  assert.equal(coverAttempts, 2);
});

test('改稿面后要重算提示词，重算本身不跑成稿', async () => {
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
  });
  runner.generateDraft({ business: '卖课', article: '', galleryCount: 0 });
  await untilIdle(runner);
  fs.writeFileSync(path.join(runner.loadLatest().directory, 'cover.png'), 'old');
  const saved = runner.saveEditor({
    draft: { ...face, title: '新标题' },
  });
  assert.equal(saved.ok, true);
  const stale = runner.loadLatest();
  assert.equal(stale.prompts.stale, true);
  assert.equal(fs.existsSync(path.join(runner.loadLatest().directory, 'cover.png')), false);
  assert.equal(runner.generateImages({}).message, '提示词待重算');

  const before = seen.length;
  runner.generatePrompts({});
  const refreshed = await untilIdle(runner);
  assert.equal(refreshed.prompts.stale, false);
  assert.equal(refreshed.prompts.basis.title, '新标题');
  assert.equal(seen.slice(before).some((prompt) => prompt.startsWith('DRAFT')), false);
  assert.equal(seen.slice(before).some((prompt) => prompt.startsWith('COVER')), true);
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
  runner.generateImages({});
  const imaged = await untilIdle(runner);
  assert.match(imaged.job.error, /缺少 REPLICATE_API_TOKEN/);
  assert.equal(imaged.draft.title, '标题');
  assert.equal(imaged.prompts.cover, '封面画面');
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
