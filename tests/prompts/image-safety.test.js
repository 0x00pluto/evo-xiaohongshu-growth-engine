'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  applyImageSafety,
  findImageSafety,
  formatImageSafetyMessage,
} = require('../../src/prompts/image-safety/apply');

const FACTORY_PROMPT = path.join(
  __dirname,
  '../../assets/prompts/one-post/albums/000001.magazine.dazibao/prompt.md',
);

/** 失败请求描述段摘录（上图文案保留） */
const FAILED_REQUEST_PROMPT = [
  '竖版 3:4，暖调美容／身体护理实拍人像，白色衬线大标题直接压在照片上的生活美学封面。',
  '',
  '8. 构图布局：照片为竖幅头肩特写，人物仰卧闭眼，头颈沿画面中轴略偏左；右手按住额头，左手托住下颌与颈侧。',
  '9. 视觉风格：真实摄影＋白字叠加的美容／护理视觉，暖棕色调、皮肤偏暖米色，画面有真实体感。',
  '10. 光影与质感：额头、颧骨与面膜处有湿润高光；可见皮肤纹理、面膜的湿润反光与毛巾绒毛质感。',
  '11. 主题绘画内容：镜前收产品。',
  '',
  '图片必须准确呈现的文案：',
  '中文主标题（左右各带全角双引号）：',
  '“先停深清”',
  '英文副标题（单行，居中于中文标题下方）：',
  'Pause Deep Cleansing',
  '署名小字（一行，两侧加细线角括号）：',
  '@熙雅个人美学',
  '底部引句（2～3 行取自文案第三段落，逐行居中）：',
  '换季脸红洗完发紧的时候',
  '第一反应别急着做深层清洁',
  '把去角质和清洁面膜停一周',
].join('\n');

/**
 * 机制测用临时词库（不写进 assets 默认空库）。
 * @returns {string}
 */
function writeFixtureLexicon() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-safety-'));
  const file = path.join(dir, 'rewrites.json');
  fs.writeFileSync(file, `${JSON.stringify({
    version: 1,
    rules: [
      { id: 'beauty-body-care-slash', match: '美容／身体护理', replace: '面部护肤' },
      { id: 'body-care', match: '身体护理', replace: '面部护肤' },
      { id: 'supine-eyes-closed', match: '仰卧闭眼', replace: '靠着休息' },
      { id: 'hold-jaw-neck-side', match: '托住下颌与颈侧', replace: '手在面颊外侧' },
      { id: 'real-body-feel', match: '真实体感', replace: '自然肤色' },
      { id: 'wet-highlight', match: '湿润高光', replace: '柔和光线' },
      { id: 'wet-reflect', match: '湿润反光', replace: '柔和光线' },
      { id: 'skin-texture', match: '皮肤纹理', replace: '自然肤色' },
    ],
  }, null, 2)}\n`, 'utf8');
  return file;
}

test('默认空库：学模板不改字，find 零命中', () => {
  const result = applyImageSafety(FAILED_REQUEST_PROMPT);
  assert.equal(result.text, FAILED_REQUEST_PROMPT);
  assert.equal(result.changes.length, 0);
  assert.equal(findImageSafety(FAILED_REQUEST_PROMPT).length, 0);
});

test('出厂题词在空库下原样通过', () => {
  const text = fs.readFileSync(FACTORY_PROMPT, 'utf8');
  const applied = applyImageSafety(text);
  assert.equal(applied.text, text);
  assert.equal(applied.changes.length, 0);
  assert.equal(findImageSafety(text).length, 0);
});

test('词库缺失时原样通过', () => {
  const text = '身体护理仰卧闭眼';
  const missing = path.join(__dirname, 'no-such-rewrites.json');
  const applied = applyImageSafety(text, { lexiconPath: missing });
  assert.equal(applied.text, text);
  assert.equal(findImageSafety(text, { lexiconPath: missing }).length, 0);
});

test('临时词库：描述段 apply 改写，上图文案不动', () => {
  const lexiconPath = writeFixtureLexicon();
  const result = applyImageSafety(FAILED_REQUEST_PROMPT, { lexiconPath });
  assert.doesNotMatch(result.text, /身体护理|仰卧闭眼|托住下颌与颈侧|真实体感|湿润高光|湿润反光|皮肤纹理/);
  assert.match(result.text, /面部护肤/);
  assert.match(result.text, /先停深清/);
  assert.match(result.text, /Pause Deep Cleansing/);
  assert.match(result.text, /@熙雅个人美学/);
  assert.match(result.text, /把去角质和清洁面膜停一周/);
  assert.ok(result.changes.length > 0);
});

test('临时词库：find 只报告命中，不改原文', () => {
  const lexiconPath = writeFixtureLexicon();
  const original = FAILED_REQUEST_PROMPT;
  const before = original;
  const hits = findImageSafety(original, { lexiconPath });
  assert.equal(original, before);
  assert.ok(hits.some((hit) => hit.match === '美容／身体护理' || hit.match === '身体护理'));
  assert.ok(hits.some((hit) => hit.match.includes('下颌')));
  const message = formatImageSafetyMessage(hits);
  assert.match(message, /不宜生图的说法/);
  assert.match(message, /请改完再画/);
});

test('临时词库：文案区命中不参与 apply，但 find 会报', () => {
  const lexiconPath = writeFixtureLexicon();
  const text = [
    '竖版 3:4，干净杂志封面。',
    '11. 主题绘画内容：{{scene}}',
    '',
    '图片必须准确呈现的文案：',
    '肩颈放松',
  ].join('\n');
  const applied = applyImageSafety(text, { lexiconPath });
  assert.match(applied.text, /肩颈放松/);
  assert.equal(applied.changes.length, 0);

  const withLexiconPhrase = [
    '竖版 3:4，干净杂志封面。',
    '',
    '图片必须准确呈现的文案：',
    '身体护理周刊',
  ].join('\n');
  const afterApply = applyImageSafety(withLexiconPhrase, { lexiconPath });
  assert.match(afterApply.text, /身体护理周刊/);
  const hits = findImageSafety(withLexiconPhrase, { lexiconPath });
  assert.ok(hits.some((hit) => hit.match === '身体护理'));
});
