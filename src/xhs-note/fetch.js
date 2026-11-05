// @ts-check
'use strict';

const net = require('node:net');
const crypto = require('node:crypto');
const {
  bridgePort,
  humanError,
  isExtensionVersionAtLeast,
  mapBridgeError,
  MIN_EXTENSION_VERSION,
} = require('./bridge');
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
 * @typedef {{
 *   ok: true;
 *   version: string;
 *   minVersion: string;
 * } | {
 *   ok: false;
 *   code: string;
 *   message: string;
 *   version?: string;
 *   minVersion: string;
 * }} CheckBridgeResult
 */

/**
 * @param {import('node:net').Socket} socket
 * @param {unknown} body
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<unknown>}
 */
function requestOnce(socket, body, options) {
  const timeoutMs = options && Number.isFinite(options.timeoutMs) && /** @type {number} */ (options.timeoutMs) > 0
    ? /** @type {number} */ (options.timeoutMs)
    : 35_000;
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
    timer = setTimeout(() => fail(new Error('TIMEOUT')), timeoutMs);
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
 * @param {unknown} raw
 * @returns {string}
 */
function readExtensionVersion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const bag = /** @type {Record<string, unknown>} */ (raw);
  if (typeof bag.version === 'string' && bag.version.trim()) return bag.version.trim();
  if (typeof bag.extensionVersion === 'string' && bag.extensionVersion.trim()) {
    return bag.extensionVersion.trim();
  }
  if (bag.info && typeof bag.info === 'object' && !Array.isArray(bag.info)) {
    const info = /** @type {Record<string, unknown>} */ (bag.info);
    if (typeof info.version === 'string' && info.version.trim()) return info.version.trim();
  }
  if (bag.data && typeof bag.data === 'object' && !Array.isArray(bag.data)) {
    const data = /** @type {Record<string, unknown>} */ (bag.data);
    if (typeof data.version === 'string' && data.version.trim()) return data.version.trim();
  }
  return '';
}

/**
 * 探测本机取料通道与扩展版本（≥ MIN_EXTENSION_VERSION）。
 * @param {{ port?: number; requestId?: string; timeoutMs?: number }} [options]
 * @returns {Promise<CheckBridgeResult>}
 */
async function checkBridge(options) {
  const minVersion = MIN_EXTENSION_VERSION;
  const timeoutMs = options && Number.isFinite(options.timeoutMs)
    ? /** @type {number} */ (options.timeoutMs)
    : 5_000;
  /** @type {import('node:net').Socket | null} */
  let socket = null;
  try {
    socket = await connectBridge(options && options.port);
    const requestId = (options && options.requestId) || crypto.randomUUID();
    /** @type {unknown} */
    let raw;
    try {
      raw = await requestOnce(socket, {
        op: 'getExtensionInfo',
        requestId,
      }, { timeoutMs });
    } catch {
      // getExtensionInfo 失败再 ping；短连接可能已断，重连一次
      try {
        socket.end();
      } catch {
        // ignore
      }
      socket = await connectBridge(options && options.port);
      raw = await requestOnce(socket, {
        op: 'ping',
        requestId: crypto.randomUUID(),
      }, { timeoutMs });
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        ok: false,
        code: 'VERSION_LOW',
        message: humanError('VERSION_LOW'),
        minVersion,
      };
    }
    const bag = /** @type {Record<string, unknown>} */ (raw);
    if (bag.ok === false) {
      const errBag = bag.error && typeof bag.error === 'object' && !Array.isArray(bag.error)
        ? /** @type {Record<string, unknown>} */ (bag.error)
        : null;
      const code = errBag && typeof errBag.code === 'string' ? errBag.code : 'BRIDGE_DOWN';
      if (code === 'DISABLED') {
        return { ok: false, code, message: humanError(code), minVersion };
      }
      return {
        ok: false,
        code: code === 'TIMEOUT' ? 'TIMEOUT' : 'BRIDGE_DOWN',
        message: humanError(code === 'TIMEOUT' ? 'TIMEOUT' : 'BRIDGE_DOWN'),
        minVersion,
      };
    }

    const version = readExtensionVersion(bag);
    if (!version || !isExtensionVersionAtLeast(version, minVersion)) {
      return {
        ok: false,
        code: 'VERSION_LOW',
        message: humanError('VERSION_LOW'),
        version: version || undefined,
        minVersion,
      };
    }
    return { ok: true, version, minVersion };
  } catch (err) {
    const mapped = mapBridgeError(err);
    const code = mapped.code === 'TIMEOUT' ? 'TIMEOUT' : (
      mapped.code === 'BRIDGE_DOWN' ? 'BRIDGE_DOWN' : 'BRIDGE_DOWN'
    );
    return {
      ok: false,
      code,
      message: humanError(code, mapped.message),
      minVersion,
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
  checkBridge,
  connectBridge,
  fetchNoteByUrl,
  readExtensionVersion,
  requestOnce,
};
