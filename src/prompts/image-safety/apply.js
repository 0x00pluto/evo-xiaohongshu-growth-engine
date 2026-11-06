// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** 学模板时只改这段之前；之后是上图文案 */
const COPY_MARKER = '图片必须准确呈现';

/**
 * @typedef {{ id: string; match: string; replace: string }} RewriteRule
 * @typedef {{ id: string; match: string; replace: string }} SafetyHit
 * @typedef {{ text: string; changes: SafetyHit[] }} ApplyResult
 */

/**
 * @returns {string}
 */
function defaultLexiconPath() {
  return path.join(
    __dirname,
    '..',
    '..',
    '..',
    'assets',
    'prompts',
    'one-post',
    'image-safety',
    'rewrites.json',
  );
}

/**
 * @param {unknown} raw
 * @returns {RewriteRule[]}
 */
function normalizeRules(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const bag = /** @type {{ rules?: unknown }} */ (raw);
  if (!Array.isArray(bag.rules)) return [];
  /** @type {RewriteRule[]} */
  const list = [];
  for (const item of bag.rules) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = /** @type {Record<string, unknown>} */ (item);
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const match = typeof row.match === 'string' ? row.match : '';
    const replace = typeof row.replace === 'string' ? row.replace : '';
    if (!id || !match) continue;
    list.push({ id, match, replace });
  }
  return list;
}

/**
 * 长句优先，避免短词先吃掉长句。
 * @param {RewriteRule[]} rules
 * @returns {RewriteRule[]}
 */
function sortRules(rules) {
  return rules.slice().sort((a, b) => {
    const byLen = b.match.length - a.match.length;
    if (byLen !== 0) return byLen;
    return a.id.localeCompare(b.id);
  });
}

/**
 * @param {string} [lexiconPath]
 * @returns {RewriteRule[]}
 */
function loadRewriteRules(lexiconPath) {
  const file = typeof lexiconPath === 'string' && lexiconPath.trim()
    ? path.resolve(lexiconPath.trim())
    : defaultLexiconPath();
  if (!fs.existsSync(file)) return [];
  try {
    const text = fs.readFileSync(file, 'utf8');
    return sortRules(normalizeRules(JSON.parse(text)));
  } catch {
    return [];
  }
}

/**
 * @param {string} text
 * @returns {{ head: string; tail: string }}
 */
function splitCopyZone(text) {
  const source = String(text || '');
  const index = source.indexOf(COPY_MARKER);
  if (index < 0) return { head: source, tail: '' };
  return {
    head: source.slice(0, index),
    tail: source.slice(index),
  };
}

/**
 * @param {string} source
 * @param {RewriteRule[]} rules
 * @returns {{ text: string; changes: SafetyHit[] }}
 */
function rewriteOnce(source, rules) {
  let next = source;
  /** @type {SafetyHit[]} */
  const changes = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const rule of rules) {
    if (!next.includes(rule.match)) continue;
    next = next.split(rule.match).join(rule.replace);
    if (seen.has(rule.id)) continue;
    seen.add(rule.id);
    changes.push({
      id: rule.id,
      match: rule.match,
      replace: rule.replace,
    });
  }
  return { text: next, changes };
}

/**
 * 学模板用：只改「图片必须准确呈现」之前的描述；无此标记则整段可改。
 * @param {unknown} text
 * @param {{ lexiconPath?: string; rules?: RewriteRule[] }} [options]
 * @returns {ApplyResult}
 */
function applyImageSafety(text, options) {
  const source = typeof text === 'string' ? text : '';
  const rules = options && Array.isArray(options.rules)
    ? sortRules(options.rules)
    : loadRewriteRules(options && options.lexiconPath);
  if (!source || rules.length === 0) {
    return { text: source, changes: [] };
  }
  const { head, tail } = splitCopyZone(source);
  const rewritten = rewriteOnce(head, rules);
  return {
    text: `${rewritten.text}${tail}`,
    changes: rewritten.changes,
  };
}

/**
 * 画这张用：扫全文，只报告命中，不改字。
 * @param {unknown} text
 * @param {{ lexiconPath?: string; rules?: RewriteRule[] }} [options]
 * @returns {SafetyHit[]}
 */
function findImageSafety(text, options) {
  const source = typeof text === 'string' ? text : '';
  const rules = options && Array.isArray(options.rules)
    ? sortRules(options.rules)
    : loadRewriteRules(options && options.lexiconPath);
  if (!source || rules.length === 0) return [];
  /** @type {SafetyHit[]} */
  const hits = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const rule of rules) {
    if (!source.includes(rule.match)) continue;
    if (seen.has(rule.id)) continue;
    seen.add(rule.id);
    hits.push({
      id: rule.id,
      match: rule.match,
      replace: rule.replace,
    });
  }
  return hits;
}

/**
 * @param {SafetyHit[]} hits
 * @returns {string}
 */
function formatImageSafetyMessage(hits) {
  if (!Array.isArray(hits) || hits.length === 0) return '';
  const parts = hits.slice(0, 3).map((hit) => {
    const suggestion = hit.replace
      ? `可改成「${hit.replace}」`
      : '请删掉或改成更普通的说法';
    return `「${hit.match}」${suggestion}`;
  });
  const more = hits.length > 3 ? `（另有 ${hits.length - 3} 处）` : '';
  return `画面说明里有不宜生图的说法：${parts.join('；')}${more}。请改完再画。`;
}

module.exports = {
  COPY_MARKER,
  applyImageSafety,
  defaultLexiconPath,
  findImageSafety,
  formatImageSafetyMessage,
  loadRewriteRules,
  sortRules,
};
