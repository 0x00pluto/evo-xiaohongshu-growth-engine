'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  attachLearnedAlbum,
  attachLearnedArticle,
  findXhsNoteLinkByNoteId,
  findXhsNoteLinkByUrl,
  listXhsNoteLinks,
  rememberInputUrl,
  saveXhsNoteLink,
} = require('../../src/xhs-note/links');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-notes-'));
}

test('链接资源按 noteId 去重；不同 xsec 仍命中同一篇', () => {
  const libraryDir = path.join(tempDir(), 'xhs-notes');
  const saved = saveXhsNoteLink(libraryDir, {
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=old',
    inputUrl: 'https://xhslink.com/short1',
    title: '标题',
    fetchedAt: '2026-11-04T12:00:00+08:00',
  });
  assert.ok(saved.id);
  assert.equal(saved.noteId, 'abc123');
  assert.equal(listXhsNoteLinks(libraryDir).length, 1);

  assert.equal(
    findXhsNoteLinkByUrl(
      libraryDir,
      'https://www.xiaohongshu.com/explore/abc123?xsec_token=new&xsec_source=pc_feed',
    )?.id,
    saved.id,
  );
  assert.equal(findXhsNoteLinkByNoteId(libraryDir, 'abc123')?.id, saved.id);
  assert.equal(
    findXhsNoteLinkByUrl(libraryDir, 'https://xhslink.com/short1')?.id,
    saved.id,
  );
  assert.equal(findXhsNoteLinkByUrl(libraryDir, 'https://xhslink.com/other'), null);

  rememberInputUrl(libraryDir, saved.sourceUrl, 'https://xhslink.com/short2');
  assert.ok(findXhsNoteLinkByUrl(libraryDir, 'https://xhslink.com/short2'));
});

test('同一 noteId 再次保存合并 inputUrls，不新建第二条', () => {
  const libraryDir = path.join(tempDir(), 'xhs-notes');
  const first = saveXhsNoteLink(libraryDir, {
    sourceUrl: 'https://www.xiaohongshu.com/explore/sameid',
    inputUrl: 'https://xhslink.com/a',
    title: 'A',
  });
  const second = saveXhsNoteLink(libraryDir, {
    sourceUrl: 'https://www.xiaohongshu.com/explore/sameid?xsec_token=x',
    inputUrl: 'https://xhslink.com/b',
    title: 'B',
  });
  assert.equal(first.id, second.id);
  assert.equal(listXhsNoteLinks(libraryDir).length, 1);
  assert.ok(second.inputUrls.includes('https://xhslink.com/a'));
  assert.ok(second.inputUrls.includes('https://xhslink.com/b'));
});

test('双向溯源：范文与图册回写 learned', () => {
  const libraryDir = path.join(tempDir(), 'xhs-notes');
  const saved = saveXhsNoteLink(libraryDir, {
    sourceUrl: 'https://www.xiaohongshu.com/explore/linkback01',
    title: '溯源',
  });
  attachLearnedArticle(libraryDir, saved.id, 'sample01');
  attachLearnedAlbum(libraryDir, saved.id, '100001.foo.bar', 'cover');
  attachLearnedAlbum(libraryDir, saved.id, '100002.foo.baz', 'inner');
  const again = findXhsNoteLinkByNoteId(libraryDir, 'linkback01');
  assert.equal(again?.learned.articleSampleId, 'sample01');
  assert.equal(again?.learned.albums.length, 2);
  assert.equal(again?.learned.albums[0].albumId, '100001.foo.bar');
  assert.equal(again?.learned.albums[1].role, 'inner');
});
