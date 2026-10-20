'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildAlbumDraft,
  normalizeReferenceImage,
  parseLearnResult,
  readLearnSystemPrompt,
} = require('../../src/prompts/album/learn');
const { commitAlbumDraft, deleteAlbumFiles } = require('../../src/prompts/album/store');
const {
  clearAlbumCatalogCache,
  isBuiltinAlbum,
  listAlbums,
  normalizeFrame,
  renderAlbumPrompt,
} = require('../../src/prompts/fill');
const { createLlm } = require('../../src/llm/client');
const { createRunner } = require('../../src/one-post/run');

const ROOT_PROMPTS = path.join(__dirname, '../../assets/prompts/one-post');

/** 最小合法 JPEG */
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

function sheetPrompt() {
  return [
    '竖版 3:4，测试风格。',
    '1. 背景：白',
    '2. 色彩：黑',
    '3. 字体：黑体',
    '4. 字号：大',
    '5. 字重：粗',
    '6. 文字排版：短句',
    '7. 文字位置：中',
    '8. 构图布局：偏',
    '9. 视觉风格：测',
    '10. 光影与质感：平',
    '11. 系列统一规则：统一',
    '12. 主题绘画内容：{{scene}}',
    '',
    '图片必须准确呈现的中文文案：',
    '{{line}}',
    '',
    '文案必须完整、准确。',
  ].join('\n');
}

function learnPayload(overrides = {}) {
  return {
    kind: 'poster',
    slug: 'bold-type',
    label: '粗字海报风',
    hint: '大字为主的海报',
    copySchema: '新海报。每一项对象字段：\n- line：须准确上图的一句中文（非空）\n返回形状：{"frames":[{"line":"..."}]}',
    promptMd: sheetPrompt(),
    copySample: '仅示例。\n\n```json\n{"frames":[{"line":"示例一句"}]}\n```',
    ...overrides,
  };
}

/**
 * 五本出厂形杂志册，足够目录加载与出厂保护测试。
 * @param {string} dir
 */
