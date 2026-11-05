'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRunner } = require('../../src/one-post/run');
const { findXhsNoteLinkByUrl, listXhsNoteLinks, readXhsNoteLink } = require('../../src/xhs-note/links');
const { listArticleSamples, readArticleSample } = require('../../src/article-samples/store');
const { readNotePayload, writeNotePayload } = require('../../src/xhs-note/cache');

const ROOT = path.resolve(__dirname, '../..');
const PROMPTS = path.join(ROOT, 'assets', 'prompts', 'one-post');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-import-'));
}

const NOTE = {
  sourceUrl: 'https://www.xiaohongshu.com/explore/testdelete000000000001',
  title: '爆款标题',
  body: '第一段钩子。\n\n第二段卖点。',
  tags: ['测试'],
  images: [
    { url: 'https://example.com/cover.jpg', mime: 'image/jpeg', role: 'cover' },
    { url: 'https://example.com/inner.jpg', mime: 'image/jpeg', role: 'image' },
  ],
  fetchedAt: '2026-11-04T12:00:00+08:00',
};

test('resolve 已收录则停；首次 import 写链接与 cache；再 save 范文', async () => {
  const root = tempDir();
  const notesDir = path.join(root, 'xhs-notes');
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const samplesDir = path.join(root, 'article-samples');
  let fetchCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: samplesDir,
    userXhsNotesDir: notesDir,
    userXhsNotesCacheDir: cacheDir,
    fetchNoteByUrl: async () => {
      fetchCalls += 1;
      return { ok: true, note: { ...NOTE, sourceUrl: NOTE.sourceUrl } };
    },
    fetch: async () => {
      throw new Error('测试不下真图');
    },
  });

  const shortUrl = 'https://xhslink.com/abcTest1';
  const first = await runner.resolveXhsNote({ url: shortUrl });
  assert.equal(first.ok, true, first.message);
  assert.equal(first.parts.hasCover, true);
  assert.equal(first.parts.innerCount, 1);
  assert.equal(fetchCalls, 1);
  assert.equal(first.fromCache, false);
  // 取料成功立刻落 cache，不必等 import
  assert.ok(readNotePayload(cacheDir, 'testdelete000000000001'));

  const imported = await runner.importXhsNote({
    url: shortUrl,
    note: first.note,
    learnArticle: true,
    learnCover: false,
    learnInner: false,
  });
  assert.equal(imported.ok, true, imported.message);
  assert.equal(imported.wantArticle, true);
  assert.ok(imported.link?.id);
  assert.equal(imported.link.noteId, 'testdelete000000000001');
  assert.equal(listXhsNoteLinks(notesDir).length, 1);
  assert.ok(readNotePayload(cacheDir, 'testdelete000000000001'));
  assert.equal(listArticleSamples(samplesDir).length, 0);

  const article = runner.saveXhsNoteArticle({
    linkId: imported.link.id,
    note: first.note,
  });
  assert.equal(article.ok, true, article.message);
  assert.ok(article.articleSample?.id);
  assert.equal(listArticleSamples(samplesDir).length, 1);
  const sample = readArticleSample(samplesDir, article.articleSample.id);
  assert.equal(sample?.source?.kind, 'xhs-note');
  assert.equal(sample?.source?.noteId, 'testdelete000000000001');
  const linkMeta = readXhsNoteLink(notesDir, imported.link.id);
  assert.equal(linkMeta?.learned.articleSampleId, article.articleSample.id);

  assert.ok(findXhsNoteLinkByUrl(notesDir, shortUrl));
  assert.ok(findXhsNoteLinkByUrl(notesDir, NOTE.sourceUrl));

  const again = await runner.resolveXhsNote({ url: shortUrl });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'ALREADY');
  assert.equal(fetchCalls, 1);

  const exploreAgain = await runner.resolveXhsNote({
    url: `${NOTE.sourceUrl}?xsec_token=changed`,
  });
  assert.equal(exploreAgain.ok, false);
  assert.equal(exploreAgain.code, 'ALREADY');
  assert.equal(fetchCalls, 1);
});

