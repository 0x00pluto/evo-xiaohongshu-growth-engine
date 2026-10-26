// @ts-check
'use strict';

/**
 * @param {unknown} err
 * @returns {string}
 */
function errorCode(err) {
  if (!err || typeof err !== 'object' || !('code' in err)) return '';
  const code = /** @type {{ code?: unknown }} */ (err).code;
  return typeof code === 'string' ? code.trim() : '';
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function errorText(err) {
  if (!err || typeof err !== 'object' || !('message' in err)) return '';
  const message = /** @type {{ message?: unknown }} */ (err).message;
  return typeof message === 'string' ? message.trim() : '';
}

/**
 * @param {unknown} err
 * @param {string} fallback
 * @returns {string}
 */
function formatModelError(err, fallback) {
  const code = errorCode(err);
  const raw = errorText(err);
  if (code === 'UNAUTHORIZED' && /DEX_BUDDY_API_KEY/.test(raw)) {
    return `请在本机 .env 填写 DEX_BUDDY_API_KEY（${code}）`;
  }
  if (code === 'UNAUTHORIZED') {
    return `未登录或会话失效（${code}）`;
  }
  if (code === 'NOT_ENTITLED') {
    return `当前账号未开通这个插件（${code}）`;
  }
  if (code === 'INSUFFICIENT_CREDITS') {
    return `积分不足（${code}）`;
  }
  const text = raw || fallback || '没有完成';
  return code && !text.includes(`（${code}）`) ? `${text}（${code}）` : text;
}

module.exports = {
  formatModelError,
};
