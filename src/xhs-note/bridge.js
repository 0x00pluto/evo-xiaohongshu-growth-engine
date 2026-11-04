// @ts-check
'use strict';

/** 侧通道默认端口；可用环境变量 DEX_BUDDY_NATIVE_BRIDGE_PORT 覆盖 */
const DEFAULT_BRIDGE_PORT = 18769;
const DEFAULT_HOST_NAME = 'com.zhiying.dexbuddy.host';

/**
 * @returns {number}
 */
function bridgePort() {
  const raw = process.env.DEX_BUDDY_NATIVE_BRIDGE_PORT;
  const n = raw ? Number(raw) : DEFAULT_BRIDGE_PORT;
  if (!Number.isInteger(n) || n < 1 || n > 65535) return DEFAULT_BRIDGE_PORT;
  return n;
}

/**
 * @returns {string}
 */
function hostName() {
  const name = process.env.DEX_BUDDY_NATIVE_HOST_NAME;
  return typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_HOST_NAME;
}

/**
 * @param {unknown} err
 * @returns {{ code: string; message: string }}
 */
function mapBridgeError(err) {
  const message = err instanceof Error ? err.message : String(err || '连接失败');
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|connect ECONNREFUSED/i.test(message)) {
    return {
      code: 'BRIDGE_DOWN',
      message: '连不上本机取料通道。请确认内部特供版已加载，并打开「Dex Buddy → 允许 Dex Buddy 连接」。',
    };
  }
  if (/timeout|Timeout|TIMEOUT/i.test(message)) {
    return {
      code: 'TIMEOUT',
      message: '取料超时，请稍后再试',
    };
  }
  return { code: 'INTERNAL', message };
}

/**
 * @param {string} code
 * @param {string} [fallback]
 * @returns {string}
 */
function humanError(code, fallback) {
  switch (code) {
    case 'NOT_LOGGED_IN':
      return '请在本机 Chrome 打开小红书并登录后再试';
    case 'NOTE_NOT_FOUND':
      return '找不到这篇笔记，请检查链接';
    case 'INVALID_URL':
      return '请粘贴小红书笔记链接（explore 或 xhslink）';
    case 'DISABLED':
      return '请打开扩展选项「Dex Buddy → 允许 Dex Buddy 连接」';
    case 'BUSY':
      return '正在取另一篇，请稍后再试';
    case 'TIMEOUT':
      return '取料超时，请稍后再试';
    case 'BRIDGE_DOWN':
      return '连不上本机取料通道。请确认内部特供版已加载，并打开「Dex Buddy → 允许 Dex Buddy 连接」。';
    case 'ALREADY':
      return '这篇笔记已经收录过了';
    case 'IMPORTING':
      return '这篇笔记正在收录，请稍等';
    default:
      return fallback || '取料失败';
  }
}

module.exports = {
  DEFAULT_BRIDGE_PORT,
  DEFAULT_HOST_NAME,
  bridgePort,
  hostName,
  humanError,
  mapBridgeError,
};
