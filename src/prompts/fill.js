'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateDraftFace, normalizeFace } = require('../draft/validate');

const COVER_TYPES = new Set(['story', 'compare']);
const SET_TYPES = new Set(['breakdown', 'compare']);
const READINGS = { breakdown: 'story', compare: 'compare' };

const PROMPT_FILES = new Set([
  'draft.md',
  'cover/tone-amateur.md',
  'cover/large-type.md',
  'cover/sentence.md',
  'cover/choose-type.md',
  'cover/types/story.md',
  'cover/types/compare.md',
  'sets/choose-type.md',
  'sets/breakdown/plan.md',
  'sets/breakdown/point.md',
  'sets/breakdown/summary.md',
  'sets/breakdown/shared.md',
  'sets/types/breakdown.md',
  'sets/compare/plan.md',
  'sets/compare/shared.md',
  'sets/types/compare.md',
  'sets/art.md',
  'sets/sheet.md',
  'sets/looks/magazine.md',
  'sets/looks/scrapbook.md',
  'sets/looks/conceptual.md',
  'sets/looks/card.md',
]);

function readPromptFile(promptsDir, name) {
  if (typeof name !== 'string' || !PROMPT_FILES.has(name)) {
    throw new Error('未知提示词文件');
  }
  const file = path.join(promptsDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`找不到提示词文件 ${name}`);
  }
  return fs.readFileSync(file, 'utf8');
}

function coverTypePromptName(type) {
  if (!COVER_TYPES.has(type)) {
    throw new Error('封面类型不在允许列表');
  }
  return `cover/types/${type}.md`;
}

function seriesPromptNames(type) {
  if (!SET_TYPES.has(type)) {
    throw new Error('系列类型不在允许列表');
  }
  const names = {
    typeFile: `sets/types/${type}.md`,
    plan: `sets/${type}/plan.md`,
    shared: `sets/${type}/shared.md`,
  };
  if (type === 'breakdown') {
    names.point = `sets/${type}/point.md`;
    names.summary = `sets/${type}/summary.md`;
  }
  return names;
}

function assignGalleryRoles(count) {
  if (!Number.isInteger(count) || count < 0) return [];
  if (count === 0) return [];
  if (count === 1) return ['summary'];
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? 'summary' : 'point'));
}

function assignStoryRoles(galleryCount) {
  return ['opening', ...assignGalleryRoles(galleryCount)];
}

function assignContrastSlots(galleryCount) {
  const count = Number.isInteger(galleryCount) && galleryCount >= 0 ? galleryCount + 1 : 1;
  return Array.from({ length: count }, () => 'contrast');
}

function lastBodyLine(body) {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item && item !== 'ㅤ');
  return lines.length > 0 ? lines[lines.length - 1] : '';
}

function formatGallerySlots(roles) {
  return roles.map((role, index) => `${index + 1} ${role}`).join('\n');
}

function fillPrompt(template, vars) {
  const missing = [];
  const text = String(template).replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      missing.push(key);
      return match;
    }
    return String(vars[key]);
  });
  if (missing.length > 0) {
    throw new Error(`提示词变量没有装填：${missing.join('、')}`);
  }
  return text;
}

function parseJsonObject(text) {
  let raw = String(text || '').replace(/^\uFEFF/, '').trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) raw = fenced[1].trim();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error('模型没有返回 JSON 对象');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('模型没有返回 JSON 对象');
  }
  return data;
}

function parseDraftText(text) {
  const data = parseJsonObject(text);
  // 封面那句话改由封面流程写入。成稿若仍返回 coverLine，这里丢掉，避免两套句子并存。
  const face = {
    title: typeof data.title === 'string' ? data.title : '',
    body: typeof data.body === 'string' ? data.body : '',
    topics: Array.isArray(data.topics) ? data.topics : [],
    coverLine: '',
  };
  const message = validateDraftFace(face);
  if (message) throw new Error(message);
  return normalizeFace(face);
}

function parseCoverLineText(text) {
  const data = parseJsonObject(text);
  const coverLine = typeof data.coverLine === 'string' ? data.coverLine.trim() : '';
  if (!coverLine) throw new Error('封面那句话是空的');
  return coverLine;
}

function parseCoverTypeText(text) {
  const data = parseJsonObject(text);
  const type = typeof data.type === 'string' ? data.type.trim() : '';
  if (!COVER_TYPES.has(type)) throw new Error('封面类型不在允许列表');
  return type;
}

const LOOKS = new Set(['magazine', 'scrapbook', 'conceptual', 'card']);
const EXAMPLE_STYLE_COLORS = ['#112233', '#445566', '#778899'];
const LOOK_KEYS = ['label', 'font', 'size', 'typesetting', 'placement', 'composition', 'style', 'light'];
const SHEET_SLOTS = [
  '1. 背景',
  '2. 色彩',
  '3. 字体',
  '4. 字号',
  '5. 字重',
  '6. 文字排版',
  '7. 文字位置',
  '8. 构图布局',
  '9. 视觉风格',
  '10. 光影与质感',
  '11. 主题绘画内容',
  '12. 系列统一规则',
];

