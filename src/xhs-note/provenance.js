// @ts-check
'use strict';

/**
 * @typedef {{
 *   kind: 'xhs-note';
 *   noteId: string;
 *   linkId: string;
 *   role?: string;
 * }} XhsNoteProvenance
 */

/**
 * @param {unknown} raw
 * @returns {XhsNoteProvenance | null}
 */
function normalizeXhsProvenance(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bag = /** @type {Record<string, unknown>} */ (raw);
  if (bag.kind !== 'xhs-note') return null;
  const noteId = typeof bag.noteId === 'string' ? bag.noteId.trim() : '';
  const linkId = typeof bag.linkId === 'string' ? bag.linkId.trim() : '';
  if (!noteId || !linkId) return null;
  /** @type {XhsNoteProvenance} */
  const out = { kind: 'xhs-note', noteId, linkId };
  if (typeof bag.role === 'string' && bag.role.trim()) {
    out.role = bag.role.trim();
  }
  return out;
}

/**
 * @param {XhsNoteProvenance | null | undefined} source
 * @returns {Record<string, string> | undefined}
 */
function provenanceToJson(source) {
  if (!source) return undefined;
  /** @type {Record<string, string>} */
  const out = {
    kind: source.kind,
    noteId: source.noteId,
    linkId: source.linkId,
  };
  if (source.role) out.role = source.role;
  return out;
}

module.exports = {
  normalizeXhsProvenance,
  provenanceToJson,
};
