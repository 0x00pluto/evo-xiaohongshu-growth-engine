// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @typedef {import('./match').RiskSeverity} RiskSeverity */
/** @typedef {import('./match').RiskWord} RiskWord */

/**
 * @typedef {{
 *   ad_extreme: boolean;
 *   offsite_traffic: boolean;
 *   banned: boolean;
 *   personal: boolean;
 * }} RiskSelection
 */

/**
 * @typedef {{
 *   text: string;
 *   severity: RiskSeverity;
 * }} PersonalRiskWord
 */

const WORD_LIMIT = 50;
const BATCH_LIMIT = 100;

const DEFAULT_SELECTION = Object.freeze({
  ad_extreme: true,
  offsite_traffic: true,
  banned: true,
  personal: true,
});

/**
 * @param {string} text
 * @returns {number}
 */
function codePointLength(text) {
  return Array.from(text).length;
}

/**
 * @param {string} riskDir
 */
function ensureDir(riskDir) {
  if (!riskDir) return;
  fs.mkdirSync(riskDir, { recursive: true });
}

/**
 * @param {string} riskDir
 * @returns {string}
 */
function selectionPath(riskDir) {
  return path.join(riskDir, 'selection.json');
}

/**
 * @param {string} riskDir
 * @returns {string}
 */
function personalPath(riskDir) {
  return path.join(riskDir, 'personal-words.json');
}

/**
 * @param {unknown} raw
 * @returns {RiskSelection}
 */
function normalizeSelection(raw) {
  /** @type {RiskSelection} */
  const next = {
    ad_extreme: true,
    offsite_traffic: true,
    banned: true,
    personal: true,
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return next;
  const bag = /** @type {Record<string, unknown>} */ (raw);
  for (const key of /** @type {(keyof RiskSelection)[]} */ ([
    'ad_extreme',
    'offsite_traffic',
    'banned',
    'personal',
  ])) {
    if (typeof bag[key] === 'boolean') next[key] = bag[key];
  }
  return next;
}

/**
 * @param {unknown} raw
 * @returns {PersonalRiskWord[]}
 */
function normalizePersonalWords(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const bag = /** @type {{ words?: unknown }} */ (raw);
  if (!Array.isArray(bag.words)) return [];
  /** @type {PersonalRiskWord[]} */
  const list = [];
  const seen = new Set();
  for (const item of bag.words) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = /** @type {Record<string, unknown>} */ (item);
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (!text) continue;
    if (codePointLength(text) > WORD_LIMIT) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const severity = row.severity === '不能发' ? '不能发' : '要改口';
    list.push({ text, severity });
  }
  return list;
}

/**
 * @param {string} riskDir
 * @returns {RiskSelection}
 */
function readSelection(riskDir) {
  if (!riskDir || !fs.existsSync(selectionPath(riskDir))) return normalizeSelection(null);
  try {
    return normalizeSelection(JSON.parse(fs.readFileSync(selectionPath(riskDir), 'utf8')));
  } catch {
    return normalizeSelection(null);
  }
}

/**
 * @param {string} riskDir
 * @param {unknown} selection
 * @returns {RiskSelection}
 */
