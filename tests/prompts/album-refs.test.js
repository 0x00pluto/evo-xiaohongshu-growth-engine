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
  fs.writeFileSync(
    path.join(dir, 'image-refs.md'),
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

test('出厂 image-refs 只有 template 与 logo，没有 product', () => {
  const text = fs.readFileSync(path.join(factoryPromptsDir, 'image-refs.md'), 'utf8');
  assert.match(text, /^## template\s*$/m);
  assert.match(text, /^## logo\s*$/m);
  assert.doesNotMatch(text, /^## product\s*$/m);
  const sections = loadRoleSections(factoryPromptsDir);
  assert.equal(sections.has('template'), true);
  assert.equal(sections.has('logo'), true);
  assert.equal(sections.has('product'), false);
});

test('出厂 template 说明仍拼第一张是版式模板', () => {
  const samplePath = path.join(factoryPromptsDir, 'samples', '000001.magazine.dazibao.jpg');
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
