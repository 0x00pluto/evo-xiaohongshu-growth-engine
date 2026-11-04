// @ts-check
'use strict';

const net = require('node:net');
const crypto = require('node:crypto');
const { bridgePort, humanError, mapBridgeError } = require('./bridge');
const { normalizeNotePayload } = require('./split');

/**
 * @typedef {{
 *   ok: true;
 *   note: import('./split').NoteImportPayload;
 * } | {
 *   ok: false;
 *   code: string;
 *   message: string;
 * }} FetchNoteResult
 */

/**
 * @param {import('node:net').Socket} socket
 * @param {unknown} body
 * @returns {Promise<unknown>}
 */
function requestOnce(socket, body) {
  return new Promise((resolve, reject) => {
    let buf = '';
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      if (timer) clearTimeout(timer);
    };
    /**
     * @param {unknown} err
     */
    const fail = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    /**
     * @param {Buffer | string} chunk
     */
    const onData = (chunk) => {
      buf += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      const line = buf.slice(0, nl);
      cleanup();
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        fail(err);
      }
    };
    /**
     * @param {Error} err
     */
    const onError = (err) => fail(err);
    const onClose = () => fail(new Error('取料通道已断开'));
    timer = setTimeout(() => fail(new Error('TIMEOUT')), 35_000);
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
    socket.write(`${JSON.stringify(body)}\n`);
  });
}

/**
 * @param {number} [port]
 * @returns {Promise<import('node:net').Socket>}
 */
function connectBridge(port) {
  const target = typeof port === 'number' ? port : bridgePort();
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: target });
    /**
     * @param {Error} err
     */
    const onError = (err) => {
      socket.destroy();
      reject(err);
    };
    socket.once('error', onError);
    socket.once('connect', () => {
      socket.off('error', onError);
      resolve(socket);
    });
  });
}

/**
 * @param {string} url
 * @param {{ port?: number; requestId?: string }} [options]
 * @returns {Promise<FetchNoteResult>}
 */
async function fetchNoteByUrl(url, options) {
  const target = typeof url === 'string' ? url.trim() : '';
  if (!target) {
    return { ok: false, code: 'INVALID_URL', message: humanError('INVALID_URL') };
  }
  /** @type {import('node:net').Socket | null} */
  let socket = null;
  try {
    socket = await connectBridge(options && options.port);
    const requestId = (options && options.requestId)
      || crypto.randomUUID();
    const raw = await requestOnce(socket, {
      op: 'fetchNote',
      requestId,
      url: target,
    });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, code: 'INTERNAL', message: '取料回包不完整' };
    }
    const bag = /** @type {Record<string, unknown>} */ (raw);
    if (bag.ok === true) {
      const note = normalizeNotePayload(bag);
      if (!note) {
        return { ok: false, code: 'INTERNAL', message: '取料回包缺少笔记字段' };
      }
      return { ok: true, note };
    }
    const errBag = bag.error && typeof bag.error === 'object' && !Array.isArray(bag.error)
      ? /** @type {Record<string, unknown>} */ (bag.error)
      : null;
    const code = errBag && typeof errBag.code === 'string' ? errBag.code : 'INTERNAL';
    const message = errBag && typeof errBag.message === 'string' && errBag.message.trim()
      ? errBag.message.trim()
      : humanError(code);
    return { ok: false, code, message };
  } catch (err) {
    const mapped = mapBridgeError(err);
    return {
      ok: false,
      code: mapped.code,
      message: humanError(mapped.code, mapped.message),
    };
  } finally {
    if (socket) {
      try {
        socket.end();
      } catch {
        // ignore
      }
    }
  }
}

module.exports = {
  connectBridge,
  fetchNoteByUrl,
};
