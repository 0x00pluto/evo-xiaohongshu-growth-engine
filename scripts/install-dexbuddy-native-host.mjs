#!/usr/bin/env node
/**
 * 本机注册 Chrome Native Messaging Host。
 * 默认按智赢内部版 current/legacy 安装路径计算两个 allowed_origins；
 * --extension-id / DEX_BUDDY_XHS_EXTENSION_ID 仅追加（开发目录加载时用）。
 * 用户正常路径由插件/操作台启动静默注册，不必手跑本脚本。
 *
 * 用法:
 *   node scripts/install-dexbuddy-native-host.mjs
 *   node scripts/install-dexbuddy-native-host.mjs --extension-id <id>
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** @type {typeof import('../src/xhs-note/register-host')} */
const registerHost = require('../src/xhs-note/register-host');

/**
 * @param {string[]} argv
 * @returns {{ extensionId: string; help: boolean }}
 */
function parseArgs(argv) {
  let extensionId = '';
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--extension-id') {
      extensionId = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return { extensionId, help };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(
    '用法: node scripts/install-dexbuddy-native-host.mjs [--extension-id <chrome-extension-id>]\n',
  );
  process.exit(0);
}

const result = registerHost.registerNativeHost({
  extensionId: args.extensionId || undefined,
  hostScriptPath: path.join(root, 'scripts', 'dexbuddy-native-host.js'),
});

if (!result.ok) {
  process.stderr.write(`${result.message || '注册失败'}\n`);
  process.exit(1);
}

process.stdout.write(`${result.message}\n`);
process.stdout.write(`hostName: ${result.hostName}\n`);
process.stdout.write(`extensionId: ${result.extensionId}\n`);
if (Array.isArray(result.allowedOrigins)) {
  process.stdout.write(`allowed_origins (${result.allowedOrigins.length}):\n`);
  for (const origin of result.allowedOrigins) {
    process.stdout.write(`  ${origin}\n`);
  }
}
process.stdout.write(`manifest: ${result.manifestPath}\n`);
process.stdout.write(`wrapper: ${result.wrapperPath}\n`);
process.stdout.write('下一步：在 chrome://extensions 重载内部特供版，再测操作台「取这篇」。\n');
