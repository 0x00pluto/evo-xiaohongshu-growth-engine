'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore, nextImageFile } = require('../../src/draft/store');

test('旧路径算第 1 张，下一张用新文件名', () => {
  const latestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-store-'));
  const store = createStore(latestDir);
  fs.writeFileSync(path.join(latestDir, 'cover.png'), 'cover');
  fs.writeFileSync(path.join(latestDir, 'gallery-01.png'), 'one');
  const state = store.read();
  state.images.cover = { status: '成功', path: 'cover.png', revisedAt: 12 };
  state.images.gallery = [{ status: '成功', path: 'gallery-01.png', revisedAt: 4 }];
  store.write(state);
  const saved = store.read();
  assert.equal(saved.images.cover.selected, 1);
  assert.equal(saved.images.cover.versions.length, 1);
  assert.equal(saved.images.cover.versions[0].path, 'cover.png');
  assert.equal(saved.images.cover.revisedAt, 12);
  assert.equal(nextImageFile('cover', 0, saved.images.cover.versions), 'cover-2.png');
  assert.equal(nextImageFile('gallery', 1, saved.images.gallery[0].versions), 'gallery-01-2.png');
  assert.equal(nextImageFile('cover', 0, []), 'cover-1.png');
  assert.equal(fs.existsSync(path.join(latestDir, 'cover.png')), true);
  assert.equal(fs.existsSync(path.join(latestDir, 'gallery-01.png')), true);
});

test('同一张图的修订号会留下来', () => {
  const latestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-store-'));
  const store = createStore(latestDir);
  const state = store.read();
  state.images.cover = { status: '成功', path: 'cover.png', revisedAt: 12 };
  store.write(state);
  assert.equal(store.read().images.cover.revisedAt, 12);
});

test('旧稿没有 uploadRefs / picks 时读成空列表', () => {
  const latestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-store-mat-'));
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(
    path.join(latestDir, 'draft.json'),
    `${JSON.stringify({
      business: '测',
      article: '',
      articleType: '素人',
      galleryCount: 1,
      draft: null,
      prompts: { cover: '', storyType: '', look: '', gallery: [], galleryLines: [], galleryRoles: [], style: '', stale: false, basis: null },
      images: { cover: { status: '空', path: '', selected: 0, revisedAt: 0, versions: [] }, gallery: [] },
      job: { running: false, step: '', error: '' },
    }, null, 2)}\n`,
  );
  const store = createStore(latestDir);
  const state = store.read();
  assert.deepEqual(state.uploadRefs, []);
  assert.deepEqual(state.picks.cover.materialIds, []);
  assert.equal(state.picks.gallery.length, 1);
  assert.equal(state.sampleBody, '');
  assert.deepEqual(state.references, []);
  assert.equal(state.articleType, '涨粉');
  assert.equal(state.persona, '素人');
});

test('旧稿非空 article 迁成 sampleBody，写回不再落 article', () => {
  const latestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-store-sample-'));
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(
    path.join(latestDir, 'draft.json'),
    `${JSON.stringify({
      business: '测',
      article: '旧文章正文',
      articleType: '种草',
      galleryCount: 1,
      draft: null,
      prompts: { cover: '', storyType: '', look: '', gallery: [], galleryLines: [], galleryRoles: [], style: '', stale: false, basis: null },
      images: { cover: { status: '空', path: '', selected: 0, revisedAt: 0, versions: [] }, gallery: [] },
      job: { running: false, step: '', error: '' },
    }, null, 2)}\n`,
  );
  const store = createStore(latestDir);
  const state = store.read();
  assert.equal(state.sampleBody, '旧文章正文');
  assert.equal(Object.prototype.hasOwnProperty.call(state, 'article'), false);
  store.write(state);
  const raw = JSON.parse(fs.readFileSync(path.join(latestDir, 'draft.json'), 'utf8'));
  assert.equal(raw.sampleBody, '旧文章正文');
  assert.equal(Object.prototype.hasOwnProperty.call(raw, 'article'), false);
});

