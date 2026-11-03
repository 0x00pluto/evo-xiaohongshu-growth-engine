'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  applyFrameSentence,
  aspectRatioFromImage,
  cssAspectRatio,
  framePhrase,
  nearestAspectRatio,
  normalizeAspectRatio,
  readImageSize,
} = require('../../src/image/aspect');

/**
 * @param {number} width
 * @param {number} height
 * @returns {Buffer}
 */
function tinyPng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const ihdr = pngChunk('IHDR', ihdrData);
  const raw = Buffer.alloc((width * 3 + 1) * height, 0);
  const idat = pngChunk('IDAT', zlib.deflateSync(raw));
  const iend = pngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

test('七档从高到宽排列', () => {
  assert.deepEqual([...ASPECT_RATIOS], [
    '9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9',
  ]);
});

test('最近档：极值夹到两端，平局取更靠前', () => {
  assert.equal(nearestAspectRatio(9, 1000), '9:16');
  assert.equal(nearestAspectRatio(1000, 9), '16:9');
  assert.equal(nearestAspectRatio(3, 4), '3:4');
  assert.equal(nearestAspectRatio(1, 1), '1:1');
  assert.equal(nearestAspectRatio(16, 9), '16:9');
  // 正好落在两档中点时取列表更靠前（更「高」）的一档
  const mid = (3 / 4 + 1) / 2;
  assert.equal(nearestAspectRatio(mid, 1), '3:4');
  assert.equal(nearestAspectRatio(0, 0), DEFAULT_ASPECT_RATIO);
  assert.equal(nearestAspectRatio(-1, 4), DEFAULT_ASPECT_RATIO);
});

test('normalizeAspectRatio 只认七档', () => {
  assert.equal(normalizeAspectRatio(' 3:4 '), '3:4');
  assert.equal(normalizeAspectRatio('7:5'), '');
  assert.equal(normalizeAspectRatio(null), '');
});

test('读 PNG 像素并归档', () => {
  const bytes = tinyPng(16, 9);
  const size = readImageSize(bytes);
  assert.ok(size);
  assert.equal(size.width, 16);
  assert.equal(size.height, 9);
  assert.equal(aspectRatioFromImage(bytes), '16:9');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aspect-png-'));
  const file = path.join(dir, 'sample.png');
  fs.writeFileSync(file, bytes);
  assert.equal(aspectRatioFromImage(file), '16:9');
  assert.equal(aspectRatioFromImage(path.join(dir, 'missing.png')), DEFAULT_ASPECT_RATIO);
});

test('画幅句覆盖与 CSS', () => {
  assert.equal(framePhrase('3:4'), '竖版 3:4');
  assert.equal(framePhrase('1:1'), '方图 1:1');
  assert.equal(framePhrase('16:9'), '横版 16:9');
  assert.equal(
    applyFrameSentence('竖版 3:4，杂志风。\n1. 背景', '16:9'),
    '横版 16:9，杂志风。\n1. 背景',
  );
  assert.match(applyFrameSentence('没有画幅开头', '1:1'), /^方图 1:1，/);
  assert.equal(cssAspectRatio('9:16'), '9 / 16');
});
