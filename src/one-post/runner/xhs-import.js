// @ts-check
'use strict';

/** @type {typeof import('../../xhs-note/links')} */
const xhsNoteLinks = require('../../xhs-note/links');
/** @type {typeof import('../../xhs-note/split')} */
const xhsNoteSplit = require('../../xhs-note/split');
/** @type {typeof import('../../xhs-note/download-image')} */
const xhsNoteDownload = require('../../xhs-note/download-image');
/** @type {typeof import('../../xhs-note/bridge')} */
const xhsNoteBridge = require('../../xhs-note/bridge');
/** @type {typeof import('../../xhs-note/note-id')} */
const xhsNoteId = require('../../xhs-note/note-id');
/** @type {typeof import('../../xhs-note/cache')} */
const xhsNoteCache = require('../../xhs-note/cache');
/** @type {typeof import('../../xhs-note/fingerprint')} */
const xhsNoteFingerprint = require('../../xhs-note/fingerprint');
/** @type {typeof import('../../xhs-note/compare')} */
const xhsNoteCompare = require('../../xhs-note/compare');

/**
 * 小红书笔记：确认勾选后导入（写链接、待学图队列、补指纹）。
 * @param {import('./context').RunnerCtx} ctx
 * @param {import('./xhs-notes').XhsNoteGate} gate
 */
