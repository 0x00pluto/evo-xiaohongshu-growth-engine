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
 * 小红书笔记：探测取料通道与链接解析（resolve）。
 * @param {import('./context').RunnerCtx} ctx
 * @param {import('./xhs-notes').XhsNoteGate} gate
 */
function attachXhsResolve(ctx, gate) {
  const {
    checkBridgeFn,
    fetchImpl,
    fetchNoteByUrl,
    userXhsNotesCacheDir,
    userXhsNotesDir,
  } = ctx;

  /**
   * 打开进料弹层时探测本机 Chrome 扩展取料通道与版本。
   */
  async function checkXhsNoteBridge() {
    const result = await checkBridgeFn();
    if (result.ok) {
      return {
        ok: true,
        version: result.version,
        minVersion: result.minVersion,
      };
    }
    return {
      ok: false,
      code: result.code,
      message: result.message,
      version: result.version || '',
      minVersion: result.minVersion,
    };
  }

  /**
   * 组装 resolve 成功回包：预览图优先 cache，缺再 CDN，并回写 cache 图片。
   * @param {string} inputUrl
   * @param {import('../../xhs-note/split').NoteImportPayload} note
   * @param {string} noteId
   */
  async function buildResolveOkResult(inputUrl, note, noteId) {
    const parts = xhsNoteSplit.splitNoteParts(note);
    /** @type {string} */
    let coverUrl = '';
    /** @type {string} */
    let coverPreviewUrl = '';
    if (parts.cover && parts.cover.url) {
      coverUrl = parts.cover.url;
      if (userXhsNotesCacheDir) {
        coverPreviewUrl = xhsNoteCache.readImageDataUrl(userXhsNotesCacheDir, noteId, 'cover');
      }
      if (!coverPreviewUrl) {
        const coverDownloaded = await xhsNoteDownload.downloadNoteImage(coverUrl, {
          mime: parts.cover.mime || '',
          fetchFn: fetchImpl || globalThis.fetch,
        });
        if (coverDownloaded && coverDownloaded.dataUrl) {
          coverPreviewUrl = coverDownloaded.dataUrl;
          if (userXhsNotesCacheDir) {
            xhsNoteCache.writeImageDataUrl(
              userXhsNotesCacheDir,
              noteId,
              'cover',
              coverPreviewUrl,
            );
          }
        }
      }
    }

    /** @type {{ index: number; url: string; role: string; mime: string; previewUrl: string }[]} */
    const inners = [];
    for (let index = 0; index < parts.inners.length; index += 1) {
      const img = parts.inners[index];
      /** @type {string} */
      let previewUrl = '';
      // 多内页勾选网格才准备内页预览；单张不展示缩略网格
      if (parts.inners.length > 1 && img.url) {
        if (userXhsNotesCacheDir) {
          previewUrl = xhsNoteCache.readImageDataUrl(
            userXhsNotesCacheDir,
            noteId,
            `inner-${index}`,
          );
        }
        if (!previewUrl) {
          const downloaded = await xhsNoteDownload.downloadNoteImage(img.url, {
            mime: img.mime || '',
            fetchFn: fetchImpl || globalThis.fetch,
          });
          if (downloaded && downloaded.dataUrl) {
            previewUrl = downloaded.dataUrl;
            if (userXhsNotesCacheDir) {
              xhsNoteCache.writeImageDataUrl(
                userXhsNotesCacheDir,
                noteId,
                `inner-${index}`,
                previewUrl,
              );
            }
          }
        }
      }
      inners.push({
        index,
        url: img.url,
        role: img.role || 'image',
        mime: img.mime || '',
        previewUrl,
      });
    }
    return {
      ok: true,
      inputUrl,
      note,
      fromCache: false,
      parts: {
        title: parts.title,
        body: parts.body,
        tagOnlyBody: xhsNoteSplit.isTagOnlyBody(parts.body),
        hasCover: Boolean(parts.cover),
        coverUrl,
        coverPreviewUrl,
        innerCount: parts.inners.length,
        inners,
      },
    };
  }

  /**
   * @param {Awaited<ReturnType<typeof buildResolveOkResult>>} result
   * @param {import('../../xhs-note/links').XhsNoteLinkMeta} link
   * @param {number} [innerIndex]
   */
  function withLearnedCompare(result, link, innerIndex) {
    const idx = Number.isInteger(innerIndex) ? /** @type {number} */ (innerIndex) : 0;
    const coverMd5 = xhsNoteFingerprint.contentMd5FromDataUrl(result.parts.coverPreviewUrl || '');
    const innerRow = Array.isArray(result.parts.inners)
      ? result.parts.inners.find((row) => Number(row.index) === idx) || result.parts.inners[0]
      : null;
    const innerMd5 = innerRow
      ? xhsNoteFingerprint.contentMd5FromDataUrl(String(innerRow.previewUrl || ''))
      : '';
    const compare = xhsNoteCompare.compareLearnedParts({
      link,
      title: result.parts.title || '',
      body: result.parts.body || '',
      coverMd5,
      innerMd5,
      hasCover: Boolean(result.parts.hasCover),
      hasInner: Number(result.parts.innerCount) > 0,
    });
    return {
      ...result,
      link: {
        id: link.id,
        noteId: link.noteId,
        sourceUrl: link.sourceUrl,
        title: link.title,
      },
      compare,
      allUnchanged: compare.allUnchanged,
    };
  }

  /**
   * 粘贴链接或重新学：未知则取料；已知则比较指纹。30 分钟内复用新鲜 cache。
   * @param {Record<string, unknown>} payload
   */
  async function resolveXhsNote(payload) {
    if (!userXhsNotesDir) return { ok: false, code: 'INTERNAL', message: '缺少小红书链接库目录' };
    const url = xhsNoteLinks.trimUrl(payload.url);
    const linkIdHint = typeof payload.linkId === 'string' ? payload.linkId.trim() : '';
    if (!url && !linkIdHint) {
      return {
        ok: false,
        code: 'INVALID_URL',
        message: xhsNoteBridge.humanError('INVALID_URL'),
      };
    }
    if (gate.busyKey) {
      return {
        ok: false,
        code: 'IMPORTING',
        message: xhsNoteBridge.humanError('IMPORTING'),
      };
    }

    /** @type {import('../../xhs-note/links').XhsNoteLinkMeta | null} */
    let known = linkIdHint ? xhsNoteLinks.readXhsNoteLink(userXhsNotesDir, linkIdHint) : null;
    if (!known && url) known = xhsNoteLinks.findXhsNoteLinkByUrl(userXhsNotesDir, url);

    const resolveUrl = url || (known ? known.sourceUrl : '');
    if (!resolveUrl) {
      return {
        ok: false,
        code: 'INVALID_URL',
        message: xhsNoteBridge.humanError('INVALID_URL'),
      };
    }

    const pastedNoteId = xhsNoteId.extractXhsNoteId(resolveUrl)
      || (known ? known.noteId : '');
    // 真拉只传 durable 分享链；无 token 不调桥。noteId 只用于缓存与入库短链身份
    const shareFetchUrl = xhsNoteId.toDurableShareFetchUrl(resolveUrl);
    const noShareMessage = '没有可用的分享链接（缺 xsec_token），请到小红书复制分享链接后再学';
    const innerIndex = Number.isInteger(payload.innerIndex)
      ? /** @type {number} */ (payload.innerIndex)
      : 0;

    /**
     * @param {string} noteId
     * @returns {import('../../xhs-note/split').NoteImportPayload | null}
     */
    function readLearnableCachedNote(noteId) {
      if (!userXhsNotesCacheDir || !noteId) return null;
      const cachedRaw = xhsNoteCache.readNotePayload(userXhsNotesCacheDir, noteId);
      const cachedNote = xhsNoteSplit.normalizeNotePayload(cachedRaw);
      if (!cachedNote || !xhsNoteSplit.hasLearnableNoteContent(cachedNote)) return null;
      return cachedNote;
    }

    /**
     * @param {import('../../xhs-note/split').NoteImportPayload} note
     * @param {string} noteId
     * @param {boolean} fromCache
     */
    async function finishOk(note, noteId, fromCache) {
      const result = await buildResolveOkResult(resolveUrl, note, noteId);
      result.fromCache = fromCache;
      if (known) {
        if (url) xhsNoteLinks.rememberInputUrl(userXhsNotesDir, known.sourceUrl, url);
        return withLearnedCompare(result, known, innerIndex);
      }
      return result;
    }

    /**
     * 取料空/失败时：不写盘；能回退可学旧包则用旧包。
     * @param {string} noteIdHint
     * @param {{ ok: false; code?: string; message?: string }} fail
     */
    async function finishFetchMiss(noteIdHint, fail) {
      const fallbackId = noteIdHint || pastedNoteId || (known ? known.noteId : '');
      const stale = fallbackId ? readLearnableCachedNote(fallbackId) : null;
      if (stale) {
        const staleId = xhsNoteId.extractXhsNoteId(stale.sourceUrl) || fallbackId;
        if (!known) {
          known = xhsNoteLinks.findXhsNoteLinkByNoteId(userXhsNotesDir, staleId)
            || xhsNoteLinks.findXhsNoteLinkByUrl(userXhsNotesDir, stale.sourceUrl);
        }
        return finishOk(stale, staleId, true);
      }
      return {
        ok: false,
        code: fail.code || 'INTERNAL',
        message: fail.message
          || '取到的笔记没有正文也没有图，没法学。',
      };
    }

    if (pastedNoteId && userXhsNotesCacheDir
      && xhsNoteCache.isCacheFresh(userXhsNotesCacheDir, pastedNoteId)) {
      const cachedNote = readLearnableCachedNote(pastedNoteId);
      if (cachedNote) {
        if (!known) {
          known = xhsNoteLinks.findXhsNoteLinkByNoteId(userXhsNotesDir, pastedNoteId);
        }
        gate.busyKey = pastedNoteId || resolveUrl;
        try {
          return await finishOk(cachedNote, pastedNoteId, true);
        } finally {
          gate.busyKey = '';
        }
      }
      // 新鲜但不可学（空壳污染）：当 miss，继续取料
    }

    if (!shareFetchUrl) {
      return await finishFetchMiss(pastedNoteId, {
        ok: false,
        code: 'INVALID_URL',
        message: noShareMessage,
      });
    }

    gate.busyKey = pastedNoteId || resolveUrl;
    try {
      const fetched = await fetchNoteByUrl(shareFetchUrl);
      if (!fetched.ok) {
        return await finishFetchMiss(pastedNoteId, {
          ok: false,
          code: fetched.code,
          message: fetched.message || xhsNoteBridge.humanError(fetched.code),
        });
      }
      const note = xhsNoteSplit.normalizeNotePayload(fetched.note);
      if (!note) {
        return await finishFetchMiss(pastedNoteId, {
          ok: false,
          code: 'INVALID_URL',
          message: '取料回包缺少可识别的笔记 ID',
        });
      }
      const noteId = xhsNoteId.extractXhsNoteId(note.sourceUrl) || pastedNoteId;
      if (!noteId) {
        return await finishFetchMiss(pastedNoteId, {
          ok: false,
          code: 'INVALID_URL',
          message: '取料回包缺少可识别的笔记 ID',
        });
      }
      if (!known) {
        known = xhsNoteLinks.findXhsNoteLinkByNoteId(userXhsNotesDir, noteId)
          || xhsNoteLinks.findXhsNoteLinkByUrl(userXhsNotesDir, note.sourceUrl);
      }
      if (!xhsNoteSplit.hasLearnableNoteContent(note)) {
        return await finishFetchMiss(noteId, {
          ok: false,
          code: 'INTERNAL',
          message: '取到的笔记没有正文也没有图，没法学。',
        });
      }
      if (userXhsNotesCacheDir) {
        xhsNoteCache.writeNotePayload(userXhsNotesCacheDir, noteId, note);
      }
      return await finishOk(note, noteId, false);
    } finally {
      gate.busyKey = '';
    }
  }

  return {
    checkXhsNoteBridge,
    resolveXhsNote,
  };
}

module.exports = { attachXhsResolve };
