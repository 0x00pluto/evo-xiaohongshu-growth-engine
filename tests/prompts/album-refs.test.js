'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  composeImagePrompt,
  formatImageRefsBlock,
  loadRoleSections,
} = require('../../src/prompts/album/refs');

const factoryPromptsDir = path.join(__dirname, '../../assets/prompts/one-post');

/**
 * @returns {string}
 */
function makeTempPromptsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-image-refs-'));
  fs.mkdirSync(path.join(dir, 'article-image'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'article-image', 'image-refs.md'),
    [
      '# 出厂',
      '',
      '## template',
      '',
      '版式模板参考图，不是成稿。锁定底色。',
      '',
      '## logo',
      '',
      '品牌标识参考图。出厂说明。',
    ].join('\n'),
  );
  return dir;
}

test('出厂 image-refs 有 template、logo、prior，没有 product', () => {
  const text = fs.readFileSync(path.join(factoryPromptsDir, 'article-image', 'image-refs.md'), 'utf8');
  assert.match(text, /^## template\s*$/m);
  assert.match(text, /^## logo\s*$/m);
  assert.match(text, /^## prior\s*$/m);
  assert.doesNotMatch(text, /^## product\s*$/m);
  const sections = loadRoleSections(factoryPromptsDir);
  assert.equal(sections.has('template'), true);
  assert.equal(sections.has('logo'), true);
  assert.equal(sections.has('prior'), true);
  assert.equal(sections.has('product'), false);
});

test('出厂 template 说明仍拼第一张是版式模板', () => {
  const samplePath = path.join(
    factoryPromptsDir,
    'albums',
    '000001.magazine.dazibao',
    'sample.jpg',
  );
  assert.equal(fs.existsSync(samplePath), true);
  const block = formatImageRefsBlock(factoryPromptsDir, [
    { role: 'template', path: samplePath },
  ]);
  assert.match(block, /【参考图】/);
  assert.match(block, /第一张是版式模板参考图/);
  assert.doesNotMatch(block, /product|第二张|logo/);

  const composed = composeImagePrompt('题词正文仅测试', {
    promptsDir: factoryPromptsDir,
    look: '000001.magazine.dazibao',
  });
  assert.match(composed.prompt, /第一张是版式模板参考图/);
  assert.equal(composed.references[0].role, 'template');
});

test('合并 runtime/image-refs：新角色能拼上，同名覆盖出厂，无目录不报错', () => {
  const dir = makeTempPromptsDir();
  const userDir = path.join(dir, 'runtime', 'image-refs');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDir, 'foo.md'),
    [
      '## course-shot',
      '',
      '课程真图参考。锁定场景与人物姿态。',
      '',
      '## logo',
      '',
      '用户覆盖后的标识说明。',
    ].join('\n'),
  );

  const merged = loadRoleSections(dir, userDir);
  assert.match(merged.get('course-shot') || '', /课程真图参考/);
  assert.equal(merged.get('logo'), '用户覆盖后的标识说明。');
  assert.match(merged.get('template') || '', /版式模板参考图/);

  const block = formatImageRefsBlock(
    dir,
    [
      { role: 'logo', path: '/tmp/logo.png' },
      { role: 'course-shot', path: '/tmp/course.jpg' },
    ],
    userDir,
  );
  assert.match(block, /第一张是用户覆盖后的标识说明/);
  assert.match(block, /第二张是课程真图参考/);

  assert.doesNotThrow(() => loadRoleSections(dir));
  assert.doesNotThrow(() => loadRoleSections(dir, path.join(dir, 'runtime', 'missing-image-refs')));
  assert.equal(loadRoleSections(dir).get('logo'), '品牌标识参考图。出厂说明。');
});

test('上传参考用用法句拼第 N 张，不拼主体空位规则', () => {
  const dir = makeTempPromptsDir();
  fs.writeFileSync(
    path.join(dir, 'article-image', 'subject-slot.md'),
    '【主体空位】\n用上传主体换掉模板假人。',
  );
  const samplePath = path.join(dir, 'sample.jpg');
  const materialPath = path.join(dir, 'hero.jpg');
  fs.writeFileSync(samplePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(materialPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const block = formatImageRefsBlock(dir, [
    { role: 'template', path: samplePath },
    { role: 'upload-ref', path: materialPath, usage: '人物照片。按 Hero 放中央。' },
  ]);
  assert.match(block, /第一张是版式模板参考图/);
  assert.match(block, /第二张是人物照片。按 Hero 放中央。/);
  assert.match(block, /必须使用【参考图】中版式模板之后列出的上传参考图/);

  // 用临时图册目录拼 compose：无样图时仅素材
  fs.mkdirSync(path.join(dir, 'albums'), { recursive: true });
  const albumId = '100001.conceptual.test-mat';
  const sheet = [
    '竖版 3:4。',
    '1. 背景：白', '2. 色彩：黑', '3. 字体：黑', '4. 字号：大', '5. 字重：粗',
    '6. 文字排版：中', '7. 文字位置：中', '8. 构图布局：中', '9. 视觉风格：排',
    '10. 光影与质感：平', '11. 主题绘画内容：{{scene}}',
    '',
    '本次主题内容：',
    '{{theme}}',
    '',
    '主标题：',
    '{{mainTitle}}',
    '',
    '副标题：',
    '{{subTitle}}',
  ].join('\n');
  fs.mkdirSync(path.join(dir, 'albums', albumId), { recursive: true });
  fs.writeFileSync(path.join(dir, 'albums', albumId, 'album.json'), `${JSON.stringify({
    id: albumId,
    kind: 'conceptual',
    slug: 'test-mat',
    hint: '概念插画，测素材。',
    label: '测',
    copySchema: '每一项对象字段：\n- theme\n- mainTitle\n- subTitle\n返回形状：{"frames":[{"theme":"...","mainTitle":"...","subTitle":"..."}]}',
    legacyIds: [],
    enabled: true,
    promptSheetVersion: 2,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'albums', albumId, 'prompt.md'), sheet);
  fs.writeFileSync(path.join(dir, 'albums', albumId, 'copy-sample.md'), '仅示例\n');
  const { clearAlbumCatalogCache } = require('../../src/prompts/fill');
  clearAlbumCatalogCache(dir);

  const postDir = path.join(dir, 'post');
  const matFile = 'm-abc123.jpg';
  fs.mkdirSync(path.join(postDir, 'materials', 'upload-refs'), { recursive: true });
  fs.writeFileSync(path.join(postDir, 'materials', 'upload-refs', matFile), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const composed = composeImagePrompt('题词正文仅测试', {
    promptsDir: dir,
    look: albumId,
    postDir,
    uploadRefs: [{ id: 'abc123', fileName: matFile, usage: '人物照片。按 Hero 放中央。' }],
    pick: { materialIds: ['abc123'], overrides: {} },
  });
  assert.match(composed.prompt, /第一张是人物照片。按 Hero 放中央。/);
  assert.match(composed.prompt, /必须使用【参考图】中版式模板之后列出的上传参考图/);
  assert.doesNotMatch(composed.prompt, /【主体空位】/);
  assert.equal(composed.references[0].role, 'upload-ref');
});

test('勾选的上传参考文件缺失时拼装抛错', () => {
  const dir = makeTempPromptsDir();
  fs.mkdirSync(path.join(dir, 'albums'), { recursive: true });
  const albumId = '100002.conceptual.missing-mat';
  const sheet = [
    '竖版 3:4。',
    '1. 背景：白', '2. 色彩：黑', '3. 字体：黑', '4. 字号：大', '5. 字重：粗',
    '6. 文字排版：中', '7. 文字位置：中', '8. 构图布局：中', '9. 视觉风格：排',
    '10. 光影与质感：平', '11. 主题绘画内容：测',
  ].join('\n');
  fs.mkdirSync(path.join(dir, 'albums', albumId), { recursive: true });
  fs.writeFileSync(path.join(dir, 'albums', albumId, 'album.json'), `${JSON.stringify({
    id: albumId,
    kind: 'conceptual',
    slug: 'missing-mat',
    hint: '概念插画。',
    label: '测',
    copySchema: '返回形状：{"frames":[]}',
    legacyIds: [],
    enabled: true,
    promptSheetVersion: 2,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'albums', albumId, 'prompt.md'), sheet);
  fs.writeFileSync(path.join(dir, 'albums', albumId, 'copy-sample.md'), '仅示例\n');
  const { clearAlbumCatalogCache } = require('../../src/prompts/fill');
  clearAlbumCatalogCache(dir);
  const postDir = path.join(dir, 'post-missing');
  fs.mkdirSync(path.join(postDir, 'materials', 'upload-refs'), { recursive: true });
  assert.throws(
    () => composeImagePrompt('题词正文仅测试', {
      promptsDir: dir,
      look: albumId,
      postDir,
      uploadRefs: [{ id: 'gone1', fileName: 'm-gone1.jpg', usage: '标识。角落小标，不占主体。' }],
      pick: { materialIds: ['gone1'], overrides: {} },
    }),
    /上传参考文件找不到/,
  );
});