function namedHexes(text) {
  return [...String(text || '').matchAll(/([\u4e00-\u9fff]{2,12})\s*(#[0-9A-Fa-f]{6})(?![0-9A-Fa-f])/g)]
    .map((match) => ({ name: match[1], hex: match[2].toUpperCase() }));
}

function paletteProblem(background, colors) {
  const joined = `${background || ''}\n${colors || ''}`.toUpperCase();
  if (EXAMPLE_STYLE_COLORS.some((color) => joined.includes(color))) return '配色不要照抄示例';
  const paper = namedHexes(background);
  const ink = namedHexes(colors);
  if (paper.length < 1 || ink.length < 2) return '配色要写色名加色号';
  const unique = new Set([...paper, ...ink].map((item) => item.hex));
  if (unique.size < 3) return '配色要写出背景、主色和强调色';
  return '';
}

function parseArtText(text, lines) {
  const data = parseJsonObject(text);
  const look = typeof data.look === 'string' ? data.look.trim().toLowerCase() : '';
  if (!LOOKS.has(look)) throw new Error('风格不在允许列表');
  const background = typeof data.background === 'string' ? data.background.trim() : '';
  const colors = typeof data.colors === 'string' ? data.colors.trim() : '';
  const problem = paletteProblem(background, colors);
  if (problem) throw new Error(problem);
  const expected = Array.isArray(lines) ? lines.map((item) => String(item).trim()) : [];
  if (!Array.isArray(data.scenes) || data.scenes.length !== expected.length) {
    throw new Error(`画面应为 ${expected.length} 张`);
  }
  const scenes = data.scenes.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (scenes.some((item) => !item)) throw new Error('这一张的画面是空的');
  const seen = new Set();
  for (let index = 0; index < scenes.length; index += 1) {
    if (scenes[index] === expected[index]) throw new Error('这一张的画面不能只是文案');
    if (seen.has(scenes[index])) throw new Error('这一张的画面重复了');
    seen.add(scenes[index]);
  }
  return { look, background, colors, scenes };
}

function parseLookText(text) {
  const found = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^([a-z]+)\s*:\s*(.+)$/);
    if (match) found[match[1]] = match[2].trim();
  }
  for (const key of LOOK_KEYS) {
    if (!found[key]) throw new Error(`风格配置缺了 ${key}`);
  }
  return found;
}

function renderSheet(promptsDir, art, scene, line) {
  const picture = typeof scene === 'string' ? scene.trim() : '';
  const copy = typeof line === 'string' ? line.trim() : '';
  if (!picture) throw new Error('这一张的画面是空的');
  if (!copy) throw new Error('这一张的文案是空的');
  const lookId = art && typeof art.look === 'string' ? art.look : '';
  if (!LOOKS.has(lookId)) throw new Error('风格不在允许列表');
  const problem = paletteProblem(art.background, art.colors);
  if (problem) throw new Error(problem);
  const look = parseLookText(readPromptFile(promptsDir, `sets/looks/${lookId}.md`));
  const prompt = fillPrompt(readPromptFile(promptsDir, 'sets/sheet.md'), {
    label: look.label,
    background: art.background,
    colors: art.colors,
    font: look.font,
    size: look.size,
    typesetting: look.typesetting,
    placement: look.placement,
    composition: look.composition,
    style: look.style,
    light: look.light,
    scene: picture,
    line: copy,
  }).trim();
  if (SHEET_SLOTS.some((slot) => !prompt.includes(slot)) || !prompt.includes(picture) || !prompt.includes(copy)) {
    throw new Error('绘图提示词缺了一槽');
  }
  return {
    prompt,
    style: `${look.label}；${art.background}；${art.colors}`,
  };
}

function parseSetTypeText(text) {
  const data = parseJsonObject(text);
  const type = typeof data.type === 'string' ? data.type.trim() : '';
  if (!SET_TYPES.has(type)) throw new Error('系列类型不在允许列表');
  return type;
}

function parsePlanText(text, galleryCount, body) {
  const data = parseJsonObject(text);
  const count = galleryCount + 1;
  const lengthError = `策划句子应为 ${count} 条`;
  if (!Array.isArray(data.lines) || data.lines.length !== count) throw new Error(lengthError);
  const lines = data.lines.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (lines.some((item) => !item)) throw new Error('策划那一句是空的');
  const seen = new Set();
  for (const line of lines) {
    if (seen.has(line)) throw new Error('策划那一句重复了');
    seen.add(line);
  }
  const ending = lastBodyLine(body);
  if (ending && lines[lines.length - 1] === ending) throw new Error('最后一句不要照抄正文结尾');
  return lines;
}

module.exports = {
  COVER_TYPES,
  READINGS,
  SET_TYPES,
  assignContrastSlots,
  assignGalleryRoles,
  assignStoryRoles,
  coverTypePromptName,
  fillPrompt,
  formatGallerySlots,
  parseArtText,
  parseCoverLineText,
  parseCoverTypeText,
  parseDraftText,
  parseJsonObject,
  parseLookText,
  parsePlanText,
  parseSetTypeText,
  readPromptFile,
  renderSheet,
  seriesPromptNames,
};
