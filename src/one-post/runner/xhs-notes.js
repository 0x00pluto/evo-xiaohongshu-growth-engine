// @ts-check
'use strict';

const { attachXhsResolve } = require('./xhs-resolve');
const { attachXhsImport } = require('./xhs-import');
const { attachXhsLibrary } = require('./xhs-library');

/**
 * resolve 与 import 共用的防并行闸：非空即有取料/导入在跑。
 * @typedef {{ busyKey: string }} XhsNoteGate
 */

/**
 * 小红书笔记：链接解析、导入、存稿与笔记库。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachXhsNotes(ctx) {
  /** @type {XhsNoteGate} */
  const gate = { busyKey: '' };
  return {
    ...attachXhsResolve(ctx, gate),
    ...attachXhsImport(ctx, gate),
    ...attachXhsLibrary(ctx),
  };
}

module.exports = { attachXhsNotes };
