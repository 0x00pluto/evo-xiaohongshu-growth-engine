'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RECOMMENDED_GOALS_BY_PERSONA,
  isRecommendedCombo,
} = require('../../src/prompts/fill');

test('推荐矩阵仅覆盖 taxonomy ✅ 组合', () => {
  assert.deepEqual([...RECOMMENDED_GOALS_BY_PERSONA['素人']], ['种草', '搜索']);
  assert.deepEqual([...RECOMMENDED_GOALS_BY_PERSONA['KOC']], ['种草', '涨粉', '搜索']);
  assert.deepEqual([...RECOMMENDED_GOALS_BY_PERSONA['达人']], ['种草', '涨粉', '曝光', '搜索']);
  assert.deepEqual([...RECOMMENDED_GOALS_BY_PERSONA['官号']], ['引流', '曝光', '搜索', '转化']);
  assert.deepEqual([...RECOMMENDED_GOALS_BY_PERSONA['创始人']], ['种草', '引流', '涨粉', '曝光', '转化']);
  assert.deepEqual([...RECOMMENDED_GOALS_BY_PERSONA['店主']], ['引流', '搜索', '转化']);
  assert.deepEqual([...RECOMMENDED_GOALS_BY_PERSONA['员工']], ['种草', '引流', '搜索', '转化']);
});

test('isRecommendedCombo 区分 ✅ 与非推荐', () => {
  assert.equal(isRecommendedCombo('素人', '种草'), true);
  assert.equal(isRecommendedCombo('素人', '搜索'), true);
  assert.equal(isRecommendedCombo('素人', '引流'), false);
  assert.equal(isRecommendedCombo('官号', '转化'), true);
  assert.equal(isRecommendedCombo('官号', '种草'), false);
  assert.equal(isRecommendedCombo('创始人', '涨粉'), true);
  assert.equal(isRecommendedCombo('店主', '种草'), false);
  assert.equal(isRecommendedCombo('员工', '搜索'), true);
  assert.equal(isRecommendedCombo('', '种草'), false);
  assert.equal(isRecommendedCombo('素人', null), false);
});
