(function () {
  /**
   * @typedef {'pending' | 'applied' | 'discarded'} RiskMarkUiState
   * @typedef {{
   *   id: string;
   *   source: 'lexicon' | 'ai';
   *   fieldId: string;
   *   displayField: 'title' | 'body';
   *   start: number;
   *   end: number;
   *   text: string;
   *   originalText?: string;
   *   reason: string;
   *   replacement: string;
   *   badge: string;
   *   severity?: string;
   *   status?: string;
   *   uiState?: RiskMarkUiState;
   * }} RiskInlineMark
   */

  /**
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 用原文对齐区间：slice 对不上时按 text 就近唯一匹配。
   * @param {string} source
   * @param {number} start
   * @param {number} end
   * @param {string} text
   * @returns {{ start: number; end: number } | null}
   */
  function resolveMarkRange(source, start, end, text) {
    const src = String(source || '');
    const needle = String(text || '');
    if (!needle) return null;
    const s0 = Number(start);
    const e0 = Number(end);
    if (Number.isFinite(s0) && Number.isFinite(e0) && e0 > s0 && src.slice(s0, e0) === needle) {
      return { start: s0, end: e0 };
    }
    const from = Number.isFinite(s0) ? Math.max(0, s0 - Math.max(24, needle.length)) : 0;
    let idx = src.indexOf(needle, from);
    if (idx < 0) idx = src.indexOf(needle);
    if (idx < 0) return null;
    const next = src.indexOf(needle, idx + 1);
    // 从附近找到且全局唯一，或附近命中即可；多处时取离原 start 最近的
    if (next >= 0 && Number.isFinite(s0)) {
      let best = idx;
      let bestDist = Math.abs(idx - s0);
      let cursor = next;
      while (cursor >= 0) {
        const dist = Math.abs(cursor - s0);
        if (dist < bestDist) {
          best = cursor;
          bestDist = dist;
        }
        cursor = src.indexOf(needle, cursor + 1);
      }
      return { start: best, end: best + needle.length };
    }
    return { start: idx, end: idx + needle.length };
  }

  /**
   * @param {RiskMarkUiState | string | undefined} uiState
   * @returns {{ className: string; style: string }}
   */
  function markStyleForState(uiState) {
    const state = uiState === 'applied' || uiState === 'discarded' ? uiState : 'pending';
    // 内联底色：daisyUI + CDN 下 bg-*/20 经常画不出来，只剩描边感
    if (state === 'applied') {
      return {
        className: 'risk-inline-mark text-success pointer-events-auto cursor-pointer outline-none',
        style: 'background-color:#BBF7D0;outline:none;',
      };
    }
    if (state === 'discarded') {
      return {
        className: 'risk-inline-mark text-warning pointer-events-auto cursor-pointer outline-none',
        style: 'background-color:#FEF08A;outline:none;',
      };
    }
    return {
      className: 'risk-inline-mark text-error pointer-events-auto cursor-pointer outline-none',
      style: 'background-color:#FECACA;outline:none;',
    };
  }

  /**
   * @param {RiskMarkUiState | string | undefined} uiState
   * @returns {string}
   */
  function markClassForState(uiState) {
    return markStyleForState(uiState).className;
  }

  /**
   * 重叠时保留较短区间；同长则先出现的优先。
   * @param {RiskInlineMark[]} marks
   * @returns {RiskInlineMark[]}
   */
  function pickNonOverlappingMarks(marks) {
    const list = Array.isArray(marks) ? marks.slice() : [];
    list.sort((a, b) => {
      const lenA = a.end - a.start;
      const lenB = b.end - b.start;
      if (lenA !== lenB) return lenA - lenB;
      if (a.start !== b.start) return a.start - b.start;
      return String(a.id).localeCompare(String(b.id));
    });
    /** @type {RiskInlineMark[]} */
    const chosen = [];
    for (const mark of list) {
      if (!mark || mark.end <= mark.start) continue;
      const hit = chosen.some((row) => !(mark.end <= row.start || mark.start >= row.end)
        && row.displayField === mark.displayField);
      if (!hit) chosen.push(mark);
    }
    chosen.sort((a, b) => {
      if (a.displayField !== b.displayField) {
        return a.displayField === 'title' ? -1 : 1;
      }
      return a.start - b.start || a.end - b.end;
    });
    return chosen;
  }

  /**
   * @param {string} text
   * @param {RiskInlineMark[]} marks 同一 displayField
   * @returns {string}
   */
  function buildOverlayHtml(text, marks) {
    const source = String(text || '');
    const ranges = (Array.isArray(marks) ? marks : [])
      .filter((item) => item && item.end > item.start)
      .slice()
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let html = '';
    let cursor = 0;
    for (const mark of ranges) {
      const resolved = resolveMarkRange(source, mark.start, mark.end, mark.text);
      if (!resolved) continue;
      const start = resolved.start;
      const end = resolved.end;
      if (start < cursor) continue;
      if (start > cursor) html += escapeHtml(source.slice(cursor, start));
      const slice = source.slice(start, end);
      const look = markStyleForState(mark.uiState);
      html += `<span class="${look.className}" style="${look.style}" data-risk-mark-id="${escapeHtml(mark.id)}" role="button" tabindex="0">${escapeHtml(slice)}</span>`;
      cursor = end;
    }
    if (cursor < source.length) html += escapeHtml(source.slice(cursor));
    if (!html) html = escapeHtml(source) || '&nbsp;';
    return html;
  }

  /**
   * @param {Record<string, unknown>} item
   * @returns {RiskMarkUiState}
   */
  function readUiState(item) {
    const raw = typeof item.uiState === 'string' ? item.uiState : '';
    if (raw === 'applied' || raw === 'discarded' || raw === 'pending') return raw;
    if (item.status === '已改这一处') return 'applied';
    return 'pending';
  }

  /**
   * @param {Record<string, unknown>} hit
   * @returns {string}
   */
  function hitUiKey(hit) {
    const fieldId = typeof hit.fieldId === 'string' ? hit.fieldId : '';
    const text = typeof hit.text === 'string' ? hit.text : '';
    const libraryId = typeof hit.libraryId === 'string' ? hit.libraryId : '';
    if (!fieldId || !text) return '';
    return `${fieldId}\0${text}\0${libraryId}`;
  }

  /**
   * 重查时保留本地 applied / discarded，避免替换后绿标被冲掉。
   * @param {unknown[]} prevHits
   * @param {unknown[]} nextHits
   * @returns {Record<string, unknown>[]}
   */
  function mergeHitUiState(prevHits, nextHits) {
    const prev = Array.isArray(prevHits) ? prevHits : [];
    const next = Array.isArray(nextHits) ? nextHits : [];
    /** @type {Map<string, Record<string, unknown>>} */
    const discardedByKey = new Map();
    /** @type {Record<string, unknown>[]} */
    const prevApplied = [];
    for (const raw of prev) {
      if (!raw || typeof raw !== 'object') continue;
      const hit = /** @type {Record<string, unknown>} */ (raw);
      const state = readUiState(hit);
      if (state === 'applied') {
        prevApplied.push(hit);
        continue;
      }
      if (state === 'discarded') {
        const key = hitUiKey(hit);
        if (key) discardedByKey.set(key, hit);
      }
    }
    /** @type {Set<string>} */
    const nextIds = new Set();
    /** @type {Record<string, unknown>[]} */
    const merged = next.map((raw) => {
      const hit = raw && typeof raw === 'object'
        ? { .../** @type {Record<string, unknown>} */ (raw) }
        : {};
      if (typeof hit.id === 'string' && hit.id) nextIds.add(hit.id);
      const key = hitUiKey(hit);
      if (key && discardedByKey.has(key)) {
        return { ...hit, uiState: 'discarded' };
      }
      return { ...hit, uiState: typeof hit.uiState === 'string' ? hit.uiState : 'pending' };
    });
    for (const applied of prevApplied) {
      const id = typeof applied.id === 'string' ? applied.id : '';
      if (id && nextIds.has(id)) {
        const idx = merged.findIndex((row) => row.id === id);
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...applied, uiState: 'applied' };
        }
        continue;
      }
      merged.push({ ...applied, uiState: 'applied' });
    }
    return merged;
  }

  /**
   * @param {{
   *   hits?: unknown[];
   *   suggestions?: unknown[];
   *   bodyText?: string;
   *   bodyOnly?: string;
   *   titleText?: string;
   * }} input
   * @returns {RiskInlineMark[]}
   */
  function collectInlineMarks(input) {
    const bag = input && typeof input === 'object' ? input : {};
    const bodyText = String(bag.bodyText || '');
    const titleText = String(bag.titleText || '');
    const bodyOnly = String(bag.bodyOnly != null ? bag.bodyOnly : '').replace(/\s+$/, '');
    /** @type {RiskInlineMark[]} */
    const out = [];

    /**
     * @param {Omit<RiskInlineMark, 'start' | 'end'> & { start: number; end: number }} draft
     * @param {string} displaySource
     */
    function pushResolved(draft, displaySource) {
      const originalText = typeof draft.originalText === 'string' && draft.originalText
        ? draft.originalText
        : draft.text;
      const needle = draft.uiState === 'applied' && draft.replacement
        ? draft.replacement
        : draft.text;
      const resolved = resolveMarkRange(displaySource, draft.start, draft.end, needle);
      if (!resolved) return;
      out.push({
        ...draft,
        originalText,
        text: needle,
        start: resolved.start,
        end: resolved.end,
      });
    }

    const hits = Array.isArray(bag.hits) ? bag.hits : [];
    for (const raw of hits) {
      if (!raw || typeof raw !== 'object') continue;
      const hit = /** @type {Record<string, unknown>} */ (raw);
      const id = typeof hit.id === 'string' ? hit.id : '';
      if (!id) continue;
      const fieldId = typeof hit.fieldId === 'string' ? hit.fieldId : '';
      const start = Number(hit.start);
      const end = Number(hit.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const text = typeof hit.text === 'string' ? hit.text : '';
      const originalText = typeof hit.originalText === 'string' && hit.originalText
        ? hit.originalText
        : text;
      const replacement = typeof hit.replacement === 'string' ? hit.replacement : '';
      const severity = typeof hit.severity === 'string' ? hit.severity : '要改口';
      const libraryName = typeof hit.libraryName === 'string' ? hit.libraryName : '词库';
      const uiState = readUiState(hit);
      const base = {
        id,
        source: /** @type {'lexicon'} */ ('lexicon'),
        fieldId,
        text,
        originalText,
        reason: `${libraryName} · ${severity}`,
        replacement,
        badge: `词库 · ${severity}`,
        severity,
        uiState,
      };
      if (fieldId === 'title') {
        pushResolved({ ...base, displayField: 'title', start, end }, titleText);
      } else if (fieldId === 'body') {
        pushResolved({ ...base, displayField: 'body', start, end }, bodyText);
      } else if (fieldId === 'topics') {
        const offset = bodyOnly ? bodyOnly.length + 2 : 0;
        pushResolved({ ...base, displayField: 'body', start: offset + start, end: offset + end }, bodyText);
      }
    }

    const suggestions = Array.isArray(bag.suggestions) ? bag.suggestions : [];
    for (const raw of suggestions) {
      if (!raw || typeof raw !== 'object') continue;
      const item = /** @type {Record<string, unknown>} */ (raw);
      const id = typeof item.id === 'string' ? item.id : '';
      if (!id) continue;
      const status = typeof item.status === 'string' ? item.status : '还没改';
      const uiState = readUiState(item);
      const fieldId = typeof item.fieldId === 'string' ? item.fieldId : '';
      const start = Number(item.start);
      const end = Number(item.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const text = typeof item.text === 'string' ? item.text : '';
      const originalText = typeof item.originalText === 'string' && item.originalText
        ? item.originalText
        : text;
      const reason = typeof item.reason === 'string' ? item.reason : '';
      const replacement = typeof item.replacement === 'string' ? item.replacement : '';
      const severityAi = typeof item.severity === 'string' ? item.severity : '要改口';
      const base = {
        id,
        source: /** @type {'ai'} */ ('ai'),
        fieldId,
        text,
        originalText,
        reason,
        replacement,
        badge: 'AI 建议',
        severity: severityAi,
        status,
        uiState,
      };
      if (fieldId === 'title') {
        pushResolved({ ...base, displayField: 'title', start, end }, titleText);
      } else if (fieldId === 'body') {
        pushResolved({ ...base, displayField: 'body', start, end }, bodyText);
      } else if (fieldId === 'topics') {
        const offset = bodyOnly ? bodyOnly.length + 2 : 0;
        pushResolved({ ...base, displayField: 'body', start: offset + start, end: offset + end }, bodyText);
      }
    }

    return pickNonOverlappingMarks(out);
  }

  window.riskInlineMark = {
    escapeHtml,
    resolveMarkRange,
    markStyleForState,
    markClassForState,
    pickNonOverlappingMarks,
    buildOverlayHtml,
    collectInlineMarks,
    mergeHitUiState,
  };
}());
