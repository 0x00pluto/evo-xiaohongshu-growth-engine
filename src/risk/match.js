// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @typedef {'不能发' | '要改口'} RiskSeverity */
/** @typedef {'ad_extreme' | 'offsite_traffic' | 'banned' | 'personal'} RiskLibraryId */

/**
 * @typedef {{
 *   id: RiskLibraryId | string;
 *   name: string;
 * }} RiskLibraryMeta
 */

/**
 * @typedef {{
 *   libraryId: string;
 *   text: string;
 *   severity: RiskSeverity;
 *   replacement?: string;
 *   source: 'factory' | 'personal';
 * }} RiskWord
 */

/**
 * @typedef {{
 *   id: string;
 *   text: string;
 * }} RiskField
 */

/**
 * @typedef {{
 *   id: string;
 *   fieldId: string;
 *   fieldLabel: string;
 *   start: number;
 *   end: number;
 *   text: string;
 *   libraryId: string;
 *   libraryName: string;
 *   severity: RiskSeverity;
 *   replacement?: string;
 * }} RiskHit
 */

/**
 * @typedef {{
 *   status: 'need_library' | 'no_text' | 'no_hit' | 'hits';
 *   libraries: string[];
 *   cannotCount: number;
 *   rewriteCount: number;
 *   hits: RiskHit[];
 *   message?: string;
 * }} RiskCheckResult
 */

const LIBRARY_LABELS = Object.freeze({
  ad_extreme: '广告法极限词',
  offsite_traffic: '站外引流',
  banned: '违禁表达',
  personal: '个人违禁词库',
});

const FIELD_LABELS = Object.freeze({
  title: '标题',
  body: '正文',
  topics: '话题',
  paste: '这段文字',
});

/**
 * @returns {string}
 */
function defaultFactoryPath() {
  return path.join(__dirname, '..', '..', 'assets', 'risk', 'factory-words.json');
}

/**
 * @param {unknown} value
 * @returns {RiskSeverity | ''}
 */
function normalizeSeverity(value) {
  if (value === '不能发' || value === '要改口') return value;
  return '';
}

/**
 * @param {unknown} raw
 * @returns {{ libraries: RiskLibraryMeta[]; words: RiskWord[] }}
 */
function normalizeFactory(raw) {
  /** @type {RiskLibraryMeta[]} */
  const libraries = [
    { id: 'ad_extreme', name: LIBRARY_LABELS.ad_extreme },
    { id: 'offsite_traffic', name: LIBRARY_LABELS.offsite_traffic },
    { id: 'banned', name: LIBRARY_LABELS.banned },
  ];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { libraries, words: [] };
  }
  const bag = /** @type {Record<string, unknown>} */ (raw);
  if (Array.isArray(bag.libraries)) {
    /** @type {RiskLibraryMeta[]} */
    const listed = [];
    for (const item of bag.libraries) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = /** @type {Record<string, unknown>} */ (item);
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!id || !name) continue;
      listed.push({ id, name });
    }
    if (listed.length) {
      libraries.length = 0;
      for (const item of listed) libraries.push(item);
    }
  }
  /** @type {RiskWord[]} */
  const words = [];
  if (Array.isArray(bag.words)) {
    for (const item of bag.words) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = /** @type {Record<string, unknown>} */ (item);
      const libraryId = typeof row.libraryId === 'string' ? row.libraryId.trim() : '';
      const text = typeof row.text === 'string' ? row.text : '';
      const severity = normalizeSeverity(row.severity);
      if (!libraryId || !text || !severity) continue;
      /** @type {RiskWord} */
      const word = {
        libraryId,
        text,
        severity,
        source: 'factory',
      };
      if (typeof row.replacement === 'string' && row.replacement.trim()) {
        word.replacement = row.replacement.trim();
      }
      words.push(word);
    }
  }
  return { libraries, words };
}

/**
 * @param {string} [factoryPath]
 * @returns {{ libraries: RiskLibraryMeta[]; words: RiskWord[] }}
 */