test('已有 sampleBody 时忽略旧 article', () => {
  const latestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-store-sample2-'));
  fs.mkdirSync(latestDir, { recursive: true });
  fs.writeFileSync(
    path.join(latestDir, 'draft.json'),
    `${JSON.stringify({
      business: '测',
      article: '旧文章',
      sampleBody: '',
      sampleTitle: '标题',
      references: ['事实一'],
      articleType: '素人',
      galleryCount: 1,
      draft: null,
      prompts: { cover: '', storyType: '', look: '', gallery: [], galleryLines: [], galleryRoles: [], style: '', stale: false, basis: null },
      images: { cover: { status: '空', path: '', selected: 0, revisedAt: 0, versions: [] }, gallery: [] },
      job: { running: false, step: '', error: '' },
    }, null, 2)}\n`,
  );
  const state = createStore(latestDir).read();
  assert.equal(state.sampleBody, '');
  assert.equal(state.sampleTitle, '标题');
  assert.deepEqual(state.references, ['事实一']);
  assert.equal(state.articleType, '涨粉');
  assert.equal(state.persona, '素人');
});

test('读写时保留用户图册 look，需带上 userAlbumsDir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-look-'));
  const latestDir = path.join(root, 'post');
  const promptsDir = path.join(root, 'prompts');
  const userAlbumsDir = path.join(root, 'runtime', 'albums');
  const factoryId = '000001.magazine.seed';
  const id = '100000.magazine.peach-quote-card';
  fs.mkdirSync(path.join(promptsDir, 'albums'), { recursive: true });
  fs.mkdirSync(userAlbumsDir, { recursive: true });
  const sheet = [
    '竖版 3:4。',
    '1. 背景：白', '2. 色彩：黑', '3. 字体：黑', '4. 字号：大', '5. 字重：粗',
    '6. 文字排版：中', '7. 文字位置：中', '8. 构图布局：中', '9. 视觉风格：排',
    '10. 光影与质感：平',    '11. 主题绘画内容：{{scene}}',
    '',
    '图片必须准确呈现的中文文案：',
    '{{line}}',
    '',
    '文案须完整准确。',
  ].join('\n');
  const meta = (albumId, slug) => `${JSON.stringify({
    id: albumId,
    kind: 'magazine',
    slug,
    hint: '纯文字，测。',
    label: '测',
    copySchema: '每一项对象字段：\n- line：一句\n返回形状：{"frames":[{"line":"..."}]}',
    legacyIds: [],
    enabled: true,
      promptSheetVersion: 2,
  }, null, 2)}\n`;
  fs.mkdirSync(path.join(promptsDir, 'albums', factoryId), { recursive: true });
  fs.writeFileSync(path.join(promptsDir, 'albums', factoryId, 'album.json'), meta(factoryId, 'seed'));
  fs.writeFileSync(path.join(promptsDir, 'albums', factoryId, 'prompt.md'), sheet);
  fs.writeFileSync(path.join(promptsDir, 'albums', factoryId, 'copy-sample.md'), '仅示例\n');
  fs.mkdirSync(path.join(userAlbumsDir, id), { recursive: true });
  fs.writeFileSync(path.join(userAlbumsDir, id, 'album.json'), meta(id, 'peach-quote-card'));
  fs.writeFileSync(path.join(userAlbumsDir, id, 'prompt.md'), sheet);
  fs.writeFileSync(path.join(userAlbumsDir, id, 'copy-sample.md'), '仅示例\n');

  const withoutUser = createStore(latestDir, { promptsDir });
  const wiped = withoutUser.read();
  wiped.prompts.look = id;
  wiped.prompts.style = '奶油底大引号金句卡';
  withoutUser.write(wiped);
  assert.equal(withoutUser.read().prompts.look, '');

  fs.writeFileSync(path.join(latestDir, 'draft.json'), `${JSON.stringify({
    prompts: { look: id, style: '奶油底大引号金句卡', cover: '', gallery: [], storyType: 'process' },
  }, null, 2)}\n`);
  const withUser = createStore(latestDir, { promptsDir, userAlbumsDir });
  assert.equal(withUser.read().prompts.look, id);
  withUser.write(withUser.read());
  assert.equal(withUser.read().prompts.look, id);
});
