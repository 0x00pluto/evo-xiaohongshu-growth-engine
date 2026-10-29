// @ts-check
'use strict';

/** @type {typeof import('./album/catalog')} */
const catalogModule = require('./album/catalog');
/** @type {typeof import('./album/editable')} */
const editableModule = require('./album/editable');
/** @type {typeof import('./album/frame')} */
const frameModule = require('./album/frame');
/** @type {typeof import('./album/learn')} */
const learnModule = require('./album/learn');
/** @type {typeof import('./album/render')} */
const renderModule = require('./album/render');
/** @type {typeof import('./album/store')} */
const albumStoreModule = require('./album/store');
/** @type {typeof import('./article')} */
const articleModule = require('./article');
/** @type {typeof import('./article-combo')} */
const articleComboModule = require('./article-combo');
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
  PERSONA_FILES: articleModule.PERSONA_FILES,
  PERSONA_TYPES: articleModule.PERSONA_TYPES,
  RECOMMENDED_GOALS_BY_PERSONA: articleComboModule.RECOMMENDED_GOALS_BY_PERSONA,
  isRecommendedCombo: articleComboModule.isRecommendedCombo,
  STORY_TYPES: storyModule.STORY_TYPES,
  STORY_TYPE_SET: storyModule.STORY_TYPE_SET,
  albumHint: catalogModule.albumHint,
  albumKind: catalogModule.albumKind,
  albumLabel: catalogModule.albumLabel,
  albumLabelShort: editableModule.albumLabelShort,
  albumPromptName: catalogModule.albumPromptName,
  albumSampleFile: catalogModule.albumSampleFile,
  albumSamplePath: catalogModule.albumSamplePath,
  articlePromptName: articleModule.articlePromptName,
  isPersonaType: articleModule.isPersonaType,
  personaPromptName: articleModule.personaPromptName,
  assignContrastSlots: storyModule.assignContrastSlots,
  assignGalleryRoles: storyModule.assignGalleryRoles,
  assignStoryRoles: storyModule.assignStoryRoles,
  assertPromptPlaceholders: learnModule.assertPromptPlaceholders,
  assertPromptSheet: learnModule.assertPromptSheet,
  buildAlbumDraft: learnModule.buildAlbumDraft,
  buildDraftMessages: articleModule.buildDraftMessages,
  buildDraftPrompt: articleModule.buildDraftPrompt,
  clearAlbumCatalogCache: catalogModule.clearAlbumCatalogCache,
  commitAlbumDraft: albumStoreModule.commitAlbumDraft,
  updateAlbumPromptMd: albumStoreModule.updateAlbumPromptMd,
  copyFramesFitSchema: editableModule.copyFramesFitSchema,
  copySchema: catalogModule.copySchema,
  decodeFilledPrompt: editableModule.decodeFilledPrompt,
  deleteAlbumFiles: albumStoreModule.deleteAlbumFiles,
  composeImagePrompt: require('./album/refs').composeImagePrompt,
  formatImageRefsBlock: require('./album/refs').formatImageRefsBlock,
  imageReferencesFor: require('./album/refs').imageReferencesFor,
  TEXT_ONLY_LOCK: require('./album/refs').TEXT_ONLY_LOCK,
  migrateUserAlbumsFromAssets: albumStoreModule.migrateUserAlbumsFromAssets,
  migrateUserAlbumPacks: albumStoreModule.migrateUserAlbumPacks,
  readAlbumPromptText: catalogModule.readAlbumPromptText,
  draftPublicView: learnModule.draftPublicView,
  embedEditablePrompt: editableModule.embedEditablePrompt,
  extractEditablePrompt: editableModule.extractEditablePrompt,
  extractSceneFromPrompt: editableModule.extractSceneFromPrompt,
  fillPrompt: templateModule.fillPrompt,
  formatGallerySlots: storyModule.formatGallerySlots,
  formatPlannedLines: frameModule.formatPlannedLines,
  frameDisplayLine: frameModule.frameDisplayLine,
  isAlbum: catalogModule.isAlbum,
  isArticleType: articleModule.isArticleType,
  isBuiltinAlbum: catalogModule.isBuiltinAlbum,
  isLook: catalogModule.isLook,
  isStoryType: storyModule.isStoryType,
  listAlbums: catalogModule.listAlbums,
  loadAlbumCatalog: catalogModule.loadAlbumCatalog,
  migrateAlbumId: catalogModule.migrateAlbumId,
  normalizeFrame: frameModule.normalizeFrame,
  normalizeReferenceImage: learnModule.normalizeReferenceImage,
  TEXT_ONLY_SCENE: parseModule.TEXT_ONLY_SCENE,
  parseDraftText: parseModule.parseDraftText,
  parseJsonObject: parseModule.parseJsonObject,
  parseLearnResult: learnModule.parseLearnResult,
  parsePlanText: parseModule.parsePlanText,
  parseScenesText: parseModule.parseScenesText,
  pickAlbum: catalogModule.pickAlbum,
  pickLook: catalogModule.pickLook,
  pickOne: catalogModule.pickOne,
  pickStoryType: storyModule.pickStoryType,
  readLearnSystemPrompt: learnModule.readLearnSystemPrompt,
  readPromptFile: templateModule.readPromptFile,
  renderAlbumPrompt: renderModule.renderAlbumPrompt,
  storyPromptName: storyModule.storyPromptName,
};