function writeSelection(riskDir, selection) {
  const next = normalizeSelection(selection);
  if (!riskDir) return next;
  ensureDir(riskDir);
  fs.writeFileSync(selectionPath(riskDir), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/**
 * @param {string} riskDir
 * @returns {PersonalRiskWord[]}
 */
function readPersonalWords(riskDir) {
  if (!riskDir || !fs.existsSync(personalPath(riskDir))) return [];
  try {
    return normalizePersonalWords(JSON.parse(fs.readFileSync(personalPath(riskDir), 'utf8')));
  } catch {
    return [];
  }
}

/**
 * @param {string} riskDir
 * @param {PersonalRiskWord[]} words
 * @returns {PersonalRiskWord[]}
 */
function writePersonalWords(riskDir, words) {
  const next = normalizePersonalWords({ words });
  if (!riskDir) return next;
  ensureDir(riskDir);
  fs.writeFileSync(
    personalPath(riskDir),
    `${JSON.stringify({ version: 1, words: next }, null, 2)}\n`,
    'utf8',
  );
  return next;
}

/**
 * @param {PersonalRiskWord[]} words
 * @returns {RiskWord[]}
 */
function toMatchWords(words) {
  return words.map((item) => ({
    libraryId: 'personal',
    text: item.text,
    severity: item.severity,
    source: /** @type {'personal'} */ ('personal'),
  }));
}

/**
 * @param {string} riskDir
 * @param {unknown} lines
 * @returns {{
 *   ok: true;
 *   words: PersonalRiskWord[];
 *   added: PersonalRiskWord[];
 *   rejected: { line: number; text: string; reason: string }[];
 * } | { ok: false; message: string }}
 */
function addPersonalWords(riskDir, lines) {
  const rawLines = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? String(lines).split(/\r?\n/) : []);
  /** @type {{ line: number; text: string; reason: string }[]} */
  const rejected = [];
  /** @type {PersonalRiskWord[]} */
  const candidates = [];
  let lineNo = 0;
  for (const item of rawLines) {
    lineNo += 1;
    const text = typeof item === 'string'
      ? item.trim()
      : (item && typeof item === 'object' && typeof /** @type {{ text?: unknown }} */ (item).text === 'string'
        ? String(/** @type {{ text: string }} */ (item).text).trim()
        : '');
    if (!text) continue;
    if (codePointLength(text) > WORD_LIMIT) {
      rejected.push({ line: lineNo, text, reason: `超过 ${WORD_LIMIT} 字` });
      continue;
    }
    const severity = item && typeof item === 'object' && !Array.isArray(item)
      && /** @type {{ severity?: unknown }} */ (item).severity === '不能发'
      ? '不能发'
      : '要改口';
    candidates.push({ text, severity });
  }
  if (candidates.length > BATCH_LIMIT) {
    return { ok: false, message: `一次最多添加 ${BATCH_LIMIT} 条` };
  }
  const existing = readPersonalWords(riskDir);
  const seen = new Set(existing.map((item) => item.text.toLowerCase()));
  /** @type {PersonalRiskWord[]} */
  const added = [];
  for (const item of candidates) {
    const key = item.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(item);
  }
  const next = existing.concat(added);
  writePersonalWords(riskDir, next);
  return { ok: true, words: next, added, rejected };
}

/**
 * @param {string} riskDir
 * @param {unknown} text
 * @returns {{ ok: true; words: PersonalRiskWord[]; removed: PersonalRiskWord | null }
 *   | { ok: false; message: string }}
 */
function deletePersonalWord(riskDir, text) {
  const needle = typeof text === 'string' ? text.trim() : '';
  if (!needle) return { ok: false, message: '要指明删哪个词' };
  const existing = readPersonalWords(riskDir);
  /** @type {PersonalRiskWord | null} */
  let removed = null;
  const next = existing.filter((item) => {
    if (item.text === needle) {
      removed = item;
      return false;
    }
    return true;
  });
  if (!removed) return { ok: false, message: '找不到这个词' };
  writePersonalWords(riskDir, next);
  return { ok: true, words: next, removed };
}

/**
 * @param {RiskSelection} selection
 * @param {boolean} personalEmpty
 * @returns {string[]}
 */
function selectedLibraryIds(selection, personalEmpty) {
  /** @type {string[]} */
  const ids = [];
  if (selection.ad_extreme) ids.push('ad_extreme');
  if (selection.offsite_traffic) ids.push('offsite_traffic');
  if (selection.banned) ids.push('banned');
  if (selection.personal && !personalEmpty) ids.push('personal');
  return ids;
}

module.exports = {
  BATCH_LIMIT,
  DEFAULT_SELECTION,
  WORD_LIMIT,
  addPersonalWords,
  deletePersonalWord,
  normalizePersonalWords,
  normalizeSelection,
  readPersonalWords,
  readSelection,
  selectedLibraryIds,
  toMatchWords,
  writePersonalWords,
  writeSelection,
};
