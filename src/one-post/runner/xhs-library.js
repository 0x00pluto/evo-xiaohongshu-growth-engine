// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @type {typeof import('../../article-samples/store')} */
const articleSamplesStore = require('../../article-samples/store');
/** @type {typeof import('../../xhs-note/links')} */
const xhsNoteLinks = require('../../xhs-note/links');
/** @type {typeof import('../../xhs-note/split')} */
const xhsNoteSplit = require('../../xhs-note/split');
/** @type {typeof import('../../xhs-note/bridge')} */
const xhsNoteBridge = require('../../xhs-note/bridge');
/** @type {typeof import('../../xhs-note/fingerprint')} */
const xhsNoteFingerprint = require('../../xhs-note/fingerprint');
/** @type {typeof import('../../prompts/fill')} */
const fillModule = require('../../prompts/fill');

const {
  albumSampleFile,
  deleteAlbumFiles,
  isAlbum,
  isBuiltinAlbum,
  readAlbumPromptText,
} = fillModule;

/**
 * 小红书笔记：存稿与资料库「对标笔记」。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachXhsLibrary(ctx) {
  const {
    busy,
    promptsDir,
    userAlbumsDir,
    userArticleSamplesDir,
    userXhsNotesDir,
  } = ctx;

  /**
   * 图队列结束后写范文，并回写链接 learned.articleSampleId + 文本哈希。
   * @param {Record<string, unknown>} payload
   */
  function saveXhsNoteArticle(payload) {
    if (!userXhsNotesDir) return { ok: false, code: 'INTERNAL', message: '缺少小红书链接库目录' };
    if (!userArticleSamplesDir) return { ok: false, code: 'INTERNAL', message: '缺少范文库目录' };
    const linkId = typeof payload.linkId === 'string' ? payload.linkId.trim() : '';
    const note = xhsNoteSplit.normalizeNotePayload(payload.note);
    if (!linkId || !note) {
      return { ok: false, code: 'INVALID_URL', message: xhsNoteBridge.humanError('INVALID_URL') };
    }
    const link = xhsNoteLinks.readXhsNoteLink(userXhsNotesDir, linkId);
    if (!link) return { ok: false, code: 'INTERNAL', message: '找不到对应的笔记链接' };
    const parts = xhsNoteSplit.splitNoteParts(note);
    if (!parts.body) return { ok: false, code: 'INTERNAL', message: '这篇没有正文可学' };
    const existingId = typeof payload.articleSampleId === 'string'
      ? payload.articleSampleId.trim()
      : (link.learned.articleSampleId || '');
    const textHash = xhsNoteFingerprint.articleTextHash(parts.title, parts.body);
    try {
      /** @type {{ id?: string; title: string; body: string; source: Record<string, string> }} */
      const input = {
        title: parts.title,
        body: parts.body,
        source: {
          kind: 'xhs-note',
          noteId: link.noteId,
          linkId: link.id,
        },
      };
      if (existingId) input.id = existingId;
      const saved = articleSamplesStore.saveArticleSample(userArticleSamplesDir, input);
      xhsNoteLinks.attachLearnedArticle(userXhsNotesDir, link.id, saved.id, textHash);
      return { ok: true, articleSample: { id: saved.id, title: saved.title } };
    } catch (err) {
      return {
        ok: false,
        code: 'INTERNAL',
        message: err instanceof Error ? err.message : '写入范文失败',
      };
    }
  }

  /**
   * @param {string} albumId
   * @returns {string}
   */
  function albumPreviewDataUrl(albumId) {
    const id = String(albumId || '').trim();
    if (!id || !isAlbum(id, promptsDir, userAlbumsDir)) return '';
    const abs = albumSampleFile(promptsDir, id, userAlbumsDir);
    if (!fs.existsSync(abs)) return '';
    try {
      const bytes = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = ext === '.png'
        ? 'image/png'
        : (ext === '.webp'
          ? 'image/webp'
          : (ext === '.bmp' ? 'image/bmp' : 'image/jpeg'));
      return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
      return '';
    }
  }

  /**
   * 资料库「对标笔记」卡墙。
   */
  function listLibraryXhsNotes() {
    if (!userXhsNotesDir) return { ok: false, message: '缺少小红书链接库目录' };
    const links = xhsNoteLinks.listXhsNoteLinks(userXhsNotesDir);
    /** @type {Record<string, unknown>[]} */
    const notes = [];
    for (const link of links) {
      // list 直接 parse 文件：顺带用 read 治愈脏 sourceUrl
      const healed = xhsNoteLinks.readXhsNoteLink(userXhsNotesDir, link.id) || link;
      const coverAlbum = healed.learned.albums.find((row) => row.role === 'cover')
        || healed.learned.albums[0];
      let coverPreviewUrl = '';
      if (coverAlbum && coverAlbum.albumId) {
        coverPreviewUrl = albumPreviewDataUrl(coverAlbum.albumId);
      }
      /** @type {string} */
      let bodyPreview = '';
      if (healed.learned.articleSampleId && userArticleSamplesDir) {
        const sample = articleSamplesStore.readArticleSample(
          userArticleSamplesDir,
          healed.learned.articleSampleId,
        );
        if (sample) bodyPreview = String(sample.body || '').slice(0, 200);
      }
      notes.push({
        id: healed.id,
        noteId: healed.noteId,
        title: healed.title || '未命名笔记',
        sourceUrl: healed.sourceUrl,
        learnedAt: healed.learnedAt || healed.updatedAt || 0,
        updatedAt: healed.updatedAt || 0,
        coverPreviewUrl,
        bodyPreview,
        hasArticle: Boolean(healed.learned.articleSampleId),
        albumCount: healed.learned.albums.length,
      });
    }
    return { ok: true, notes };
  }

  /**
   * 对标笔记详情浮层。
   * @param {Record<string, unknown>} payload
   */
  function getLibraryXhsNote(payload) {
    if (!userXhsNotesDir) return { ok: false, message: '缺少小红书链接库目录' };
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    if (!id) return { ok: false, message: '要指明笔记' };
    const link = xhsNoteLinks.readXhsNoteLink(userXhsNotesDir, id);
    if (!link) return { ok: false, message: '找不到这篇对标笔记' };

    /** @type {{
     *   role: string;
     *   albumId: string;
     *   exists: boolean;
     *   missing: boolean;
     *   label: string;
     *   previewUrl: string;
     *   promptExcerpt: string;
     * }[]} */
    const images = [];
    for (const row of link.learned.albums) {
      const exists = Boolean(row.albumId) && isAlbum(row.albumId, promptsDir, userAlbumsDir);
      /** @type {string} */
      let promptExcerpt = '';
      if (exists) {
        try {
          const full = readAlbumPromptText(promptsDir, row.albumId, userAlbumsDir);
          promptExcerpt = String(full || '').trim().split(/\n/).slice(0, 2).join('\n');
        } catch {
          promptExcerpt = '';
        }
      }
      images.push({
        role: row.role || 'image',
        albumId: row.albumId,
        exists,
        missing: !exists,
        label: row.role === 'cover' ? '首图' : '内页',
        previewUrl: exists ? albumPreviewDataUrl(row.albumId) : '',
        promptExcerpt,
      });
    }

    /** @type {null | { id: string; title: string; body: string }} */
    let article = null;
    let articleMissing = false;
    if (link.learned.articleSampleId) {
      if (!userArticleSamplesDir) {
        articleMissing = true;
      } else {
        const sample = articleSamplesStore.readArticleSample(
          userArticleSamplesDir,
          link.learned.articleSampleId,
        );
        if (sample) {
          article = { id: sample.id, title: sample.title, body: sample.body };
        } else {
          articleMissing = true;
        }
      }
    }

    return {
      ok: true,
      link: {
        id: link.id,
        noteId: link.noteId,
        title: link.title,
        sourceUrl: link.sourceUrl,
        // 文案用规范链；仅带 xsec_token 的原粘贴串可点，否则为空
        openUrl: xhsNoteLinks.pickOpenableXhsUrl(link),
        learnedAt: link.learnedAt || link.updatedAt || 0,
        updatedAt: link.updatedAt || 0,
      },
      images,
      article,
      articleMissing,
      articleSampleId: link.learned.articleSampleId || '',
    };
  }

  /**
   * 从笔记删除：级联删名下图册与对标文案。
   * @param {Record<string, unknown>} payload
   */
  function deleteLibraryXhsNote(payload) {
    if (!userXhsNotesDir) return { ok: false, message: '缺少小红书链接库目录' };
    if (ctx.lock) return busy();
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    if (!id) return { ok: false, message: '要指明笔记' };
    const link = xhsNoteLinks.readXhsNoteLink(userXhsNotesDir, id);
    if (!link) return { ok: false, message: '找不到这篇对标笔记' };

    /** @type {string[]} */
    const errors = [];
    for (const row of link.learned.albums) {
      const albumId = row.albumId;
      if (!albumId || isBuiltinAlbum(albumId)) continue;
      if (!isAlbum(albumId, promptsDir, userAlbumsDir)) continue;
      try {
        deleteAlbumFiles(promptsDir, userAlbumsDir, albumId);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : '删图册失败');
      }
    }
    if (link.learned.articleSampleId && userArticleSamplesDir) {
      try {
        articleSamplesStore.deleteArticleSample(
          userArticleSamplesDir,
          link.learned.articleSampleId,
        );
      } catch (err) {
        // 已不存在则忽略
        if (!(err instanceof Error) || !/没有这篇范文/.test(err.message)) {
          errors.push(err instanceof Error ? err.message : '删对标文案失败');
        }
      }
    }
    const removed = xhsNoteLinks.deleteXhsNoteLink(userXhsNotesDir, id);
    if (!removed) return { ok: false, message: '删除链接失败' };
    if (errors.length) {
      return { ok: true, warning: errors.join('；') };
    }
    return { ok: true };
  }

  return {
    deleteLibraryXhsNote,
    getLibraryXhsNote,
    saveXhsNoteArticle,
    listLibraryXhsNotes,
  };
}

module.exports = { attachXhsLibrary };
