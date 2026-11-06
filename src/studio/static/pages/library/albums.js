function libraryAlbums() {
  const colors = () => window.promptColors || {
    renderPromptHtml: () => '',
    serializePromptDom: () => '',
    replaceHexAt: (text) => String(text || ''),
    createImageSampler: () => ({ sampleAt: () => null, drawLoupe: () => {} }),
    normalizeHex: () => '',
  };

  /** @type {{ sampleAt: Function; drawLoupe: Function } | null} */
  let eyedropperSampler = null;

  const LEARNING_LINES = [
    '正在检查这张图能否用于生图',
    '正在看这张图',
    '在看配色和排版',
    '在整理这套风格',
    '马上出一套草稿',
  ];
  const LEARNING_LINE_MS = 3500;

  /** @type {ReturnType<typeof setInterval> | null} */
  let learningTimer = null;

  return {
    hostReady: window.studioHost.ready,
    albums: [],
    albumSamples: {},
    error: '',
    learning: false,
    learningLineIndex: 0,
    learningLineKey: 0,
    committing: false,
    savingDetail: false,
    deleting: false,

    detailOpen: false,
    detail: null,
    detailSample: '',
    detailPrompt: '',
    detailSavedPrompt: '',

    draftOpen: false,
    draft: null,
    draftPrompt: '',

    deleteOpen: false,
    deleteTarget: null,

    unsavedOpen: false,

    eyedropper: {
      open: false,
      target: '',
      occurrence: -1,
      imageUrl: '',
      loupeX: 0,
      loupeY: 0,
      loupeVisible: false,
      previewHex: '',
    },

    async call(method, payload) {
      return window.studioHost.call(method, payload);
    },

    emitBusy() {
      this.$dispatch('library-albums-busy', this.learning || this.committing || this.savingDetail);
    },

    get learningLineText() {
      return LEARNING_LINES[this.learningLineIndex] || LEARNING_LINES[0];
    },

    draftRewriteSummary() {
      const list = this.draft && Array.isArray(this.draft.promptRewrites)
        ? this.draft.promptRewrites
        : [];
      if (list.length === 0) return '';
      const parts = list.slice(0, 4).map((item) => {
        const match = item && typeof item.match === 'string' ? item.match : '';
        const replace = item && typeof item.replace === 'string' ? item.replace : '';
        if (!match) return '';
        return replace ? `${match} → ${replace}` : `删掉「${match}」`;
      }).filter(Boolean);
      if (parts.length === 0) return '';
      const more = list.length > 4 ? ` 等 ${list.length} 处` : '';
      return `已改写：${parts.join('；')}${more}`;
    },

    startLearningCopy() {
      this.stopLearningCopy();
      this.learningLineIndex = 0;
      this.learningLineKey += 1;
      learningTimer = setInterval(() => {
        this.learningLineIndex = (this.learningLineIndex + 1) % LEARNING_LINES.length;
        this.learningLineKey += 1;
      }, LEARNING_LINE_MS);
    },

    stopLearningCopy() {
      if (learningTimer != null) {
        clearInterval(learningTimer);
        learningTimer = null;
      }
    },

    albumSamplePreview(album) {
      if (!album || !album.id) return '';
      return this.albumSamples[album.id] || '';
    },

    detailEditable() {
      return Boolean(this.detail && this.detail.editable);
    },

    detailDirty() {
      if (!this.detailEditable()) return false;
      return String(this.detailPrompt || '') !== String(this.detailSavedPrompt || '');
    },

    /**
     * @param {'draft' | 'detail'} which
     * @returns {HTMLElement | null}
     */
    promptEditorEl(which) {
      if (!this.$refs) return null;
      return which === 'draft' ? this.$refs.draftPromptEditor : this.$refs.detailPromptEditor;
    },

    /**
     * @param {'draft' | 'detail'} which
     */
    syncPromptEditor(which) {
      const el = this.promptEditorEl(which);
      if (!el) return;
      const text = which === 'draft' ? this.draftPrompt : this.detailPrompt;
      const disabled = which === 'detail' && !this.detailEditable();
      el.innerHTML = colors().renderPromptHtml(text, { disabled });
    },

    /**
     * @param {'draft' | 'detail'} which
     */
    pullPromptFromEditor(which) {
      const el = this.promptEditorEl(which);
      if (!el) return;
      const text = colors().serializePromptDom(el);
      if (which === 'draft') {
        this.draftPrompt = text;
        if (this.draft) this.draft.promptTemplate = text;
      } else {
        this.detailPrompt = text;
      }
    },

    /**
     * @param {'draft' | 'detail'} which
     */
    onPromptEditorInput(which) {
      this.pullPromptFromEditor(which);
    },

    /**
     * @param {'draft' | 'detail'} which
     */
    onPromptEditorBlur(which) {
      this.pullPromptFromEditor(which);
      this.syncPromptEditor(which);
    },

    /**
     * @param {MouseEvent} event
     * @param {'draft' | 'detail'} which
     */
    onPromptEditorClick(event, which) {
      const target = event.target;
      if (!target || !target.closest) return;
      const btn = target.closest('button[data-color-index]');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled) return;
      if (which === 'detail' && !this.detailEditable()) return;
      if (which === 'detail' && !this.detailSample) {
        this.error = '没有可吸色的样图';
        if (this.error) this.$dispatch('library-toast', this.error);
        return;
      }
      const index = Number(btn.getAttribute('data-color-index'));
      if (!Number.isInteger(index) || index < 0) return;
      this.pullPromptFromEditor(which);
      this.openEyedropper(which, index);
    },

    async init() {
      this.$watch('learning', (on) => {
        this.emitBusy();
        if (on) this.startLearningCopy();
        else this.stopLearningCopy();
      });
      this.$watch('committing', () => this.emitBusy());
      this.$watch('savingDetail', () => this.emitBusy());
      this.emitBusy();
      if (!this.hostReady) return;
      await this.refresh();
    },

    async refresh() {
      this.error = '';
      const data = await this.call('listAlbums');
      if (!data || data.ok === false || !Array.isArray(data.albums)) {
        this.albums = [];
        this.error = (data && data.message) || '没有读到风格列表';
        if (this.error) this.$dispatch('library-toast', this.error);
        return;
      }
      this.albums = data.albums;
      await this.loadSamples();
    },

    async loadSamples() {
      const next = { ...this.albumSamples };
      let changed = false;
      for (const album of this.albums) {
        if (!album.hasSample || next[album.id]) continue;
        const result = await this.call('previewAlbumSample', { id: album.id });
        if (result && result.ok && result.dataUrl) {
          next[album.id] = result.dataUrl;
          changed = true;
        }
      }
      if (changed) this.albumSamples = next;
    },

    async openDetail(album) {
      if (!album || !album.id || this.learning || this.committing || this.savingDetail) return;
      this.error = '';
      const detail = await this.call('getAlbumDetail', { id: album.id });
      if (!detail || detail.ok === false) {
        this.error = (detail && detail.message) || '没有读到这一册';
        if (this.error) this.$dispatch('library-toast', this.error);
        return;
      }
      this.detail = detail;
      this.detailPrompt = String(detail.promptTemplate || '');
      this.detailSavedPrompt = this.detailPrompt;
      this.detailSample = this.albumSamplePreview(album) || '';
      if (!this.detailSample && detail.hasSample) {
        const sample = await this.call('previewAlbumSample', { id: album.id });
        if (sample && sample.ok && sample.dataUrl) {
          this.detailSample = sample.dataUrl;
          this.albumSamples = { ...this.albumSamples, [album.id]: sample.dataUrl };
        }
      }
      this.detailOpen = true;
      this.$nextTick(() => this.syncPromptEditor('detail'));
    },

    closeDetail() {
      if (this.unsavedOpen) return;
      if (this.detailOpen && this.detailEditable()) {
        this.pullPromptFromEditor('detail');
      }
      if (this.detailDirty()) {
        this.unsavedOpen = true;
        return;
      }
      this.forceCloseDetail();
    },

    cancelUnsavedClose() {
      this.unsavedOpen = false;
    },

    confirmUnsavedClose() {
      this.unsavedOpen = false;
      this.forceCloseDetail();
    },

    forceCloseDetail() {
      this.closeEyedropper();
      this.unsavedOpen = false;
      this.detailOpen = false;
      this.detail = null;
      this.detailSample = '';
      this.detailPrompt = '';
      this.detailSavedPrompt = '';
    },

    async saveDetailPrompt() {
      if (!this.detailEditable() || !this.detail || this.savingDetail) return;
      this.pullPromptFromEditor('detail');
      this.savingDetail = true;
      this.error = '';
      try {
        const result = await this.call('updateAlbumPrompt', {
          id: this.detail.id,
          promptTemplate: this.detailPrompt,
        });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '保存失败';
          if (this.error) this.$dispatch('library-toast', this.error);
          return;
        }
        this.detailSavedPrompt = String(this.detailPrompt || '');
        this.detail.promptTemplate = this.detailSavedPrompt;
        this.syncPromptEditor('detail');
        this.$dispatch('library-toast', { message: '已保存怎么画', type: 'success' });
      } finally {
        this.savingDetail = false;
      }
    },

    /**
     * 外部（上传框 / 小红书笔记进料）直接交 dataUrl 学成草稿。
     * @param {{ dataUrl?: string; label?: string; source?: Record<string, unknown> } | string | undefined} detail
     */
    async onLearnDataUrl(detail) {
      const dataUrl = typeof detail === 'string'
        ? detail
        : (detail && typeof detail.dataUrl === 'string' ? detail.dataUrl : '');
      const source = typeof detail === 'object' && detail && detail.source
        ? detail.source
        : undefined;
      if (!dataUrl) {
        window.dispatchEvent(new CustomEvent('library-album-draft-settled', {
          detail: { action: 'error', message: '没有可学的图' },
        }));
        return;
      }
      if (!this.hostReady || this.learning || this.committing || this.savingDetail) {
        window.dispatchEvent(new CustomEvent('library-album-draft-settled', {
          detail: { action: 'error', message: '风格正忙，请稍后再试' },
        }));
        return;
      }
      this.error = '';
      this.learning = true;
      try {
        /** @type {Record<string, unknown>} */
        const payload = { dataUrl };
        if (source) payload.source = source;
        const result = await this.call('learnAlbum', payload);
        if (!result || result.ok === false) {
          const message = (result && result.message) || '学习失败';
          this.error = message;
          if (this.error) this.$dispatch('library-toast', this.error);
          window.dispatchEvent(new CustomEvent('library-album-draft-settled', {
            detail: { action: 'error', message },
          }));
          return;
        }
        if (result.safetyStatus === 'flagged') {
          const message = (result && result.message)
            || '这张图未通过安全审核，已入库但不能用于生图';
          this.error = message;
          if (this.error) this.$dispatch('library-toast', this.error);
          window.dispatchEvent(new CustomEvent('library-album-draft-settled', {
            detail: {
              action: 'flagged',
              id: result.album && result.album.id ? String(result.album.id) : '',
              message,
            },
          }));
          await this.refresh();
          return;
        }
        this.draft = result.draft;
        this.draftPrompt = String((result.draft && result.draft.promptTemplate) || '');
        this.draftOpen = true;
        this.detailOpen = false;
        this.detail = null;
        this.detailSample = '';
        this.detailPrompt = '';
        this.detailSavedPrompt = '';
        this.$nextTick(() => this.syncPromptEditor('draft'));
      } catch (err) {
        const message = err && err.message ? err.message : '学习失败';
        this.error = message;
        if (this.error) this.$dispatch('library-toast', this.error);
        window.dispatchEvent(new CustomEvent('library-album-draft-settled', {
          detail: { action: 'error', message },
        }));
      } finally {
        this.learning = false;
      }
    },

    async onCommitDraft() {
      if (!this.draft || this.committing) return;
      this.pullPromptFromEditor('draft');
      this.committing = true;
      this.error = '';
      try {
        const result = await this.call('commitAlbum', {
          draftId: this.draft.draftId,
          promptTemplate: this.draftPrompt,
        });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '写入失败';
          if (this.error) this.$dispatch('library-toast', this.error);
          return;
        }
        const albumId = result && result.id ? String(result.id) : '';
        this.closeEyedropper();
        this.draftOpen = false;
        this.draft = null;
        this.draftPrompt = '';
        this.$dispatch('library-toast', { message: '已保存风格', type: 'success' });
        // 先清 committing，再派 settled，避免下一张学图命中「风格正忙」
        this.committing = false;
        window.dispatchEvent(new CustomEvent('library-album-draft-settled', {
          detail: { action: 'commit', id: albumId },
        }));
        await this.refresh();
      } finally {
        this.committing = false;
      }
    },

    async onDiscardDraft() {
      if (this.committing) return;
      this.closeEyedropper();
      await this.call('discardAlbum', {});
      this.draftOpen = false;
      this.draft = null;
      this.draftPrompt = '';
      this.$dispatch('library-toast', { message: '已放弃草稿', type: 'success' });
      this.committing = false;
      window.dispatchEvent(new CustomEvent('library-album-draft-settled', {
        detail: { action: 'discard' },
      }));
    },

    /**
     * @param {'draft' | 'detail'} target
     * @param {number} occurrence
     */
    openEyedropper(target, occurrence) {
      const imageUrl = target === 'draft'
        ? (this.draft && this.draft.sampleDataUrl) || ''
        : this.detailSample || '';
      if (!imageUrl) {
        this.error = '没有可吸色的样图';
        if (this.error) this.$dispatch('library-toast', this.error);
        return;
      }
      if (target === 'detail' && !this.detailEditable()) return;
      eyedropperSampler = null;
      this.eyedropper = {
        open: true,
        target,
        occurrence: Number(occurrence),
        imageUrl,
        loupeX: 0,
        loupeY: 0,
        loupeVisible: false,
        previewHex: '',
      };
      this.$nextTick(() => this.onEyedropperImageLoad());
    },

    closeEyedropper() {
      eyedropperSampler = null;
      this.eyedropper = {
        open: false,
        target: '',
        occurrence: -1,
        imageUrl: '',
        loupeX: 0,
        loupeY: 0,
        loupeVisible: false,
        previewHex: '',
      };
    },

    onEyedropperImageLoad() {
      if (!this.eyedropper.open) return;
      const img = this.$refs && this.$refs.eyedropperImage;
      if (!img || !img.naturalWidth) return;
      eyedropperSampler = colors().createImageSampler(img);
    },

    /**
     * @param {MouseEvent} event
     */
    onEyedropperMove(event) {
      if (!this.eyedropper.open) return;
      const img = this.$refs && this.$refs.eyedropperImage;
      if (!img) return;
      if (!eyedropperSampler && img.naturalWidth) {
        eyedropperSampler = colors().createImageSampler(img);
      }
      if (!eyedropperSampler) return;
      const rect = img.getBoundingClientRect();
      const host = event.currentTarget.getBoundingClientRect();
      this.eyedropper.loupeX = event.clientX - host.left;
      this.eyedropper.loupeY = event.clientY - host.top;
      const sample = eyedropperSampler.sampleAt(event.clientX, event.clientY, rect);
      if (!sample) {
        this.eyedropper.loupeVisible = false;
        this.eyedropper.previewHex = '';
        return;
      }
      this.eyedropper.loupeVisible = true;
      this.eyedropper.previewHex = sample.hex;
      const loupe = this.$refs && this.$refs.eyedropperLoupe;
      if (loupe) eyedropperSampler.drawLoupe(loupe, sample.px, sample.py);
    },

    /**
     * @param {MouseEvent} event
     */
    onEyedropperPick(event) {
      if (!this.eyedropper.open) return;
      event.preventDefault();
      const img = this.$refs && this.$refs.eyedropperImage;
      if (!img || !eyedropperSampler) return;
      const rect = img.getBoundingClientRect();
      const sample = eyedropperSampler.sampleAt(event.clientX, event.clientY, rect);
      if (!sample) return;
      const which = this.eyedropper.target === 'draft' ? 'draft' : 'detail';
      this.pullPromptFromEditor(which);
      const sourceText = which === 'draft' ? this.draftPrompt : this.detailPrompt;
      const next = colors().replaceHexAt(sourceText, this.eyedropper.occurrence, sample.hex);
      if (which === 'draft') {
        this.draftPrompt = next;
        if (this.draft) this.draft.promptTemplate = next;
      } else {
        this.detailPrompt = next;
      }
      this.closeEyedropper();
      this.$nextTick(() => this.syncPromptEditor(which));
    },

    askDelete(album) {
      if (!album || !album.deletable || this.learning || this.committing || this.savingDetail) return;
      this.deleteTarget = album;
      this.deleteOpen = true;
      this.error = '';
    },

    cancelDelete() {
      this.deleteOpen = false;
      this.deleteTarget = null;
    },

    async confirmDelete() {
      if (!this.deleteTarget || this.deleting) return;
      this.deleting = true;
      this.error = '';
      try {
        const result = await this.call('deleteAlbum', { id: this.deleteTarget.id });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '删除失败';
          if (this.error) this.$dispatch('library-toast', this.error);
          return;
        }
        const id = this.deleteTarget.id;
        this.cancelDelete();
        this.detailOpen = false;
        this.detail = null;
        this.detailSample = '';
        this.detailPrompt = '';
        this.detailSavedPrompt = '';
        this.$dispatch('library-toast', { message: '已删除这套风格', type: 'success' });
        const nextSamples = { ...this.albumSamples };
        delete nextSamples[id];
        this.albumSamples = nextSamples;
        await this.refresh();
      } finally {
        this.deleting = false;
      }
    },
  };
}
