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
  if (code === 'CONTENT_FLAGGED') {
    return `内容未通过安全审核。请换画面说明，或换风格样图 / 我们的图后再试（${code}）`;
  }
  const text = raw || fallback || '没有完成';
  return code && !text.includes(`（${code}）`) ? `${text}（${code}）` : text;
}

/**
 * 断线 / 超时 / 同 key 冲突：可用同一把 Idempotency-Key 再取。
 * @param {unknown} err
 * @returns {boolean}
 */
function isIdempotencyConflict(err) {
  if (errorCode(err) === 'IDEMPOTENCY_CONFLICT') return true;
  const text = errorText(err) || (err instanceof Error ? err.message : String(err || ''));
  return text.includes('IDEMPOTENCY_CONFLICT')
    || text.includes('相同幂等键')
    || text.includes('同 key 正在处理');
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isReplayableModelError(err) {
  if (isIdempotencyConflict(err)) return true;
  if (errorCode(err) === 'NETWORK_ERROR') return true;
  const text = (errorText(err) || (err instanceof Error ? err.message : String(err || ''))).toLowerCase();
  if (text.includes('fetch failed')) return true;
  if (text.includes('network_error')) return true;
  const raw = errorText(err) || (err instanceof Error ? err.message : String(err || ''));
  if (raw.startsWith('无法连接')) return true;
  if (raw.includes('网关读取超时')) return true;
  return false;
}

/**
 * 文案是否像可重放的取回失败（前端轮询结果用）。
 * @param {unknown} message
 * @returns {boolean}
 */
function isReplayableErrorMessage(message) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes('fetch failed')
    || lower.includes('network_error')
    || text.includes('NETWORK_ERROR')
    || text.includes('IDEMPOTENCY_CONFLICT')
    || text.includes('相同幂等键')
    || text.includes('同 key 正在处理')
    || text.startsWith('无法连接')
    || text.includes('网关读取超时')
    || text.includes('请再点一次取回')
    || text.includes('不会重复扣费')
    || text.includes('取回失败');
}

module.exports = {
  errorCode,
  formatModelError,
  isIdempotencyConflict,
  isReplayableErrorMessage,
  isReplayableModelError,
};
