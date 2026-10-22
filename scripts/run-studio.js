// @ts-check
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

/** @type {typeof import('../src/one-post/env')} */
const envModule = require('../src/one-post/env');
/** @type {typeof import('../src/one-post/run')} */
const runModule = require('../src/one-post/run');
const { fillMissingFromDotEnv } = envModule;
const { createRunner } = runModule;

const ROOT = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(ROOT, 'src', 'studio', 'static');
const DEFAULT_PORT = 8768;
// 单张素材 ≤8MB，data URL base64 约 4/3，再留一点 JSON 余量
const MAX_BODY = 12_000_000;
const RELOAD_DEBOUNCE_MS = 100;
const RELOAD_SNIPPET = '<script>(function(){var s=new EventSource("/api/dev/reload");s.onmessage=function(){location.reload();};})();</script>';
const METHODS = new Set([
  'loadLatest',
  'openPost',
  'listPosts',
  'listAlbums',
  'listLibraryUploadRefs',
  'addLibraryUploadRef',
  'listLibraryArticleSamples',
  'getLibraryArticleSample',
  'saveLibraryArticleSample',
  'deleteLibraryArticleSample',
  'getAlbumDetail',
  'learnAlbum',
  'commitAlbum',
  'updateAlbumPrompt',
  'discardAlbum',
  'deleteAlbum',
  'startNew',
  'saveEditor',
  'generateDraft',
  'generatePrompts',
  'chooseImage',
  'generateImages',
  'retryImage',
  'previewImage',
  'previewAlbumSample',
  'revealImage',
  'addUploadRef',
  'updateUploadRefUsage',
  'deleteUploadRef',
  'setSlotPick',
  'previewUploadRef',
  'previewLibraryUploadRef',
  'draftUploadRefUsage',
  'saveUploadRefToLibrary',
  'pickLibraryUploadRef',
  'deleteLibraryUploadRef',
]);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * @typedef {{ host: string; port: number; open: boolean; help: boolean }} CliArgs
 * @typedef {{
 *   root?: string;
 *   env?: Record<string, string | undefined>;
 *   revealFile?: (absPath: string) => void;
 *   host?: string;
 *   port?: number;
 *   reload?: boolean;
 *   runner?: ReturnType<typeof createRunner>;
 *   staticDir?: string;
 * }} StudioOptions
 * @typedef {{
 *   add: (res: import('node:http').ServerResponse) => void;
 *   remove: (res: import('node:http').ServerResponse) => void;
 *   schedule: () => void;
 *   close: () => void;
 * }} ReloadHub
 */

/**
 * @param {unknown} err
 * @param {string} fallback
 * @returns {string}
 */
function errorMessage(err, fallback) {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = /** @type {{ message?: unknown }} */ (err).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} source
 * @returns {Record<string, string>}
 */
function envStrings(source) {
  /** @type {Record<string, string>} */
  const next = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') next[key] = value;
  }
  return next;
}

/**
 * @param {string} host
 * @returns {boolean}
 */
function localHostAllowed(host) {
  return LOCAL_HOSTS.has(host);
}

/**
 * @param {string[]} [argv]
 * @returns {CliArgs}
 */
function parseArgs(argv) {
  /** @type {CliArgs} */
  const args = { host: '127.0.0.1', port: DEFAULT_PORT, open: false, help: false };
  const list = argv || [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (item === '--open') {
      args.open = true;
    } else if (item === '--help' || item === '-h') {
      args.help = true;
    } else if (item === '--host') {
      const value = list[index + 1];
      if (typeof value !== 'string') throw new Error('未知参数 --host');
      args.host = value;
      index += 1;
    } else if (item === '--port') {
      const value = list[index + 1];
      if (typeof value !== 'string') throw new Error('未知参数 --port');
      args.port = Number(value);
      index += 1;
    } else {
      throw new Error(`未知参数 ${item}`);
    }
  }
  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) {
    throw new Error('端口无效');
  }
  return args;
}

/**
 * @param {string} absPath
 */
function revealInFolder(absPath) {
  if (process.platform === 'darwin') {
    spawn('open', ['-R', absPath], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  if (process.platform === 'win32') {
    spawn('explorer', [`/select,${absPath}`], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  spawn('xdg-open', [path.dirname(absPath)], { stdio: 'ignore', detached: true }).unref();
}

/**
 * @param {StudioOptions} options
 * @returns {ReturnType<typeof createRunner>}
 */
function createStudio(options) {
  const root = options.root || ROOT;
  const base = options.env ? envStrings(options.env) : envStrings(process.env);
  const env = fillMissingFromDotEnv(base, path.join(root, '.env'));
  return createRunner({
    postsDir: path.join(root, 'output', 'one-post', 'posts'),
    promptsDir: path.join(root, 'assets', 'prompts', 'one-post'),
    userAlbumsDir: path.join(root, 'runtime', 'albums'),
    userImageRefsDir: path.join(root, 'runtime', 'image-refs'),
    userUploadRefsDir: path.join(root, 'runtime', 'materials', 'upload-refs'),
    userArticleSamplesDir: path.join(root, 'runtime', 'materials', 'article-samples'),
    env,
    revealFile: options.revealFile || revealInFolder,
  });
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > MAX_BODY) {
        reject(new Error('请求太大'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  const raw = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': raw.length,
    'Cache-Control': 'no-store',
  });
  res.end(raw);
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function entryDocument(pathname) {
  return pathname === '/' || pathname === '/index.html';
}

/**
 * @param {Buffer} body
 * @returns {Buffer}
 */
function injectReload(body) {
  const text = body.toString('utf8');
  const at = text.lastIndexOf('</body>');
  const next = at === -1 ? `${text}${RELOAD_SNIPPET}` : `${text.slice(0, at)}${RELOAD_SNIPPET}${text.slice(at)}`;
  return Buffer.from(next);
}

/**
 * @returns {ReloadHub}
 */
function createReloadHub() {
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  return {
    /**
     * @param {import('node:http').ServerResponse} res
     */
    add(res) {
      clients.add(res);
    },
    /**
     * @param {import('node:http').ServerResponse} res
     */
    remove(res) {
      clients.delete(res);
    },
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const payload = Buffer.from('data: reload\n\n');
        for (const res of clients) res.write(payload);
      }, RELOAD_DEBOUNCE_MS);
    },
    close() {
      if (timer) clearTimeout(timer);
      timer = null;
      for (const res of clients) res.end();
      clients.clear();
    },
  };
}

/**
 * @param {string} staticDir
 * @param {() => void} onChange
 * @returns {fs.FSWatcher}
 */
function watchStatic(staticDir, onChange) {
  return fs.watch(staticDir, { recursive: true }, () => onChange());
}

/**
 * @param {string} staticDir
 * @param {string} pathname
 * @returns {string}
 */
function resolveStatic(staticDir, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return '';
  }
  if (!rel || rel.includes('\0')) return '';
  const root = path.resolve(staticDir);
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) return '';
  return full;
}

