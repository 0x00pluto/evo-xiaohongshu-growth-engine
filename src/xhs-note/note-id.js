// @ts-check
'use strict';

/**
 * 从小红书笔记 URL 抽出稳定笔记 ID（忽略 xsec_token 等 query）。
 * 支持 /explore/<id>、/discovery/item/<id>。
 * @param {unknown} url
 * @returns {string}
 */
function extractXhsNoteId(url) {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return '';
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withScheme);
    const path = parsed.pathname || '';
    let match = path.match(/\/explore\/([A-Za-z0-9]+)/);
    if (match && match[1]) return match[1];
    match = path.match(/\/discovery\/item\/([A-Za-z0-9]+)/);
    if (match && match[1]) return match[1];
  } catch {
    // 非法 URL：抽不出
  }
  return '';
}

/**
 * 去掉 query/hash 的规范 explore 链接（有 noteId 时）。
 * @param {unknown} url
 * @returns {string}
 */
function canonicalExploreUrl(url) {
  const noteId = extractXhsNoteId(url);
  if (!noteId) return typeof url === 'string' ? url.trim() : '';
  return `https://www.xiaohongshu.com/explore/${noteId}`;
}

module.exports = {
  canonicalExploreUrl,
  extractXhsNoteId,
};
