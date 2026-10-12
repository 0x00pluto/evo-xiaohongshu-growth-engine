'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main, startServer } = require('../../scripts/run-studio');

test('非本机 host 拒绝启动', async () => {
  assert.throws(() => startServer({ host: '0.0.0.0', port: 0 }), /拒绝非本机绑定/);
  assert.equal(await main(['--host', '0.0.0.0']), 2);
});

test('本机服务的 loadLatest 在空目录返回空态', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-studio-'));
  const started = await startServer({ host: '127.0.0.1', port: 0, root, env: {} });
  try {
    const page = await fetch(started.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /本机运行操作台/);
    const shellFile = await fetch(`${started.url}shell.js`);
    assert.equal(shellFile.status, 200);
    assert.match(await shellFile.text(), /生成笔记/);
    const noteFile = await fetch(`${started.url}pages/note.html`);
    assert.equal(noteFile.status, 200);
    assert.match(await noteFile.text(), /复制这篇笔记/);

    const response = await fetch(`${started.url}api/one-post/loadLatest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.draft, null);
    assert.equal(body.galleryCount, 1);
    assert.equal(body.business, '');
    assert.equal(fs.existsSync(path.join(root, 'output', 'one-post', 'latest', 'draft.json')), false);

    const blocked = await fetch(`${started.url}api/one-post/generateDraft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business: '   ', article: '', galleryCount: 1 }),
    });
    const rejected = await blocked.json();
    assert.equal(rejected.ok, false);
    assert.equal(rejected.message, '先用一句话说你要发什么。');
    assert.equal(fs.existsSync(path.join(root, 'output', 'one-post', 'latest', 'draft.json')), false);
  } finally {
    await started.close();
  }
});
