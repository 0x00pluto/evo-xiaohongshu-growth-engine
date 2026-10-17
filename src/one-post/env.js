// @ts-check
'use strict';

const fs = require('node:fs');

/**
 * @param {Record<string, string>} env
 * @param {string} [file]
 * @returns {Record<string, string>}
 */
function fillMissingFromDotEnv(env, file) {
  const next = { ...env };
  if (!file || !fs.existsSync(file)) return next;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // 已有值来自工作台设置或进程环境，不让仓库 .env 盖掉。
    if (!next[key]) next[key] = value;
  }
  return next;
}

module.exports = { fillMissingFromDotEnv };
