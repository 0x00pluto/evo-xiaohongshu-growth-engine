(function () {
  /**
   * 轮询是否应结束本轮 AI 取回。只认本轮 riskAiId 的 done/error。
   * @param {unknown} ai
   * @param {{ riskAiId?: string }} ctx
   * @returns {boolean}
   */
  function riskAiPollShouldStop(ai, ctx) {
    if (!ai || typeof ai !== 'object') return false;
    const bag = /** @type {Record<string, unknown>} */ (ai);
    const status = typeof bag.status === 'string' ? bag.status : '';
    if (status !== 'done' && status !== 'error') return false;
    const want = String((ctx && ctx.riskAiId) || '');
    if (!want) return false;
    return String(bag.id || '') === want;
  }

  /**
   * AI 只跟正文；词库指纹是正文 + 勾选。
   * @param {unknown} fields
   * @returns {string}
   */
  function riskTextFingerprintFromFields(fields) {
    return JSON.stringify({ fields: Array.isArray(fields) ? fields : [] });
  }

  /**
   * 已存 AI 指纹可能是正文 `{fields}`，或旧版 `{fields, selection}`。
   * @param {string} stored
   * @param {string} textFp
   * @returns {boolean}
   */
  function riskAiFingerprintMatches(stored, textFp) {
    const have = String(stored || '');
    const want = String(textFp || '');
    if (!have || !want) return false;
    if (have === want) return true;
    try {
      const parsed = JSON.parse(have);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      if (!Object.prototype.hasOwnProperty.call(parsed, 'fields')) return false;
      return riskTextFingerprintFromFields(/** @type {{ fields?: unknown }} */ (parsed).fields) === want;
    } catch {
      return false;
    }
  }

  /**
   * @param {string} status
   * @returns {boolean}
   */
  function riskLexiconStatusReady(status) {
    return status === 'hits'
      || status === 'no_hit'
      || status === 'no_text'
      || status === 'need_library';
  }

  /**
   * 两页共用的危险词面板状态与动作。
   * 页面须提供：
   * - riskGetFields(): { id, text }[]
   * - riskReadField(fieldId): string
   * - riskWriteField(fieldId, text): void
   * - riskFieldElement(fieldId): HTMLInputElement | HTMLTextAreaElement | null
   * - riskMapHitToElement(hit): { el, start, end } | null  （话题映射到正文框时用）
   * 可选：
   * - riskPersistToDraft: true 时本机查词写草稿（笔记页）
   * - riskCanPersistDraft(): 是否有当前篇可写草稿
   * - riskAfterDraftPoll(data): 轮询 loadLatest 后回写页面其它字段
   */
  window.createRiskPanel = function createRiskPanel() {
    return {
      riskLibraries: [],
      riskSelection: {
        ad_extreme: true,
        offsite_traffic: true,
        banned: true,
        personal: true,
      },
      riskPersonalWords: [],
      riskPersonalDraft: '',
      riskPersonalSearch: '',
      riskPersonalUndo: null,
      riskPersonalUndoTimer: null,
      riskHits: [],
      riskStatus: '',
      riskMessage: '',
      riskCannotCount: 0,
      riskRewriteCount: 0,
      riskCheckedLibraries: [],
      riskSelectedHitId: '',
      riskBusy: false,
      riskAiBusy: false,
      riskAiRecovering: false,
      riskAiSuggestions: [],
      riskAiMessage: '',
      riskAiId: '',
      riskAiPollTimer: null,
      riskAiPollStartedAt: 0,
      riskAiNeedsRetry: false,
      riskIncludeAi: true,
      riskOptionsOpen: false,
      riskLoadingLineKey: 0,
      riskLoadingTimer: null,
      riskLoadingDelayTimer: null,
      riskLoadingVisible: false,
      riskLoadingDelayMs: 400,
      riskLoadingLines: [
        '正在查敏感词',
        '对照词库扫一遍',
        '再让 AI 帮看一眼',
        '马上标在文里',
        '再等一小会儿',
      ],
      riskLastFingerprint: '',
      riskLastAiFingerprint: '',
      riskUndo: null,
      riskPersistToDraft: false,
      riskPopover: {
        open: false,
        markId: '',
        style: '',
        draftReplacement: '',
      },
      riskPopoverScrollBound: false,
      riskPasteDrafts: {},
      riskAiOpenId: '',

      riskScopeText() {
        return '查标题、正文、话题；本机，不走模型；不含图片和生图提示词';
      },

      riskPasteScopeText() {
        return '查这段文字；本机，不走模型；不含图片和生图提示词';
      },

      riskSummaryText() {
        if (this.riskStatus === 'hits') {
          return `不能发 ${this.riskCannotCount} 处 / 要改口 ${this.riskRewriteCount} 处`;
        }
        return this.riskMessage || '';
      },

      riskInlineStatusText() {
        const n = this.riskVisibleInlineMarks().length;
        if (this.riskAiBusy || this.riskAiRecovering) {
          return this.riskAiStatusText();
        }
        if (this.riskAiMessage && !n) return this.riskAiMessage;
        if (n > 0) return `已标出 ${n} 处，在文里改`;
        if (this.riskStatus === 'hits') return this.riskSummaryText();
        return this.riskMessage || '';
      },

      riskVisibleInlineMarks() {
        const api = window.riskInlineMark;
        if (!api || typeof api.collectInlineMarks !== 'function') return [];
        const titleText = typeof this.riskReadField === 'function' ? this.riskReadField('title') : '';
        const bodyOnly = typeof this.riskReadField === 'function' ? this.riskReadField('body') : '';
        let bodyText = bodyOnly;
        if (typeof this.composeBody === 'function') {
          bodyText = this.composeBody();
        } else if (typeof this.bodyDraft === 'string') {
          bodyText = this.bodyDraft;
        }
        return api.collectInlineMarks({
          hits: this.riskHits,
          suggestions: this.riskAiSuggestions,
          titleText,
          bodyText,
          bodyOnly,
        });
      },

      /**
       * @param {'title' | 'body'} field
       * @returns {string}
       */
      riskOverlayHtml(field) {
        const api = window.riskInlineMark;
        if (!api || typeof api.buildOverlayHtml !== 'function') return '';
        const marks = this.riskVisibleInlineMarks().filter((item) => item.displayField === field);
        let text = '';
        if (field === 'title') {
          text = typeof this.riskReadField === 'function' ? this.riskReadField('title') : '';
        } else if (typeof this.composeBody === 'function') {
          text = this.composeBody();
        } else if (typeof this.riskReadField === 'function') {
          text = this.riskReadField('body');
        }
        if (!marks.length) return api.escapeHtml(text) || '&nbsp;';
        return api.buildOverlayHtml(text, marks);
      },

      riskHasInlineMarks() {
        return this.riskVisibleInlineMarks().length > 0;
      },

      /**
       * @param {string} id
       */
      riskToggleAiItem(id) {
        const key = String(id || '');
        this.riskAiOpenId = this.riskAiOpenId === key ? '' : key;
      },

      /**
       * @param {MouseEvent | FocusEvent} event
       */
      riskOpenMarkFromEvent(event) {
        const target = event && event.target;
        if (!target || typeof target.closest !== 'function') return;
        const el = target.closest('[data-risk-mark-id]');
        if (!el) return;
        const id = el.getAttribute('data-risk-mark-id');
        if (!id) return;
        event.preventDefault();
        event.stopPropagation();
        this.riskOpenMarkPopover(id, el);
      },

      /**
       * @param {string} markId
       * @param {Element} [anchor]
       */
      riskBindPopoverScrollClose() {
        if (this.riskPopoverScrollBound) return;
        this._riskPopoverOnScroll = () => {
          if (this.riskPopover && this.riskPopover.open) this.riskCloseMarkPopover();
        };
        document.addEventListener('scroll', this._riskPopoverOnScroll, true);
        this.riskPopoverScrollBound = true;
      },

      riskOpenMarkPopover(markId, anchor) {
        const id = String(markId || '');
        const mark = this.riskVisibleInlineMarks().find((item) => item.id === id);
        if (!mark) return;
        this.riskBindPopoverScrollClose();
        this.riskPopover.markId = id;
        this.riskPopover.open = true;
        this.riskPopover.draftReplacement = String(mark.replacement || '');
        if (anchor && typeof anchor.getBoundingClientRect === 'function') {
          const box = anchor.getBoundingClientRect();
          const left = Math.min(window.innerWidth - 288, Math.max(8, box.left));
          const top = Math.min(window.innerHeight - 12, box.bottom + 8);
          this.riskPopover.style = `left:${Math.round(left)}px;top:${Math.round(top)}px;`;
        } else {
          this.riskPopover.style = 'left:1rem;top:4rem;';
        }
      },

      riskCloseMarkPopover() {
        this.riskPopover.open = false;
        this.riskPopover.markId = '';
        this.riskPopover.style = '';
        this.riskPopover.draftReplacement = '';
      },

      riskMarkIsCannotSend(mark) {
        if (!mark) return false;
        if (mark.severity === '不能发') return true;
        const reason = String(mark.reason || '');
        return reason.includes('不能发') || String(mark.badge || '').includes('不能发');
      },

      riskPopoverCanReplace() {
        const mark = this.riskActiveMark();
        if (!mark || mark.uiState === 'applied') return false;
        if (this.riskMarkIsCannotSend(mark)) {
          return Boolean(String(this.riskPopover.draftReplacement || '').trim());
        }
        return Boolean(String(mark.replacement || '').trim());
      },

      riskActiveMark() {
        const id = this.riskPopover.markId;
        if (!id) return null;
        return this.riskVisibleInlineMarks().find((item) => item.id === id) || null;
      },

      riskScrollToFirstMark() {
        const first = this.riskVisibleInlineMarks()[0];
        if (!first) return;
        const safeId = String(first.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const el = document.querySelector(`[data-risk-mark-id="${safeId}"]`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          this.riskOpenMarkPopover(first.id, el);
          return;
        }
        if (first.source === 'lexicon') {
          const hit = (this.riskHits || []).find((row) => row.id === first.id);
          if (hit) this.riskLocateHit(hit);
        }
      },

      riskApplyActiveMark() {
        const mark = this.riskActiveMark();
        if (!mark) return;
        if (mark.uiState === 'applied') {
          this.riskUndoReplacement();
          this.riskCloseMarkPopover();
          return;
        }
        if (mark.source === 'ai') {
          const item = (this.riskAiSuggestions || []).find((row) => row.id === mark.id);
          if (item) this.riskApplyAiSuggestion(item);
          this.riskCloseMarkPopover();
          return;
        }
        const hit = (this.riskHits || []).find((row) => row.id === mark.id);
        if (!hit) {
          this.riskCloseMarkPopover();
          return;
        }
        const draft = String(this.riskPopover.draftReplacement || '').trim();
        if (this.riskMarkIsCannotSend(mark)) {
          if (!draft) {
            if (this.showToast) this.showToast('先写一句替换');
            return;
          }
          this.riskApplyReplacement(hit, draft);
        } else {
          if (!String(hit.replacement || '').trim()) return;
          this.riskApplyReplacement(hit);
        }
        this.riskCloseMarkPopover();
      },

      riskPopoverReplaceOnEnter(event) {
        if (!event || event.key !== 'Enter') return;
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        if (!this.riskPopoverCanReplace()) {
          if (this.showToast) this.showToast('先写一句替换');
          return;
        }
        this.riskApplyActiveMark();
      },

      riskDiscardActiveMark() {
        const id = this.riskPopover.markId;
        if (!id) return;
        const mark = this.riskActiveMark();
        if (!mark || mark.uiState === 'applied') return;
        // 不能发不允许放弃（假解决）
        if (this.riskMarkIsCannotSend(mark) && mark.source !== 'ai') return;
        if (mark.source === 'ai') {
          this.riskAiSuggestions = (this.riskAiSuggestions || []).map((row) => (
            row.id === id ? { ...row, uiState: 'discarded', status: row.status || '还没改' } : row
          ));
        } else {
          this.riskHits = (this.riskHits || []).map((row) => (
            row.id === id ? { ...row, uiState: 'discarded' } : row
          ));
        }
        if (this.riskUndo && this.riskUndo.hitId === id) this.riskUndo = null;
        this.riskCloseMarkPopover();
      },

      riskPasteDraftFor(hit) {
        if (!hit || !hit.id) return '';
        const bag = this.riskPasteDrafts && typeof this.riskPasteDrafts === 'object'
          ? this.riskPasteDrafts
          : {};
        if (Object.prototype.hasOwnProperty.call(bag, hit.id)) {
          return String(bag[hit.id] || '');
        }
        return String(hit.replacement || '');
      },

      riskSetPasteDraft(hit, value) {
        if (!hit || !hit.id) return;
        this.riskPasteDrafts = {
          ...(this.riskPasteDrafts || {}),
          [hit.id]: String(value == null ? '' : value),
        };
      },

      riskApplyPasteHit(hit) {
        if (!hit || hit.uiState === 'applied') return;
        if (hit.severity === '不能发') {
          const draft = String(this.riskPasteDraftFor(hit) || '').trim();
          if (!draft) {
            if (this.showToast) this.showToast('先写一句替换');
            return;
          }
          this.riskApplyReplacement(hit, draft);
          return;
        }
        if (!String(hit.replacement || '').trim()) return;
        this.riskApplyReplacement(hit);
      },

      riskUndoActiveMark() {
        const mark = this.riskActiveMark();
        if (!mark || mark.uiState !== 'applied') return;
        if (this.riskUndo && this.riskUndo.hitId === mark.id) {
          this.riskUndoReplacement();
          this.riskCloseMarkPopover();
          return;
        }
        // undo 丢了时用 originalText 兜底改回原词
        const before = String(mark.originalText || '').trim()
          ? String(mark.originalText)
          : '';
        if (!before || !mark.fieldId) {
          this.riskCloseMarkPopover();
          return;
        }
        const current = typeof this.riskReadField === 'function' ? this.riskReadField(mark.fieldId) : '';
        const after = String(mark.text || '');
        const start = Number(mark.start);
        const end = Number(mark.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          this.riskCloseMarkPopover();
          return;
        }
        if (String(current).slice(start, end) !== after) {
          if (this.showToast) this.showToast('这处已经变了');
          this.riskCloseMarkPopover();
          return;
        }
        this.riskUndo = {
          kind: mark.source === 'ai' ? 'ai' : 'lexicon',
          hitId: mark.id,
          fieldId: mark.fieldId,
          start,
          before,
          after,
          endAfter: end,
        };
        this.riskUndoReplacement();
        this.riskCloseMarkPopover();
      },

      riskAiStatusText() {
        if (this.riskAiNeedsRetry) return this.riskAiMessage || '等太久了，点「查危险词」再试一次';
        if (this.riskAiRecovering) return '正在取回 AI 结果…';
        if (this.riskAiBusy) return '正在用 AI 看一遍…';
        return '';
      },

      riskIsChecking() {
        return Boolean(this.riskBusy || this.riskAiBusy || this.riskAiRecovering);
      },

      riskLoadingLineText() {
        const lines = Array.isArray(this.riskLoadingLines) ? this.riskLoadingLines : [];
        if (!lines.length) return '正在查敏感词';
        const idx = Number(this.riskLoadingLineKey) || 0;
        return lines[idx % lines.length];
      },

      riskStartLoadingLines() {
        if (this.riskLoadingTimer) {
          clearInterval(this.riskLoadingTimer);
          this.riskLoadingTimer = null;
        }
        this.riskLoadingLineKey = 0;
        if (typeof window !== 'undefined'
          && window.matchMedia
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          return;
        }
        this.riskLoadingTimer = setInterval(() => {
          const n = Array.isArray(this.riskLoadingLines) ? this.riskLoadingLines.length : 1;
          this.riskLoadingLineKey = ((Number(this.riskLoadingLineKey) || 0) + 1) % Math.max(1, n);
        }, 2000);
      },

      /** 延迟展示 Lottie，避免指纹未变时连点闪一下 */
      riskScheduleLoadingShow() {
        if (this.riskLoadingDelayTimer) {
          clearTimeout(this.riskLoadingDelayTimer);
          this.riskLoadingDelayTimer = null;
        }
        const delay = Number(this.riskLoadingDelayMs);
        const ms = Number.isFinite(delay) && delay >= 0 ? delay : 400;
        this.riskLoadingDelayTimer = setTimeout(() => {
          this.riskLoadingDelayTimer = null;
          if (!this.riskIsChecking()) return;
          this.riskLoadingVisible = true;
          this.riskStartLoadingLines();
        }, ms);
      },

      riskHideLoading() {
        if (this.riskLoadingDelayTimer) {
          clearTimeout(this.riskLoadingDelayTimer);
          this.riskLoadingDelayTimer = null;
        }
        if (this.riskLoadingTimer) {
          clearInterval(this.riskLoadingTimer);
          this.riskLoadingTimer = null;
        }
        this.riskLoadingVisible = false;
      },

      riskToggleOptions() {
        this.riskOptionsOpen = !this.riskOptionsOpen;
      },

      /**
       * 词库缓存是否命中（正文 + 勾选）。
       * @param {string} [lexiconFp]
       * @returns {boolean}
       */
      riskLexiconCacheHit(lexiconFp) {
        const fp = lexiconFp != null ? lexiconFp : this.riskFingerprint();
        return Boolean(
          fp
          && fp === this.riskLastFingerprint
          && riskLexiconStatusReady(this.riskStatus),
        );
      },

      /**
       * AI 缓存是否命中（只跟正文；含「没有新的建议」）。
       * @param {string} [textFp]
       * @returns {boolean}
       */
      riskAiCacheHit(textFp) {
        const fp = textFp != null ? textFp : this.riskTextFingerprint();
        if (!riskAiFingerprintMatches(this.riskLastAiFingerprint, fp)) return false;
        if (Array.isArray(this.riskAiSuggestions) && this.riskAiSuggestions.length) return true;
        return this.riskAiMessage === 'AI 没有新的建议';
      },

      /** 一键：本机查危险词；勾选「AI 查词」时接着跑 AI。勾选本身不查。 */
      async riskRunCheck() {
        if (this.riskBusy) return;
        if (this.riskAiBusy && !this.riskAiNeedsRetry) return;
        const force = Boolean(this.riskAiNeedsRetry);
        this.riskAiNeedsRetry = false;
        this.riskOptionsOpen = false;

        const lexiconFp = this.riskFingerprint();
        const textFp = this.riskTextFingerprint();
        const lexiconReady = !force && this.riskLexiconCacheHit(lexiconFp);
        const aiReady = !force && this.riskAiCacheHit(textFp);

        if (lexiconReady && (!this.riskIncludeAi || aiReady)) {
          if (this.showToast) {
            this.showToast('没有变化，无需重复查询', { type: 'success' });
          }
          return;
        }

        this.riskScheduleLoadingShow();
        try {
          if (!lexiconReady) {
            await this.riskCheck({ force: true });
          }
          if (this.riskIncludeAi) {
            if (!aiReady) await this.riskReviewWithAi({ force });
          } else if (!riskAiFingerprintMatches(this.riskLastAiFingerprint, textFp)) {
            this.riskAiSuggestions = [];
            this.riskAiMessage = '';
            this.riskLastAiFingerprint = '';
            this.riskCloseMarkPopover();
          }
        } finally {
          if (!this.riskAiBusy && !this.riskAiRecovering) this.riskHideLoading();
        }
      },

      riskIsReplayableMessage(message) {
        const text = String(message || '').trim();
        if (!text) return false;
        const lower = text.toLowerCase();
        return lower.includes('fetch failed')
          || lower.includes('network_error')
          || text.includes('NETWORK_ERROR')
          || text.includes('IDEMPOTENCY_CONFLICT')
          || text.includes('相同幂等键')
          || text.includes('同 key 正在处理')
          || text.startsWith('无法连接')
          || text.includes('网关读取超时')
          || text.includes('请再点一次取回')
          || text.includes('不会重复扣费')
          || text.includes('取回失败');
      },

      riskFormatAiErrorMessage(message) {
        const text = String(message || '').trim();
        if (!text) return 'AI 没有看完';
        if (this.riskIsReplayableMessage(text)) {
          if (text.includes('请再点一次取回')) return text;
          return '取回失败，再点「查危险词」（不会重复扣费）';
        }
        return text;
      },

      riskVisiblePersonalWords() {
        const q = String(this.riskPersonalSearch || '').trim().toLowerCase();
        const list = Array.isArray(this.riskPersonalWords) ? this.riskPersonalWords : [];
        if (!q) return list;
        return list.filter((item) => String(item.text || '').toLowerCase().includes(q));
      },

      riskLibraryDisabled(lib) {
        return Boolean(lib && lib.id === 'personal' && lib.empty);
      },

      /** 词库键：正文 + 勾选 */
      riskFingerprint() {
        const fields = typeof this.riskGetFields === 'function' ? this.riskGetFields() : [];
        return JSON.stringify({
          fields,
          selection: this.riskSelection,
        });
      },

      /** AI 键：只有正文（标题 / 正文 / 话题） */
      riskTextFingerprint() {
        const fields = typeof this.riskGetFields === 'function' ? this.riskGetFields() : [];
        return riskTextFingerprintFromFields(fields);
      },

      riskCanWriteDraft() {
        if (!this.riskPersistToDraft) return false;
        if (typeof this.riskCanPersistDraft === 'function') return Boolean(this.riskCanPersistDraft());
        return true;
      },

      async riskLoadSetup() {
        if (!window.studioHost || !window.studioHost.ready) return;
        const data = await window.studioHost.call('getRiskSetup');
        if (!data || data.ok === false) {
          if (data && data.message && this.showToast) this.showToast(data.message);
          return;
        }
        this.riskApplySetup(data);
      },

      riskApplySetup(data) {
        if (!data) return;
        if (data.selection && typeof data.selection === 'object') {
          this.riskSelection = {
            ad_extreme: Boolean(data.selection.ad_extreme),
            offsite_traffic: Boolean(data.selection.offsite_traffic),
            banned: Boolean(data.selection.banned),
            personal: Boolean(data.selection.personal),
          };
        }
        this.riskLibraries = Array.isArray(data.libraries) ? data.libraries : [];
        this.riskPersonalWords = Array.isArray(data.personalWords) ? data.personalWords : [];
      },

      async riskToggleLibrary(id, checked) {
        const key = String(id || '').trim();
        if (!key || !(key in this.riskSelection)) return;
        if (key === 'personal') {
          const lib = (this.riskLibraries || []).find((item) => item.id === 'personal');
          if (lib && lib.empty) return;
        }
        this.riskSelection = { ...this.riskSelection, [key]: Boolean(checked) };
        const data = await window.studioHost.call('setRiskSelection', {
          selection: this.riskSelection,
        });
        if (data && data.ok === false) {
          if (this.showToast) this.showToast(data.message || '没有保存勾选');
          await this.riskLoadSetup();
          return;
        }
        this.riskApplySetup(data);
        // 勾选只记偏好；点「查危险词」再按新勾选查，不清现有词库 / AI 标
      },

      /**
       * @param {Record<string, unknown>} data
       * @param {string} [fingerprint]
       */
      riskApplyCheckResult(data, fingerprint) {
        if (!data) return;
        this.riskStatus = String(data.status || '');
        this.riskMessage = String(data.message || '');
        this.riskCannotCount = Number(data.cannotCount) || 0;
        this.riskRewriteCount = Number(data.rewriteCount) || 0;
        this.riskCheckedLibraries = Array.isArray(data.libraries) ? data.libraries : [];
        const prevHits = this.riskHits || [];
        const nextHits = Array.isArray(data.hits) ? data.hits : [];
        const api = window.riskInlineMark;
        this.riskHits = api && typeof api.mergeHitUiState === 'function'
          ? api.mergeHitUiState(prevHits, nextHits)
          : nextHits.map((hit) => ({ ...hit, uiState: hit.uiState || 'pending' }));
        this.riskPasteDrafts = {};
        this.riskSelectedHitId = '';
        if (fingerprint != null) this.riskLastFingerprint = fingerprint;
        else if (typeof data.fingerprint === 'string') this.riskLastFingerprint = data.fingerprint;
      },

      /**
       * 从草稿 risk 块回填；词库按正文+勾选，AI 只按正文。
       * @param {unknown} risk
       * @param {string} [fingerprint] 词库指纹；缺省用当前 riskFingerprint()
       */
      riskApplyFromDraft(risk, fingerprint) {
        if (!risk || typeof risk !== 'object') return false;
        const bag = /** @type {Record<string, unknown>} */ (risk);
        const check = bag.check && typeof bag.check === 'object'
          ? /** @type {Record<string, unknown>} */ (bag.check)
          : null;
        const lexiconFp = fingerprint != null ? fingerprint : this.riskFingerprint();
        const textFp = this.riskTextFingerprint();
        let applied = false;
        if (
          check
          && typeof check.fingerprint === 'string'
          && check.fingerprint
          && check.fingerprint === lexiconFp
        ) {
          this.riskApplyCheckResult(check, lexiconFp);
          applied = true;
        }
        const ai = bag.ai && typeof bag.ai === 'object'
          ? /** @type {Record<string, unknown>} */ (bag.ai)
          : null;
        if (ai) {
          this.riskAiId = typeof ai.id === 'string' ? ai.id : '';
          const aiFp = typeof ai.fingerprint === 'string' ? ai.fingerprint : '';
          const aiMatches = riskAiFingerprintMatches(aiFp, textFp);
          if (ai.status === 'running' && aiMatches) {
            this.riskAiBusy = true;
            this.riskAiRecovering = true;
            this.riskAiMessage = '正在取回 AI 结果…';
            this.riskStartAiPoll();
            applied = true;
          } else if (ai.status === 'done' && aiMatches) {
            this.riskStopAiPoll();
            this.riskAiBusy = false;
            this.riskAiRecovering = false;
            this.riskAiSuggestions = Array.isArray(ai.suggestions)
              ? ai.suggestions.map((item) => ({
                ...item,
                status: item.status || '还没改',
                uiState: item.uiState || (item.status === '已改这一处' ? 'applied' : 'pending'),
              }))
              : [];
            this.riskLastAiFingerprint = textFp;
            this.riskAiMessage = this.riskAiSuggestions.length ? '' : 'AI 没有新的建议';
            applied = true;
          } else if (ai.status === 'error' && aiMatches) {
            this.riskStopAiPoll();
            this.riskAiBusy = false;
            this.riskAiRecovering = false;
            this.riskAiSuggestions = [];
            this.riskLastAiFingerprint = '';
            this.riskAiMessage = this.riskFormatAiErrorMessage(
              typeof ai.error === 'string' ? ai.error : '',
            );
            applied = true;
          }
        }
        return applied;
      },

      /**
       * 有草稿且词库指纹变了才重查；已有匹配结果则跳过。只更新词库，不因勾选重跑 AI。
       * @param {{ force?: boolean }} [opts]
       */
      async riskEnsureAutoCheck(opts) {
        if (!window.studioHost || !window.studioHost.ready) return;
        if (!this.riskCanWriteDraft()) return;
        if (this.riskBusy) return;
        const force = Boolean(opts && opts.force);
        if (!force && this.riskLexiconCacheHit()) return;
        await this.riskCheck({ force: true, persist: true });
      },

      /**
       * @param {{ force?: boolean; persist?: boolean }} [opts]
       */
      async riskCheck(opts) {
        if (this.riskBusy) return;
        const force = Boolean(opts && opts.force);
        const persist = opts && opts.persist != null
          ? Boolean(opts.persist)
          : this.riskCanWriteDraft();
        const fingerprint = this.riskFingerprint();
        const textFp = this.riskTextFingerprint();
        if (!force && this.riskLexiconCacheHit(fingerprint)) {
          return;
        }
        this.riskBusy = true;
        // 本机重查不清空正在跑的 AI；只清正文已变、对不上的展示
        if (this.riskLastAiFingerprint && !riskAiFingerprintMatches(this.riskLastAiFingerprint, textFp)) {
          this.riskAiSuggestions = [];
          this.riskAiMessage = '';
          this.riskCloseMarkPopover();
        }
        try {
          const fields = typeof this.riskGetFields === 'function' ? this.riskGetFields() : [];
          const libraryIds = Object.keys(this.riskSelection).filter((id) => this.riskSelection[id]);
          const method = persist ? 'saveRiskCheck' : 'checkRisk';
          const data = await window.studioHost.call(method, { fields, libraryIds, fingerprint });
          if (!data || data.ok === false) {
            if (data && data.silenced) return;
            if (this.showToast) this.showToast((data && data.message) || '查危险词失败');
            return;
          }
          const prevUndo = this.riskUndo;
          this.riskApplyCheckResult(data, fingerprint);
          // 合并后若绿标仍在，保留撤回；否则清掉
          if (
            prevUndo
            && prevUndo.hitId
            && (this.riskHits || []).some((row) => row.id === prevUndo.hitId && row.uiState === 'applied')
          ) {
            this.riskUndo = prevUndo;
          } else {
            this.riskUndo = null;
          }
          if (data.risk) this.riskApplyFromDraft(data.risk, fingerprint);
        } finally {
          this.riskBusy = false;
        }
      },

      riskLocateHit(hit) {
        if (!hit) return;
        this.riskSelectedHitId = hit.id;
        const mapped = typeof this.riskMapHitToElement === 'function'
          ? this.riskMapHitToElement(hit)
          : null;
        const el = mapped && mapped.el
          ? mapped.el
          : (typeof this.riskFieldElement === 'function' ? this.riskFieldElement(hit.fieldId) : null);
        if (!el) return;
        const start = mapped ? mapped.start : hit.start;
        const end = mapped ? mapped.end : hit.end;
        try {
          el.focus({ preventScroll: false });
          if (typeof el.setSelectionRange === 'function') {
            el.setSelectionRange(start, end);
          }
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch {
          try {
            el.scrollIntoView({ block: 'nearest' });
          } catch {
            // ignore
          }
        }
      },

      riskApplyReplacement(hit, replacementOverride) {
        if (!hit || hit.uiState === 'applied') return;
        const replacement = String(
          replacementOverride != null ? replacementOverride : hit.replacement || ''
        ).trim();
        if (!replacement) return;
        const fieldId = hit.fieldId;
        const current = typeof this.riskReadField === 'function' ? this.riskReadField(fieldId) : '';
        const api = window.riskInlineMark;
        const range = api && typeof api.resolveMarkRange === 'function'
          ? api.resolveMarkRange(current, hit.start, hit.end, hit.text)
          : (String(current).slice(hit.start, hit.end) === hit.text
            ? { start: hit.start, end: hit.end }
            : null);
        if (!range) {
          if (this.showToast) this.showToast('这处已经变了');
          return;
        }
        const next = String(current).slice(0, range.start) + replacement + String(current).slice(range.end);
        const endAfter = range.start + replacement.length;
        this.riskUndo = {
          kind: 'lexicon',
          hitId: hit.id,
          fieldId,
          start: range.start,
          before: hit.text,
          after: replacement,
          endAfter,
        };
        if (typeof this.riskWriteField === 'function') this.riskWriteField(fieldId, next);
        this.riskHits = (this.riskHits || []).map((row) => (
          row.id === hit.id
            ? {
              ...row,
              uiState: 'applied',
              replacement,
              originalText: row.originalText || hit.text,
              start: range.start,
              end: endAfter,
            }
            : row
        ));
        // 对齐词库指纹，避免 persist→自动重查冲掉绿标；AI 仍按真实正文决定是否重跑
        this.riskLastFingerprint = this.riskFingerprint();
      },

      riskUndoReplacement() {
        const undo = this.riskUndo;
        if (!undo) return;
        const current = typeof this.riskReadField === 'function' ? this.riskReadField(undo.fieldId) : '';
        const slice = String(current).slice(undo.start, undo.endAfter);
        if (slice !== undo.after) {
          if (this.showToast) this.showToast('这处已经变了');
          this.riskUndo = null;
          return;
        }
        const next = String(current).slice(0, undo.start) + undo.before + String(current).slice(undo.endAfter);
        if (typeof this.riskWriteField === 'function') this.riskWriteField(undo.fieldId, next);
        if (undo.kind === 'ai') {
          this.riskAiSuggestions = (this.riskAiSuggestions || []).map((row) => (
            row.id === undo.hitId
              ? {
                ...row,
                status: '还没改',
                uiState: 'pending',
                start: undo.start,
                end: undo.start + String(undo.before).length,
              }
              : row
          ));
        } else if (undo.hitId) {
          this.riskHits = (this.riskHits || []).map((row) => (
            row.id === undo.hitId
              ? {
                ...row,
                uiState: 'pending',
                start: undo.start,
                end: undo.start + String(undo.before).length,
              }
              : row
          ));
        }
        this.riskUndo = null;
        this.riskLastFingerprint = this.riskFingerprint();
      },

      riskStopAiPoll() {
        if (this.riskAiPollTimer) {
          clearInterval(this.riskAiPollTimer);
          this.riskAiPollTimer = null;
        }
      },

      riskStartAiPoll() {
        if (this.riskAiPollTimer) return;
        this.riskAiPollStartedAt = Date.now();
        this.riskAiNeedsRetry = false;
        const wait = window.riskAiPollWait;
        const interval = wait && Number(wait.POLL_INTERVAL_MS) > 0
          ? Number(wait.POLL_INTERVAL_MS)
          : 10000;
        this.riskAiPollTimer = setInterval(() => {
          void this.riskPollAiOnce();
        }, interval);
        void this.riskPollAiOnce();
      },

      async riskPollAiOnce() {
        if (!window.studioHost || !window.studioHost.ready) return;
        if (!this.riskCanWriteDraft()) return;
        const wait = window.riskAiPollWait;
        if (wait && typeof wait.timing === 'function' && this.riskAiPollStartedAt) {
          const t = wait.timing(Date.now(), this.riskAiPollStartedAt);
          if (t.shouldStopWaiting) {
            this.riskStopAiPoll();
            this.riskAiBusy = false;
            this.riskAiRecovering = false;
            this.riskAiNeedsRetry = true;
            this.riskAiMessage = '等太久了，点「查危险词」再试一次';
            this.riskHideLoading();
            return;
          }
        }
        try {
          const data = await window.studioHost.call('loadLatest');
          if (!data || data.ok === false) return;
          if (typeof this.riskAfterDraftPoll === 'function') {
            this.riskAfterDraftPoll(data);
          }
          const lexiconFp = this.riskFingerprint();
          const textFp = this.riskTextFingerprint();
          if (data.risk) this.riskApplyFromDraft(data.risk, lexiconFp);
          const ai = data.risk && data.risk.ai;
          // 只认本轮 id 的终态；旧 done/error 或 idle 继续等
          if (!riskAiPollShouldStop(ai, { riskAiId: this.riskAiId })) return;
          const aiFp = ai && typeof ai.fingerprint === 'string' ? ai.fingerprint : '';
          if (aiFp && !riskAiFingerprintMatches(aiFp, textFp)) {
            // 本轮已结束但正文指纹已变：不展示旧建议，给可操作文案
            this.riskAiSuggestions = [];
            this.riskLastAiFingerprint = '';
            this.riskAiMessage = '正文已改，请再点「查危险词」';
          }
          this.riskStopAiPoll();
          this.riskAiBusy = false;
          this.riskAiRecovering = false;
          this.riskAiNeedsRetry = false;
          this.riskHideLoading();
        } catch {
          // 网络抖一下继续轮询，等到超时窗口再提示重试
          this.riskAiRecovering = true;
          this.riskAiMessage = '正在取回 AI 结果…';
        }
      },

      /**
       * @param {{ force?: boolean }} [opts]
       */
      async riskReviewWithAi(opts) {
        if (this.riskBusy) return;
        const force = Boolean(opts && opts.force);
        const fingerprint = this.riskTextFingerprint();

        // 已有 running：只取回，不新开
        if (this.riskAiBusy && this.riskAiId && this.riskCanWriteDraft()) {
          this.riskAiRecovering = true;
          this.riskAiMessage = '正在取回 AI 结果…';
          this.riskStartAiPoll();
          return;
        }
        if (this.riskAiBusy) return;

        if (!force && this.riskAiCacheHit(fingerprint)) {
          return;
        }

        this.riskAiBusy = true;
        this.riskAiRecovering = false;
        this.riskAiMessage = '';
        this.riskCloseMarkPopover();
        try {
          const fields = typeof this.riskGetFields === 'function' ? this.riskGetFields() : [];
          const data = await window.studioHost.call('reviewRiskWithAi', {
            fields,
            hits: this.riskHits,
            fingerprint,
          });
          if (!data || data.ok === false) {
            if (data && data.silenced) {
              this.riskAiMessage = '';
              this.riskAiBusy = false;
              this.riskHideLoading();
              return;
            }
            // 网关抖 / 客户端断：有草稿则轮询取回，不当终态死字
            const msg = (data && data.message) || 'AI 没有看完';
            if (this.riskCanWriteDraft()) {
              this.riskAiRecovering = true;
              this.riskAiMessage = '正在取回 AI 结果…';
              this.riskStartAiPoll();
              return;
            }
            this.riskAiMessage = this.riskFormatAiErrorMessage(msg);
            this.riskAiBusy = false;
            this.riskLastAiFingerprint = '';
            this.riskHideLoading();
            return;
          }

          if (data.accepted) {
            this.riskAiId = String(data.riskAiId || (data.risk && data.risk.ai && data.risk.ai.id) || '');
            this.riskAiRecovering = false;
            this.riskAiMessage = '';
            if (data.risk) this.riskApplyFromDraft(data.risk, this.riskFingerprint());
            this.riskStartAiPoll();
            return;
          }

          // 无草稿同步路径（粘贴页）
          this.riskAiSuggestions = Array.isArray(data.suggestions) ? data.suggestions.map((item) => ({
            ...item,
            status: item.status || '还没改',
            uiState: item.uiState || 'pending',
          })) : [];
          this.riskAiId = String(data.riskAiId || '');
          this.riskLastAiFingerprint = fingerprint;
          this.riskAiBusy = false;
          if (!this.riskAiSuggestions.length) {
            this.riskAiMessage = 'AI 没有新的建议';
          }
          this.riskHideLoading();
        } catch (err) {
          if (this.riskCanWriteDraft()) {
            this.riskAiRecovering = true;
            this.riskAiMessage = '正在取回 AI 结果…';
            this.riskStartAiPoll();
            return;
          }
          this.riskAiBusy = false;
          this.riskLastAiFingerprint = '';
          this.riskAiMessage = this.riskFormatAiErrorMessage(
            (err && err.message) || 'AI 没有看完',
          );
          this.riskHideLoading();
        }
      },

      riskApplyAiSuggestion(item) {
        if (!item || item.uiState === 'applied' || item.status === '已改这一处') return;
        const current = typeof this.riskReadField === 'function' ? this.riskReadField(item.fieldId) : '';
        const api = window.riskInlineMark;
        const range = api && typeof api.resolveMarkRange === 'function'
          ? api.resolveMarkRange(current, item.start, item.end, item.text)
          : (String(current).slice(item.start, item.end) === item.text
            ? { start: item.start, end: item.end }
            : null);
        if (!range) {
          if (this.showToast) this.showToast('这处已经变了');
          return;
        }
        const next = String(current).slice(0, range.start) + item.replacement + String(current).slice(range.end);
        const endAfter = range.start + String(item.replacement).length;
        this.riskUndo = {
          kind: 'ai',
          hitId: item.id,
          fieldId: item.fieldId,
          start: range.start,
          before: item.text,
          after: item.replacement,
          endAfter,
        };
        if (typeof this.riskWriteField === 'function') this.riskWriteField(item.fieldId, next);
        this.riskAiSuggestions = (this.riskAiSuggestions || []).map((row) => (
          row.id === item.id
            ? {
              ...row,
              status: '已改这一处',
              uiState: 'applied',
              originalText: row.originalText || item.text,
              start: range.start,
              end: endAfter,
            }
            : row
        ));
        this.riskLastFingerprint = this.riskFingerprint();
      },

      async riskAddPersonalWords() {
        const text = String(this.riskPersonalDraft || '');
        if (!text.trim()) return;
        const data = await window.studioHost.call('addPersonalRiskWords', { text });
        if (!data || data.ok === false) {
          if (this.showToast) this.showToast((data && data.message) || '没有加进去');
          return;
        }
        this.riskApplySetup(data);
        this.riskPersonalDraft = '';
        if (Array.isArray(data.rejected) && data.rejected.length && this.showToast) {
          const lines = data.rejected.map((item) => `第 ${item.line} 行`).join('、');
          this.showToast(`${lines}超过 50 字，未加入`);
        } else if (this.showToast) {
          this.showToast('已加入个人违禁词', { type: 'success' });
        }
      },

      async riskDeletePersonalWord(word) {
        const text = word && word.text ? word.text : String(word || '');
        if (!text) return;
        const data = await window.studioHost.call('deletePersonalRiskWord', { text });
        if (!data || data.ok === false) {
          if (this.showToast) this.showToast((data && data.message) || '没有删掉');
          return;
        }
        this.riskApplySetup(data);
        this.riskPersonalUndo = data.removed || { text, severity: '要改口' };
        if (this.riskPersonalUndoTimer) clearTimeout(this.riskPersonalUndoTimer);
        this.riskPersonalUndoTimer = setTimeout(() => {
          this.riskPersonalUndo = null;
          this.riskPersonalUndoTimer = null;
        }, 8000);
      },

      async riskUndoPersonalDelete() {
        const item = this.riskPersonalUndo;
        if (!item || !item.text) return;
        const data = await window.studioHost.call('addPersonalRiskWords', {
          words: [{ text: item.text, severity: item.severity || '要改口' }],
        });
        if (!data || data.ok === false) {
          if (this.showToast) this.showToast((data && data.message) || '没有加回来');
          return;
        }
        this.riskApplySetup(data);
        this.riskPersonalUndo = null;
        if (this.riskPersonalUndoTimer) {
          clearTimeout(this.riskPersonalUndoTimer);
          this.riskPersonalUndoTimer = null;
        }
      },
    };
  };
}());
