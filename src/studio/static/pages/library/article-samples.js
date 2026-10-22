function libraryArticleSamples() {
  function splitPasteToSample(paste) {
    const raw = String(paste || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return { title: '', body: '' };
    const nl = raw.indexOf('\n');
    if (nl < 0) {
      const title = Array.from(raw).slice(0, 20).join('');
      return { title, body: raw };
    }
    const title = raw.slice(0, nl).trim();
    const body = raw.slice(nl + 1).trim();
    return {
      title: title || Array.from(body).slice(0, 20).join(''),
      body: body || title,
    };
  }

  return {
    hostReady: window.studioHost.ready,
    samples: [],
    error: '',
    busy: false,
    savingDetail: false,
    deleting: false,
    deleteOpen: false,
    deleteTarget: null,
    editorOpen: false,
    editorId: '',
    editorPaste: '',
    editorError: '',
    detailOpen: false,
    detailTarget: null,
    detailBody: '',
    detailBaselineBody: '',
    detailError: '',
    unsavedOpen: false,

    call(method, payload) {
      return window.studioHost.call(method, payload);
    },

    emitBusy() {
      this.$dispatch('library-albums-busy', this.busy || this.deleting || this.savingDetail);
    },

    detailDirty() {
      if (!this.detailTarget) return false;
      return String(this.detailBody || '') !== String(this.detailBaselineBody || '');
    },

    async init() {
      await this.refresh();
    },

    async refresh() {
      if (!this.hostReady) return;
      this.error = '';
      const data = await this.call('listLibraryArticleSamples');
      if (!data || data.ok === false) {
        this.samples = [];
        this.error = (data && data.message) || '读库失败';
        return;
      }
      this.samples = Array.isArray(data.samples) ? data.samples : [];
    },

    onCreateArticleSample() {
      if (!this.hostReady || this.busy || this.deleting || this.savingDetail) return;
      this.editorId = '';
      this.editorPaste = '';
      this.editorError = '';
      this.editorOpen = true;
    },

    closeEditor(force) {
      if (this.busy && !force) return;
      this.editorOpen = false;
      this.editorId = '';
      this.editorPaste = '';
      this.editorError = '';
      this.busy = false;
      this.emitBusy();
    },

    async confirmEditor() {
      if (this.busy) return;
      const { title, body } = splitPasteToSample(this.editorPaste);
      if (!title) {
        this.editorError = '请粘贴全文，第一行当标题';
        return;
      }
      if (!body) {
        this.editorError = '请粘贴正文（第一行后的内容）';
        return;
      }
      if (Array.from(body).length > 8000) {
        this.editorError = '贴进来的原文太长了，先删到 8000 字以内。';
        return;
      }
      this.busy = true;
      this.editorError = '';
      this.emitBusy();
      try {
        const payload = { title, body };
        if (this.editorId) payload.id = this.editorId;
        const result = await this.call('saveLibraryArticleSample', payload);
        if (!result || result.ok === false) {
          this.editorError = (result && result.message) || '保存失败';
          return;
        }
        this.closeEditor(true);
        this.$dispatch('library-toast', '已写入资料库');
        await this.refresh();
      } finally {
        this.busy = false;
        this.emitBusy();
      }
    },

    async openDetail(item) {
      if (!item || this.deleting || this.busy || this.savingDetail) return;
      this.detailError = '';
      this.unsavedOpen = false;
      this.detailTarget = item;
      this.detailBody = String(item.body || '');
      this.detailBaselineBody = this.detailBody;
      this.detailOpen = true;
      const result = await this.call('getLibraryArticleSample', { id: item.id });
      if (result && result.ok && result.sample) {
        this.detailTarget = result.sample;
        this.detailBody = String(result.sample.body || '');
        this.detailBaselineBody = this.detailBody;
      }
    },

    closeDetail() {
      if (this.deleteOpen || this.unsavedOpen || this.savingDetail) return;
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
      this.unsavedOpen = false;
      this.detailOpen = false;
      this.detailTarget = null;
      this.detailBody = '';
      this.detailBaselineBody = '';
      this.detailError = '';
    },

    async saveDetail() {
      if (!this.detailTarget || this.savingDetail || !this.detailDirty()) return;
      const body = String(this.detailBody || '').trim();
      if (!body) {
        this.detailError = '正文不能为空';
        return;
      }
      if (Array.from(body).length > 8000) {
        this.detailError = '正文太长了，先删到 8000 字以内。';
        return;
      }
      this.savingDetail = true;
      this.detailError = '';
      this.emitBusy();
      try {
        const result = await this.call('saveLibraryArticleSample', {
          id: this.detailTarget.id,
          title: this.detailTarget.title,
          body,
        });
        if (!result || result.ok === false) {
          this.detailError = (result && result.message) || '保存失败';
          return;
        }
        if (result.sample) {
          this.detailTarget = result.sample;
          this.detailBody = String(result.sample.body || '');
        } else {
          this.detailBody = body;
        }
        this.detailBaselineBody = this.detailBody;
        this.$dispatch('library-toast', '已更新');
        await this.refresh();
      } finally {
        this.savingDetail = false;
        this.emitBusy();
      }
    },

    askDelete(item) {
      if (!item || this.deleting || this.busy || this.savingDetail) return;
      this.deleteTarget = item;
      this.deleteOpen = true;
    },

    askDeleteFromDetail() {
      if (!this.detailTarget || this.detailDirty()) return;
      this.askDelete(this.detailTarget);
    },

    cancelDelete() {
      if (this.deleting) return;
      this.deleteOpen = false;
      this.deleteTarget = null;
    },

    async confirmDelete() {
      if (!this.deleteTarget || this.deleting) return;
      this.deleting = true;
      this.error = '';
      this.emitBusy();
      try {
        const result = await this.call('deleteLibraryArticleSample', { id: this.deleteTarget.id });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '删除失败';
          return;
        }
        const deletedId = this.deleteTarget.id;
        this.deleteOpen = false;
        this.deleteTarget = null;
        if (this.detailTarget && this.detailTarget.id === deletedId) {
          this.forceCloseDetail();
        }
        this.$dispatch('library-toast', '已从库里拿走');
        await this.refresh();
      } finally {
        this.deleting = false;
        this.emitBusy();
      }
    },
  };
}