function attachXhsImport(ctx, gate) {
  const {
    fetchImpl,
    userXhsNotesCacheDir,
    userXhsNotesDir,
  } = ctx;

  /**
   * 确认勾选后：写/更新链接；返回待学图队列；缺指纹只补指纹。
   * @param {Record<string, unknown>} payload
   */
  async function importXhsNote(payload) {
    if (!userXhsNotesDir) return { ok: false, code: 'INTERNAL', message: '缺少小红书链接库目录' };
    if (!userXhsNotesCacheDir) {
      return { ok: false, code: 'INTERNAL', message: '缺少小红书笔记缓存目录' };
    }
    const inputUrl = xhsNoteLinks.trimUrl(payload.url);
    const note = xhsNoteSplit.normalizeNotePayload(payload.note);
    if (!inputUrl || !note) {
      return {
        ok: false,
        code: 'INVALID_URL',
        message: xhsNoteBridge.humanError('INVALID_URL'),
      };
    }
    const noteId = xhsNoteId.extractXhsNoteId(note.sourceUrl);
    if (!noteId) {
      return {
        ok: false,
        code: 'INVALID_URL',
        message: '无法从链接识别小红书笔记 ID',
      };
    }
    if (gate.busyKey) {
      return {
        ok: false,
        code: 'IMPORTING',
        message: xhsNoteBridge.humanError('IMPORTING'),
      };
    }
    const known = xhsNoteLinks.findXhsNoteLinkByNoteId(userXhsNotesDir, noteId)
      || xhsNoteLinks.findXhsNoteLinkByUrl(userXhsNotesDir, note.sourceUrl)
      || xhsNoteLinks.findXhsNoteLinkByUrl(userXhsNotesDir, inputUrl);

    let learnArticle = payload.learnArticle === true;
    let learnCover = payload.learnCover === true;
    let learnInner = payload.learnInner === true;
    const patchArticleFp = payload.patchArticleFingerprint === true;
    const patchCoverFp = payload.patchCoverFingerprint === true;
    const patchInnerFp = payload.patchInnerFingerprint === true;
    if (!learnArticle && !learnCover && !learnInner && !patchArticleFp && !patchCoverFp && !patchInnerFp) {
      return { ok: false, code: 'INTERNAL', message: '请至少选择学习文章、首图或内页中的一项' };
    }
    const parts = xhsNoteSplit.splitNoteParts(note);
    if (learnArticle && !parts.body) {
      return { ok: false, code: 'INTERNAL', message: '这篇没有正文可学' };
    }
    if (learnCover && !parts.cover) {
      return { ok: false, code: 'INTERNAL', message: '这篇没有首图可学' };
    }
    const innerIndex = Number.isInteger(payload.innerIndex)
      ? /** @type {number} */ (payload.innerIndex)
      : 0;
    const inner = (learnInner || patchInnerFp) ? xhsNoteSplit.pickInnerImage(parts, innerIndex) : null;
    if (learnInner && !inner) {
      return { ok: false, code: 'INTERNAL', message: '这篇没有内页可学' };
    }

    const coverDataUrl = typeof payload.coverDataUrl === 'string' ? payload.coverDataUrl.trim() : '';
    const innerDataUrl = typeof payload.innerDataUrl === 'string' ? payload.innerDataUrl.trim() : '';

    /** @type {string} */
    let articleSampleId = '';
    /** @type {string} */
    let coverReplaceId = '';
    /** @type {string} */
    let innerReplaceId = '';

    if (known) {
      const coverMd5Hint = xhsNoteFingerprint.contentMd5FromDataUrl(coverDataUrl);
      const innerMd5Hint = xhsNoteFingerprint.contentMd5FromDataUrl(innerDataUrl);
      const compare = xhsNoteCompare.compareLearnedParts({
        link: known,
        title: parts.title,
        body: parts.body,
        coverMd5: coverMd5Hint,
        innerMd5: innerMd5Hint,
        hasCover: Boolean(parts.cover),
        hasInner: Boolean(inner) || parts.inners.length > 0,
      });
      if (learnArticle) {
        if (compare.article.status === 'unchanged') learnArticle = false;
        else if (compare.article.status === 'missing_fp') {
          learnArticle = false;
          // 缺指纹：只补指纹，不改文案
        } else if (compare.article.existingId) {
          articleSampleId = compare.article.existingId;
        }
      }
      if (learnCover) {
        if (compare.cover.status === 'unchanged') learnCover = false;
        else if (compare.cover.status === 'missing_fp') learnCover = false;
        else if (compare.cover.existingId) coverReplaceId = compare.cover.existingId;
      }
      if (learnInner) {
        if (compare.inner.status === 'unchanged') learnInner = false;
        else if (compare.inner.status === 'missing_fp') learnInner = false;
        else if (compare.inner.existingId) innerReplaceId = compare.inner.existingId;
      }
      // 显式补指纹或缺指纹勾选（learn 被关掉但仍要 patch）
      const needArticleFp = patchArticleFp
        || (payload.learnArticle === true && compare.article.status === 'missing_fp');
      const needCoverFp = patchCoverFp
        || (payload.learnCover === true && compare.cover.status === 'missing_fp');
      const needInnerFp = patchInnerFp
        || (payload.learnInner === true && compare.inner.status === 'missing_fp');

      if (!learnArticle && !learnCover && !learnInner && !needArticleFp && !needCoverFp && !needInnerFp) {
        return {
          ok: true,
          allUnchanged: true,
          link: {
            id: known.id,
            noteId: known.noteId,
            sourceUrl: known.sourceUrl,
            title: known.title,
          },
          wantArticle: false,
          articleSampleId: '',
          learnImages: [],
          skippedImages: false,
        };
      }

      gate.busyKey = noteId;
      try {
        xhsNoteLinks.rememberInputUrl(userXhsNotesDir, known.sourceUrl, inputUrl);
        xhsNoteLinks.saveXhsNoteLink(userXhsNotesDir, {
          id: known.id,
          noteId: known.noteId,
          sourceUrl: known.sourceUrl,
          inputUrl,
          title: note.title || known.title,
          fetchedAt: note.fetchedAt || known.fetchedAt,
          learned: known.learned,
          learnedAt: known.learnedAt,
        });
        if (xhsNoteSplit.hasLearnableNoteContent(note)) {
          xhsNoteCache.writeNotePayload(userXhsNotesCacheDir, noteId, note);
        }

        /** @type {{ albumId: string; role: string; contentMd5?: string }[]} */
        const fpAlbums = [];
        /** @type {string} */
        let articleHash = '';
        if (needArticleFp && parts.body) {
          articleHash = xhsNoteFingerprint.articleTextHash(parts.title, parts.body);
        }
        /**
         * @param {string} remoteUrl
         * @param {{ mime?: string }} [options]
         */
        const downloadFn = async (remoteUrl, options) => xhsNoteDownload.downloadNoteImage(remoteUrl, {
          mime: options && options.mime,
          fetchFn: fetchImpl || globalThis.fetch,
        });

        /** @type {{
         *   role: string;
         *   label: string;
         *   dataUrl: string;
         *   replaceAlbumId?: string;
         *   source: import('../../xhs-note/provenance').XhsNoteProvenance;
         * }[]} */
        const learnImages = [];

        if (needCoverFp && parts.cover && compare.cover.existingId) {
          const dataUrl = await xhsNoteCache.resolveImageDataUrl({
            cacheRoot: userXhsNotesCacheDir,
            noteId,
            basename: 'cover',
            dataUrl: coverDataUrl,
            remoteUrl: parts.cover.url,
            mime: parts.cover.mime,
            downloadFn,
          });
          const md5 = xhsNoteFingerprint.contentMd5FromDataUrl(dataUrl);
          if (md5) fpAlbums.push({ albumId: compare.cover.existingId, role: 'cover', contentMd5: md5 });
        }
        if (needInnerFp && inner && compare.inner.existingId) {
          const dataUrl = await xhsNoteCache.resolveImageDataUrl({
            cacheRoot: userXhsNotesCacheDir,
            noteId,
            basename: `inner-${innerIndex}`,
            dataUrl: innerDataUrl,
            remoteUrl: inner.url,
            mime: inner.mime,
            downloadFn,
          });
          const md5 = xhsNoteFingerprint.contentMd5FromDataUrl(dataUrl);
          if (md5) {
            fpAlbums.push({
              albumId: compare.inner.existingId,
              role: compare.inner.existingId ? 'inner' : 'inner',
              contentMd5: md5,
            });
          }
        }
        if (articleHash || fpAlbums.length) {
          xhsNoteLinks.patchLearnedFingerprints(userXhsNotesDir, known.id, {
            articleTextHash: articleHash || undefined,
            albums: fpAlbums,
          });
        }

        if (learnCover && parts.cover) {
          const dataUrl = await xhsNoteCache.resolveImageDataUrl({
            cacheRoot: userXhsNotesCacheDir,
            noteId,
            basename: 'cover',
            dataUrl: coverDataUrl,
            remoteUrl: parts.cover.url,
            mime: parts.cover.mime,
            downloadFn,
          });
          if (dataUrl) {
            /** @type {{
             *   role: string;
             *   label: string;
             *   dataUrl: string;
             *   replaceAlbumId?: string;
             *   source: import('../../xhs-note/provenance').XhsNoteProvenance;
             * }} */
            const row = {
              role: 'cover',
              label: '首图',
              dataUrl,
              source: {
                kind: 'xhs-note',
                noteId,
                linkId: known.id,
                role: 'cover',
              },
            };
            if (coverReplaceId) row.replaceAlbumId = coverReplaceId;
            learnImages.push(row);
          }
        }
        if (learnInner && inner) {
          const dataUrl = await xhsNoteCache.resolveImageDataUrl({
            cacheRoot: userXhsNotesCacheDir,
            noteId,
            basename: `inner-${innerIndex}`,
            dataUrl: innerDataUrl,
            remoteUrl: inner.url,
            mime: inner.mime,
            downloadFn,
          });
          if (dataUrl) {
            /** @type {{
             *   role: string;
             *   label: string;
             *   dataUrl: string;
             *   replaceAlbumId?: string;
             *   source: import('../../xhs-note/provenance').XhsNoteProvenance;
             * }} */
            const row = {
              role: 'inner',
              label: '内页',
              dataUrl,
              source: {
                kind: 'xhs-note',
                noteId,
                linkId: known.id,
                role: 'inner',
              },
            };
            if (innerReplaceId) row.replaceAlbumId = innerReplaceId;
            learnImages.push(row);
          }
        }

        if (Array.isArray(parts.inners) && parts.inners.length > 1) {
          const previewInners = Array.isArray(payload.innerPreviews) ? payload.innerPreviews : [];
          for (let i = 0; i < parts.inners.length; i += 1) {
            if (learnInner && i === innerIndex) continue;
            const preview = previewInners.find((row) => (
              row && typeof row === 'object' && Number(/** @type {Record<string, unknown>} */ (row).index) === i
            ));
            const previewUrl = preview && typeof /** @type {Record<string, unknown>} */ (preview).previewUrl === 'string'
              ? String(/** @type {Record<string, unknown>} */ (preview).previewUrl)
              : '';
            if (previewUrl.startsWith('data:')) {
              xhsNoteCache.writeImageDataUrl(userXhsNotesCacheDir, noteId, `inner-${i}`, previewUrl);
            }
          }
        }

        return {
          ok: true,
          link: {
            id: known.id,
            noteId: known.noteId,
            sourceUrl: known.sourceUrl,
            title: note.title || known.title,
          },
          wantArticle: learnArticle,
          articleSampleId,
          learnImages,
          skippedImages: (learnCover && parts.cover && !learnImages.some((i) => i.role === 'cover'))
            || (learnInner && inner && !learnImages.some((i) => i.role === 'inner')),
        };
      } finally {
        gate.busyKey = '';
      }
    }

    gate.busyKey = noteId;
    try {
      const link = xhsNoteLinks.saveXhsNoteLink(userXhsNotesDir, {
        noteId,
        sourceUrl: note.sourceUrl,
        inputUrl,
        title: note.title,
        fetchedAt: note.fetchedAt,
      });
      if (xhsNoteSplit.hasLearnableNoteContent(note)) {
        xhsNoteCache.writeNotePayload(userXhsNotesCacheDir, noteId, note);
      }

      /** @type {{
       *   role: string;
       *   label: string;
       *   dataUrl: string;
       *   replaceAlbumId?: string;
       *   source: import('../../xhs-note/provenance').XhsNoteProvenance;
       * }[]} */
      const learnImages = [];
      /**
       * @param {string} remoteUrl
       * @param {{ mime?: string }} [options]
       */
      const downloadFn = async (remoteUrl, options) => xhsNoteDownload.downloadNoteImage(remoteUrl, {
        mime: options && options.mime,
        fetchFn: fetchImpl || globalThis.fetch,
      });

      if (learnCover && parts.cover) {
        const dataUrl = await xhsNoteCache.resolveImageDataUrl({
          cacheRoot: userXhsNotesCacheDir,
          noteId,
          basename: 'cover',
          dataUrl: coverDataUrl,
          remoteUrl: parts.cover.url,
          mime: parts.cover.mime,
          downloadFn,
        });
        if (dataUrl) {
          learnImages.push({
            role: 'cover',
            label: '首图',
            dataUrl,
            source: {
              kind: 'xhs-note',
              noteId,
              linkId: link.id,
              role: 'cover',
            },
          });
        }
      }
      if (learnInner && inner) {
        const dataUrl = await xhsNoteCache.resolveImageDataUrl({
          cacheRoot: userXhsNotesCacheDir,
          noteId,
          basename: `inner-${innerIndex}`,
          dataUrl: innerDataUrl,
          remoteUrl: inner.url,
          mime: inner.mime,
          downloadFn,
        });
        if (dataUrl) {
          learnImages.push({
            role: 'inner',
            label: '内页',
            dataUrl,
            source: {
              kind: 'xhs-note',
              noteId,
              linkId: link.id,
              role: 'inner',
            },
          });
        }
      }

      if (Array.isArray(parts.inners) && parts.inners.length > 1) {
        const previewInners = Array.isArray(payload.innerPreviews) ? payload.innerPreviews : [];
        for (let i = 0; i < parts.inners.length; i += 1) {
          if (learnInner && i === innerIndex) continue;
          const preview = previewInners.find((row) => (
            row && typeof row === 'object' && Number(/** @type {Record<string, unknown>} */ (row).index) === i
          ));
          const previewUrl = preview && typeof /** @type {Record<string, unknown>} */ (preview).previewUrl === 'string'
            ? String(/** @type {Record<string, unknown>} */ (preview).previewUrl)
            : '';
          if (previewUrl.startsWith('data:')) {
            xhsNoteCache.writeImageDataUrl(userXhsNotesCacheDir, noteId, `inner-${i}`, previewUrl);
          }
        }
      }

      return {
        ok: true,
        link: {
          id: link.id,
          noteId: link.noteId,
          sourceUrl: link.sourceUrl,
          title: link.title,
        },
        wantArticle: learnArticle,
        articleSampleId: '',
        learnImages,
        skippedImages: (learnCover && parts.cover && !learnImages.some((i) => i.role === 'cover'))
          || (learnInner && inner && !learnImages.some((i) => i.role === 'inner')),
      };
    } finally {
      gate.busyKey = '';
    }
  }

  return {
    importXhsNote,
  };
}

module.exports = { attachXhsImport };
