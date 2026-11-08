// @ts-check
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_HOST_NAME, hostName } = require('./bridge');

/** 校验向量路径（macOS UTF-8）；算出的 ID 必须是 andhfibibleajbnnpbnfdmngmhkoeldj */
const CHROME_ID_VECTOR_PATH = '/Users/peng.zhi/QuanMediaCrawl/extension';
const CHROME_ID_VECTOR_ID = 'andhfibibleajbnnpbnfdmngmhkoeldj';

/**
 * @typedef {{
 *   ok: boolean;
 *   skipped?: boolean;
 *   hostName: string;
 *   extensionId: string;
 *   allowedOrigins?: string[];
 *   manifestPath: string;
 *   wrapperPath: string;
 *   installDir?: string;
 *   message?: string;
 * }} RegisterHostResult
 * @typedef {{
 *   kind: 'node' | 'electron';
 *   execPath: string;
 *   electronRunAsNode: boolean;
 * }} HostRuntime
 */

/**
 * @param {{
 *   homedir?: string;
 *   localAppData?: string;
 *   programData?: string;
 *   publicDir?: string;
 *   platform?: string;
 * }} [options]
 * @returns {{ platform: string; home: string; localAppData: string; programData: string; publicDir: string }}
 */
function resolveInstallDirOptions(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const platform = opts.platform || process.platform;
  const home = typeof opts.homedir === 'string' && opts.homedir.trim()
    ? opts.homedir.trim()
    : os.homedir();
  const localAppData = typeof opts.localAppData === 'string' && opts.localAppData.trim()
    ? opts.localAppData.trim()
    : (process.env.LOCALAPPDATA || (
      platform === 'win32'
        ? path.win32.join(home, 'AppData', 'Local')
        : path.join(home, 'AppData', 'Local')
    ));
  const programData = typeof opts.programData === 'string' && opts.programData.trim()
    ? opts.programData.trim()
    : (process.env.ProgramData || 'C:\\ProgramData');
  const publicDir = typeof opts.publicDir === 'string' && opts.publicDir.trim()
    ? opts.publicDir.trim()
    : (process.env.PUBLIC || 'C:\\Users\\Public');
  return { platform, home, localAppData, programData, publicDir };
}

/**
 * Windows 候选安装目录：用户 Local 优先；含非 ASCII 时改 ProgramData / Public。
 * 仅 win32 使用；darwin 不会走到这里。
 * @param {{
 *   homedir?: string;
 *   localAppData?: string;
 *   programData?: string;
 *   publicDir?: string;
 *   platform?: string;
 * }} [options]
 * @returns {string[]}
 */
function windowsNativeHostInstallCandidates(options) {
  const resolved = resolveInstallDirOptions({ ...options, platform: 'win32' });
  return [
    path.win32.join(resolved.localAppData, 'DexBuddy', 'native-host'),
    path.win32.join(resolved.programData, 'DexBuddy', 'native-host'),
    path.win32.join(resolved.publicDir, 'DexBuddy', 'native-host'),
  ];
}

/**
 * Chrome 清单 path 必须纯 ASCII。
 * darwin / linux：用户 Application Support（或 .local），不写 Windows 盘符。
 * win32：用户 Local 若纯 ASCII 则用它；否则改 ProgramData，再不行 Users\Public。
 * @param {{
 *   homedir?: string;
 *   localAppData?: string;
 *   programData?: string;
 *   publicDir?: string;
 *   platform?: string;
 * }} [options]
 * @returns {string}
 */
function nativeHostInstallDir(options) {
  const resolved = resolveInstallDirOptions(options);
  if (resolved.platform === 'darwin') {
    return path.posix.join(
      resolved.home,
      'Library',
      'Application Support',
      'DexBuddy',
      'native-host',
    );
  }
  if (resolved.platform === 'win32') {
    const candidates = windowsNativeHostInstallCandidates(resolved);
    for (const dir of candidates) {
      if (isAsciiPath(dir)) return dir;
    }
    return candidates[0];
  }
  return path.posix.join(resolved.home, '.local', 'share', 'DexBuddy', 'native-host');
}

/**
 * win32：按候选依次 mkdir，挑第一个可写的纯 ASCII 目录。
 * @param {{
 *   homedir?: string;
 *   localAppData?: string;
 *   programData?: string;
 *   publicDir?: string;
 * }} [options]
 * @returns {string}
 */
