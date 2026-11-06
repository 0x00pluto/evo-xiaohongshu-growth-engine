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
    assert.match(shellText, /写笔记/);
    assert.match(shellText, /lucide:notebook-pen/);
    assert.match(shellText, /xhs-studio-nav-collapsed/);
    const noteFile = await fetch(`${started.url}pages/note.html`);
    assert.equal(noteFile.status, 200);
    const noteHtml = await noteFile.text();
    assert.match(noteHtml, /复制这篇/);
    assert.match(noteHtml, /这张的画面内容/);
    assert.match(noteHtml, /产品资料/);
    assert.match(noteHtml, /对标文案/);
    assert.match(noteHtml, /笔记内图数量/);
    assert.match(noteHtml, /我们的图/);
    assert.doesNotMatch(noteHtml, /只发头图/);
    assert.doesNotMatch(noteHtml, /让画面跟上/);
    assert.doesNotMatch(noteHtml, /待重算/);
    assert.doesNotMatch(noteHtml, /id="reading"/);
    assert.doesNotMatch(noteHtml, /可囤多张/);
    assert.doesNotMatch(noteHtml, /事实材料/);
    assert.doesNotMatch(noteHtml, /从库挑一篇仿写/);
    assert.doesNotMatch(noteHtml, /id="combo-brief"/);
    assert.doesNotMatch(noteHtml, /lucide:circle-help/);
    assert.doesNotMatch(noteHtml, /id="sample-hint"/);
    assert.match(noteHtml, /人设/);
    assert.match(noteHtml, />目的</);
    assert.match(noteHtml, /grid grid-cols-2/);
    assert.match(noteHtml, /goalOptionLabel/);
    assert.match(noteHtml, /lucide:file-text/);
    assert.match(noteHtml, /openReferenceEditor/);
    assert.match(noteHtml, /id="add-reference"/);
    assert.match(noteHtml, /x-show="references\.length < 5"/);
    assert.match(noteHtml, /id="reference-pick-library-modal"/);
    assert.match(noteHtml, /新建产品资料/);
    assert.match(noteHtml, /id="reference-editor-modal"/);
    assert.doesNotMatch(noteHtml, /事实内容/);
    assert.match(noteHtml, /openPickSample/);
    assert.match(noteHtml, /openCreateSample/);
    assert.match(noteHtml, /id="sample-pick-library-modal"/);
    assert.match(noteHtml, /id="sample-create-modal"/);
    assert.match(noteHtml, /createSamplePaste/);
    assert.match(noteHtml, /canGenerateDraft/);
    assert.match(noteHtml, /phase === 'materials'/);
    assert.doesNotMatch(noteHtml, /x-model="sampleBody"/);
    assert.doesNotMatch(noteHtml, /已选仍显示新建/);
    const sampleSection = noteHtml.slice(noteHtml.indexOf('>对标文案<') - 80, noteHtml.indexOf('id="gallery-count"'));
    assert.match(sampleSection, /justify-between/);
    assert.match(sampleSection, /id="sample-actions"/);
    assert.match(sampleSection, /id="pick-sample"[^>]*btn-ghost/);
    assert.match(sampleSection, /id="create-sample"/);
    assert.match(sampleSection, />新建</);
    assert.doesNotMatch(sampleSection, /新建到库/);
    assert.match(sampleSection, /id="clear-sample"/);
    assert.match(sampleSection, /id="swap-sample"/);
    // 字段下裸红已改 toast；sample-panel 后紧接笔记内图数量，勿依赖已删的 sample-error 锚点。
    const samplePanelEnd = noteHtml.indexOf('id="gallery-count"');
    const samplePanelStart = noteHtml.indexOf('id="sample-panel"');
    assert.ok(samplePanelStart > 0 && samplePanelEnd > samplePanelStart);
    const samplePanel = noteHtml.slice(samplePanelStart, samplePanelEnd);
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
    assert.ok(sampleIdx > 0 && galleryIdx > sampleIdx, '对标文案应在张数之上');

    const noteJsFile = await fetch(`${started.url}pages/note.js`);
    assert.equal(noteJsFile.status, 200);
    const noteJs = await noteJsFile.text();
    assert.match(noteJs, /RECOMMENDED_GOALS_BY_PERSONA/);
    assert.doesNotMatch(noteJs, /PERSONA_HELP/);
    assert.doesNotMatch(noteJs, /GOAL_HELP/);
    assert.doesNotMatch(noteJs, /PERSONA_BRIEF/);
    assert.doesNotMatch(noteJs, /GOAL_BRIEF/);
    assert.doesNotMatch(noteJs, /comboBriefHtml/);
    assert.match(noteJs, /goalOptionLabel/);
    assert.doesNotMatch(noteJs, /personaOptionLabel/);
    assert.match(noteJs, /★ \$\{goal\}/);
    assert.doesNotMatch(noteJs, /★ \$\{persona\}/);
    assert.match(noteJs, /素人:\s*\['种草',\s*'搜索'\]/);
    assert.match(noteJs, /官号:\s*\['引流',\s*'曝光',\s*'搜索',\s*'转化'\]/);
    assert.match(noteJs, /员工:\s*\['种草',\s*'引流',\s*'搜索',\s*'转化'\]/);
    assert.match(noteJs, /我们的 logo，放在右上角。/);
    assert.match(noteJs, /REFERENCES_MAX = 5/);
    assert.match(noteJs, /listLibraryArticleSamples/);
    assert.match(noteJs, /saveLibraryArticleSample/);
    assert.match(noteJs, /listLibraryReferenceDocs/);
    assert.match(noteJs, /saveLibraryReferenceDoc/);
    assert.match(noteJs, /pickLibraryReference/);
    assert.match(noteJs, /isReferenceAlreadyOnNote/);
    assert.match(noteJs, /filterAvailableReferenceDocs/);
    assert.match(noteJs, /openCreateReferenceFromPick/);
    assert.match(noteJs, /splitPasteToSample/);
    assert.match(noteJs, /splitPasteToDoc/);
    assert.match(noteJs, /get canGenerateDraft/);

    const libraryFile = await fetch(`${started.url}pages/library.html`);
    assert.equal(libraryFile.status, 200);
    const libraryHtml = await libraryFile.text();
    assert.match(libraryHtml, /animations\/image-scan\.json/);
    assert.match(libraryHtml, /learn-line/);
    assert.doesNotMatch(libraryHtml, /正在学习参考图，请稍等/);
    assert.doesNotMatch(libraryHtml, /创建新内容/);
    assert.doesNotMatch(libraryHtml, /题词结构/);
    assert.match(libraryHtml, /toast-top toast-center/);
    assert.match(libraryHtml, /@library-toast\.window/);
    assert.doesNotMatch(libraryHtml, /notice && !error/);
    assert.match(libraryHtml, /aria-label="对标文案"/);
    assert.match(libraryHtml, /aria-label="产品资料"/);
    assert.match(libraryHtml, /onCreateReferenceDocs/);
    assert.match(libraryHtml, /aspect-\[3\/4\]/);
    assert.match(libraryHtml, /grid-cols-3 gap-2 sm:grid-cols-6/);
    assert.match(libraryHtml, /whitespace-pre-wrap/);
    assert.match(libraryHtml, /library-article-sample-paste/);
    assert.match(libraryHtml, /library-article-sample-detail-body/);
    assert.match(libraryHtml, /library-article-sample-detail-modal[\s\S]*?h-\[calc\(100dvh-2rem\)\]/);
    assert.match(libraryHtml, /library-reference-doc-paste/);
    assert.match(libraryHtml, /library-reference-doc-detail-body/);
    assert.match(libraryHtml, /detailDirty\(\)/);
    assert.match(libraryHtml, /saveDetail\(\)/);
    assert.doesNotMatch(libraryHtml, /editFromDetail/);
    const libraryJsFile = await fetch(`${started.url}pages/library.js`);
    assert.equal(libraryJsFile.status, 200);
    const libraryJs = await libraryJsFile.text();
    assert.match(libraryJs, /createStudioToast/);
    assert.match(libraryJs, /showToast/);
    assert.match(libraryHtml, /lucide:circle-alert/);
    assert.match(libraryHtml, /lucide:circle-check/);
    assert.match(libraryHtml, /toastOpen/);
    const toastLibFile = await fetch(`${started.url}lib/studio-toast.js`);
    assert.equal(toastLibFile.status, 200);
    const toastLib = await toastLibFile.text();
    assert.match(toastLib, /toastTimer/);
    assert.match(toastLib, /createStudioToast/);
    assert.match(libraryJs, /reference-docs/);
    assert.match(libraryJs, /onCreateReferenceDocs/);
    assert.match(libraryJs, /label: '风格'/);
    assert.match(libraryJs, /label: '我们的图'/);
    const albumsFile = await fetch(`${started.url}pages/library/albums.js`);
    assert.equal(albumsFile.status, 200);
    const albumsText = await albumsFile.text();
    assert.match(albumsText, /正在看这张图/);
    assert.match(albumsText, /马上出一套草稿/);
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
    const refsFile = await fetch(`${started.url}pages/library/reference-docs.js`);
    assert.equal(refsFile.status, 200);
    const refsText = await refsFile.text();
    assert.match(refsText, /detailDirty/);
    assert.match(refsText, /detailBaselineBody/);
    assert.match(refsText, /unsavedOpen/);
    assert.match(refsText, /saveLibraryReferenceDoc/);
    assert.match(refsText, /library-toast/);
    assert.doesNotMatch(refsText, /this\.notice\s*=/);
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
