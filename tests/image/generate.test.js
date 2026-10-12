'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IMAGE_INPUT, MODEL_URL, generatePng } = require('../../src/image/generate');

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
      calls.push({ url, options });
      if (url === MODEL_URL) {
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
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.input.prompt, '一张桌子');
  assert.equal(body.input.aspect_ratio, '3:4');
  assert.equal(body.input.quality, 'medium');
  assert.equal(body.input.output_format, 'png');
  assert.equal(body.input.number_of_images, 1);
  assert.deepEqual({
    aspect_ratio: body.input.aspect_ratio,
    quality: body.input.quality,
    output_format: body.input.output_format,
    number_of_images: body.input.number_of_images,
  }, IMAGE_INPUT);
  assert.equal(fs.readFileSync(outputPath).length, 4);
});