/**
 * @param {ReturnType<typeof createRunner>} runner
 * @param {string} staticDir
 * @param {ReloadHub | null} reloadHub
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
function createHandler(runner, staticDir, reloadHub) {
  return async function handle(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/api/dev/reload') {
        if (!reloadHub) {
          sendJson(res, 404, { ok: false, message: '没有这个地址' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        res.write(': ok\n\n');
        reloadHub.add(res);
        req.on('close', () => reloadHub.remove(res));
        return;
      }
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        const filePath = resolveStatic(staticDir, url.pathname);
        if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          sendJson(res, 404, { ok: false, message: '没有这个地址' });
          return;
        }
        /** @type {Buffer} */
        let body = fs.readFileSync(filePath);
        // pages/*.html 会被 innerHTML 塞进页面，脚本插进去不会执行，也污染片段。
        if (reloadHub && entryDocument(url.pathname)) body = injectReload(body);
        res.writeHead(200, {
          'Content-Type': contentType(filePath),
          'Content-Length': body.length,
          'Cache-Control': 'no-store',
        });
        res.end(body);
        return;
      }
      const matched = url.pathname.match(/^\/api\/one-post\/([A-Za-z_][A-Za-z0-9_]*)$/);
      const methodName = matched ? matched[1] : '';
      if (req.method === 'POST' && methodName && METHODS.has(methodName)) {
        const method = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (runner))[methodName];
        if (typeof method === 'function') {
          const text = await readBody(req);
          const payload = text.trim() ? JSON.parse(text) : {};
          const result = method.call(runner, payload);
          sendJson(res, 200, result && typeof result.then === 'function' ? await result : result);
          return;
        }
      }
      sendJson(res, 404, { ok: false, message: '没有这个地址' });
    } catch (err) {
      sendJson(res, 400, { ok: false, message: errorMessage(err, '没有完成') });
    }
  };
}

/**
 * @param {StudioOptions} options
 * @returns {Promise<{
 *   server: import('node:http').Server;
 *   port: number;
 *   url: string;
 *   close: () => Promise<void>;
 * }>}
 */
function startServer(options) {
  const host = options.host || '127.0.0.1';
  if (!localHostAllowed(host)) {
    const error = /** @type {Error & { code?: string }} */ (new Error('拒绝非本机绑定：请使用 127.0.0.1'));
    error.code = 'HOST_DENIED';
    throw error;
  }
  const runner = options.runner || createStudio(options);
  const staticDir = options.staticDir || STATIC_DIR;
  const reloadHub = options.reload ? createReloadHub() : null;
  const watcher = reloadHub ? watchStatic(staticDir, () => reloadHub.schedule()) : null;
  const server = http.createServer(createHandler(runner, staticDir, reloadHub));
  return new Promise((resolve, reject) => {
    /**
     * @param {Error} err
     */
    const onError = (err) => {
      if (watcher) watcher.close();
      if (reloadHub) reloadHub.close();
      reject(err);
    };
    server.once('error', onError);
    server.listen(options.port == null ? DEFAULT_PORT : options.port, host, () => {
      server.removeListener('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('端口无效'));
        return;
      }
      const printedHost = host === '::1' ? '[::1]' : host;
      resolve({
        server,
        port: address.port,
        url: `http://${printedHost}:${address.port}/`,
        close() {
          if (watcher) watcher.close();
          if (reloadHub) reloadHub.close();
          return new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          });
        },
      });
    });
  });
}

/**
 * @param {string} url
 */
function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [url], { stdio: 'ignore', detached: true }).unref();
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write('用法: node scripts/run-studio.js [--host 127.0.0.1] [--port 8768] [--open]\n');
    process.stdout.write('改 src/studio/static 后，浏览器会自动刷新。改 src/one-post 或本脚本需要重启。\n');
    return 0;
  }
  if (!localHostAllowed(args.host)) {
    process.stderr.write('拒绝非本机绑定：请使用 127.0.0.1\n');
    return 2;
  }
  const started = await startServer({ host: args.host, port: args.port, reload: true });
  process.stdout.write(`一篇图文 → ${started.url}\n`);
  process.stdout.write('改页面会自动刷新。Ctrl+C 停止。\n');
  if (args.open) openBrowser(started.url);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    if (code) process.exit(code);
  }).catch((err) => {
    process.stderr.write(`${errorMessage(err, String(err))}\n`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_PORT,
  createHandler,
  createStudio,
  localHostAllowed,
  main,
  parseArgs,
  startServer,
};
