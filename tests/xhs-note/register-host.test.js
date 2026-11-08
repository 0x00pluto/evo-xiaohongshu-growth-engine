'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CHROME_ID_VECTOR_ID,
  CHROME_ID_VECTOR_PATH,
  chromeUnpackedExtensionId,
  defaultHostScriptPath,
  isAsciiPath,
  isNodeBinary,
  nativeHostInstallDir,
  preferStableNodePath,
  quanMediaCrawlExtensionDirs,
  registerNativeHost,
  resolveAllowedOrigins,
  resolveExtensionId,
  resolveHostRuntime,
  sameOriginSet,
  windowsNativeHostInstallCandidates,
  wrapperPathFor,
  writeWrapper,
} = require('../../src/xhs-note/register-host');

test('校验向量：QuanMediaCrawl 路径算出固定扩展 ID', () => {
  assert.equal(
    chromeUnpackedExtensionId(CHROME_ID_VECTOR_PATH, 'darwin'),
    CHROME_ID_VECTOR_ID,
  );
  assert.equal(
    chromeUnpackedExtensionId(`${CHROME_ID_VECTOR_PATH}/`, 'darwin'),
    CHROME_ID_VECTOR_ID,
  );
});

test('Windows 路径：盘符大写 + UTF-16LE；勿与 POSIX 混算', () => {
  const id = chromeUnpackedExtensionId('c:\\Users\\demo\\QuanMediaCrawl\\extension', 'win32');
  assert.match(id, /^[a-p]{32}$/);
  assert.equal(
    chromeUnpackedExtensionId('C:\\Users\\demo\\QuanMediaCrawl\\extension', 'win32'),
    id,
  );
  assert.notEqual(
    chromeUnpackedExtensionId('/Users/demo/QuanMediaCrawl/extension', 'darwin'),
    id,
  );
});

test('resolveExtensionId：显式 / 环境变量追加用，不再回落写死 ID', () => {
  assert.equal(resolveExtensionId('  abcdev  '), 'abcdev');
  const fromPath = chromeUnpackedExtensionId(quanMediaCrawlExtensionDirs()[0]);
  assert.equal(resolveExtensionId(''), fromPath);
  assert.equal(resolveExtensionId(), fromPath);
});

test('default origins：current + legacy 两条都在；env 追加第三条', () => {
  const prev = process.env.DEX_BUDDY_XHS_EXTENSION_ID;
  try {
    delete process.env.DEX_BUDDY_XHS_EXTENSION_ID;
    const base = resolveAllowedOrigins({
      homedir: '/Users/peng.zhi',
      platform: 'darwin',
    });
    assert.equal(base.length, 2);
    assert.ok(base.includes(`chrome-extension://${CHROME_ID_VECTOR_ID}/`));
    const legacyId = chromeUnpackedExtensionId(
      '/Users/peng.zhi/Library/Application Support/QuanMediaCrawl/extension',
      'darwin',
    );
    assert.ok(base.includes(`chrome-extension://${legacyId}/`));

    process.env.DEX_BUDDY_XHS_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
    const withDev = resolveAllowedOrigins({
      homedir: '/Users/peng.zhi',
      platform: 'darwin',
      extensionId: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    });
    assert.equal(withDev.length, 4);
    assert.ok(withDev.includes('chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/'));
    assert.ok(withDev.includes('chrome-extension://abcdefghijklmnopabcdefghijklmnop/'));
  } finally {
    if (prev === undefined) delete process.env.DEX_BUDDY_XHS_EXTENSION_ID;
    else process.env.DEX_BUDDY_XHS_EXTENSION_ID = prev;
  }
});

test('sameOriginSet 按集合比较', () => {
  assert.equal(sameOriginSet(['a', 'b'], ['b', 'a']), true);
  assert.equal(sameOriginSet(['a'], ['a', 'b']), false);
});

