// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FILES_URL = 'https://api.replicate.com/v1/files';

/**
 * @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} FetchFn
 */

/**
 * @param {string} filePath
 * @returns {string}
 */
function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * 上传本地文件到 Replicate Files，返回可供 prediction 使用的 URL。
 * @param {{
 *   path: unknown;
 *   token: string;
 *   fetch?: FetchFn;
 * }} args
 * @returns {Promise<string>}
 */
async function uploadReplicateFile({ path: filePath, token, fetch: fetchImpl }) {
  const abs = typeof filePath === 'string' ? filePath.trim() : '';
  if (!abs) throw new Error('参考图路径是空的');
  if (!fs.existsSync(abs)) throw new Error('找不到参考图文件');
  const auth = String(token || '').trim();
  if (!auth) throw new Error('缺少 REPLICATE_API_TOKEN');
  const bytes = fs.readFileSync(abs);
  if (bytes.length === 0) throw new Error('参考图是空的');
  const filename = path.basename(abs) || 'reference.bin';
  const mime = mimeFromPath(abs);
  const form = new FormData();
  form.append('content', new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  const fetchFn = fetchImpl || globalThis.fetch;
  const response = await fetchFn(FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth}`,
    },
    body: form,
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body && typeof body.detail === 'string' ? body.detail : '';
    } catch {
      detail = '';
    }
    throw new Error(detail ? `参考图上传失败：${detail}` : `参考图上传失败（${response.status}）`);
  }
  /** @type {unknown} */
  const body = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('参考图上传没有返回文件信息');
  }
  const record = /** @type {{ urls?: { get?: unknown }; id?: unknown }} */ (body);
  if (typeof record.urls?.get === 'string' && record.urls.get.startsWith('http')) {
    return record.urls.get;
  }
  if (typeof record.id === 'string' && record.id.trim()) {
    return `${FILES_URL}/${record.id.trim()}`;
  }
  throw new Error('参考图上传没有返回可用地址');
}

module.exports = {
  FILES_URL,
  mimeFromPath,
  uploadReplicateFile,
};
