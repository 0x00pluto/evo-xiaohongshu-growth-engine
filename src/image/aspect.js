// @ts-check
'use strict';

const fs = require('node:fs');

/** 从高到宽；平局取更靠前的一档。 */
/** @type {ReadonlyArray<string>} */
const ASPECT_RATIOS = Object.freeze([
  '9:16',
  '2:3',
  '3:4',
  '1:1',
  '4:3',
  '3:2',
  '16:9',
]);

/** @type {ReadonlySet<string>} */
const ASPECT_RATIO_SET = new Set(ASPECT_RATIOS);

const DEFAULT_ASPECT_RATIO = '3:4';

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isAspectRatio(value) {
  return typeof value === 'string' && ASPECT_RATIO_SET.has(value.trim());
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeAspectRatio(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return ASPECT_RATIO_SET.has(text) ? text : '';
}

/**
 * @param {string} ratio
 * @returns {number}
 */
function ratioValue(ratio) {
  const parts = String(ratio || '').split(':');
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!(w > 0) || !(h > 0)) return NaN;
  return w / h;
}

/**
 * 宽高 → 七档最近档；距离相同取从高到宽列表中先出现的。
 * @param {unknown} width
 * @param {unknown} height
 * @returns {string}
 */
function nearestAspectRatio(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return DEFAULT_ASPECT_RATIO;
  }
  const target = w / h;
  let best = DEFAULT_ASPECT_RATIO;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const ratio of ASPECT_RATIOS) {
    const value = ratioValue(ratio);
    if (!Number.isFinite(value)) continue;
    const dist = Math.abs(target - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = ratio;
    }
  }
  return best;
}

/**
 * @param {Buffer} bytes
 * @returns {{ width: number; height: number } | null}
 */
function readPngSize(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24) return null;
  // 不用 ascii 字符串比签名：0x89 在 ascii 解码里会被截成 0x09。
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i += 1) {
    if (bytes[i] !== sig[i]) return null;
  }
  if (
    bytes[12] !== 0x49
    || bytes[13] !== 0x48
    || bytes[14] !== 0x44
    || bytes[15] !== 0x52
  ) {
    return null;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

/**
 * @param {Buffer} bytes
 * @returns {{ width: number; height: number } | null}
 */
function readJpegSize(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) break;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    // SOF0 / SOF1 / SOF2
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      if (!width || !height) return null;
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * @param {Buffer} bytes
 * @returns {{ width: number; height: number } | null}
 */
function readWebpSize(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 30) return null;
  if (bytes.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourcc = bytes.toString('ascii', 12, 16);
  if (fourcc === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes.readUIntLE(24, 3);
    const height = 1 + bytes.readUIntLE(27, 3);
    if (!width || !height) return null;
    return { width, height };
  }
  if (fourcc === 'VP8 ' && bytes.length >= 30) {
    // lossy bitstream starts after chunk header; frame tag + start code
    const start = 20;
    if (bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) {
      return null;
    }
    const width = bytes.readUInt16LE(start + 6) & 0x3fff;
    const height = bytes.readUInt16LE(start + 8) & 0x3fff;
    if (!width || !height) return null;
    return { width, height };
  }
  if (fourcc === 'VP8L' && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    if (b0 !== 0x2f) return null;
    const width = 1 + (((b1 | (b2 << 8)) & 0x3fff));
    const height = 1 + ((((b2 >> 6) | (b3 << 2)) & 0x3fff));
    if (!width || !height) return null;
    return { width, height };
  }
  return null;
}

/**
 * @param {unknown} bytes
 * @returns {{ width: number; height: number } | null}
 */
function readImageSize(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
  return readPngSize(bytes) || readJpegSize(bytes) || readWebpSize(bytes);
}

/**
 * @param {unknown} filePath
 * @returns {{ width: number; height: number } | null}
 */
function readImageSizeFromFile(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null;
  try {
    if (!fs.existsSync(filePath)) return null;
    return readImageSize(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

/**
 * @param {unknown} width
 * @param {unknown} height
 * @returns {string}
 */
function aspectRatioFromPixels(width, height) {
  return nearestAspectRatio(width, height);
}

/**
 * @param {unknown} bytesOrPath
 * @returns {string}
 */
function aspectRatioFromImage(bytesOrPath) {
  if (Buffer.isBuffer(bytesOrPath)) {
    const size = readImageSize(bytesOrPath);
    if (!size) return DEFAULT_ASPECT_RATIO;
    return nearestAspectRatio(size.width, size.height);
  }
  if (typeof bytesOrPath === 'string' && bytesOrPath.trim()) {
    const size = readImageSizeFromFile(bytesOrPath);
    if (!size) return DEFAULT_ASPECT_RATIO;
    return nearestAspectRatio(size.width, size.height);
  }
  return DEFAULT_ASPECT_RATIO;
}

/**
 * 题词开头画幅短语（不含逗号后的风格总述）。
 * @param {unknown} ratio
 * @returns {string}
 */
function framePhrase(ratio) {
  const safe = normalizeAspectRatio(ratio) || DEFAULT_ASPECT_RATIO;
  if (safe === '1:1') return `方图 ${safe}`;
  const value = ratioValue(safe);
  if (Number.isFinite(value) && value > 1) return `横版 ${safe}`;
  return `竖版 ${safe}`;
}

/**
 * 开头一句：「竖版 3:4，…」→ 按有效比例重写画幅短语。
 * @param {unknown} prompt
 * @param {unknown} ratio
 * @returns {string}
 */
function applyFrameSentence(prompt, ratio) {
  const text = typeof prompt === 'string' ? prompt : '';
  if (!text.trim()) return text;
  const phrase = framePhrase(ratio);
  const replaced = text.replace(
    /^(?:竖版|横版|方图)\s*\d+\s*:\s*\d+/u,
    phrase,
  );
  if (replaced !== text) return replaced;
  // 没有标准画幅开头时，在全文前插入一句画幅。
  return `${phrase}，${text.replace(/^\uFEFF/, '').trimStart()}`;
}

/**
 * CSS aspect-ratio 用的数字串，如 "3 / 4"。
 * @param {unknown} ratio
 * @returns {string}
 */
function cssAspectRatio(ratio) {
  const safe = normalizeAspectRatio(ratio) || DEFAULT_ASPECT_RATIO;
  const parts = safe.split(':');
  return `${parts[0]} / ${parts[1]}`;
}

module.exports = {
  ASPECT_RATIOS,
  ASPECT_RATIO_SET,
  DEFAULT_ASPECT_RATIO,
  applyFrameSentence,
  aspectRatioFromImage,
  aspectRatioFromPixels,
  cssAspectRatio,
  framePhrase,
  isAspectRatio,
  nearestAspectRatio,
  normalizeAspectRatio,
  readImageSize,
  readImageSizeFromFile,
  ratioValue,
};