function loadFactoryWords(factoryPath) {
  const file = typeof factoryPath === 'string' && factoryPath.trim()
    ? path.resolve(factoryPath.trim())
    : defaultFactoryPath();
  if (!fs.existsSync(file)) return normalizeFactory(null);
  try {
    return normalizeFactory(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return normalizeFactory(null);
  }
}

/**
 * @param {string} libraryId
 * @param {RiskLibraryMeta[]} libraries
 * @returns {string}
 */
function libraryName(libraryId, libraries) {
  const hit = libraries.find((item) => item.id === libraryId);
  if (hit) return hit.name;
  if (libraryId === 'personal') return LIBRARY_LABELS.personal;
  return libraryId;
}

/**
 * @param {string} fieldId
 * @returns {string}
 */
function fieldLabel(fieldId) {
  return FIELD_LABELS[/** @type {keyof typeof FIELD_LABELS} */ (fieldId)] || fieldId;
}

/**
 * 最长优先；同长时出厂词优先于个人词，再按词面稳定排序。
 * @param {RiskWord[]} words
 * @returns {RiskWord[]}
 */
function sortWords(words) {
  return words.slice().sort((a, b) => {
    const byLen = Array.from(b.text).length - Array.from(a.text).length;
    if (byLen !== 0) return byLen;
    if (a.source !== b.source) return a.source === 'factory' ? -1 : 1;
    return a.text.localeCompare(b.text, 'zh');
  });
}

/**
 * @param {string} text
 * @param {RiskWord[]} words
 * @param {RiskLibraryMeta[]} libraries
 * @param {string} fieldId
 * @returns {RiskHit[]}
 */
function matchField(text, words, libraries, fieldId) {
  const source = String(text || '');
  if (!source) return [];
  /** @type {boolean[]} */
  const taken = Array.from({ length: source.length }, () => false);
  /** @type {RiskHit[]} */
  const hits = [];
  let seq = 0;
  for (const word of sortWords(words)) {
    const needle = word.text;
    if (!needle) continue;
    let from = 0;
    while (from < source.length) {
      const start = source.indexOf(needle, from);
      if (start < 0) break;
      const end = start + needle.length;
      let overlap = false;
      for (let i = start; i < end; i += 1) {
        if (taken[i]) {
          overlap = true;
          break;
        }
      }
      from = start + 1;
      if (overlap) continue;
      for (let i = start; i < end; i += 1) taken[i] = true;
      seq += 1;
      /** @type {RiskHit} */
      const hit = {
        id: `${fieldId}:${start}:${end}:${seq}`,
        fieldId,
        fieldLabel: fieldLabel(fieldId),
        start,
        end,
        text: needle,
        libraryId: word.libraryId,
        libraryName: libraryName(word.libraryId, libraries),
        severity: word.severity,
      };
      if (word.replacement) hit.replacement = word.replacement;
      hits.push(hit);
    }
  }
  hits.sort((a, b) => a.start - b.start || a.end - b.end);
  return hits;
}

/**
 * @param {{
 *   fields: RiskField[];
 *   libraryIds: string[];
 *   factoryWords?: RiskWord[];
 *   personalWords?: RiskWord[];
 *   libraries?: RiskLibraryMeta[];
 * }} input
 * @returns {RiskCheckResult}
 */
function checkRiskText(input) {
  const libraries = Array.isArray(input.libraries) && input.libraries.length
    ? input.libraries
    : [
      { id: 'ad_extreme', name: LIBRARY_LABELS.ad_extreme },
      { id: 'offsite_traffic', name: LIBRARY_LABELS.offsite_traffic },
      { id: 'banned', name: LIBRARY_LABELS.banned },
      { id: 'personal', name: LIBRARY_LABELS.personal },
    ];
  const selected = new Set(
    (Array.isArray(input.libraryIds) ? input.libraryIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const personalWords = Array.isArray(input.personalWords) ? input.personalWords : [];
  const personalEmpty = personalWords.length === 0;
  if (selected.has('personal') && personalEmpty) selected.delete('personal');

  /** @type {string[]} */
  const activeIds = [];
  for (const lib of libraries) {
    if (selected.has(lib.id)) activeIds.push(lib.id);
  }
  if (selected.has('personal') && !activeIds.includes('personal')) activeIds.push('personal');

  if (!activeIds.length) {
    return {
      status: 'need_library',
      libraries: [],
      cannotCount: 0,
      rewriteCount: 0,
      hits: [],
      message: '先勾一个词库',
    };
  }

  const fields = Array.isArray(input.fields) ? input.fields : [];
  const hasText = fields.some((field) => String(field && field.text || '').trim());
  if (!hasText) {
    return {
      status: 'no_text',
      libraries: activeIds.map((id) => libraryName(id, libraries)),
      cannotCount: 0,
      rewriteCount: 0,
      hits: [],
      message: '没有可查的字',
    };
  }

  /** @type {RiskWord[]} */
  const pool = [];
  for (const word of Array.isArray(input.factoryWords) ? input.factoryWords : []) {
    if (selected.has(word.libraryId)) pool.push(word);
  }
  if (selected.has('personal')) {
    for (const word of personalWords) pool.push(word);
  }

  /** @type {RiskHit[]} */
  const hits = [];
  for (const field of fields) {
    const id = typeof field.id === 'string' ? field.id.trim() : '';
    if (!id) continue;
    hits.push(...matchField(String(field.text || ''), pool, libraries, id));
  }

  const libraryNames = activeIds.map((id) => libraryName(id, libraries));
  if (!hits.length) {
    const scope = fields.some((field) => field.id === 'paste') ? '这段' : '这篇';
    return {
      status: 'no_hit',
      libraries: libraryNames,
      cannotCount: 0,
      rewriteCount: 0,
      hits: [],
      message: `已查 ${libraryNames.join('、')}。${scope}没有危险词`,
    };
  }

  let cannotCount = 0;
  let rewriteCount = 0;
  for (const hit of hits) {
    if (hit.severity === '不能发') cannotCount += 1;
    else rewriteCount += 1;
  }
  return {
    status: 'hits',
    libraries: libraryNames,
    cannotCount,
    rewriteCount,
    hits,
  };
}

module.exports = {
  LIBRARY_LABELS,
  FIELD_LABELS,
  checkRiskText,
  defaultFactoryPath,
  fieldLabel,
  libraryName,
  loadFactoryWords,
  matchField,
  normalizeFactory,
  sortWords,
};
