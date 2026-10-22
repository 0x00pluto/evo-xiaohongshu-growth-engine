// @ts-check
'use strict';

/** @type {typeof import('./album/catalog')} */
const catalogModule = require('./album/catalog');
const { pickOne } = catalogModule;

/** @type {ReadonlyArray<string>} */
const STORY_TYPES = ['process', 'contrast'];
/** @type {ReadonlySet<string>} */
const STORY_TYPE_SET = new Set(STORY_TYPES);

/**
 * @param {unknown} type
 * @returns {type is string}
 */
function isStoryType(type) {
  return typeof type === 'string' && STORY_TYPE_SET.has(type);
}

/**
 * @param {unknown} type
 * @returns {string}
 */
function storyPromptName(type) {
  if (!isStoryType(type)) {
    throw new Error('故事类型不在允许列表');
  }
  return `article-image/lines/${type}.md`;
}

/**
 * @param {() => number} [random]
 * @returns {string}
 */
function pickStoryType(random) {
  return pickOne(STORY_TYPES, random);
}

/**
 * @param {number} count
 * @returns {string[]}
 */
function assignGalleryRoles(count) {
  if (!Number.isInteger(count) || count < 0) return [];
  if (count === 0) return [];
  if (count === 1) return ['summary'];
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? 'summary' : 'point'));
}

/**
 * @param {number} galleryCount
 * @returns {string[]}
 */
function assignStoryRoles(galleryCount) {
  return ['opening', ...assignGalleryRoles(galleryCount)];
}

/**
 * @param {number} galleryCount
 * @returns {string[]}
 */
function assignContrastSlots(galleryCount) {
  const count = Number.isInteger(galleryCount) && galleryCount >= 0 ? galleryCount + 1 : 1;
  return Array.from({ length: count }, () => 'contrast');
}

/**
 * @param {string[]} roles
 * @returns {string}
 */
function formatGallerySlots(roles) {
  return roles.map((role, index) => `${index + 1} ${role}`).join('\n');
}

module.exports = {
  STORY_TYPES,
  STORY_TYPE_SET,
  assignContrastSlots,
  assignGalleryRoles,
  assignStoryRoles,
  formatGallerySlots,
  isStoryType,
  pickStoryType,
  storyPromptName,
};
