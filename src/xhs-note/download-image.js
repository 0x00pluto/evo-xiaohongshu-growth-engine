// @ts-check
'use strict';

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * @param {string} mime
 * @returns {string | null}
 */
function extForMime(mime) {
  const kind = String(mime || '').toLowerCase().split(';')[0]?.trim() || '';
  if (kind === 'image/jpeg' || kind === 'image/jpg') return '.jpg';
  if (kind === 'image/png') return '.png';
  if (kind === 'image/webp') return '.webp';
  return null;
}

/**
 * @param {string} url
 * @param {string} [hintMime]
 * @returns {string | null}
 */
function guessMime(url, hintMime) {
  const hint = String(hintMime || '').toLowerCase().split(';')[0]?.trim() || '';
  if (extForMime(hint)) return hint;
  const lower = String(url || '').toLowerCase();
  if (/\.png(\?|#|$)/.test(lower)) return 'image/png';
  if (/\.webp(\?|#|$)/.test(lower)) return 'image/webp';
  if (/\.jpe?g(\?|#|$)/.test(lower)) return 'image/jpeg';
  return 'image/jpeg';
}

/**
 * 下载单张图为 data URL；超 8MB 或失败返回 null（不整次失败）。
 * @param {string} url
 * @param {{ mime?: string; fetchFn?: typeof fetch }} [options]
 * @returns {Promise<{ dataUrl: string; mime: string; bytes: Buffer } | null>}
 */
async function downloadNoteImage(url, options) {
  const target = String(url || '').trim();
  if (!target) return null;
  const fetchFn = options && typeof options.fetchFn === 'function'
    ? options.fetchFn
    : globalThis.fetch;
  if (typeof fetchFn !== 'function') return null;
  try {
    const res = await fetchFn(target, {
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    if (!res || !res.ok) return null;
    const headerMime = res.headers && typeof res.headers.get === 'function'
      ? String(res.headers.get('content-type') || '')
      : '';
    const mime = guessMime(target, options && options.mime ? options.mime : headerMime);
    const safeMime = mime || 'image/jpeg';
    if (!extForMime(safeMime)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > IMAGE_MAX_BYTES) return null;
    return {
      mime: safeMime,
      bytes: buf,
      dataUrl: `data:${safeMime};base64,${buf.toString('base64')}`,
    };
  } catch {
    return null;
  }
}

module.exports = {
  IMAGE_MAX_BYTES,
  downloadNoteImage,
  extForMime,
  guessMime,
};
