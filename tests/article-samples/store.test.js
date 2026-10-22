'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  deleteArticleSample,
  listArticleSamples,
  publicListItem,
  readArticleSample,
  saveArticleSample,
  splitPasteToSample,
} = require('../../src/article-samples/store');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'article-samples-'));
}

test('范文库可新建、列表、改写与删除', () => {
  const libraryDir = path.join(tempDir(), 'article-samples');
  const created = saveArticleSample(libraryDir, {
    title: ' 引流骨架 ',
    body: '开头钩子。\n\n中间三点。',
  });
  assert.ok(created.id);
  assert.equal(created.title, '引流骨架');
  assert.match(created.body, /开头钩子/);
  const metaPath = path.join(libraryDir, created.id, 'meta.json');
  assert.equal(fs.existsSync(metaPath), true);

  const listed = listArticleSamples(libraryDir);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);
  const preview = publicListItem(listed[0]);
  assert.ok(preview.preview.includes('开头钩子'));
  assert.match(preview.preview, /\n/);

  const updated = saveArticleSample(libraryDir, {
    id: created.id,
    title: '引流骨架改',
    body: '新正文一段。',
  });
  assert.equal(updated.id, created.id);
  assert.equal(readArticleSample(libraryDir, created.id).title, '引流骨架改');

  deleteArticleSample(libraryDir, created.id);
  assert.equal(listArticleSamples(libraryDir).length, 0);
  assert.equal(fs.existsSync(path.join(libraryDir, created.id)), false);
});

test('标题或正文为空、正文超长都拒绝', () => {
  const libraryDir = path.join(tempDir(), 'article-samples');
  assert.throws(() => saveArticleSample(libraryDir, { title: '  ', body: '有正文' }), /请写上标题/);
  assert.throws(() => saveArticleSample(libraryDir, { title: '有标题', body: '  ' }), /请写上正文/);
  assert.throws(
    () => saveArticleSample(libraryDir, { title: '有标题', body: '字'.repeat(8001) }),
    /8000/,
  );
});

test('整篇粘贴按首行拆标题与正文', () => {
  assert.deepEqual(splitPasteToSample('标题一行\n正文第一段\n\n第二段'), {
    title: '标题一行',
    body: '正文第一段\n\n第二段',
  });
  const oneLine = splitPasteToSample('只有一行很长的内容');
  assert.equal(oneLine.title, Array.from('只有一行很长的内容').slice(0, 20).join(''));
  assert.equal(oneLine.body, '只有一行很长的内容');
});
