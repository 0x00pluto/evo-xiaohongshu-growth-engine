'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FILES_URL } = require('../../src/image/files');
const { IMAGE_INPUT, MODEL_URL, MODEL_URLS, generatePng } = require('../../src/image/generate');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

test('没有 Replicate 密钥时不发请求', async () => {
  let called = false;
  await assert.rejects(() => generatePng({
    prompt: '一张桌子',
    outputPath: path.join(os.tmpdir(), 'missing.png'),
    env: {},
    fetch: () => {
      called = true;
      throw new Error('不应请求');
    },
  }), /缺少 REPLICATE_API_TOKEN/);
  assert.equal(called, false);
});

test('生图只传 3:4 和 medium，并在完成后落成 PNG', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-image-'));
  const outputPath = path.join(dir, 'cover.png');
  const calls = [];
  await generatePng({
    prompt: '一张桌子',
    outputPath,
    env: { REPLICATE_API_TOKEN: 'token' },
    sleep: async () => {},
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url) === MODEL_URL) {
        return jsonResponse({
          status: 'processing',
          urls: { get: 'https://api.replicate.com/v1/predictions/p1' },
        });
      }
      if (String(url).endsWith('/predictions/p1')) {
        return jsonResponse({ status: 'succeeded', output: ['https://cdn.example/cover.png'] });
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
      };
    },
  });

  assert.match(MODEL_URL, /\/models\/openai\/gpt-image-2\.5-flare\/predictions$/);
  assert.equal(MODEL_URLS.flare, MODEL_URL);
  assert.match(MODEL_URLS.sunburst, /\/models\/openai\/gpt-image-2\.5-sunburst\/predictions$/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.input.prompt, '一张桌子');
  assert.equal(body.input.aspect_ratio, '3:4');
  assert.equal(body.input.quality, 'medium');
  assert.equal(body.input.output_format, 'png');
  assert.equal(body.input.number_of_images, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(body.input, 'input_images'), false);
  assert.deepEqual({
    aspect_ratio: body.input.aspect_ratio,
    quality: body.input.quality,
    output_format: body.input.output_format,
    number_of_images: body.input.number_of_images,
  }, IMAGE_INPUT);
  assert.equal(fs.readFileSync(outputPath).length, 4);
});

test('有参考图时先 Files 上传再把 URL 填进 input_images', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-image-ref-'));
  const samplePath = path.join(dir, 'template.jpg');
  fs.writeFileSync(samplePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const outputPath = path.join(dir, 'cover.png');
  const fileUrl = `${FILES_URL}/file-abc`;
  const calls = [];
  await generatePng({
    prompt: '照模板换文案',
    outputPath,
    references: [{ role: 'template', path: samplePath }],
    env: { REPLICATE_API_TOKEN: 'token' },
    sleep: async () => {},
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url) === FILES_URL) {
        assert.equal(options.method, 'POST');
        assert.ok(options.body instanceof FormData);
        assert.equal(options.headers.Authorization, 'Bearer token');
        assert.equal(options.headers['Content-Type'], undefined);
        return jsonResponse({
          id: 'file-abc',
          urls: { get: fileUrl },
        });
      }
      if (String(url) === MODEL_URL) {
        return jsonResponse({
          status: 'succeeded',
          output: ['https://cdn.example/cover.png'],
        });
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
      };
    },
  });

  assert.equal(calls[0].url, FILES_URL);
  const predBody = JSON.parse(calls[1].options.body);
  assert.deepEqual(predBody.input.input_images, [fileUrl]);
  assert.doesNotMatch(predBody.input.input_images[0], /^data:/);
  assert.equal(fs.readFileSync(outputPath).length, 4);
});
