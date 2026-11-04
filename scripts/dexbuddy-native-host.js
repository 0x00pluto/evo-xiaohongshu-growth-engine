#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * Chrome Native Messaging Host + 本机侧通道。
 * stdin/stdout：与扩展帧协议互通（stdout 只能写长度前缀帧）。
 * 127.0.0.1:DEX_BUDDY_NATIVE_BRIDGE_PORT：增长引擎 JSON 行协议。
 *
 * Host 是本机独立进程，由 Chrome connectNative 拉起；不必跑在 Dex Buddy 窗口里。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_BRIDGE = path.join(__dirname, 'bridge.js');
/** 安装副本（DexBuddy/native-host）日志写同目录；仓内直跑写 temp/native-host */
const LOG_DIR = fs.existsSync(LOCAL_BRIDGE)
  ? __dirname
  : path.join(ROOT, 'temp', 'native-host');
const LOG_FILE = path.join(LOG_DIR, 'host.log');

/**
 * @param {string} line
 */
function log(line) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // 日志失败不影响主路径
  }
}

// 任何业务 require 之前先打 boot，确认 Chrome 是否跑到本脚本
log(`boot pid=${process.pid} execPath=${process.execPath} argv1=${process.argv[1] || ''}`);

process.on('uncaughtException', (err) => {
  log(`uncaughtException: ${err && err.stack ? err.stack : String(err)}`);
});
process.on('unhandledRejection', (reason) => {
  const text = reason instanceof Error
    ? (reason.stack || reason.message)
    : String(reason);
  log(`unhandledRejection: ${text}`);
});

// 禁止污染 stdout（Chrome NM 只接受长度前缀帧）
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
console.log = (...args) => { log(`console.log ${args.map(String).join(' ')}`); };
console.info = (...args) => { log(`console.info ${args.map(String).join(' ')}`); };
console.warn = (...args) => { log(`console.warn ${args.map(String).join(' ')}`); };
console.error = (...args) => { log(`console.error ${args.map(String).join(' ')}`); };

const net = require('node:net');
/** @type {typeof import('../src/xhs-note/bridge')} */
const bridge = fs.existsSync(LOCAL_BRIDGE)
  ? require('./bridge')
  : require('../src/xhs-note/bridge');

const BRIDGE_PORT = bridge.bridgePort();

/** @type {Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>} */
const pending = new Map();

/**
 * @param {unknown} message
 */
function writeNativeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  originalStdoutWrite(header);
  originalStdoutWrite(body);
}

/**
 * @returns {(chunk: Buffer) => void}
 */
function createNativeReader() {
  /** @type {Buffer} */
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const size = buf.readUInt32LE(0);
      if (size > 1024 * 1024) {
        log(`native frame too large: ${size}`);
        buf = Buffer.alloc(0);
        return;
      }
      if (buf.length < 4 + size) return;
      const json = buf.subarray(4, 4 + size).toString('utf8');
      buf = buf.subarray(4 + size);
      try {
        const msg = JSON.parse(json);
        onNativeMessage(msg);
      } catch (err) {
        log(`native json error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
}

/**
 * @param {unknown} msg
 */
function onNativeMessage(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
  const bag = /** @type {Record<string, unknown>} */ (msg);
  const requestId = typeof bag.requestId === 'string' ? bag.requestId : '';
  if (!requestId) return;
  const waiter = pending.get(requestId);
  if (!waiter) {
    log(`orphan native response ${requestId}`);
    return;
  }
  clearTimeout(waiter.timer);
  pending.delete(requestId);
  waiter.resolve(msg);
}

/**
 * @param {Record<string, unknown>} request
 * @returns {Promise<unknown>}
 */
function sendToExtension(request) {
  const requestId = typeof request.requestId === 'string' ? request.requestId : '';
  if (!requestId) {
    return Promise.reject(new Error('缺少 requestId'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('TIMEOUT'));
    }, 32_000);
    pending.set(requestId, { resolve, reject, timer });
    try {
      writeNativeMessage(request);
    } catch (err) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * @param {import('node:net').Socket} socket
 */
function handleClient(socket) {
  let buf = '';
  socket.setEncoding('utf8');
  socket.on('data', async (chunk) => {
    buf += chunk;
    while (true) {
      const nl = buf.indexOf('\n');
      if (nl < 0) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      /** @type {unknown} */
      let req;
      try {
        req = JSON.parse(line);
      } catch {
        socket.write(`${JSON.stringify({
          ok: false,
          requestId: '',
          error: { code: 'INTERNAL', message: '侧通道请求不是 JSON' },
        })}\n`);
        continue;
      }
      if (!req || typeof req !== 'object' || Array.isArray(req)) {
        socket.write(`${JSON.stringify({
          ok: false,
          requestId: '',
          error: { code: 'INTERNAL', message: '侧通道请求不完整' },
        })}\n`);
        continue;
      }
      const bag = /** @type {Record<string, unknown>} */ (req);
      const op = typeof bag.op === 'string' ? bag.op : '';
      const requestId = typeof bag.requestId === 'string' ? bag.requestId : '';
      try {
        if (op !== 'ping' && op !== 'getExtensionInfo' && op !== 'fetchNote') {
          socket.write(`${JSON.stringify({
            ok: false,
            requestId,
            error: { code: 'INTERNAL', message: `不支持的 op: ${op || '(空)'}` },
          })}\n`);
          continue;
        }
        /** @type {Record<string, unknown>} */
        const outbound = { op, requestId };
        if (op === 'fetchNote') {
          outbound.url = typeof bag.url === 'string' ? bag.url : '';
        }
        const response = await sendToExtension(outbound);
        socket.write(`${JSON.stringify(response)}\n`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = /TIMEOUT/i.test(message) ? 'TIMEOUT' : 'INTERNAL';
        socket.write(`${JSON.stringify({
          ok: false,
          requestId,
          error: {
            code,
            message: code === 'TIMEOUT'
              ? '取料超时，请稍后再试'
              : (message || '取料失败'),
          },
        })}\n`);
      }
    }
  });
  socket.on('error', (err) => {
    log(`client error: ${err.message}`);
  });
}

function main() {
  log('main enter');
  process.stdin.resume();
  process.stdin.on('data', createNativeReader());
  process.stdin.on('end', () => {
    log('stdin end → exit');
    process.exit(0);
  });
  process.stdin.on('error', (err) => {
    log(`stdin error: ${err.message}`);
  });

  const server = net.createServer(handleClient);
  server.on('error', (err) => {
    log(`bridge listen error: ${err.message}`);
    // 端口占用等：不退出，保留 NM 通道；侧通道失败由客户端提示
  });
  server.listen(BRIDGE_PORT, '127.0.0.1', () => {
    log(`bridge listening 127.0.0.1:${BRIDGE_PORT} host=${bridge.hostName()}`);
  });
}

try {
  main();
} catch (err) {
  log(`main throw: ${err instanceof Error ? (err.stack || err.message) : String(err)}`);
  process.exit(1);
}
