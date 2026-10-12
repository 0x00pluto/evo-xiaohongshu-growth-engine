'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { fillMissingFromDotEnv } = require('../src/one-post/env');
const { createRunner } = require('../src/one-post/run');

const ROOT = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(ROOT, 'src', 'studio', 'static');
const DEFAULT_PORT = 8768;
const MAX_BODY = 1_500_000;
const METHODS = new Set([
  'loadLatest',
  'openPost',
  'listPosts',
  'startNew',
  'saveEditor',
  'generateDraft',
  'generatePrompts',
  'generateImages',
  'retryImage',
  'previewImage',
  'revealImage',
]);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function localHostAllowed(host) {
  return LOCAL_HOSTS.has(host);
}

function parseArgs(argv) {
  const args = { host: '127.0.0.1', port: DEFAULT_PORT, open: false, help: false };
  const list = argv || [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (item === '--open') {
      args.open = true;
    } else if (item === '--help' || item === '-h') {
      args.help = true;
    } else if (item === '--host') {
      args.host = list[index + 1];
      index += 1;
    } else if (item === '--port') {
      args.port = Number(list[index + 1]);
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

function createStudio(options) {
  const root = options.root || ROOT;
  const base = options.env ? { ...options.env } : { ...process.env };
  const env = fillMissingFromDotEnv(base, path.join(root, '.env'));
  return createRunner({
    postsDir: path.join(root, 'output', 'one-post', 'posts'),
    promptsDir: path.join(root, 'assets', 'prompts', 'one-post'),
    env,
    revealFile: options.revealFile || revealInFolder,
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求太大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const raw = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': raw.length,
    'Cache-Control': 'no-store',
  });
  res.end(raw);
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function resolveStatic(staticDir, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  try {
    rel = decodeURIComponent(rel);
  } catch (err) {
    return '';
  }
  if (!rel || rel.includes('\0')) return '';
  const root = path.resolve(staticDir);
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) return '';
  return full;
}

function createHandler(runner, staticDir) {
  return async function handle(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        const filePath = resolveStatic(staticDir, url.pathname);
        if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          sendJson(res, 404, { ok: false, message: '没有这个地址' });
          return;
        }
        const body = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType(filePath),
          'Content-Length': body.length,
          'Cache-Control': 'no-store',
        });
        res.end(body);
        return;
      }
      const matched = url.pathname.match(/^\/api\/one-post\/([A-Za-z_][A-Za-z0-9_]*)$/);
      if (req.method === 'POST' && matched && METHODS.has(matched[1]) && typeof runner[matched[1]] === 'function') {
        const text = await readBody(req);
        const payload = text.trim() ? JSON.parse(text) : {};
        sendJson(res, 200, runner[matched[1]](payload));
        return;
      }
      sendJson(res, 404, { ok: false, message: '没有这个地址' });
    } catch (err) {
      sendJson(res, 400, { ok: false, message: err && err.message ? err.message : '没有完成' });
    }
  };
}

function startServer(options) {
  const host = options.host || '127.0.0.1';
  if (!localHostAllowed(host)) {
    const error = new Error('拒绝非本机绑定：请使用 127.0.0.1');
    error.code = 'HOST_DENIED';
    throw error;
  }
  const runner = options.runner || createStudio(options);
  const server = http.createServer(createHandler(runner, options.staticDir || STATIC_DIR));
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once('error', onError);
    server.listen(options.port == null ? DEFAULT_PORT : options.port, host, () => {
      server.removeListener('error', onError);
      const address = server.address();
      const printedHost = host === '::1' ? '[::1]' : host;
      resolve({
        server,
        port: address.port,
        url: `http://${printedHost}:${address.port}/`,
        close() {
          return new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          });
        },
      });
    });
  });
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : [command, [url]];
  spawn(args[0], args[1], { stdio: 'ignore', detached: true }).unref();
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write('用法: node scripts/run-studio.js [--host 127.0.0.1] [--port 8768] [--open]\n');
    return 0;
  }
  if (!localHostAllowed(args.host)) {
    process.stderr.write('拒绝非本机绑定：请使用 127.0.0.1\n');
    return 2;
  }
  const started = await startServer({ host: args.host, port: args.port });
  process.stdout.write(`一篇图文 → ${started.url}\n`);
  process.stdout.write('Ctrl+C 停止。\n');
  if (args.open) openBrowser(started.url);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    if (code) process.exit(code);
  }).catch((err) => {
    process.stderr.write(`${err && err.message ? err.message : err}\n`);
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
