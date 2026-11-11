'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRunner } = require('../../src/one-post/run');
const {
  findXhsNoteLinkByUrl,
  listXhsNoteLinks,
  readXhsNoteLink,
  saveXhsNoteLink,
  attachLearnedArticle,
  attachLearnedAlbum,
  patchLearnedFingerprints,
} = require('../../src/xhs-note/links');
const { listArticleSamples, readArticleSample } = require('../../src/article-samples/store');
const { readNotePayload, writeNotePayload } = require('../../src/xhs-note/cache');
const { articleTextHash, contentMd5FromDataUrl } = require('../../src/xhs-note/fingerprint');

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

test('首次 import 写链接与 cache；再 resolve 比较而非 ALREADY；30 分钟内不二次取料', async () => {
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
  assert.ok(linkMeta?.learned.articleTextHash);

  assert.ok(findXhsNoteLinkByUrl(notesDir, shortUrl));
  assert.ok(findXhsNoteLinkByUrl(notesDir, NOTE.sourceUrl));

  const again = await runner.resolveXhsNote({ url: shortUrl });
  assert.equal(again.ok, true, again.message);
  assert.equal(again.code, undefined);
  assert.equal(again.fromCache, true);
  assert.ok(again.compare);
  assert.equal(again.compare.article.status, 'unchanged');
  assert.equal(again.compare.cover.status, 'new');
  assert.equal(fetchCalls, 1);

  const exploreAgain = await runner.resolveXhsNote({
    url: `${NOTE.sourceUrl}?xsec_token=changed`,
  });
  assert.equal(exploreAgain.ok, true, exploreAgain.message);
  assert.equal(exploreAgain.fromCache, true);
  assert.ok(exploreAgain.compare);
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

test('短链二次解析到同一 sourceUrl 时补 inputUrls 并返回比较', async () => {
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
  assert.equal(second.ok, true, second.message);
  assert.ok(second.compare);
  assert.equal(second.link?.noteId, 'testdelete000000000001');
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

test('resolve：带 token 取料走规范链；同 noteId 无 query 再取命中 cache', async () => {
  const root = tempDir();
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const noteId = 'tokencanon00000000001';
  /** @type {string[]} */
  const fetchUrls = [];
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: path.join(root, 'xhs-notes'),
    userXhsNotesCacheDir: cacheDir,
    fetchNoteByUrl: async (url) => {
      fetchUrls.push(String(url || ''));
      return {
        ok: true,
        note: {
          ...NOTE,
          sourceUrl: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=from-plugin`,
        },
      };
    },
    fetch: async () => {
      throw new Error('测试不下真图');
    },
  });

  const dirty = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=AB9U&xsec_source=pc_feed`;
  const first = await runner.resolveXhsNote({ url: dirty });
  assert.equal(first.ok, true, first.message);
  assert.equal(first.fromCache, false);
  assert.deepEqual(fetchUrls, [`https://www.xiaohongshu.com/explore/${noteId}`]);
  assert.equal(first.note.sourceUrl, `https://www.xiaohongshu.com/explore/${noteId}`);

  const second = await runner.resolveXhsNote({
    url: `https://www.xiaohongshu.com/explore/${noteId}`,
  });
  assert.equal(second.ok, true, second.message);
  assert.equal(second.fromCache, true);
  assert.equal(fetchUrls.length, 1);
});

test('resolve：linkId + 短链在 cache 新鲜时不真拉', async () => {
  const root = tempDir();
  const notesDir = path.join(root, 'xhs-notes');
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const noteId = 'relinkshort0000000001';
  const saved = saveXhsNoteLink(notesDir, {
    sourceUrl: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=old`,
    inputUrl: 'https://xhslink.com/relinkOld',
    title: '已学',
  });
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
    userXhsNotesDir: notesDir,
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
    linkId: saved.id,
    url: 'https://xhslink.com/neverSeenShort',
  });
  assert.equal(resolved.ok, true, resolved.message);
  assert.equal(resolved.fromCache, true);
  assert.equal(fetchCalls, 0);
  assert.equal(resolved.link?.noteId, noteId);
  assert.equal(readXhsNoteLink(notesDir, saved.id)?.sourceUrl,
    `https://www.xiaohongshu.com/explore/${noteId}`);
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

test('已知链接 missing_fp：勾选后只补指纹，不产出重学队列', async () => {
  const root = tempDir();
  const notesDir = path.join(root, 'xhs-notes');
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const samplesDir = path.join(root, 'article-samples');
  const tinyJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
    'base64',
  );
  const dataUrl = `data:image/jpeg;base64,${tinyJpeg.toString('base64')}`;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: samplesDir,
    userXhsNotesDir: notesDir,
    userXhsNotesCacheDir: cacheDir,
  });

  const link = saveXhsNoteLink(notesDir, {
    noteId: 'testdelete000000000001',
    sourceUrl: NOTE.sourceUrl,
    inputUrl: 'https://xhslink.com/fpOnly',
    title: NOTE.title,
    fetchedAt: NOTE.fetchedAt,
  });
  attachLearnedArticle(notesDir, link.id, 'sample-legacy');
  attachLearnedAlbum(notesDir, link.id, 'album-cover-legacy', 'cover');

  const imported = await runner.importXhsNote({
    url: 'https://xhslink.com/fpOnly',
    note: NOTE,
    learnArticle: true,
    learnCover: true,
    learnInner: false,
    coverDataUrl: dataUrl,
  });
  assert.equal(imported.ok, true, imported.message);
  assert.equal(imported.wantArticle, false);
  assert.equal(imported.learnImages.length, 0);
  const meta = readXhsNoteLink(notesDir, link.id);
  assert.equal(meta?.learned.articleSampleId, 'sample-legacy');
  assert.equal(meta?.learned.articleTextHash, articleTextHash(NOTE.title, NOTE.body));
  const coverRow = meta?.learned.albums.find((row) => row.role === 'cover');
  assert.equal(coverRow?.albumId, 'album-cover-legacy');
  assert.equal(coverRow?.contentMd5, contentMd5FromDataUrl(dataUrl));
});

test('已知链接文案变更：写回原 articleSampleId', async () => {
  const root = tempDir();
  const notesDir = path.join(root, 'xhs-notes');
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const samplesDir = path.join(root, 'article-samples');
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: samplesDir,
    userXhsNotesDir: notesDir,
    userXhsNotesCacheDir: cacheDir,
  });

  const first = await runner.importXhsNote({
    url: 'https://xhslink.com/rewriteArt',
    note: NOTE,
    learnArticle: true,
    learnCover: false,
    learnInner: false,
  });
  const saved = runner.saveXhsNoteArticle({
    linkId: first.link.id,
    note: NOTE,
  });
  const sampleId = saved.articleSample.id;

  const changedNote = {
    ...NOTE,
    title: '新标题',
    body: '新正文内容。',
  };
  const again = await runner.importXhsNote({
    url: 'https://xhslink.com/rewriteArt',
    note: changedNote,
    learnArticle: true,
    learnCover: false,
    learnInner: false,
  });
  assert.equal(again.ok, true, again.message);
  assert.equal(again.wantArticle, true);
  assert.equal(again.articleSampleId, sampleId);

  const rewritten = runner.saveXhsNoteArticle({
    linkId: again.link.id,
    note: changedNote,
    articleSampleId: again.articleSampleId,
  });
  assert.equal(rewritten.ok, true, rewritten.message);
  assert.equal(rewritten.articleSample.id, sampleId);
  assert.equal(listArticleSamples(samplesDir).length, 1);
  const sample = readArticleSample(samplesDir, sampleId);
  assert.equal(sample?.title, '新标题');
  assert.equal(sample?.body, '新正文内容。');
});

test('list / get / delete 对标笔记级联删范文', async () => {
  const root = tempDir();
  const notesDir = path.join(root, 'xhs-notes');
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const samplesDir = path.join(root, 'article-samples');
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: samplesDir,
    userXhsNotesDir: notesDir,
    userXhsNotesCacheDir: cacheDir,
  });

  const imported = await runner.importXhsNote({
    url: 'https://xhslink.com/deleteMe',
    note: NOTE,
    learnArticle: true,
    learnCover: false,
    learnInner: false,
  });
  const article = runner.saveXhsNoteArticle({
    linkId: imported.link.id,
    note: NOTE,
  });

  const listed = runner.listLibraryXhsNotes();
  assert.equal(listed.ok, true);
  assert.equal(listed.notes.length, 1);
  assert.equal(listed.notes[0].id, imported.link.id);

  const detail = runner.getLibraryXhsNote({ id: imported.link.id });
  assert.equal(detail.ok, true);
  assert.equal(detail.article?.id, article.articleSample.id);
  assert.equal(detail.articleMissing, false);
  assert.equal(detail.link?.sourceUrl, NOTE.sourceUrl);
  // 短链无 xsec_token：不可点开
  assert.equal(detail.link?.openUrl, '');

  const deleted = runner.deleteLibraryXhsNote({ id: imported.link.id });
  assert.equal(deleted.ok, true, deleted.message);
  assert.equal(listXhsNoteLinks(notesDir).length, 0);
  assert.equal(listArticleSamples(samplesDir).length, 0);
  assert.equal(runner.getLibraryXhsNote({ id: imported.link.id }).ok, false);
});

test('指纹齐全且内容未变：import 返回 allUnchanged', async () => {
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
  });

  const link = saveXhsNoteLink(notesDir, {
    noteId: 'testdelete000000000001',
    sourceUrl: NOTE.sourceUrl,
    inputUrl: 'https://xhslink.com/same',
    title: NOTE.title,
    fetchedAt: NOTE.fetchedAt,
  });
  const textHash = articleTextHash(NOTE.title, NOTE.body);
  attachLearnedArticle(notesDir, link.id, 'sample-same', textHash);
  attachLearnedAlbum(notesDir, link.id, 'album-cover', 'cover');
  patchLearnedFingerprints(notesDir, link.id, {
    albums: [{ albumId: 'album-cover', role: 'cover', contentMd5: 'deadbeef' }],
  });

  const imported = await runner.importXhsNote({
    url: 'https://xhslink.com/same',
    note: NOTE,
    learnArticle: true,
    learnCover: true,
    learnInner: false,
    coverDataUrl: 'data:image/jpeg;base64,AAAA',
  });
  // cover MD5 of AAAA != deadbeef → changed；再测文案未变路径
  assert.equal(imported.ok, true);
  // 只勾文案且哈希相同 → allUnchanged
  const articleOnly = await runner.importXhsNote({
    url: 'https://xhslink.com/same',
    note: NOTE,
    learnArticle: true,
    learnCover: false,
    learnInner: false,
  });
  assert.equal(articleOnly.ok, true);
  assert.equal(articleOnly.allUnchanged, true);
  assert.equal(articleOnly.wantArticle, false);
  assert.equal(articleOnly.learnImages.length, 0);
});

test('空取料不覆盖已有可学 cache；回退旧包', async () => {
  const root = tempDir();
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const noteId = 'emptyfetch00000000001';
  const sourceUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
  const good = {
    ...NOTE,
    sourceUrl,
    title: '旧的好内容',
    body: '旧正文还在。',
  };
  writeNotePayload(cacheDir, noteId, good);
  const before = readNotePayload(cacheDir, noteId);
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
          sourceUrl,
          title: '',
          body: '',
          tags: [],
          images: [],
          fetchedAt: '',
        },
      };
    },
  });

  // 先让 cache 过期：改 meta 为很久以前
  const metaPath = path.join(cacheDir, noteId, 'cache-meta.json');
  fs.writeFileSync(metaPath, `${JSON.stringify({ fetchedAtMs: Date.now() - 60 * 60 * 1000 }, null, 2)}\n`);

  const resolved = await runner.resolveXhsNote({ url: sourceUrl });
  assert.equal(resolved.ok, true, resolved.message);
  assert.equal(resolved.fromCache, true);
  assert.equal(fetchCalls, 1);
  assert.equal(resolved.parts.title, '旧的好内容');
  const after = readNotePayload(cacheDir, noteId);
  assert.equal(after && after.body, before && before.body);
  assert.equal(after && after.title, '旧的好内容');
});

