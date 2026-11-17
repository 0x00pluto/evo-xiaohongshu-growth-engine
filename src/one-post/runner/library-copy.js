// @ts-check
'use strict';

/** @type {typeof import('../../article-samples/store')} */
const articleSamplesStore = require('../../article-samples/store');
/** @type {typeof import('../../reference-docs/store')} */
const referenceDocsStore = require('../../reference-docs/store');

/**
 * 素材库文字类：范文样本与参考文档。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachLibraryCopy(ctx) {
  const { userArticleSamplesDir, userReferenceDocsDir } = ctx;

  function listLibraryArticleSamples() {
    if (!userArticleSamplesDir) return { ok: true, samples: [] };
    return {
      ok: true,
      samples: articleSamplesStore.listArticleSamples(userArticleSamplesDir).map((item) => (
        articleSamplesStore.publicListItem(item)
      )),
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function getLibraryArticleSample(payload) {
    if (!userArticleSamplesDir) return { ok: false, message: '缺少范文库目录' };
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    const meta = articleSamplesStore.readArticleSample(userArticleSamplesDir, id);
    if (!meta) return { ok: false, message: '库里没有这篇范文' };
    return { ok: true, sample: meta };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function saveLibraryArticleSample(payload) {
    if (!userArticleSamplesDir) return { ok: false, message: '缺少范文库目录' };
    try {
      const saved = articleSamplesStore.saveArticleSample(userArticleSamplesDir, {
        id: typeof payload.id === 'string' ? payload.id : '',
        title: payload.title,
        body: payload.body,
      });
      return { ok: true, sample: articleSamplesStore.publicListItem(saved) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '保存失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function deleteLibraryArticleSample(payload) {
    if (!userArticleSamplesDir) return { ok: false, message: '缺少范文库目录' };
    try {
      const id = typeof payload.id === 'string' ? payload.id : '';
      articleSamplesStore.deleteArticleSample(userArticleSamplesDir, id);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '删除失败' };
    }
  }

  function listLibraryReferenceDocs() {
    if (!userReferenceDocsDir) return { ok: true, docs: [] };
    return {
      ok: true,
      docs: referenceDocsStore.listReferenceDocs(userReferenceDocsDir).map((item) => (
        referenceDocsStore.publicListItem(item)
      )),
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function getLibraryReferenceDoc(payload) {
    if (!userReferenceDocsDir) return { ok: false, message: '缺少参考资料库目录' };
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    const meta = referenceDocsStore.readReferenceDoc(userReferenceDocsDir, id);
    if (!meta) return { ok: false, message: '库里没有这条参考资料' };
    return { ok: true, doc: meta };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function saveLibraryReferenceDoc(payload) {
    if (!userReferenceDocsDir) return { ok: false, message: '缺少参考资料库目录' };
    try {
      const saved = referenceDocsStore.saveReferenceDoc(userReferenceDocsDir, {
        id: typeof payload.id === 'string' ? payload.id : '',
        name: payload.name,
        body: payload.body,
      });
      // 返回完整条目（含 body），加一条去重后才能用库里的名称快照。
      return { ok: true, doc: saved };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '保存失败' };
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function deleteLibraryReferenceDoc(payload) {
    if (!userReferenceDocsDir) return { ok: false, message: '缺少参考资料库目录' };
    try {
      const id = typeof payload.id === 'string' ? payload.id : '';
      referenceDocsStore.deleteReferenceDoc(userReferenceDocsDir, id);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '删除失败' };
    }
  }

  return {
    deleteLibraryArticleSample,
    deleteLibraryReferenceDoc,
    getLibraryArticleSample,
    getLibraryReferenceDoc,
    listLibraryArticleSamples,
    listLibraryReferenceDocs,
    saveLibraryArticleSample,
    saveLibraryReferenceDoc,
  };
}

module.exports = { attachLibraryCopy };