test('wrapper 路径与 host 脚本同目录', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-host-wrap-'));
  const script = path.join(root, 'dexbuddy-native-host.js');
  const wrap = wrapperPathFor(script);
  assert.equal(path.dirname(wrap), root);
  assert.match(wrap, /dexbuddy-native-host\.(sh|cmd)$/);
});

test('独立 Node：resolveHostRuntime 与 writeWrapper 使用绝对 node 路径', () => {
  const runtime = resolveHostRuntime({ execPath: process.execPath });
  assert.equal(runtime.kind, 'node');
  assert.equal(runtime.electronRunAsNode, false);
  assert.equal(isNodeBinary(runtime.execPath), true);
  assert.equal(path.isAbsolute(runtime.execPath), true);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-host-node-'));
  const script = path.join(root, 'dexbuddy-native-host.js');
  const wrap = path.join(root, process.platform === 'win32' ? 'dexbuddy-native-host.cmd' : 'dexbuddy-native-host.sh');
  fs.writeFileSync(script, '#!/usr/bin/env node\n');
  writeWrapper(script, wrap, runtime);
  const body = fs.readFileSync(wrap, 'utf8');
  assert.match(body, new RegExp(runtime.execPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(body, /exec node "/);
  assert.match(body, new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (process.platform !== 'win32') {
    assert.match(body, /sh-boot/);
  }
});

test('Cellar 路径优先落到 Homebrew symlink', () => {
  if (process.platform === 'win32') return;
  const cellar = '/opt/homebrew/Cellar/node/22.0.0/bin/node';
  const stable = preferStableNodePath(cellar);
  if (fs.existsSync('/opt/homebrew/bin/node')) {
    assert.equal(stable, '/opt/homebrew/bin/node');
  } else if (fs.existsSync('/usr/local/bin/node')) {
    assert.equal(stable, '/usr/local/bin/node');
  } else {
    assert.equal(stable, path.resolve(cellar));
  }

  const runtime = resolveHostRuntime({ execPath: cellar });
  if (fs.existsSync(cellar)) {
    assert.equal(runtime.kind, 'node');
    assert.equal(runtime.execPath, stable);
  }
});

test('Electron 形态：包装器带 ELECTRON_RUN_AS_NODE', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-host-electron-'));
  const fakeElectron = path.join(root, process.platform === 'win32' ? 'DexBuddy.exe' : 'DexBuddy');
  fs.writeFileSync(fakeElectron, '');
  const runtime = resolveHostRuntime({ execPath: fakeElectron });
  assert.equal(runtime.kind, 'electron');
  assert.equal(runtime.electronRunAsNode, true);

  const script = path.join(root, 'dexbuddy-native-host.js');
  const wrap = path.join(root, process.platform === 'win32' ? 'dexbuddy-native-host.cmd' : 'dexbuddy-native-host.sh');
  fs.writeFileSync(script, '#!/usr/bin/env node\n');
  writeWrapper(script, wrap, runtime);
  const body = fs.readFileSync(wrap, 'utf8');
  assert.match(body, /ELECTRON_RUN_AS_NODE/);
  assert.match(body, new RegExp(fakeElectron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(body, /exec node "/);
});

test('注册安装到 ASCII 目录；清单含双 origin', () => {
  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dexbuddy-nh-'));
  assert.equal(isAsciiPath(installDir), true);

  const prev = process.env.DEX_BUDDY_XHS_EXTENSION_ID;
  try {
    delete process.env.DEX_BUDDY_XHS_EXTENSION_ID;
    const result = registerNativeHost({ installDir });
    assert.equal(result.ok, true, result.message);
    assert.equal(isAsciiPath(result.wrapperPath), true);
    assert.ok(fs.existsSync(result.wrapperPath));
    assert.ok(fs.existsSync(path.join(installDir, 'dexbuddy-native-host.js')));
    assert.ok(fs.existsSync(path.join(installDir, 'bridge.js')));

    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    assert.equal(manifest.path, result.wrapperPath);
    assert.equal(isAsciiPath(manifest.path), true);
    assert.doesNotMatch(manifest.path, /小红书/);
    assert.ok(Array.isArray(manifest.allowed_origins));
    assert.ok(manifest.allowed_origins.length >= 2);
    assert.equal(sameOriginSet(manifest.allowed_origins, result.allowedOrigins), true);
  } finally {
    if (prev === undefined) delete process.env.DEX_BUDDY_XHS_EXTENSION_ID;
    else process.env.DEX_BUDDY_XHS_EXTENSION_ID = prev;
  }
});

test('Host 脚本默认路径在 src/xhs-note（进插件包）', () => {
  const script = defaultHostScriptPath();
  assert.match(script.replace(/\\/g, '/'), /src\/xhs-note\/dexbuddy-native-host\.js$/);
  assert.ok(fs.existsSync(script));
});

test('win32 中文用户名：安装目录改 ProgramData；darwin 不出现 C:', () => {
  const winDir = nativeHostInstallDir({
    platform: 'win32',
    homedir: 'C:\\Users\\张三',
    localAppData: 'C:\\Users\\张三\\AppData\\Local',
    programData: 'C:\\ProgramData',
    publicDir: 'C:\\Users\\Public',
  });
  assert.equal(winDir, path.win32.join('C:\\ProgramData', 'DexBuddy', 'native-host'));
  assert.equal(isAsciiPath(winDir), true);

  const candidates = windowsNativeHostInstallCandidates({
    platform: 'win32',
    homedir: 'C:\\Users\\张三',
    localAppData: 'C:\\Users\\张三\\AppData\\Local',
    programData: 'C:\\ProgramData',
    publicDir: 'C:\\Users\\Public',
  });
  assert.equal(candidates[0], path.win32.join('C:\\Users\\张三\\AppData\\Local', 'DexBuddy', 'native-host'));
  assert.equal(candidates[1], winDir);

  const asciiWin = nativeHostInstallDir({
    platform: 'win32',
    homedir: 'C:\\Users\\peng.zhi',
    localAppData: 'C:\\Users\\peng.zhi\\AppData\\Local',
  });
  assert.equal(
    asciiWin,
    path.win32.join('C:\\Users\\peng.zhi\\AppData\\Local', 'DexBuddy', 'native-host'),
  );

  const macDir = nativeHostInstallDir({
    platform: 'darwin',
    homedir: '/Users/张三',
  });
  assert.equal(
    macDir,
    '/Users/张三/Library/Application Support/DexBuddy/native-host',
  );
  assert.doesNotMatch(macDir, /C:/);
  assert.doesNotMatch(macDir, /ProgramData/);
  assert.doesNotMatch(macDir, /Users\\Public/);
});

test('win32 中文扩展目录仍能算出 origin 并进白名单', () => {
  const prev = process.env.DEX_BUDDY_XHS_EXTENSION_ID;
  try {
    delete process.env.DEX_BUDDY_XHS_EXTENSION_ID;
    const home = 'C:\\Users\\张三';
    const local = 'C:\\Users\\张三\\AppData\\Local';
    const origins = resolveAllowedOrigins({
      platform: 'win32',
      homedir: home,
      localAppData: local,
    });
    assert.equal(origins.length, 2);
    const currentId = chromeUnpackedExtensionId(
      path.win32.join(home, 'QuanMediaCrawl', 'extension'),
      'win32',
    );
    const legacyId = chromeUnpackedExtensionId(
      path.win32.join(local, 'QuanMediaCrawl', 'extension'),
      'win32',
    );
    assert.ok(origins.includes(`chrome-extension://${currentId}/`));
    assert.ok(origins.includes(`chrome-extension://${legacyId}/`));
  } finally {
    if (prev === undefined) delete process.env.DEX_BUDDY_XHS_EXTENSION_ID;
    else process.env.DEX_BUDDY_XHS_EXTENSION_ID = prev;
  }
});
