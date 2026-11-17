/**
 * 产品资料（references）：列表项规整、悬浮卡、编辑弹窗、从资料库挑选。
 * 依赖宿主 note 页：references / errors / job / hostReady / referencesMax、call / persist / setFormError / showToast。
 */
window.createNoteReferences = function createNoteReferences() {
  return {
    referenceHoverOpen: false,
    referenceHoverText: '',
    referenceHoverStyle: '',
    referenceEditorOpen: false,
    referenceEditorIndex: -1,
    referenceEditorText: '',
    referenceEditorNew: false,
    referenceEditorError: '',
    referenceEditorBusy: false,
    referencePickOpen: false,
    referencePickError: '',
    referencePickBusy: false,
    referenceLibraryDocs: [],

    /**
     * @param {unknown} item
     * @returns {{ name?: string; body: string } | null}
     */
    normalizeReferenceItem(item) {
      if (typeof item === 'string') {
        const body = item.trim();
        return body ? { body } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const body = typeof item.body === 'string' ? item.body.trim() : '';
      if (!body) return null;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      return name ? { name, body } : { body };
    },
    /**
     * @param {{ name?: string; body: string } | null | undefined} item
     * @returns {string}
     */
    referenceDisplayText(item) {
      if (!item) return '';
      const name = String(item.name || '').trim();
      const body = String(item.body || '').trim();
      if (name && body) return `${name}\n${body}`;
      return body || name;
    },
    /**
     * @param {unknown} paste
     * @returns {{ name: string; body: string }}
     */
    splitPasteToDoc(paste) {
      const raw = String(paste || '').replace(/\r\n/g, '\n').trim();
      if (!raw) return { name: '', body: '' };
      const nl = raw.indexOf('\n');
      if (nl < 0) {
        const name = Array.from(raw).slice(0, 20).join('');
        return { name, body: raw };
      }
      const name = raw.slice(0, nl).trim();
      const body = raw.slice(nl + 1).trim();
      return {
        name: name || Array.from(body).slice(0, 20).join(''),
        body: body || name,
      };
    },
    /**
     * 编辑产品资料：有换行才拆名称；无换行保持无名称（旧稿兼容）。
     * @param {unknown} paste
     * @returns {{ name?: string; body: string } | null}
     */
    parseChipPaste(paste) {
      const raw = String(paste || '').replace(/\r\n/g, '\n').trim();
      if (!raw) return null;
      const nl = raw.indexOf('\n');
      if (nl < 0) return { body: raw };
      const name = raw.slice(0, nl).trim();
      const body = raw.slice(nl + 1).trim();
      if (!body && !name) return null;
      if (!body) return { body: name };
      if (!name) return { body };
      return { name, body };
    },
    /**
     * 篇内去重：trim 后正文全等即视为已加过。
     * @param {unknown} body
     * @param {number} [exceptIndex]
     * @returns {boolean}
     */
    isReferenceAlreadyOnNote(body, exceptIndex) {
      const target = String(body || '').trim();
      if (!target) return false;
      return this.references.some((item, index) => {
        if (Number.isInteger(exceptIndex) && index === exceptIndex) return false;
        const normalized = this.normalizeReferenceItem(item);
        return Boolean(normalized && normalized.body === target);
      });
    },
    /**
     * @param {unknown[]} docs
     * @returns {unknown[]}
     */
    filterAvailableReferenceDocs(docs) {
      const list = Array.isArray(docs) ? docs : [];
      return list.filter((doc) => {
        if (!doc || typeof doc !== 'object') return false;
        const body = typeof doc.body === 'string' ? doc.body.trim() : '';
        // 旧列表回包可能没有 body：先留着，点选 get 后再拦。
        if (!body) return true;
        return !this.isReferenceAlreadyOnNote(body);
      });
    },
    openCreateReferenceEditor() {
      this.referencePickOpen = false;
      this.referencePickError = '';
      this.referencePickBusy = false;
      this.referenceEditorNew = true;
      this.referenceEditorIndex = this.references.length;
      this.referenceEditorText = '';
      this.referenceEditorError = '';
      this.referenceEditorBusy = false;
      this.referenceEditorOpen = true;
      this.$nextTick(() => {
        const el = this.$refs && this.$refs.referenceEditorText;
        if (el && typeof el.focus === 'function') el.focus();
      });
    },
    async addReference() {
      if (this.job.running) return;
      if (this.references.length >= this.referencesMax) {
        this.setFormError('references', `产品资料最多 ${this.referencesMax} 条。`);
        return;
      }
      this.errors.references = '';
      this.hideReferenceHover();
      if (!this.hostReady) {
        this.openCreateReferenceEditor();
        return;
      }
      this.referencePickBusy = true;
      this.referencePickError = '';
      try {
        const data = await this.call('listLibraryReferenceDocs');
        if (!data || data.ok === false) {
          this.referencePickError = (data && data.message) || '读库失败';
        if (this.referencePickError) this.showToast(this.referencePickError);
          this.referenceLibraryDocs = [];
          this.openCreateReferenceEditor();
          this.referenceEditorError = this.referencePickError;
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
          return;
        }
        const all = Array.isArray(data.docs) ? data.docs : [];
        this.referenceLibraryDocs = this.filterAvailableReferenceDocs(all);
        if (this.referenceLibraryDocs.length > 0) {
          this.referencePickOpen = true;
          return;
        }
        this.openCreateReferenceEditor();
      } finally {
        this.referencePickBusy = false;
      }
    },
    closePickReference() {
      if (this.referencePickBusy) return;
      this.referencePickOpen = false;
      this.referencePickError = '';
      this.referenceLibraryDocs = [];
    },
    openCreateReferenceFromPick() {
      if (this.referencePickBusy || this.job.running) return;
      if (this.references.length >= this.referencesMax) {
        this.setFormError('references', `产品资料最多 ${this.referencesMax} 条。`);
        this.closePickReference();
        return;
      }
      this.openCreateReferenceEditor();
    },
    removeReference(index) {
      if (this.job.running) return;
      const next = this.references.slice();
      next.splice(index, 1);
      this.references = next;
      this.errors.references = '';
      this.persist();
    },
    showReferenceHover(index, event) {
      const text = this.referenceDisplayText(this.references[index]);
      this.referenceHoverText = text;
      const rect = event && event.currentTarget && event.currentTarget.getBoundingClientRect
        ? event.currentTarget.getBoundingClientRect()
        : null;
      if (rect) {
        const cardWidth = 208;
        const gap = 8;
        const cardHeight = Math.min(160, 40 + Math.ceil((text || '（空）').length / 14) * 20);
        let left = rect.left + (rect.width / 2) - (cardWidth / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - cardWidth - 8));
        let top = rect.top - cardHeight - gap;
        if (top < 8) top = Math.min(rect.bottom + gap, window.innerHeight - cardHeight - 8);
        this.referenceHoverStyle = `left:${left}px;top:${Math.max(8, top)}px;`;
      } else {
        this.referenceHoverStyle = '';
      }
      this.referenceHoverOpen = true;
    },
    hideReferenceHover() {
      this.referenceHoverOpen = false;
      this.referenceHoverText = '';
      this.referenceHoverStyle = '';
    },
    openReferenceEditor(index) {
      if (this.job.running) return;
      const i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i >= this.references.length) return;
      this.hideReferenceHover();
      this.closePickReference();
      this.referenceEditorNew = false;
      this.referenceEditorIndex = i;
      this.referenceEditorText = this.referenceDisplayText(this.references[i]);
      this.referenceEditorError = '';
      this.referenceEditorBusy = false;
      this.referenceEditorOpen = true;
      this.$nextTick(() => {
        const el = this.$refs && this.$refs.referenceEditorText;
        if (el && typeof el.focus === 'function') el.focus();
      });
    },
    closeReferenceEditor() {
      if (this.referenceEditorBusy) return;
      this.referenceEditorOpen = false;
      this.referenceEditorIndex = -1;
      this.referenceEditorText = '';
      this.referenceEditorNew = false;
      this.referenceEditorError = '';
      this.referenceEditorBusy = false;
    },
    /**
     * @param {{ name?: string; body: string }} snap
     */
    pushReferenceSnapshot(snap) {
      const item = this.normalizeReferenceItem(snap);
      if (!item) return false;
      if (this.references.length >= this.referencesMax) {
        this.setFormError('references', `产品资料最多 ${this.referencesMax} 条。`);
        return false;
      }
      if (this.isReferenceAlreadyOnNote(item.body)) {
        this.setFormError('references', '这篇已经加过相同的产品资料。');
        return false;
      }
      this.references = [...this.references, item];
      this.errors.references = '';
      this.persist();
      return true;
    },
    async pickLibraryReference(item) {
      if (!item || this.referencePickBusy || this.job.running) return;
      if (this.references.length >= this.referencesMax) {
        this.setFormError('references', `产品资料最多 ${this.referencesMax} 条。`);
        this.closePickReference();
        return;
      }
      this.referencePickBusy = true;
      this.referencePickError = '';
      try {
        const data = await this.call('getLibraryReferenceDoc', { id: item.id });
        if (!data || data.ok === false || !data.doc) {
          this.referencePickError = (data && data.message) || '读库失败';
        if (this.referencePickError) this.showToast(this.referencePickError);
          return;
        }
        const snap = this.normalizeReferenceItem({
          name: data.doc.name,
          body: data.doc.body,
        });
        if (!snap) {
          this.referencePickError = '这条产品资料是空的';
        if (this.referencePickError) this.showToast(this.referencePickError);
          return;
        }
        if (this.isReferenceAlreadyOnNote(snap.body)) {
          this.referencePickError = '这篇已经加过相同的产品资料。';
        if (this.referencePickError) this.showToast(this.referencePickError);
          this.referenceLibraryDocs = this.filterAvailableReferenceDocs(this.referenceLibraryDocs);
          return;
        }
        if (!this.pushReferenceSnapshot(snap)) {
          this.referencePickError = this.errors.references || '没有加上';
        if (this.referencePickError) this.showToast(this.referencePickError);
          return;
        }
        this.referencePickBusy = false;
        this.closePickReference();
      } finally {
        this.referencePickBusy = false;
      }
    },
    async confirmReferenceEditor() {
      if (this.referenceEditorBusy || this.job.running) return;
      const text = String(this.referenceEditorText || '').trim();
      if (!text) {
        this.referenceEditorError = '先写一点事实。空的产品资料不会保存。';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
        return;
      }
      if (this.referenceEditorNew) {
        if (this.references.length >= this.referencesMax) {
          this.setFormError('references', `产品资料最多 ${this.referencesMax} 条。`);
          this.closeReferenceEditor();
          return;
        }
        const { name, body } = this.splitPasteToDoc(text);
        if (!name) {
          this.referenceEditorError = '请写上名称（第一行）。';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
          return;
        }
        if (!body) {
          this.referenceEditorError = '请写上正文。';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
          return;
        }
        if (Array.from(body).length > 8000) {
          this.referenceEditorError = '产品资料太长了，先删到 8000 字以内。';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
          return;
        }
        if (this.isReferenceAlreadyOnNote(body)) {
          this.referenceEditorError = '这篇已经加过相同的产品资料。';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
          return;
        }
        this.referenceEditorBusy = true;
        this.referenceEditorError = '';
        try {
          const result = await this.call('saveLibraryReferenceDoc', { name, body });
          if (!result || result.ok === false || !result.doc) {
            this.referenceEditorError = (result && result.message) || '写入资料库失败';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
            return;
          }
          const snap = this.normalizeReferenceItem({
            name: result.doc.name,
            body: result.doc.body,
          });
          if (!snap) return;
          if (this.isReferenceAlreadyOnNote(snap.body)) {
            this.referenceEditorError = '这篇已经加过相同的产品资料。';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
            return;
          }
          if (!this.pushReferenceSnapshot(snap)) {
            this.referenceEditorError = this.errors.references || '没有加上';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
            return;
          }
          this.referenceEditorBusy = false;
          this.closeReferenceEditor();
        } finally {
          this.referenceEditorBusy = false;
        }
        return;
      }
      const parsed = this.parseChipPaste(text);
      if (!parsed) {
        this.referenceEditorError = '先写一点事实。空的产品资料不会保存。';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
        return;
      }
      if (Array.from(parsed.body).length > 8000) {
        this.referenceEditorError = '产品资料太长了，先删到 8000 字以内。';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
        return;
      }
      const i = this.referenceEditorIndex;
      if (!Number.isInteger(i) || i < 0 || i >= this.references.length) {
        this.closeReferenceEditor();
        return;
      }
      if (this.isReferenceAlreadyOnNote(parsed.body, i)) {
        this.referenceEditorError = '这篇已经加过相同的产品资料。';
        if (this.referenceEditorError) this.showToast(this.referenceEditorError);
        return;
      }
      const next = this.references.slice();
      next[i] = parsed;
      this.references = next;
      this.errors.references = '';
      this.persist();
      this.closeReferenceEditor();
    },
    deleteReferenceFromEditor() {
      if (this.referenceEditorBusy) return;
      if (this.referenceEditorNew) {
        this.closeReferenceEditor();
        return;
      }
      const i = this.referenceEditorIndex;
      this.closeReferenceEditor();
      if (Number.isInteger(i) && i >= 0) this.removeReference(i);
    },
  };
};
