// @ts-check
'use strict';

const crypto = require('node:crypto');

/**
 * @param {unknown} title
 * @param {unknown} body
 * @returns {string}
 */
function articleTextHash(title, body) {
  const text = `${String(title || '').trim()}\n${String(body || '').trim()}`;
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * @param {Buffer | Uint8Array | string} bytes
 * @returns {string}
 */
function contentMd5(bytes) {
  const buf = Buffer.isBuffer(bytes)
    ? bytes
    : (typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes));
  return crypto.createHash('md5').update(buf).digest('hex');
}

/**
 * @param {unknown} dataUrl
 * @returns {string}
 */
function contentMd5FromDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  const match = /^data:[^;,]+(?:;[^,]*)?;base64,(.+)$/i.exec(raw);
  if (!match) return '';
  try {
    const bytes = Buffer.from(match[1] || '', 'base64');
    if (!bytes.length) return '';
    return contentMd5(bytes);
  } catch {
    return '';
  }
}

module.exports = {
  articleTextHash,
  contentMd5,
  contentMd5FromDataUrl,
};
