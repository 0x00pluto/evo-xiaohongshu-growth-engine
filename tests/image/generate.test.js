'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IMAGE_ASPECT_RATIO, IMAGE_MODELS, generatePng } = require('../../src/image/generate');

/**
 * @param {{ enough?: boolean }} [opts]
 */
function fakeModels(opts) {
  const enough = !opts || opts.enough !== false;
  /** @type {Array<{ op: string; input?: unknown; body?: unknown; options?: unknown }>} */
  const calls = [];
  return {
    calls,
    billing: {
      quote: async (body) => {
        calls.push({ op: 'quote', body });
        const model = body && typeof body === 'object' && /** @type {{ model?: unknown }} */ (body).model;
        return {
          kind: 'image',
          estimate: '0.2000',
          enough,
          balance: enough ? '10.0000' : '0.0000',
          model: typeof model === 'string' ? model : IMAGE_MODELS.standard,
        };
      },
    },
    images: {
      generate: async (input, options) => {
        calls.push({ op: 'image', input, options });
        const outputPath = input && input.outputPath;
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, Buffer.from([137, 80, 78, 71]));
        return { status: 'succeeded', output: outputPath, model: input.model };
      },
    },
  };
}

test('没有 Dex Buddy 钥匙时不发请求', async () => {
  let called = false;
  await assert.rejects(() => generatePng({
    prompt: '一张桌子',
    outputPath: path.join(os.tmpdir(), 'missing.png'),
    env: {},
    fetch: () => {
      called = true;
      throw new Error('不应请求');
    },
  }), /DEX_BUDDY_API_KEY/);
  assert.equal(called, false);
});

test('生图只传 3:4 和标准档，并在完成后落成 PNG', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-image-'));
  const outputPath = path.join(dir, 'cover.png');
  const models = fakeModels();
  await generatePng({
    prompt: '一张桌子',
    outputPath,
    models,
  });
  const image = models.calls.find((item) => item.op === 'image');
  assert.ok(image);
  const input = /** @type {{ model: string; input: Record<string, unknown>; outputPath: string }} */ (image.input);
  assert.equal(input.model, IMAGE_MODELS.standard);
  assert.equal(input.input.prompt, '一张桌子');
  assert.equal(input.input.aspect_ratio, IMAGE_ASPECT_RATIO);
  assert.equal(input.input.quality, undefined);
  assert.equal(input.input.output_format, undefined);
  assert.equal(input.input.number_of_images, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(input.input, 'input_images'), false);
  assert.equal(fs.readFileSync(outputPath).length, 4);
});

test('专业档用 image-pro', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-image-pro-'));
  const outputPath = path.join(dir, 'cover.png');
  const models = fakeModels();
  await generatePng({
    prompt: '一张桌子',
    outputPath,
    models,
    model: IMAGE_MODELS.pro,
  });
  const image = models.calls.find((item) => item.op === 'image');
  assert.equal(/** @type {{ model: string }} */ (image.input).model, IMAGE_MODELS.pro);
});

test('参考图用本机路径放进 input_images', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-image-ref-'));
  const samplePath = path.join(dir, 'template.jpg');
  fs.writeFileSync(samplePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const outputPath = path.join(dir, 'cover.png');
  const models = fakeModels();
  await generatePng({
    prompt: '照模板换文案',
    outputPath,
    references: [{ role: 'template', path: samplePath }],
    models,
    idempotencyKey: 'post-1:cover',
  });
  const image = models.calls.find((item) => item.op === 'image');
  const input = /** @type {{ input: { input_images: string[] } }} */ (image.input);
  assert.deepEqual(input.input.input_images, [samplePath]);
  assert.deepEqual(image.options, { idempotencyKey: 'post-1:cover' });
});

test('报价不够时不调用 generate', async () => {
  const models = fakeModels({ enough: false });
  await assert.rejects(() => generatePng({
    prompt: '一张桌子',
    outputPath: path.join(os.tmpdir(), 'skip.png'),
    models,
  }), /INSUFFICIENT_CREDITS/);
  assert.equal(models.calls.some((item) => item.op === 'image'), false);
});
