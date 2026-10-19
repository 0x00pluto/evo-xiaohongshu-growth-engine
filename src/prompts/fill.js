// @ts-check
'use strict';

/** @type {typeof import('./album/catalog')} */
const catalogModule = require('./album/catalog');
/** @type {typeof import('./album/frame')} */
const frameModule = require('./album/frame');
/** @type {typeof import('./album/render')} */
const renderModule = require('./album/render');
/** @type {typeof import('./article')} */
const articleModule = require('./article');
/** @type {typeof import('./parse')} */
const parseModule = require('./parse');
/** @type {typeof import('./story')} */
const storyModule = require('./story');
/** @type {typeof import('./template')} */
const templateModule = require('./template');

module.exports = {
  ALBUM_KINDS: catalogModule.ALBUM_KINDS,
  ALBUM_KIND_SET: catalogModule.ALBUM_KIND_SET,
  ARTICLE_FILES: articleModule.ARTICLE_FILES,
  ARTICLE_TYPES: articleModule.ARTICLE_TYPES,
  STORY_TYPES: storyModule.STORY_TYPES,
  STORY_TYPE_SET: storyModule.STORY_TYPE_SET,
  albumHint: catalogModule.albumHint,
  albumKind: catalogModule.albumKind,
  albumLabel: catalogModule.albumLabel,
  albumPromptName: catalogModule.albumPromptName,
  albumSampleFile: catalogModule.albumSampleFile,
  albumSamplePath: catalogModule.albumSamplePath,
  articlePromptName: articleModule.articlePromptName,
  assignContrastSlots: storyModule.assignContrastSlots,
  assignGalleryRoles: storyModule.assignGalleryRoles,
  assignStoryRoles: storyModule.assignStoryRoles,
  buildDraftPrompt: articleModule.buildDraftPrompt,
  clearAlbumCatalogCache: catalogModule.clearAlbumCatalogCache,
  copySchema: catalogModule.copySchema,
  fillPrompt: templateModule.fillPrompt,
  formatGallerySlots: storyModule.formatGallerySlots,
  formatPlannedLines: frameModule.formatPlannedLines,
  frameDisplayLine: frameModule.frameDisplayLine,
  isAlbum: catalogModule.isAlbum,
  isArticleType: articleModule.isArticleType,
  isLook: catalogModule.isLook,
  isStoryType: storyModule.isStoryType,
  listAlbums: catalogModule.listAlbums,
  loadAlbumCatalog: catalogModule.loadAlbumCatalog,
  migrateAlbumId: catalogModule.migrateAlbumId,
  parseDraftText: parseModule.parseDraftText,
  parseJsonObject: parseModule.parseJsonObject,
  parsePlanText: parseModule.parsePlanText,
  parseScenesText: parseModule.parseScenesText,
  pickAlbum: catalogModule.pickAlbum,
  pickLook: catalogModule.pickLook,
  pickOne: catalogModule.pickOne,
  pickStoryType: storyModule.pickStoryType,
  readPromptFile: templateModule.readPromptFile,
  renderAlbumPrompt: renderModule.renderAlbumPrompt,
  storyPromptName: storyModule.storyPromptName,
};
