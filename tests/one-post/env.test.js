'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fillMissingFromDotEnv } = require('../../src/one-post/env');

test('仓库 .env 只补空位', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'one-post-env-')), '.env');
  fs.writeFileSync(file, [
    'DEEPSEEK_API_KEY=from-file',
    'REPLICATE_API_TOKEN=from-file-too',
    'DEEPSEEK_MODEL=from-file-model',
  ].join('\n'));
  const env = fillMissingFromDotEnv({
    DEEPSEEK_API_KEY: 'from-host',
    REPLICATE_API_TOKEN: '',
  }, file);
  assert.equal(env.DEEPSEEK_API_KEY, 'from-host');
  assert.equal(env.REPLICATE_API_TOKEN, 'from-file-too');
  assert.equal(env.DEEPSEEK_MODEL, 'from-file-model');
});
