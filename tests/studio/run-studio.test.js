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
    assert.match(noteHtml, /人设/);
    assert.match(noteHtml, />目的</);
    assert.match(noteHtml, /grid grid-cols-2/);
    assert.match(noteHtml, /goalOptionLabel/);
    assert.match(noteHtml, /personaHelp/);
    assert.match(noteHtml, /goalHelp/);
    assert.match(noteHtml, /comboBriefHtml/);
    assert.match(noteHtml, /id="combo-brief"/);
    assert.match(noteHtml, /x-html="comboBriefHtml\(\)"/);
    const comboIdx = noteHtml.indexOf('id="combo-brief"');
    const businessIdx = noteHtml.indexOf('id="business"');
    assert.ok(comboIdx > 0 && businessIdx > comboIdx, '组合说明应在业务输入之前');
    assert.match(noteHtml, /lucide:circle-help/);
    assert.match(noteHtml, /lucide:file-text/);
    assert.match(noteHtml, /openReferenceEditor/);
    assert.match(noteHtml, /id="add-reference"/);
    assert.match(noteHtml, /references\.length >= 5/);
    assert.match(noteHtml, /id="reference-editor-modal"/);
    assert.doesNotMatch(noteHtml, /事实内容/);
    assert.match(noteHtml, /id="sample-hint"/);
    assert.match(noteHtml, /从库挑一篇仿写/);
    assert.match(noteHtml, /openPickSample/);
    assert.match(noteHtml, /openCreateSample/);
    assert.match(noteHtml, /id="sample-pick-library-modal"/);
    assert.match(noteHtml, /id="sample-create-modal"/);
    assert.match(noteHtml, /createSamplePaste/);
    assert.match(noteHtml, /canGenerateDraft/);
    assert.match(noteHtml, /phase === 'materials'/);
    assert.doesNotMatch(noteHtml, /x-model="sampleBody"/);
    assert.doesNotMatch(noteHtml, /已选仍显示新建/);
    // 操作条与 hint 同行靠右；面板内只有正文预览
    const sampleSection = noteHtml.slice(noteHtml.indexOf('id="sample-hint"') - 200, noteHtml.indexOf('id="gallery-count"'));
    assert.match(sampleSection, /justify-between/);
    assert.match(sampleSection, /id="sample-actions"/);
    const hintIdx = sampleSection.indexOf('id="sample-hint"');
    const actionsIdx = sampleSection.indexOf('id="sample-actions"');
    const toggleIdx = sampleSection.indexOf('id="toggle-sample"');
    assert.ok(hintIdx >= 0 && actionsIdx > hintIdx, 'sample-actions 应在 sample-hint 之后');
    assert.ok(toggleIdx < 0 || actionsIdx < toggleIdx, 'sample-actions 应在折叠框之前');
    assert.match(sampleSection, /id="pick-sample"[^>]*btn-ghost/);
    assert.match(sampleSection, /id="create-sample"/);
    assert.match(sampleSection, />新建</);
    assert.doesNotMatch(sampleSection, /新建到库/);
    assert.match(sampleSection, /id="clear-sample"/);
    assert.match(sampleSection, /id="swap-sample"/);
    const samplePanel = noteHtml.slice(noteHtml.indexOf('id="sample-panel"'), noteHtml.indexOf('id="sample-error"'));
    assert.doesNotMatch(samplePanel, /清除/);
    assert.doesNotMatch(samplePanel, /换一篇/);
    assert.doesNotMatch(samplePanel, /从库挑/);
    assert.doesNotMatch(samplePanel, />新建</);
    assert.match(noteHtml, /personaOptions/);
    assert.match(noteHtml, /goalOptions/);
    assert.doesNotMatch(noteHtml, /personaOptionLabel/);
    assert.doesNotMatch(noteHtml, /文章类型/);
    assert.doesNotMatch(noteHtml, /<select[^>]*setType/);
    assert.match(noteHtml, /drawLabel\(item\)/);
    assert.match(noteHtml, /onChooseVersion/);
    assert.doesNotMatch(noteHtml, /封面上的这句话/);
    assert.doesNotMatch(noteHtml, /做出封面和配图/);
    assert.doesNotMatch(noteHtml, /id="cover-type"/);
    const sampleIdx = noteHtml.indexOf('id="toggle-sample"');
    const galleryIdx = noteHtml.indexOf('id="gallery-count"');
    assert.ok(sampleIdx > 0 && galleryIdx > sampleIdx, '范文应在张数之上');

    const noteJsFile = await fetch(`${started.url}pages/note.js`);
    assert.equal(noteJsFile.status, 200);
    const noteJs = await noteJsFile.text();
    assert.match(noteJs, /RECOMMENDED_GOALS_BY_PERSONA/);
    assert.match(noteJs, /PERSONA_HELP/);
    assert.match(noteJs, /GOAL_HELP/);
    assert.match(noteJs, /goalOptionLabel/);
    assert.doesNotMatch(noteJs, /personaOptionLabel/);
    assert.match(noteJs, /★ \$\{goal\}/);
    assert.doesNotMatch(noteJs, /★ \$\{persona\}/);
    assert.match(noteJs, /素人:\s*\['种草',\s*'搜索'\]/);
    assert.match(noteJs, /官号:\s*\['引流',\s*'曝光',\s*'搜索',\s*'转化'\]/);
    assert.match(noteJs, /员工:\s*\['种草',\s*'引流',\s*'搜索',\s*'转化'\]/);
    assert.match(noteJs, /覆盖查询意图/);
    assert.match(noteJs, /PERSONA_BRIEF/);
    assert.match(noteJs, /GOAL_BRIEF/);
    assert.match(noteJs, /comboBriefHtml/);
    assert.match(noteJs, /font-medium text-base-content/);
    assert.match(noteJs, /身份：/);
    assert.match(noteJs, /语气：/);
    assert.match(noteJs, /目标：/);
    assert.match(noteJs, /靠长尾关键词获得长期的搜索流量/);
    assert.match(noteJs, /REFERENCES_MAX = 5/);
    assert.match(noteJs, /listLibraryArticleSamples/);
    assert.match(noteJs, /saveLibraryArticleSample/);
    assert.match(noteJs, /splitPasteToSample/);
    assert.match(noteJs, /get canGenerateDraft/);

    const libraryFile = await fetch(`${started.url}pages/library.html`);
    assert.equal(libraryFile.status, 200);
    const libraryHtml = await libraryFile.text();
    assert.match(libraryHtml, /animations\/image-scan\.json/);
    assert.match(libraryHtml, /learn-line/);
    assert.doesNotMatch(libraryHtml, /正在学习参考图，请稍等/);
    assert.match(libraryHtml, /toast-top toast-center/);
    assert.match(libraryHtml, /@library-toast\.window/);
    assert.doesNotMatch(libraryHtml, /notice && !error/);
    assert.match(libraryHtml, /aria-label="范文"/);
    assert.match(libraryHtml, /aspect-\[3\/4\]/);
    assert.match(libraryHtml, /grid-cols-3 gap-2 sm:grid-cols-6/);
    assert.match(libraryHtml, /whitespace-pre-wrap/);
    assert.match(libraryHtml, /library-article-sample-paste/);
    assert.match(libraryHtml, /library-article-sample-detail-body/);
    assert.match(libraryHtml, /library-article-sample-detail-modal[\s\S]*?h-\[calc\(100dvh-2rem\)\]/);
    assert.match(libraryHtml, /detailDirty\(\)/);
    assert.match(libraryHtml, /saveDetail\(\)/);
    assert.doesNotMatch(libraryHtml, /editFromDetail/);
    const libraryJsFile = await fetch(`${started.url}pages/library.js`);
    assert.equal(libraryJsFile.status, 200);
    const libraryJs = await libraryJsFile.text();
    assert.match(libraryJs, /showToast/);
    assert.match(libraryJs, /toastTimer/);
    const albumsFile = await fetch(`${started.url}pages/library/albums.js`);
    assert.equal(albumsFile.status, 200);
    const albumsText = await albumsFile.text();
    assert.match(albumsText, /正在端详这张参考图/);
    assert.match(albumsText, /马上生成你的图册草稿/);
    assert.match(albumsText, /library-toast/);
    assert.doesNotMatch(albumsText, /this\.notice\s*=/);
    const samplesFile = await fetch(`${started.url}pages/library/article-samples.js`);
    assert.equal(samplesFile.status, 200);
    const samplesText = await samplesFile.text();
    assert.match(samplesText, /detailDirty/);
    assert.match(samplesText, /detailBaselineBody/);
    assert.match(samplesText, /unsavedOpen/);
    assert.match(samplesText, /library-toast/);
    assert.doesNotMatch(samplesText, /editFromDetail/);
    assert.doesNotMatch(samplesText, /this\.notice\s*=/);
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
      body: JSON.stringify({ business: '   ', sampleBody: '', galleryCount: 1 }),
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