test('多内页 resolve 预下载 previewUrl；不下图失败不整次失败', async () => {
  const root = tempDir();
  const tinyJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
    'base64',
  );
  let fetchHits = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: path.join(root, 'xhs-notes'),
    userXhsNotesCacheDir: path.join(root, 'cache', 'xhs-notes'),
    fetchNoteByUrl: async () => ({
      ok: true,
      note: {
        ...NOTE,
        sourceUrl: 'https://www.xiaohongshu.com/explore/previewinners00000001',
        images: [
          { url: 'https://example.com/cover.jpg', mime: 'image/jpeg', role: 'cover' },
          { url: 'https://example.com/a.jpg', mime: 'image/jpeg', role: 'image' },
          { url: 'https://example.com/b.jpg', mime: 'image/jpeg', role: 'image' },
          { url: 'https://example.com/fail.jpg', mime: 'image/jpeg', role: 'image' },
        ],
      },
    }),
    fetch: async (url) => {
      fetchHits += 1;
      if (String(url).includes('fail')) {
        return { ok: false, status: 403, headers: { get: () => '' }, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => tinyJpeg.buffer.slice(tinyJpeg.byteOffset, tinyJpeg.byteOffset + tinyJpeg.byteLength),
      };
    },
  });

  const resolved = await runner.resolveXhsNote({ url: 'https://xhslink.com/multiInner' });
  assert.equal(resolved.ok, true, resolved.message);
  assert.equal(resolved.parts.hasCover, true);
  assert.equal(resolved.parts.coverUrl, 'https://example.com/cover.jpg');
  assert.match(resolved.parts.coverPreviewUrl, /^data:image\/jpeg;base64,/);
  assert.equal(resolved.parts.innerCount, 3);
  // cover + 3 inners
  assert.equal(fetchHits, 4);
  assert.match(resolved.parts.inners[0].previewUrl, /^data:image\/jpeg;base64,/);
  assert.match(resolved.parts.inners[1].previewUrl, /^data:image\/jpeg;base64,/);
  assert.equal(resolved.parts.inners[2].previewUrl, '');
  assert.equal(resolved.parts.inners[0].url, 'https://example.com/a.jpg');
});

test('短链二次解析到同一 sourceUrl 时补 inputUrls 并停', async () => {
  const root = tempDir();
  const notesDir = path.join(root, 'xhs-notes');
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: notesDir,
    userXhsNotesCacheDir: cacheDir,
    fetchNoteByUrl: async () => ({ ok: true, note: { ...NOTE } }),
  });

  await runner.importXhsNote({
    url: 'https://xhslink.com/first',
    note: NOTE,
    learnArticle: true,
    learnCover: false,
    learnInner: false,
  });

  const second = await runner.resolveXhsNote({ url: 'https://xhslink.com/second' });
  assert.equal(second.ok, false);
  assert.equal(second.code, 'ALREADY');
  const link = findXhsNoteLinkByUrl(notesDir, NOTE.sourceUrl);
  assert.ok(link?.inputUrls.includes('https://xhslink.com/second'));
});

test('resolve：cache 已有 payload 时不调插件', async () => {
  const root = tempDir();
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const noteId = 'cachednote000000000001';
  writeNotePayload(cacheDir, noteId, {
    ...NOTE,
    sourceUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
  });
  let fetchCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: path.join(root, 'xhs-notes'),
    userXhsNotesCacheDir: cacheDir,
    fetchNoteByUrl: async () => {
      fetchCalls += 1;
      return { ok: true, note: { ...NOTE } };
    },
    fetch: async () => {
      throw new Error('有 cache 时不应再拉 CDN');
    },
  });

  const resolved = await runner.resolveXhsNote({
    url: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=new`,
  });
  assert.equal(resolved.ok, true, resolved.message);
  assert.equal(resolved.fromCache, true);
  assert.equal(fetchCalls, 0);
  assert.equal(resolved.parts.title, '爆款标题');
  assert.equal(resolved.note.sourceUrl, `https://www.xiaohongshu.com/explore/${noteId}`);
});

test('resolve：无 cache 才调插件并落盘；同 noteId 再取走 cache', async () => {
  const root = tempDir();
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const noteId = 'secondtake00000000001';
  let fetchCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: path.join(root, 'xhs-notes'),
    userXhsNotesCacheDir: cacheDir,
    fetchNoteByUrl: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        note: {
          ...NOTE,
          sourceUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
        },
      };
    },
    fetch: async () => ({
      ok: false,
      status: 404,
      headers: { get: () => '' },
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  });

  const first = await runner.resolveXhsNote({ url: 'https://xhslink.com/once' });
  assert.equal(first.ok, true, first.message);
  assert.equal(first.fromCache, false);
  assert.equal(fetchCalls, 1);
  assert.ok(readNotePayload(cacheDir, noteId));

  const second = await runner.resolveXhsNote({
    url: `https://www.xiaohongshu.com/explore/${noteId}`,
  });
  assert.equal(second.ok, true, second.message);
  assert.equal(second.fromCache, true);
  assert.equal(fetchCalls, 1);
});

test('import 优先用 coverDataUrl，不再二次拉 CDN', async () => {
  const root = tempDir();
  const tinyJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
    'base64',
  );
  const dataUrl = `data:image/jpeg;base64,${tinyJpeg.toString('base64')}`;
  let fetchHits = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: path.join(root, 'xhs-notes'),
    userXhsNotesCacheDir: path.join(root, 'cache', 'xhs-notes'),
    fetch: async () => {
      fetchHits += 1;
      throw new Error('不应再拉 CDN');
    },
  });

  const imported = await runner.importXhsNote({
    url: 'https://xhslink.com/preferData',
    note: NOTE,
    learnArticle: false,
    learnCover: true,
    learnInner: false,
    coverDataUrl: dataUrl,
  });
  assert.equal(imported.ok, true, imported.message);
  assert.equal(imported.learnImages.length, 1);
  assert.equal(imported.learnImages[0].role, 'cover');
  assert.equal(imported.learnImages[0].source.role, 'cover');
  assert.equal(fetchHits, 0);
});