test('新鲜空壳 cache 当 miss：再取可学内容并覆盖', async () => {
  const root = tempDir();
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const noteId = 'emptyshell00000000001';
  const sourceUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
  writeNotePayload(cacheDir, noteId, {
    sourceUrl,
    title: '',
    body: '',
    tags: [],
    images: [],
    fetchedAt: '',
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
      return {
        ok: true,
        note: {
          ...NOTE,
          sourceUrl,
          title: '补回正文',
          body: '新取到的正文。',
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

  const resolved = await runner.resolveXhsNote({ url: sourceUrl });
  assert.equal(resolved.ok, true, resolved.message);
  assert.equal(resolved.fromCache, false);
  assert.equal(fetchCalls, 1);
  assert.equal(resolved.parts.title, '补回正文');
  const saved = readNotePayload(cacheDir, noteId);
  assert.equal(saved && saved.body, '新取到的正文。');
});

test('空取料且无旧包：失败且不落盘', async () => {
  const root = tempDir();
  const cacheDir = path.join(root, 'cache', 'xhs-notes');
  const noteId = 'noopayload0000000001';
  const sourceUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: path.join(root, 'xhs-notes'),
    userXhsNotesCacheDir: cacheDir,
    fetchNoteByUrl: async () => ({
      ok: true,
      note: {
        sourceUrl,
        title: '空',
        body: '',
        tags: [],
        images: [],
        fetchedAt: '',
      },
    }),
  });

  const resolved = await runner.resolveXhsNote({ url: sourceUrl });
  assert.equal(resolved.ok, false);
  assert.match(String(resolved.message || ''), /没有正文也没有图/);
  assert.equal(readNotePayload(cacheDir, noteId), null);
});
