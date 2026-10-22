// @ts-check
'use strict';

/**
 * 人设 × 目的推荐组合（仅 taxonomy ✅）。
 * 页面 note.js 内嵌同一矩阵副本（静态页无打包 import）。
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
const RECOMMENDED_GOALS_BY_PERSONA = Object.freeze({
  素人: Object.freeze(['种草', '搜索']),
  KOC: Object.freeze(['种草', '涨粉', '搜索']),
  达人: Object.freeze(['种草', '涨粉', '曝光', '搜索']),
  官号: Object.freeze(['引流', '曝光', '搜索', '转化']),
  创始人: Object.freeze(['种草', '引流', '涨粉', '曝光', '转化']),
  店主: Object.freeze(['引流', '搜索', '转化']),
  // taxonomy 无员工行；按一线获客默认
  员工: Object.freeze(['种草', '引流', '搜索', '转化']),
});

/**
 * @param {unknown} persona
 * @param {unknown} goal
 * @returns {boolean}
 */
function isRecommendedCombo(persona, goal) {
  if (typeof persona !== 'string' || typeof goal !== 'string') return false;
  const goals = RECOMMENDED_GOALS_BY_PERSONA[persona];
  return Array.isArray(goals) && goals.includes(goal);
}

module.exports = {
  RECOMMENDED_GOALS_BY_PERSONA,
  isRecommendedCombo,
};
