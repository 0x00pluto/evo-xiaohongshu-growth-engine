// @ts-check
'use strict';

const { articleTextHash } = require('./fingerprint');

/**
 * @typedef {'unchanged' | 'changed' | 'missing_fp' | 'new'} CompareStatus
 * @typedef {{
 *   status: CompareStatus;
 *   defaultChecked: boolean;
 *   locked: boolean;
 *   label: string;
 *   existingId?: string;
 *   nextHash?: string;
 * }} PartCompare
 */

/**
 * @param {CompareStatus} status
 * @returns {{ defaultChecked: boolean; locked: boolean; label: string }}
 */
function statusUi(status) {
  if (status === 'unchanged') {
    return { defaultChecked: false, locked: true, label: '没变' };
  }
  if (status === 'changed') {
    return { defaultChecked: true, locked: false, label: '有更新' };
  }
  if (status === 'missing_fp') {
    return { defaultChecked: false, locked: false, label: '需确认' };
  }
  return { defaultChecked: true, locked: false, label: '未学过' };
}

/**
 * @param {string | undefined} existingHash
 * @param {string} nextHash
 * @param {boolean} previouslyLearned
 * @returns {CompareStatus}
 */
function classify(existingHash, nextHash, previouslyLearned) {
  if (!previouslyLearned) return 'new';
  if (!nextHash) return 'missing_fp';
  if (!existingHash) return 'missing_fp';
  return existingHash === nextHash ? 'unchanged' : 'changed';
}

/**
 * @param {{
 *   link: {
 *     learned: {
 *       articleSampleId: string;
 *       articleTextHash?: string;
 *       albums: { albumId: string; role: string; contentMd5?: string }[];
 *     };
 *   };
 *   title: string;
 *   body: string;
 *   coverMd5?: string;
 *   innerMd5?: string;
 *   hasCover: boolean;
 *   hasInner: boolean;
 * }} args
 * @returns {{
 *   article: PartCompare;
 *   cover: PartCompare;
 *   inner: PartCompare;
 *   allUnchanged: boolean;
 *   needsReview: boolean;
 * }}
 */
function compareLearnedParts(args) {
  const learned = args.link.learned;
  const articleHash = articleTextHash(args.title, args.body);
  const coverAlbum = learned.albums.find((row) => row.role === 'cover');
  const innerAlbum = learned.albums.find((row) => row.role === 'inner' || row.role === 'image');

  const articleStatus = classify(
    learned.articleTextHash || '',
    articleHash,
    Boolean(learned.articleSampleId),
  );
  /** 载荷里没有正文时，不展示「补学」 */
  const article = args.body
    ? {
      ...statusUi(articleStatus),
      status: articleStatus,
      existingId: learned.articleSampleId || undefined,
      nextHash: articleHash,
    }
    : {
      status: /** @type {CompareStatus} */ ('unchanged'),
      defaultChecked: false,
      locked: true,
      label: '没正文',
      existingId: learned.articleSampleId || undefined,
      nextHash: '',
    };

  const coverStatus = args.hasCover
    ? classify(coverAlbum && coverAlbum.contentMd5, args.coverMd5 || '', Boolean(coverAlbum && coverAlbum.albumId))
    : /** @type {CompareStatus} */ ('unchanged');
  const cover = args.hasCover
    ? {
      ...statusUi(coverStatus),
      status: coverStatus,
      existingId: coverAlbum && coverAlbum.albumId ? coverAlbum.albumId : undefined,
      nextHash: args.coverMd5 || '',
    }
    : {
      status: /** @type {CompareStatus} */ ('unchanged'),
      defaultChecked: false,
      locked: true,
      label: '没首图',
      nextHash: '',
    };

  const innerStatus = args.hasInner
    ? classify(innerAlbum && innerAlbum.contentMd5, args.innerMd5 || '', Boolean(innerAlbum && innerAlbum.albumId))
    : /** @type {CompareStatus} */ ('unchanged');
  const inner = args.hasInner
    ? {
      ...statusUi(innerStatus),
      status: innerStatus,
      existingId: innerAlbum && innerAlbum.albumId ? innerAlbum.albumId : undefined,
      nextHash: args.innerMd5 || '',
    }
    : {
      status: /** @type {CompareStatus} */ ('unchanged'),
      defaultChecked: false,
      locked: true,
      label: '没内页',
      nextHash: '',
    };

  const actionable = [article, cover, inner].filter((part) => (
    part.status === 'changed'
    || part.status === 'new'
    || part.status === 'missing_fp'
  ));
  const comparable = [];
  if (args.body && learned.articleSampleId) comparable.push(article);
  if (args.hasCover && coverAlbum && coverAlbum.albumId) comparable.push(cover);
  if (args.hasInner && innerAlbum && innerAlbum.albumId) comparable.push(inner);

  const allUnchanged = comparable.length > 0
    && comparable.every((part) => part.status === 'unchanged')
    && actionable.length === 0;

  return {
    article,
    cover,
    inner,
    allUnchanged,
    needsReview: !allUnchanged && (
      actionable.length > 0
      || comparable.some((part) => part.status === 'missing_fp')
    ),
  };
}

module.exports = {
  classify,
  compareLearnedParts,
  statusUi,
};
