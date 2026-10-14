'use strict';

const ARTICLE_LIMIT = 8000;

const EMPTY_BUSINESS = '先用一句话说你要发什么。';
const ARTICLE_TOO_LONG = '贴进来的原文太长了，先删到 8000 字以内。';
const BAD_GALLERY_COUNT = '配图张数要在 0 到 9 之间。';

function charLength(text) {
  return Array.from(text).length;
}

function validateGalleryCount(value) {
  if (value == null || value === '') {
    return { ok: false, field: 'galleryCount', message: BAD_GALLERY_COUNT };
  }
  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 9) {
    return { ok: false, field: 'galleryCount', message: BAD_GALLERY_COUNT };
  }
  return { ok: true, galleryCount: numeric };
}

function validateInputs(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const business = typeof source.business === 'string' ? source.business.trim() : '';
  const article = typeof source.article === 'string' ? source.article.trim() : '';
  if (!business) {
    return { ok: false, field: 'business', message: EMPTY_BUSINESS };
  }
  if (charLength(article) > ARTICLE_LIMIT) {
    return { ok: false, field: 'article', message: ARTICLE_TOO_LONG };
  }
  const count = validateGalleryCount(source.galleryCount);
  if (!count.ok) return count;
  return { ok: true, business, article, galleryCount: count.galleryCount };
}

function validateDraftFace(draft) {
  if (!draft || typeof draft.title !== 'string' || !draft.title.trim()) return '标题是空的';
  if (typeof draft.body !== 'string' || !draft.body.trim()) return '正文是空的';
  if (!Array.isArray(draft.topics) || draft.topics.length < 3 || draft.topics.length > 5) {
    return '话题要有 3 到 5 个';
  }
  if (draft.topics.some((topic) => typeof topic !== 'string' || !topic.trim())) {
    return '话题要有 3 到 5 个';
  }
  return '';
}

function normalizeFace(draft) {
  return {
    title: String(draft.title).trim(),
    body: String(draft.body).trim(),
    topics: draft.topics.map((topic) => String(topic).trim()),
    coverLine: typeof draft.coverLine === 'string' ? draft.coverLine.trim() : '',
  };
}

function basisFrom(draft, galleryCount, coverLineSpecified) {
  const face = normalizeFace(draft);
  return {
    title: face.title,
    body: face.body,
    topics: face.topics,
    coverLine: face.coverLine,
    coverLineSpecified: typeof coverLineSpecified === 'string' ? coverLineSpecified.trim() : '',
    galleryCount,
    // 大字规则改版后，旧封面提示词对不上这一版，打开时标待重算，不在这里删图。
    coverRules: 'large-type-1',
  };
}

function basisEqual(left, right) {
  if (!left || !right) return false;
  if (left.title !== right.title || left.body !== right.body || left.coverLine !== right.coverLine) return false;
  if ((left.coverLineSpecified || '') !== (right.coverLineSpecified || '')) return false;
  if ((left.coverRules || '') !== (right.coverRules || '')) return false;
  if (left.galleryCount !== right.galleryCount) return false;
  if (!Array.isArray(left.topics) || !Array.isArray(right.topics) || left.topics.length !== right.topics.length) {
    return false;
  }
  return left.topics.every((topic, index) => topic === right.topics[index]);
}

function formatTopics(topics) {
  return (topics || [])
    .map((topic) => String(topic).trim())
    .filter(Boolean)
    .map((topic) => (topic.startsWith('#') ? topic : `#${topic}`))
    .join(' ');
}

function formatPost(draft) {
  if (!draft || typeof draft !== 'object') return '';
  const title = String(draft.title || '').trim();
  const body = String(draft.body || '').trim();
  const topics = formatTopics(draft.topics);
  return [title, body, topics].filter(Boolean).join('\n\n');
}

module.exports = {
  ARTICLE_LIMIT,
  ARTICLE_TOO_LONG,
  BAD_GALLERY_COUNT,
  EMPTY_BUSINESS,
  basisEqual,
  basisFrom,
  charLength,
  formatPost,
  formatTopics,
  normalizeFace,
  validateDraftFace,
  validateGalleryCount,
  validateInputs,
};
