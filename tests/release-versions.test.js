'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const SEMVER = /^\d+\.\d+\.\d+$/;

test('工牌与插件清单 version 同号', () => {
  const packPath = path.join(root, 'evo_agent_pack.json');
  const manifestPath = path.join(root, 'plugin.manifest.json');
  assert.equal(fs.existsSync(packPath), true);
  assert.equal(fs.existsSync(manifestPath), true);

  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const packVersion = typeof pack.version === 'string' ? pack.version.trim() : '';
  const manifestVersion = typeof manifest.version === 'string' ? manifest.version.trim() : '';

  assert.match(packVersion, SEMVER);
  assert.match(manifestVersion, SEMVER);
  assert.equal(manifestVersion, packVersion);
});
