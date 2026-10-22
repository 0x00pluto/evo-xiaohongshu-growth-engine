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
    const html = await page.text();
    assert.match(html, /本机运行操作台/);
    assert.doesNotMatch(html, /EventSource/);
    assert.doesNotMatch(html, /还没做/);
    assert.match(html, /iconify-icon/);
    assert.match(html, /toggleNav/);
    const shellFile = await fetch(`${started.url}shell.js`);
    assert.equal(shellFile.status, 200);
    const shellText = await shellFile.text();
    assert.match(shellText, /生成笔记/);
    assert.match(shellText, /lucide:notebook-pen/);
    assert.match(shellText, /xhs-studio-nav-collapsed/);
    const noteFile = await fetch(`${started.url}pages/note.html`);
    assert.equal(noteFile.status, 200);
    const noteHtml = await noteFile.text();
    assert.match(noteHtml, /复制这篇/);
    assert.match(noteHtml, /这张的提示词/);
    assert.doesNotMatch(noteHtml, /只发头图/);
    assert.doesNotMatch(noteHtml, /让画面跟上/);
    assert.doesNotMatch(noteHtml, /待重算/);
    assert.doesNotMatch(noteHtml, /id="reading"/);
    assert.match(noteHtml, /文章类型/);
    assert.match(noteHtml, /种草/);
    assert.match(noteHtml, /引流/);
    assert.match(noteHtml, /素人/);
    assert.doesNotMatch(noteHtml, /<select[^>]*setType/);
    assert.match(noteHtml, /drawLabel\(item\)/);
    assert.match(noteHtml, /onChooseVersion/);
    assert.doesNotMatch(noteHtml, /封面上的这句话/);
    assert.doesNotMatch(noteHtml, /做出封面和配图/);
    assert.doesNotMatch(noteHtml, /id="cover-type"/);

    const libraryFile = await fetch(`${started.url}pages/library.html`);
    assert.equal(libraryFile.status, 200);
    const libraryHtml = await libraryFile.text();
    assert.match(libraryHtml, /animations\/image-scan\.json/);
    assert.match(libraryHtml, /learn-line/);
    assert.doesNotMatch(libraryHtml, /正在学习参考图，请稍等/);
    const albumsFile = await fetch(`${started.url}pages/library/albums.js`);
    assert.equal(albumsFile.status, 200);
    const albumsText = await albumsFile.text();
    assert.match(albumsText, /正在端详这张参考图/);
    assert.match(albumsText, /马上生成你的图册草稿/);
    const scanFile = await fetch(`${started.url}animations/image-scan.json`);
    assert.equal(scanFile.status, 200);

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

test('改静态文件会通知浏览器刷新，片段页不插脚本', async () => {
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-static-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-studio-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<html><body>入口</body></html>');
  fs.mkdirSync(path.join(staticDir, 'pages'));
  fs.writeFileSync(path.join(staticDir, 'pages', 'note.html'), '<p>片段</p>');
  const started = await startServer({
    host: '127.0.0.1',
    port: 0,
    root,
    env: {},
    staticDir,
    reload: true,
  });
  let reader;
  try {
    const page = await fetch(started.url);
    const html = await page.text();
    assert.match(html, /EventSource\("\/api\/dev\/reload"\)/);
    assert.match(html, /<\/script><\/body>/);
    const note = await fetch(`${started.url}pages/note.html`);
    assert.doesNotMatch(await note.text(), /EventSource/);

    const stream = await fetch(`${started.url}api/dev/reload`);
    assert.equal(stream.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let received = '';
    const pending = (async () => {
      while (!received.includes('data: reload')) {
        const chunk = await reader.read();
        if (chunk.done) break;
        received += decoder.decode(chunk.value, { stream: true });
      }
      return received;
    })();
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    fs.writeFileSync(path.join(staticDir, 'shell.js'), 'console.log(1)\n');
    const body = await Promise.race([
      pending,
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('没有收到刷新')), 2000);
      }),
    ]);
    assert.match(body, /data: reload/);
  } finally {
    if (reader) await reader.cancel();
    await started.close();
  }
});