function seedFactoryAlbums(dir) {
  fs.mkdirSync(path.join(dir, 'albums'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'samples'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'learn-album'), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT_PROMPTS, 'learn-album', 'system.md'),
    path.join(dir, 'learn-album', 'system.md'),
  );
  const kinds = ['magazine', 'scrapbook', 'conceptual', 'card', 'infographic'];
  const lineSchema = '每一项对象字段：\n- line：须准确上图的一句中文（非空）\n返回形状：{"frames":[{"line":"..."}]}';
  for (let i = 1; i <= 5; i += 1) {
    const seq = String(i).padStart(6, '0');
    const kind = kinds[i - 1];
    // 出厂保护只看序号；元数据用 magazine 形状即可让目录通过（kind 须与 id 中段一致）
    // 对非 magazine 的出厂五种，仍写对应 kind，但 copySchema/题词用通用 line 槽以便夹具简单。
    // 目录不再强制 kind ∈ 五种以外的形状；五种内 catalog 只校验 token。
    // scrapbook 等仍可入库，frame 分支要对应字段——夹具统一用 magazine 兼容的 line 题词，
    // 但 kind 字段必须匹配 id。对 conceptual/card/infographic，normalizeFrame 会要求其字段；
    // 本夹具只测列表 / 删除 / 新 kind，不对这些出厂册跑策划。
    const id = `${seq}.${kind}.seed`;
    let copySchema = lineSchema;
    let promptMd = sheetPrompt();
    if (kind === 'conceptual') {
      copySchema = '字段：\n- theme：t\n- mainTitle：m\n- subTitle：s\n返回：{"frames":[{...}]}';
      promptMd = [
        '竖版 3:4，测。',
        '1. 背景：白', '2. 色彩：黑', '3. 字体：黑', '4. 字号：大', '5. 字重：粗',
        '6. 文字排版：短', '7. 文字位置：中', '8. 构图布局：偏', '9. 视觉风格：测', '10. 光影与质感：平',
        '11. 系列统一规则：统一', '12. 主题绘画内容：{{scene}}',
        '', '本次主题内容：', '{{theme}}', '', '主标题：', '{{mainTitle}}', '', '副标题：', '{{subTitle}}',
        '', '文案必须完整、准确。',
      ].join('\n');
    } else if (kind === 'card') {
      copySchema = '字段：\n- mainTitle：m\n- point：p\n返回：{"frames":[{...}]}';
      promptMd = [
        '竖版 3:4，测。',
        '1. 背景：白', '2. 色彩：黑', '3. 字体：黑', '4. 字号：大', '5. 字重：粗',
        '6. 文字排版：短', '7. 文字位置：中', '8. 构图布局：偏', '9. 视觉风格：测', '10. 光影与质感：平',
        '11. 系列统一规则：统一', '12. 主题绘画内容：{{scene}}',
        '', '主标题：', '{{mainTitle}}', '', '底部要点：', '{{point}}',
        '', '文案必须完整、准确。',
      ].join('\n');
    } else if (kind === 'infographic') {
      copySchema = '字段：\n- seriesLabel：a\n- theme：t\n- mainTitle：m\n- subTitle：s\n- modules：数组\n- stepsBar：b\n- steps：数组\n- summary：u\n- credit：c';
      promptMd = [
        '竖版 3:4，测。',
        '1. 背景：白', '2. 色彩：黑', '3. 字体：黑', '4. 字号：大', '5. 字重：粗',
        '6. 文字排版：短', '7. 文字位置：中', '8. 构图布局：偏', '9. 视觉风格：测', '10. 光影与质感：平',
        '11. 系列统一规则：统一', '12. 主题绘画内容：{{scene}}',
        '', '栏目标签：', '{{seriesLabel}}', '', '本次主题内容：', '{{theme}}',
        '', '主标题：', '{{mainTitle}}', '', '副标题：', '{{subTitle}}',
        '', '{{modulesBlock}}', '', '{{stepsBlock}}',
        '', '总结金句：', '{{summary}}', '', '栏目署名：', '{{credit}}',
        '', '文案必须完整、准确。',
      ].join('\n');
    } else if (kind === 'scrapbook') {
      promptMd = `${sheetPrompt().replace('{{line}}\n', '{{line}}\n{{noteBlock}}\n')}`;
    }
    fs.writeFileSync(path.join(dir, 'albums', `${id}.json`), `${JSON.stringify({
      id,
      kind,
      slug: 'seed',
      hint: `hint ${id}`,
      label: `label ${id}`,
      copySchema,
      legacyIds: [],
      enabled: true,
      ...(kind === 'infographic' ? {
        constraints: { modules: { min: 2, max: 6 }, steps: { min: 3, max: 7 } },
      } : {}),
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'albums', `${id}.md`), promptMd);
    fs.writeFileSync(path.join(dir, 'albums', `${id}.copy-sample.md`), '仅示例\n');
  }
  clearAlbumCatalogCache(dir);
}

test('学习提示词独立文件可现读', () => {
  const text = readLearnSystemPrompt(ROOT_PROMPTS);
  assert.match(text, /图册/);
  assert.match(text, /promptMd/);
});

test('参考图按文件头校验，不合格不进模型', () => {
  assert.throws(() => normalizeReferenceImage({ dataUrl: 'data:text/plain;base64,YQ==' }), /只支持|格式/);
  assert.throws(() => normalizeReferenceImage({
    dataUrl: `data:image/jpeg;base64,${Buffer.alloc(9 * 1024 * 1024).toString('base64')}`,
  }), /太大/);
  const ok = normalizeReferenceImage({
    dataUrl: `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`,
  });
  assert.equal(ok.ext, '.jpg');
});

test('识图请求走 deepseek-flash 且图在 user 消息里', async () => {
  let captured;
  const llm = createLlm({
    DEEPSEEK_API_KEY: 'k',
    DEEPSEEK_BASE_URL: 'https://example.test/v1',
  }, async (_url, options) => {
    captured = { body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    };
  });
  await llm.completeVision({
    text: '学这张',
    dataUrl: `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`,
  });
  assert.equal(captured.body.model, 'deepseek-flash');
  assert.equal(captured.body.messages[0].role, 'user');
  assert.equal(captured.body.messages[0].content[0].type, 'text');
  assert.equal(captured.body.messages[0].content[1].type, 'image_url');
  assert.equal(captured.body.messages[0].content[1].image_url.detail, 'original');
});

test('四件套校验失败不落盘；写入后可删；出厂不可删', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'album-learn-'));
  seedFactoryAlbums(dir);
  const before = listAlbums(dir).slice().sort();

  assert.throws(() => parseLearnResult({ kind: 'poster', slug: 'x' }), /不完整/);

  const image = normalizeReferenceImage({
    dataUrl: `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`,
  });
  const draft = buildAlbumDraft(dir, learnPayload(), image, 'draft-1');
  assert.equal(draft.kind, 'poster');
  assert.match(draft.id, /^100000\.poster\.bold-type$/);
  assert.deepEqual(listAlbums(dir).slice().sort(), before);

  commitAlbumDraft(dir, draft);
  clearAlbumCatalogCache(dir);
  assert.ok(listAlbums(dir).includes(draft.id));
  assert.equal(isBuiltinAlbum(draft.id), false);
  assert.equal(isBuiltinAlbum('000001.magazine.seed'), true);

  assert.throws(() => deleteAlbumFiles(dir, '000001.magazine.seed'), /出厂/);
  deleteAlbumFiles(dir, draft.id);
  clearAlbumCatalogCache(dir);
  assert.equal(listAlbums(dir).includes(draft.id), false);
});

test('新 kind 通用槽能 normalizeFrame 与 renderAlbumPrompt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'album-generic-'));
  seedFactoryAlbums(dir);
  const image = normalizeReferenceImage({
    dataUrl: `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`,
  });
  const draft = buildAlbumDraft(dir, learnPayload(), image, 'draft-g');
  commitAlbumDraft(dir, draft);
  clearAlbumCatalogCache(dir);
  const frame = normalizeFrame({ line: '这一句上图' }, draft.id, dir);
  assert.equal(frame.line, '这一句上图');
  const rendered = renderAlbumPrompt(dir, draft.id, '画面里有一块几何色块', frame);
  assert.match(rendered.prompt, /12\. 主题绘画内容/);
  assert.match(rendered.prompt, /这一句上图/);
  assert.match(rendered.prompt, /画面里有一块几何色块/);
  assert.equal(rendered.style, '粗字海报风');
});

test('runner 学习写入删除：失败零落盘；出厂拒绝', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'album-runner-'));
  const postsDir = path.join(dir, 'posts');
  const promptsDir = path.join(dir, 'prompts');
  seedFactoryAlbums(promptsDir);
  fs.mkdirSync(postsDir, { recursive: true });

  let visionCalls = 0;
  const runner = createRunner({
    postsDir,
    promptsDir,
    env: { DEEPSEEK_API_KEY: 'k' },
    completeVision: async () => {
      visionCalls += 1;
      return JSON.stringify(learnPayload({ slug: `run-${visionCalls}` }));
    },
  });

  const bad = await runner.learnAlbum({
    dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  });
  assert.equal(bad.ok, false);
  assert.equal(visionCalls, 0);

  const learned = await runner.learnAlbum({
    dataUrl: `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`,
  });
  assert.equal(learned.ok, true);
  assert.ok(learned.draft);
  assert.equal(fs.existsSync(path.join(promptsDir, 'albums', `${learned.draft.id}.json`)), false);

  const committed = runner.commitAlbum({ draftId: learned.draft.draftId });
  assert.equal(committed.ok, true);
  assert.ok(fs.existsSync(path.join(promptsDir, 'albums', `${committed.id}.json`)));

  const listed = runner.listAlbums();
  assert.ok(listed.albums.some((item) => item.id === committed.id && item.deletable === true));
  assert.ok(listed.albums.some((item) => item.id.startsWith('000001') && item.deletable === false));

  const refuseBuiltin = runner.deleteAlbum({ id: '000001.magazine.seed' });
  assert.equal(refuseBuiltin.ok, false);

  const deleted = runner.deleteAlbum({ id: committed.id });
  assert.equal(deleted.ok, true);
  assert.equal(fs.existsSync(path.join(promptsDir, 'albums', `${committed.id}.json`)), false);
});
