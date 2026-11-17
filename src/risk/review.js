// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @typedef {import('./match').RiskHit} RiskHit */
/** @typedef {import('./match').RiskField} RiskField */
/** @typedef {import('./match').RiskSeverity} RiskSeverity */

/**
 * @typedef {{
 *   id: string;
 *   fieldId: string;
 *   fieldLabel: string;
 *   start: number;
 *   end: number;
 *   text: string;
 *   reason: string;
 *   replacement: string;
 *   severity: RiskSeverity;
 *   status: '还没改' | '已改这一处';
 * }} RiskAiSuggestion
 */

/**
 * @returns {string}
 */
function defaultPromptPath() {
  return path.join(__dirname, '..', '..', 'assets', 'prompts', 'one-post', 'risk-review.md');
}

/**
 * @param {string} [promptPath]
 * @returns {string}
 */
function readReviewPrompt(promptPath) {
  const file = typeof promptPath === 'string' && promptPath.trim()
    ? path.resolve(promptPath.trim())
    : defaultPromptPath();
  if (!fs.existsSync(file)) {
    return [
      '你是小红书文案合规助手。只给合规替换，不给规避写法。',
      '只返回 JSON：{"suggestions":[{"fieldId":"","start":0,"end":0,"text":"","reason":"","replacement":"","severity":"要改口"}]}',
    ].join('\n');
  }
  return fs.readFileSync(file, 'utf8');
}

/**
 * @param {RiskField[]} fields
 * @param {RiskHit[]} hits
 * @returns {{ system: string; user: string }}
 */
function buildReviewMessages(fields, hits) {
  const system = readReviewPrompt();
  const fieldLines = (Array.isArray(fields) ? fields : []).map((field) => (
    `- ${field.id}: ${JSON.stringify(String(field.text || ''))}`
  ));
  const hitLines = (Array.isArray(hits) ? hits : []).map((hit) => (
    `- field=${hit.fieldId} start=${hit.start} end=${hit.end} text=${JSON.stringify(hit.text)} library=${hit.libraryName} severity=${hit.severity}`
  ));
  const user = [
    '请审查下面字段里的危险说法，给出原因和一句合规替换。',
    '字段：',
    fieldLines.join('\n') || '- （空）',
    '本机命中摘要：',
    hitLines.join('\n') || '- （无）',
  ].join('\n');
  return { system, user };
}

/**
 * 模型给的 start/end 偶发偏一截：slice 对不上时按 text 就近匹配。
 * @param {string} source
 * @param {number} start
 * @param {number} end
 * @param {string} text
 * @returns {{ start: number; end: number } | null}
 */
function resolveSuggestionRange(source, start, end, text) {
  const src = String(source || '');
  const needle = String(text || '');
  if (!needle) return null;
  if (Number.isInteger(start) && Number.isInteger(end) && end > start && src.slice(start, end) === needle) {
    return { start, end };
  }
  const from = Number.isInteger(start) ? Math.max(0, start - Math.max(24, needle.length)) : 0;
  let idx = src.indexOf(needle, from);
  if (idx < 0) idx = src.indexOf(needle);
  if (idx < 0) return null;
  if (!Number.isInteger(start)) return { start: idx, end: idx + needle.length };
  let best = idx;
  let bestDist = Math.abs(idx - start);
  let cursor = src.indexOf(needle, idx + 1);
  while (cursor >= 0) {
    const dist = Math.abs(cursor - start);
    if (dist < bestDist) {
      best = cursor;
      bestDist = dist;
    }
    cursor = src.indexOf(needle, cursor + 1);
  }
  return { start: best, end: best + needle.length };
}

/**
 * @param {unknown} raw
 * @param {RiskField[]} fields
 * @returns {RiskAiSuggestion[]}
 */
function parseReviewSuggestions(raw, fields) {
  /** @type {Record<string, string>} */
  const fieldMap = {};
  for (const field of Array.isArray(fields) ? fields : []) {
    if (!field || typeof field.id !== 'string') continue;
    fieldMap[field.id] = String(field.text || '');
  }

  let bag = raw;
  if (typeof raw === 'string') {
    try {
      bag = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return [];
  const list = /** @type {{ suggestions?: unknown }} */ (bag).suggestions;
  if (!Array.isArray(list)) return [];

  /** @type {RiskAiSuggestion[]} */
  const out = [];
  let seq = 0;
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = /** @type {Record<string, unknown>} */ (item);
    const fieldId = typeof row.fieldId === 'string' ? row.fieldId.trim() : '';
    const text = typeof row.text === 'string' ? row.text : '';
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    const replacement = typeof row.replacement === 'string' ? row.replacement.trim() : '';
    const start = Number(row.start);
    const end = Number(row.end);
    if (!fieldId || !text || !reason || !replacement) continue;
    const source = fieldMap[fieldId];
    if (typeof source !== 'string') continue;
    const range = resolveSuggestionRange(source, start, end, text);
    if (!range) continue;
    const severity = row.severity === '不能发' ? '不能发' : '要改口';
    seq += 1;
    out.push({
      id: `ai:${fieldId}:${range.start}:${range.end}:${seq}`,
      fieldId,
      fieldLabel: fieldId === 'paste' ? '这段文字'
        : (fieldId === 'title' ? '标题' : (fieldId === 'topics' ? '话题' : '正文')),
      start: range.start,
      end: range.end,
      text,
      reason,
      replacement,
      severity,
      status: '还没改',
    });
  }
  return out;
}

module.exports = {
  buildReviewMessages,
  defaultPromptPath,
  parseReviewSuggestions,
  readReviewPrompt,
  resolveSuggestionRange,
};
