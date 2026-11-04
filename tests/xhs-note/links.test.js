'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  findXhsNoteLinkByUrl,
  listXhsNoteLinks,
  rememberInputUrl,
  saveXhsNoteLink,
} = require('../../src/xhs-note/links');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-notes-'));
}

test('链接资源按 sourceUrl 与 inputUrls 全等判断收录', () => {
  const libraryDir = path.join(tempDir(), 'xhs-notes');
  const saved = saveXhsNoteLink(libraryDir, {
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
    inputUrl: 'https://xhslink.com/short1',
    title: '标题',
    body: '正文',
    tags: ['话题'],
    images: [{ url: 'https://img.example/a.jpg', role: 'cover' }],
    fetchedAt: '2026-11-04T12:00:00+08:00',
  });
  assert.ok(saved.id);
  assert.equal(listXhsNoteLinks(libraryDir).length, 1);

  assert.equal(
    findXhsNoteLinkByUrl(libraryDir, 'https://www.xiaohongshu.com/explore/abc123')?.id,
    saved.id,
  );
  assert.equal(
    findXhsNoteLinkByUrl(libraryDir, 'https://xhslink.com/short1')?.id,
    saved.id,
  );
  assert.equal(findXhsNoteLinkByUrl(libraryDir, 'https://xhslink.com/other'), null);

  rememberInputUrl(libraryDir, saved.sourceUrl, 'https://xhslink.com/short2');
  assert.ok(findXhsNoteLinkByUrl(libraryDir, 'https://xhslink.com/short2'));
});

test('同一 sourceUrl 再次保存合并 inputUrls，不新建第二条', () => {
  const libraryDir = path.join(tempDir(), 'xhs-notes');
  const first = saveXhsNoteLink(libraryDir, {
    sourceUrl: 'https://www.xiaohongshu.com/explore/same',
    inputUrl: 'https://xhslink.com/a',
    title: 'A',
    body: 'body',
  });
  const second = saveXhsNoteLink(libraryDir, {
    sourceUrl: 'https://www.xiaohongshu.com/explore/same',
    inputUrl: 'https://xhslink.com/b',
    title: 'B',
    body: 'body2',
  });
  assert.equal(first.id, second.id);
  assert.equal(listXhsNoteLinks(libraryDir).length, 1);
  assert.ok(second.inputUrls.includes('https://xhslink.com/a'));
  assert.ok(second.inputUrls.includes('https://xhslink.com/b'));
});
