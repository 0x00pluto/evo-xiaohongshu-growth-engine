'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_APPLIED_UPLOAD_REFS,
  MAX_UPLOAD_REFS_PER_POST,
  TEXT_ONLY_SUBJECT_MESSAGE,
  effectiveUsage,
  emptySlotPick,
  occupiesSubject,
  addUploadRefToAllPicks,
  emptyPicks,
  normalizeSlotPick,
  normalizeUploadRefs,
  pickAllUploadRefs,
  removeUploadRefFromPicks,
  selectedUploadRefs,
  textOnlyPickBlockReason,
  validateUsage,
} = require('../../src/upload-refs/rules');

test('用法句空着不合格，非空 trim 后通过', () => {
  assert.equal(validateUsage('').ok, false);
  assert.equal(validateUsage('   ').ok, false);
  const ok = validateUsage('  人物照片。中央。  ');
  assert.equal(ok.ok, true);
  assert.equal(ok.usage, '人物照片。中央。');
});

test('占主体：无声明则占；含角落小标句则不占', () => {
  assert.equal(occupiesSubject('人物照片。按 Hero 放中央。'), true);
  assert.equal(occupiesSubject('品牌 logo。角落小标，不占主体。'), false);
});

test('有效用法：覆盖句优先，否则用上传参考用法句', () => {
  const material = { id: 'a1', fileName: 'm-a1.jpg', usage: '默认摆法' };
  const pick = {
    materialIds: ['a1'],
    overrides: { a1: '只给封面的摆法' },
  };
  assert.equal(effectiveUsage('a1', pick, material), '只给封面的摆法');
  assert.equal(effectiveUsage('a1', emptySlotPick(), material), '默认摆法');
});

test('生图 pick 带齐全部上传参考（列表序）', () => {
  const refs = [
    { id: 'a', fileName: 'm-a.jpg', usage: '甲' },
    { id: 'b', fileName: 'm-b.jpg', usage: '乙' },
  ];
  assert.deepEqual(pickAllUploadRefs(refs), {
    materialIds: ['a', 'b'],
    overrides: {},
  });
  assert.deepEqual(pickAllUploadRefs([]), { materialIds: [], overrides: {} });
});

test('新上传参考默认勾进全部槽位', () => {
  const picks = emptyPicks(2);
  const next = addUploadRefToAllPicks(picks, 'x1');
  assert.deepEqual(next.cover.materialIds, ['x1']);
  assert.deepEqual(next.gallery[0].materialIds, ['x1']);
  assert.deepEqual(next.gallery[1].materialIds, ['x1']);
});

test('池可超过应用上限；每槽勾选与默认勾入封顶 9', () => {
  assert.equal(MAX_UPLOAD_REFS_PER_POST, 48);
  assert.equal(MAX_APPLIED_UPLOAD_REFS, 9);
  /** @type {unknown[]} */
  const pool = [];
  for (let i = 0; i < 12; i += 1) {
    pool.push({
      id: `id${i}`,
      fileName: `m-id${i}.jpg`,
      usage: `用法 ${i}`,
    });
  }
  const normalized = normalizeUploadRefs(pool);
  assert.equal(normalized.length, 12);
  const ids = Array.from({ length: 12 }, (_, i) => `id${i}`);
  const pick = normalizeSlotPick({ materialIds: ids, overrides: {} });
  assert.equal(pick.materialIds.length, 9);
  assert.deepEqual(pick.materialIds, ids.slice(0, 9));
  let picks = emptyPicks(0);
  for (let i = 0; i < 9; i += 1) {
    picks = addUploadRefToAllPicks(picks, `id${i}`);
  }
  assert.equal(picks.cover.materialIds.length, 9);
  const after = addUploadRefToAllPicks(picks, 'id9');
  assert.equal(after.cover.materialIds.length, 9);
  assert.equal(after.cover.materialIds.includes('id9'), false);
});

test('纯文字册拒绝占主体上传参考；角落小标可通过', () => {
  const person = { id: 'p1', fileName: 'm-p1.jpg', usage: '人物照片。中央。' };
  const logo = {
    id: 'l1',
    fileName: 'm-l1.png',
    usage: '标识。角落小标，不占主体。',
  };
  assert.equal(
    textOnlyPickBlockReason(true, [person], { materialIds: ['p1'], overrides: {} }),
    TEXT_ONLY_SUBJECT_MESSAGE,
  );
  assert.equal(
    textOnlyPickBlockReason(true, [logo], { materialIds: ['l1'], overrides: {} }),
    '',
  );
  assert.equal(
    textOnlyPickBlockReason(false, [person], { materialIds: ['p1'], overrides: {} }),
    '',
  );
});

test('删除上传参考时清掉所有槽位勾选与覆盖句', () => {
  const picks = {
    cover: { materialIds: ['a', 'b'], overrides: { a: '封面', b: '也勾' } },
    gallery: [
      { materialIds: ['a'], overrides: { a: '配图' } },
      { materialIds: ['b'], overrides: {} },
    ],
  };
  const next = removeUploadRefFromPicks(picks, 'a');
  assert.deepEqual(next.cover.materialIds, ['b']);
  assert.equal(next.cover.overrides.a, undefined);
  assert.equal(next.cover.overrides.b, '也勾');
  assert.deepEqual(next.gallery[0].materialIds, []);
  assert.deepEqual(next.gallery[1].materialIds, ['b']);
});

test('勾选顺序决定 selectedUploadRefs 顺序', () => {
  const refs = [
    { id: 'a', fileName: 'm-a.jpg', usage: '甲' },
    { id: 'b', fileName: 'm-b.jpg', usage: '乙' },
  ];
  const pick = { materialIds: ['b', 'a'], overrides: {} };
  assert.deepEqual(
    selectedUploadRefs(refs, pick).map((item) => item.id),
    ['b', 'a'],
  );
});