function ensureWindowsNativeHostInstallDir(options) {
  const candidates = windowsNativeHostInstallCandidates(options);
  /** @type {string[]} */
  const errors = [];
  for (const dir of candidates) {
    if (!isAsciiPath(dir)) {
      errors.push(`${dir}（非 ASCII）`);
      continue;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch (err) {
      errors.push(`${dir}（${err instanceof Error ? err.message : String(err)}）`);
    }
  }
  throw new Error(
    `无法创建 ASCII Native Host 安装目录：${errors.join('；') || '无候选'}`,
  );
}

/**
 * @returns {string}
 */
function defaultHostScriptPath() {
  return path.resolve(__dirname, 'dexbuddy-native-host.js');
}

/**
 * @returns {string}
 */
function defaultBridgeScriptPath() {
  return path.resolve(__dirname, 'bridge.js');
}

/**
 * 去掉末尾斜杠（保留 Windows 盘符根如 C:\）。
 * @param {string} absolutePath
 * @param {string} [platform]
 * @returns {string}
 */
function stripTrailingSep(absolutePath, platform) {
  const plat = platform || process.platform;
  let p = String(absolutePath || '');
  if (plat === 'win32') {
    while (p.length > 3 && (p.endsWith('\\') || p.endsWith('/'))) p = p.slice(0, -1);
    return p;
  }
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * Chrome「加载已解压的扩展」ID：对安装目录绝对路径哈希（勿 realpath）。
 * @param {string} absolutePath
 * @param {NodeJS.Platform | string} [platform]
 * @returns {string}
 */
function chromeUnpackedExtensionId(absolutePath, platform) {
  const plat = platform || process.platform;
  let p = stripTrailingSep(String(absolutePath || '').trim(), plat);
  if (!p) {
    throw new Error('扩展路径为空，无法计算 Chrome 扩展 ID');
  }
  /** @type {Buffer} */
  let bytes;
  if (plat === 'win32') {
    p = p.replace(/\//g, '\\');
    if (/^[a-z]:/.test(p)) p = `${p[0].toUpperCase()}${p.slice(1)}`;
    bytes = Buffer.from(p, 'utf16le');
  } else {
    bytes = Buffer.from(p, 'utf8');
  }
  const hex = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  return [...hex].map((ch) => 'abcdefghijklmnop'[Number.parseInt(ch, 16)]).join('');
}

/**
 * 智赢内部版 current + legacy 安装目录（有无文件都算进白名单）。
 * @param {{ homedir?: string; localAppData?: string; platform?: string }} [options]
 * @returns {string[]}
 */
function quanMediaCrawlExtensionDirs(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const plat = opts.platform || process.platform;
  const home = typeof opts.homedir === 'string' && opts.homedir.trim()
    ? opts.homedir.trim()
    : os.homedir();
  if (plat === 'win32') {
    const local = typeof opts.localAppData === 'string' && opts.localAppData.trim()
      ? opts.localAppData.trim()
      : (process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'));
    return [
      path.win32.join(home, 'QuanMediaCrawl', 'extension'),
      path.win32.join(local, 'QuanMediaCrawl', 'extension'),
    ];
  }
  if (plat === 'darwin') {
    return [
      path.posix.join(home, 'QuanMediaCrawl', 'extension'),
      path.posix.join(home, 'Library', 'Application Support', 'QuanMediaCrawl', 'extension'),
    ];
  }
  return [
    path.posix.join(home, 'QuanMediaCrawl', 'extension'),
    path.posix.join(home, '.local', 'share', 'QuanMediaCrawl', 'extension'),
  ];
}

/**
 * @param {string} extensionId
 * @returns {string}
 */
function originForExtensionId(extensionId) {
  return `chrome-extension://${extensionId}/`;
}

/**
 * 开发机额外 ID：CLI / 环境变量，追加而非替换路径算出的 origin。
 * @param {string} [extensionId]
 * @returns {string[]}
 */
function resolveExtraExtensionIds(extensionId) {
  /** @type {string[]} */
  const list = [];
  /**
   * @param {unknown} raw
   */
  const push = (raw) => {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (id && !list.includes(id)) list.push(id);
  };
  push(extensionId);
  push(process.env.DEX_BUDDY_XHS_EXTENSION_ID);
  return list;
}

/**
 * @param {{
 *   extensionId?: string;
 *   homedir?: string;
 *   localAppData?: string;
 *   platform?: string;
 * }} [options]
 * @returns {string[]}
 */
function resolveAllowedOrigins(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const plat = opts.platform || process.platform;
  /** @type {string[]} */
  const origins = [];
  for (const dir of quanMediaCrawlExtensionDirs(opts)) {
    const id = chromeUnpackedExtensionId(dir, plat);
    const origin = originForExtensionId(id);
    if (!origins.includes(origin)) origins.push(origin);
  }
  for (const id of resolveExtraExtensionIds(opts.extensionId)) {
    const origin = originForExtensionId(id);
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

/**
 * 兼容旧调用：优先显式 / 环境变量；否则取 current 目录算出的 ID。
 * @param {string} [extensionId]
 * @returns {string}
 */
function resolveExtensionId(extensionId) {
  const extras = resolveExtraExtensionIds(extensionId);
  if (extras.length) return extras[0];
  const dirs = quanMediaCrawlExtensionDirs();
  return chromeUnpackedExtensionId(dirs[0]);
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function sameOriginSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const left = a.map(String).sort();
  const right = b.map(String).sort();
  return left.every((v, i) => v === right[i]);
}

/**
 * macOS / Linux 清单目录。Windows 清单与 Host 同目录（见 manifestPathFor），由注册表指向。
 * @param {string} [_name]
 * @returns {string}
 */
function chromeNativeHostsDir(_name) {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
  }
  if (process.platform === 'linux') {
    return path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts');
  }
  if (process.platform === 'win32') {
    // 兼容旧调用：英文用户名时曾写在 Chrome User Data；新登记改走 installDir。
    return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'NativeMessagingHosts');
  }
  return path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts');
}

/**
 * @param {string} name
 * @param {string} [installDir] Windows 上清单与 Host 同目录，避开中文用户名
 * @returns {string}
 */
function manifestPathFor(name, installDir) {
  if (process.platform === 'win32') {
    const dir = typeof installDir === 'string' && installDir.trim()
      ? path.resolve(installDir.trim())
      : nativeHostInstallDir();
    return path.join(dir, `${name}.json`);
  }
  return path.join(chromeNativeHostsDir(name), `${name}.json`);
}

/**
 * @param {string} hostScriptPath
 * @returns {string}
 */
function wrapperPathFor(hostScriptPath) {
  const dir = path.dirname(hostScriptPath);
  const base = process.platform === 'win32'
    ? 'dexbuddy-native-host.cmd'
    : 'dexbuddy-native-host.sh';
  return path.join(dir, base);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isAsciiPath(text) {
  return typeof text === 'string' && /^[\x20-\x7E]+$/.test(text);
}

/**
 * @param {string} execPath
 * @returns {boolean}
 */
function isNodeBinary(execPath) {
  const base = path.basename(execPath || '').toLowerCase();
  return base === 'node' || base === 'node.exe';
}

/**
 * 常见系统 Node 路径（Chrome 短 PATH 下仍可用绝对路径）。
 * Homebrew symlink 优先于 Cellar 版本目录，避免升级后路径失效。
 * @returns {string[]}
 */
function candidateSystemNodes() {
  const fromEnv = process.env.DEX_BUDDY_NODE_PATH;
  /** @type {string[]} */
  const list = [];
  if (typeof fromEnv === 'string' && fromEnv.trim()) list.push(fromEnv.trim());
  if (process.platform === 'win32') {
    list.push('C:\\Program Files\\nodejs\\node.exe');
  } else {
    list.push('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node');
  }
  return list;
}

/**
 * Cellar 等版本目录 → 优先改用稳定 symlink（若存在）。
 * @param {string} execPath
 * @returns {string}
 */
function preferStableNodePath(execPath) {
  const abs = path.resolve(execPath);
  if (process.platform === 'win32') return abs;
  const looksVersioned = /\/(?:Cellar|opt\/node@|n\/versions|nvm\/versions)\//i.test(abs)
    || /\/node\/v?\d+\.\d+\.\d+\//i.test(abs);
  if (!looksVersioned) return abs;
  for (const candidate of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
    try {
      if (fs.existsSync(candidate) && isNodeBinary(candidate)) {
        return path.resolve(candidate);
      }
    } catch {
      // ignore
    }
  }
  return abs;
}

/**
 * 解析 Host 包装器用的解释器：独立 Node 调试 vs Dex Buddy Electron。
 * @param {{ execPath?: string }} [options]
 * @returns {HostRuntime}
 */
function resolveHostRuntime(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const current = typeof opts.execPath === 'string' && opts.execPath.trim()
    ? path.resolve(opts.execPath.trim())
    : process.execPath;

  if (isNodeBinary(current) && fs.existsSync(current)) {
    return {
      kind: 'node',
      execPath: preferStableNodePath(current),
      electronRunAsNode: false,
    };
  }

  // Dex Buddy / Electron：用 ELECTRON_RUN_AS_NODE 把 Electron 二进制当 Node 跑脚本
  if (current && fs.existsSync(current) && !isNodeBinary(current)) {
    return { kind: 'electron', execPath: current, electronRunAsNode: true };
  }

  for (const candidate of candidateSystemNodes()) {
    try {
      if (candidate && fs.existsSync(candidate) && isNodeBinary(candidate)) {
        return {
          kind: 'node',
          execPath: preferStableNodePath(path.resolve(candidate)),
          electronRunAsNode: false,
        };
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    '找不到可用的 Node/Electron 解释器。请安装 Node，或设置 DEX_BUDDY_NODE_PATH。',
  );
}

/**
 * 去掉 Windows 目录联接（只删联接本身，不递归删目标）。
 * @param {string} linkPath
 */
function removeWindowsJunction(linkPath) {
  if (process.platform !== 'win32') return;
  try {
    if (!fs.existsSync(linkPath)) return;
    const st = fs.lstatSync(linkPath);
    if (st.isSymbolicLink()) {
      fs.unlinkSync(linkPath);
      return;
    }
    if (st.isDirectory()) {
      try {
        fs.unlinkSync(linkPath);
      } catch {
        fs.rmdirSync(linkPath);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * 仅 Windows：.cmd 里的解释器路径必须纯 ASCII。含中文时在 installDir 建 junction。
 * darwin 的 .sh 不走这里。
 * @param {string} execPath
 * @param {string} installDir
 * @returns {string}
 */
function resolveAsciiExecPath(execPath, installDir) {
  const abs = path.resolve(execPath);
  if (isAsciiPath(abs)) return abs;
  if (process.platform !== 'win32') {
    throw new Error(`Host 解释器路径含非 ASCII：${abs}`);
  }
  const binDir = path.dirname(abs);
  const baseName = path.basename(abs);
  const linkRoot = path.join(installDir, 'runtime-bin');
  if (!isAsciiPath(linkRoot)) {
    throw new Error(`无法在非 ASCII 安装目录创建解释器联接：${linkRoot}`);
  }
  fs.mkdirSync(installDir, { recursive: true });
  removeWindowsJunction(linkRoot);
  fs.symlinkSync(binDir, linkRoot, 'junction');
  const linked = path.join(linkRoot, baseName);
  if (!isAsciiPath(linked)) {
    throw new Error(`解释器联接路径仍含非 ASCII：${linked}`);
  }
  return linked;
}

/**
 * @param {string} hostScriptPath
 * @param {string} wrapperPath
 * @param {HostRuntime} [runtime]
 * @returns {HostRuntime}
 */
function writeWrapper(hostScriptPath, wrapperPath, runtime) {
  const absScript = path.resolve(hostScriptPath);
  const rt = runtime || resolveHostRuntime();
  const installDir = path.dirname(wrapperPath);
  const logFile = path.join(installDir, 'host.log');
  const absExec = process.platform === 'win32'
    ? resolveAsciiExecPath(rt.execPath, installDir)
    : path.resolve(rt.execPath);

  if (process.platform === 'win32') {
    const prefix = rt.electronRunAsNode ? 'set ELECTRON_RUN_AS_NODE=1\r\n' : '';
    const boot = `>>"${logFile}" echo %DATE% %TIME% sh-boot\r\n`;
    const body = `@echo off\r\n${boot}${prefix}"${absExec}" "${absScript}" %*\r\n`;
    fs.writeFileSync(wrapperPath, body, 'utf8');
  } else {
    const exportLine = rt.electronRunAsNode ? 'export ELECTRON_RUN_AS_NODE=1\n' : '';
    const body = [
      '#!/bin/sh',
      `LOG="${logFile}"`,
      'mkdir -p "$(dirname "$LOG")" 2>/dev/null',
      'echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) sh-boot pid=$$" >> "$LOG" 2>/dev/null',
      `${exportLine}exec "${absExec}" "${absScript}" "$@"`,
      '',
    ].join('\n');
    fs.writeFileSync(wrapperPath, body, { encoding: 'utf8', mode: 0o755 });
    try {
      fs.chmodSync(wrapperPath, 0o755);
    } catch {
      // ignore
    }
  }
  try {
    fs.chmodSync(absScript, 0o755);
  } catch {
    // ignore
  }
  return rt;
}

/**
 * 把仓内 Host / bridge 同步到纯 ASCII 安装目录。
 * @param {{
 *   installDir: string;
 *   sourceHostScript: string;
 *   sourceBridgeScript?: string;
 * }} options
 * @returns {{ hostScriptPath: string; bridgeScriptPath: string; wrapperPath: string }}
 */
function syncNativeHostInstall(options) {
  const installDir = path.resolve(options.installDir);
  const sourceHost = path.resolve(options.sourceHostScript);
  const sourceBridge = path.resolve(
    typeof options.sourceBridgeScript === 'string' && options.sourceBridgeScript.trim()
      ? options.sourceBridgeScript.trim()
      : defaultBridgeScriptPath(),
  );
  if (!fs.existsSync(sourceHost)) {
    throw new Error(`找不到 Host 脚本：${sourceHost}`);
  }
  if (!fs.existsSync(sourceBridge)) {
    throw new Error(`找不到 bridge 脚本：${sourceBridge}`);
  }
  fs.mkdirSync(installDir, { recursive: true });
  const hostScriptPath = path.join(installDir, 'dexbuddy-native-host.js');
  const bridgeScriptPath = path.join(installDir, 'bridge.js');
  fs.copyFileSync(sourceHost, hostScriptPath);
  fs.copyFileSync(sourceBridge, bridgeScriptPath);
  const wrapperPath = wrapperPathFor(hostScriptPath);
  return { hostScriptPath, bridgeScriptPath, wrapperPath };
}

/**
 * Windows：HKCU 注册表指向清单文件。
 * @param {string} name
 * @param {string} manifestPath
 */
function ensureWindowsRegistry(name, manifestPath) {
  if (process.platform !== 'win32') return;
  // 延迟加载，避免非 Windows 解析 child_process 路径问题；仅 win 调用。
  const { spawnSync } = require('node:child_process');
  const key = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${name}`;
  const result = spawnSync(
    'reg',
    ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(err || '写入 Chrome Native Messaging 注册表失败');
  }
}

/**
 * 静默注册 Chrome Native Messaging Host（幂等）。
 * @param {{
 *   extensionId?: string;
 *   hostScriptPath?: string;
 *   hostName?: string;
 *   installDir?: string;
 * }} [options]
 * @returns {RegisterHostResult}
 */
function registerNativeHost(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const name = typeof opts.hostName === 'string' && opts.hostName.trim()
    ? opts.hostName.trim()
    : hostName();
  const allowedOrigins = resolveAllowedOrigins({ extensionId: opts.extensionId });
  const extensionId = resolveExtensionId(opts.extensionId);
  const sourceHostScript = typeof opts.hostScriptPath === 'string' && opts.hostScriptPath.trim()
    ? path.resolve(opts.hostScriptPath.trim())
    : defaultHostScriptPath();

  /** @type {string} */
  let installDir = typeof opts.installDir === 'string' && opts.installDir.trim()
    ? path.resolve(opts.installDir.trim())
    : '';
  /** @type {string} */
  let manifestPath = '';
  /** @type {string} */
  let wrapperPath = '';

  try {
    if (!installDir) {
      installDir = process.platform === 'win32'
        ? ensureWindowsNativeHostInstallDir()
        : nativeHostInstallDir();
    }
    manifestPath = manifestPathFor(name, installDir);
    wrapperPath = path.join(installDir, process.platform === 'win32'
      ? 'dexbuddy-native-host.cmd'
      : 'dexbuddy-native-host.sh');

    if (!allowedOrigins.length) {
      throw new Error('没有可写入的 allowed_origins');
    }
    // 防回归：校验向量算错就不要写清单
    const vectorId = chromeUnpackedExtensionId(CHROME_ID_VECTOR_PATH, 'darwin');
    if (vectorId !== CHROME_ID_VECTOR_ID) {
      throw new Error(
        `Chrome 扩展 ID 算法校验失败：期望 ${CHROME_ID_VECTOR_ID}，得到 ${vectorId}`,
      );
    }

    const synced = syncNativeHostInstall({
      installDir,
      sourceHostScript,
    });
    wrapperPath = synced.wrapperPath;
    writeWrapper(synced.hostScriptPath, wrapperPath);

    if (!isAsciiPath(wrapperPath)) {
      throw new Error(`Host 包装器路径含非 ASCII，Chrome 可能无法启动：${wrapperPath}`);
    }

    /** @type {{ name: string; description: string; path: string; type: string; allowed_origins: string[] }} */
    const desired = {
      name,
      description: 'Dex Buddy ↔ 智赢媒体助手 Native Messaging Host',
      path: wrapperPath,
      type: 'stdio',
      allowed_origins: allowedOrigins,
    };

    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

    if (fs.existsSync(manifestPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (
          raw
          && typeof raw === 'object'
          && raw.name === desired.name
          && raw.path === desired.path
          && raw.type === desired.type
          && sameOriginSet(raw.allowed_origins, desired.allowed_origins)
        ) {
          if (process.platform === 'win32') ensureWindowsRegistry(name, manifestPath);
          return {
            ok: true,
            skipped: true,
            hostName: name,
            extensionId,
            allowedOrigins,
            manifestPath,
            wrapperPath,
            installDir,
            message: 'Host 清单已是最新（安装目录已刷新）',
          };
        }
      } catch {
        // 坏清单则覆盖
      }
    }

    fs.writeFileSync(manifestPath, `${JSON.stringify(desired, null, 2)}\n`, 'utf8');
    if (process.platform === 'win32') ensureWindowsRegistry(name, manifestPath);
    return {
      ok: true,
      skipped: false,
      hostName: name,
      extensionId,
      allowedOrigins,
      manifestPath,
      wrapperPath,
      installDir,
      message: '已写入 Chrome Native Messaging Host 清单',
    };
  } catch (err) {
    return {
      ok: false,
      hostName: name,
      extensionId,
      allowedOrigins,
      manifestPath: manifestPath || (installDir ? manifestPathFor(name, installDir) : manifestPathFor(name)),
      wrapperPath: wrapperPath || (installDir
        ? path.join(installDir, process.platform === 'win32'
          ? 'dexbuddy-native-host.cmd'
          : 'dexbuddy-native-host.sh')
        : ''),
      installDir: installDir || undefined,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 启动时调用：失败只返回结果，不抛。
 * @param {{ extensionId?: string; hostScriptPath?: string; installDir?: string }} [options]
 * @returns {RegisterHostResult}
 */
function ensureNativeHostRegistered(options) {
  return registerNativeHost(options);
}

module.exports = {
  CHROME_ID_VECTOR_ID,
  CHROME_ID_VECTOR_PATH,
  DEFAULT_HOST_NAME,
  chromeNativeHostsDir,
  chromeUnpackedExtensionId,
  defaultHostScriptPath,
  ensureNativeHostRegistered,
  ensureWindowsNativeHostInstallDir,
  isAsciiPath,
  isNodeBinary,
  manifestPathFor,
  nativeHostInstallDir,
  originForExtensionId,
  preferStableNodePath,
  quanMediaCrawlExtensionDirs,
  registerNativeHost,
  resolveAllowedOrigins,
  resolveAsciiExecPath,
  resolveExtensionId,
  resolveExtraExtensionIds,
  resolveHostRuntime,
  sameOriginSet,
  syncNativeHostInstall,
  windowsNativeHostInstallCandidates,
  wrapperPathFor,
  writeWrapper,
};
