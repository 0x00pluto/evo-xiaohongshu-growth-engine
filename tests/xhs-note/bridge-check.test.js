'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const {
  isExtensionVersionAtLeast,
  MIN_EXTENSION_VERSION,
  parseSemverTriple,
} = require('../../src/xhs-note/bridge');
const { checkBridge, readExtensionVersion } = require('../../src/xhs-note/fetch');
const { createRunner } = require('../../src/one-post/run');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '../..');
const PROMPTS = path.join(ROOT, 'assets', 'prompts', 'one-post');

test('semver：≥ 0.9.0 判定', () => {
  assert.deepEqual(parseSemverTriple('v0.9.0'), [0, 9, 0]);
  assert.equal(isExtensionVersionAtLeast('0.8.9', MIN_EXTENSION_VERSION), false);
  assert.equal(isExtensionVersionAtLeast('0.9.0', MIN_EXTENSION_VERSION), true);
  assert.equal(isExtensionVersionAtLeast('0.9.1', MIN_EXTENSION_VERSION), true);
  assert.equal(isExtensionVersionAtLeast('1.0.0', MIN_EXTENSION_VERSION), true);
  assert.equal(isExtensionVersionAtLeast('', MIN_EXTENSION_VERSION), false);
});

test('readExtensionVersion 兼容多种回包字段', () => {
  assert.equal(readExtensionVersion({ ok: true, version: '0.9.0' }), '0.9.0');
  assert.equal(readExtensionVersion({ ok: true, extensionVersion: '1.2.3' }), '1.2.3');
  assert.equal(readExtensionVersion({ ok: true, info: { version: '0.9.1' } }), '0.9.1');
  assert.equal(readExtensionVersion({ ok: true }), '');
});

/**
 * @param {(req: Record<string, unknown>) => Record<string, unknown>} handler
 * @returns {Promise<{ port: number; close: () => Promise<void> }>}
 */
function listenFakeBridge(handler) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buf = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => {
        buf += chunk;
        while (true) {
          const nl = buf.indexOf('\n');
          if (nl < 0) break;
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          let req;
          try {
            req = JSON.parse(line);
          } catch {
            socket.write(`${JSON.stringify({ ok: false, error: { code: 'INTERNAL' } })}\n`);
            continue;
          }
          const res = handler(req && typeof req === 'object' ? req : {});
          socket.write(`${JSON.stringify(res)}\n`);
        }
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'));
        return;
      }
      resolve({
        port: addr.port,
        close: () => new Promise((done, fail) => {
          server.close((err) => (err ? fail(err) : done()));
        }),
      });
    });
  });
}

test('checkBridge：端口拒连 → BRIDGE_DOWN', async () => {
  const result = await checkBridge({ port: 1, timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BRIDGE_DOWN');
  assert.equal(result.minVersion, MIN_EXTENSION_VERSION);
});

test('checkBridge：version 0.8.0 → VERSION_LOW；0.9.0 / 1.0.0 → ok', async () => {
  const low = await listenFakeBridge(() => ({ ok: true, version: '0.8.0' }));
  try {
    const bad = await checkBridge({ port: low.port, timeoutMs: 2000 });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'VERSION_LOW');
    assert.equal(bad.version, '0.8.0');
  } finally {
    await low.close();
  }

  const ok09 = await listenFakeBridge(() => ({ ok: true, version: '0.9.0' }));
  try {
    const good = await checkBridge({ port: ok09.port, timeoutMs: 2000 });
    assert.equal(good.ok, true);
    if (good.ok) assert.equal(good.version, '0.9.0');
  } finally {
    await ok09.close();
  }

  const ok10 = await listenFakeBridge(() => ({ ok: true, info: { version: '1.0.0' } }));
  try {
    const good = await checkBridge({ port: ok10.port, timeoutMs: 2000 });
    assert.equal(good.ok, true);
    if (good.ok) assert.equal(good.version, '1.0.0');
  } finally {
    await ok10.close();
  }
});

test('checkXhsNoteBridge 经 runner 暴露；bridgeOk 门禁逻辑依赖 ok', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-bridge-'));
  const runner = createRunner({
    postsDir: path.join(root, 'posts'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: path.join(root, 'xhs-notes'),
    userXhsNotesCacheDir: path.join(root, 'cache', 'xhs-notes'),
    checkBridge: async () => ({
      ok: false,
      code: 'BRIDGE_DOWN',
      message: '连不上',
      minVersion: MIN_EXTENSION_VERSION,
    }),
  });
  const result = await runner.checkXhsNoteBridge();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BRIDGE_DOWN');

  const okRunner = createRunner({
    postsDir: path.join(root, 'posts2'),
    promptsDir: PROMPTS,
    userAlbumsDir: path.join(root, 'albums'),
    userArticleSamplesDir: path.join(root, 'article-samples'),
    userXhsNotesDir: path.join(root, 'xhs-notes'),
    userXhsNotesCacheDir: path.join(root, 'cache', 'xhs-notes'),
    checkBridge: async () => ({
      ok: true,
      version: '0.9.2',
      minVersion: MIN_EXTENSION_VERSION,
    }),
  });
  const ok = await okRunner.checkXhsNoteBridge();
  assert.equal(ok.ok, true);
  assert.equal(ok.version, '0.9.2');
});
