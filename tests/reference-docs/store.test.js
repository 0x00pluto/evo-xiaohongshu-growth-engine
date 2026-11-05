'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  deleteReferenceDoc,
  listReferenceDocs,
  publicListItem,
  readReferenceDoc,
  saveReferenceDoc,
  splitPasteToDoc,
} = require('../../src/reference-docs/store');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reference-docs-'));
}

test('参考资料库可新建、列表、改写与删除', () => {
  const libraryDir = path.join(tempDir(), 'reference-docs');
  const created = saveReferenceDoc(libraryDir, {
    name: ' 早鸟课 ',
    body: '9 月开课。\n\n早鸟价 99。',
  });
  assert.ok(created.id);
  assert.equal(created.name, '早鸟课');
  assert.match(created.body, /早鸟价/);
  const metaPath = path.join(libraryDir, created.id, 'meta.json');
  assert.equal(fs.existsSync(metaPath), true);

  const listed = listReferenceDocs(libraryDir);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);
  const preview = publicListItem(listed[0]);
  assert.ok(preview.preview.includes('早鸟价'));
  assert.match(preview.preview, /\n/);
  assert.equal(preview.body, created.body);

  const updated = saveReferenceDoc(libraryDir, {
    id: created.id,
    name: '早鸟课改',
    body: '新正文一段。',
  });
  assert.equal(updated.id, created.id);
  assert.equal(readReferenceDoc(libraryDir, created.id).name, '早鸟课改');

  deleteReferenceDoc(libraryDir, created.id);
  assert.equal(listReferenceDocs(libraryDir).length, 0);
  assert.equal(fs.existsSync(path.join(libraryDir, created.id)), false);
});

test('名称或正文为空、正文超长都拒绝', () => {
  const libraryDir = path.join(tempDir(), 'reference-docs');
  assert.throws(() => saveReferenceDoc(libraryDir, { name: '  ', body: '有正文' }), /请写上名称/);
  assert.throws(() => saveReferenceDoc(libraryDir, { name: '有名称', body: '  ' }), /请写上正文/);
  assert.throws(
    () => saveReferenceDoc(libraryDir, { name: '有名称', body: '字'.repeat(8001) }),
    /8000/,
  );
});

test('新建时正文全等复用已有条目', () => {
  const libraryDir = path.join(tempDir(), 'reference-docs');
  const first = saveReferenceDoc(libraryDir, {
    name: '产品 A',
    body: '卖点一。',
  });
  const second = saveReferenceDoc(libraryDir, {
    name: '另一个名字',
    body: '卖点一。',
  });
  assert.equal(second.id, first.id);
  assert.equal(second.name, '产品 A');
  assert.equal(listReferenceDocs(libraryDir).length, 1);
});

test('整篇粘贴按首行拆名称与正文', () => {
  assert.deepEqual(splitPasteToDoc('课程名\n开课日期\n\n价格'), {
    name: '课程名',
    body: '开课日期\n\n价格',
  });
  const oneLine = splitPasteToDoc('只有一行很长的内容');
  assert.equal(oneLine.name, Array.from('只有一行很长的内容').slice(0, 20).join(''));
  assert.equal(oneLine.body, '只有一行很长的内容');
});
