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

/**
 * 从 URL query 抽出 xsec_token（无则空串）。
 * @param {unknown} url
 * @returns {string}
 */
function extractXsecToken(url) {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return '';
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withScheme);
    const token = parsed.searchParams.get('xsec_token');
    return token && String(token).trim() ? String(token).trim() : '';
  } catch {
    return '';
  }
}

/**
 * 真拉专用：有 noteId + xsec_token 时改写成 durable 分享链；否则空串（调用方不得调桥）。
 * @param {unknown} url
 * @returns {string}
 */
function toDurableShareFetchUrl(url) {
  const noteId = extractXhsNoteId(url);
  const token = extractXsecToken(url);
  if (!noteId || !token) return '';
  const out = new URL(`https://www.xiaohongshu.com/discovery/item/${noteId}`);
  out.searchParams.set('source', 'webshare');
  out.searchParams.set('xhsshare', 'pc_web');
  out.searchParams.set('xsec_token', token);
  out.searchParams.set('xsec_source', 'pc_share');
  return out.toString();
}

module.exports = {
  canonicalExploreUrl,
  extractXhsNoteId,
  extractXsecToken,
  toDurableShareFetchUrl,
};
