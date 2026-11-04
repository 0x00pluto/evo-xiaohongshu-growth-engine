'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRunner } = require('../../src/one-post/run');
const { findXhsNoteLinkByUrl, listXhsNoteLinks } = require('../../src/xhs-note/links');
const { listArticleSamples } = require('../../src/article-samples/store');

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

test('resolve 已收录则停；首次 import 写链接与范文', async () => {
  const root = tempDir();
  const notesDir = path.join(root, 'xhs-notes');
  const samplesDir = path.join(root, 'article-samples');
  let fetchCalls = 0;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: samplesDir,
    userXhsNotesDir: notesDir,
    fetchNoteByUrl: async (url) => {
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

  const imported = await runner.importXhsNote({
    url: shortUrl,
    note: first.note,
    learnArticle: true,
    learnCover: false,
    learnInner: false,
  });
  assert.equal(imported.ok, true, imported.message);
  assert.ok(imported.articleSample?.id);
  assert.equal(listXhsNoteLinks(notesDir).length, 1);
  assert.equal(listArticleSamples(samplesDir).length, 1);
  assert.ok(findXhsNoteLinkByUrl(notesDir, shortUrl));
  assert.ok(findXhsNoteLinkByUrl(notesDir, NOTE.sourceUrl));

  const again = await runner.resolveXhsNote({ url: shortUrl });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'ALREADY');
  assert.equal(fetchCalls, 1);

  const exploreAgain = await runner.resolveXhsNote({ url: NOTE.sourceUrl });
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
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: notesDir,
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
