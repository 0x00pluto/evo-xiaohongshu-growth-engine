function libraryUploadRefs() {
  return {
    hostReady: window.studioHost.ready,
    uploadRefs: [],
    previews: {},
    error: '',
    deleting: false,
    deleteOpen: false,
    deleteTarget: null,
    detailOpen: false,
    detailTarget: null,
    detailPreview: '',
    uploadOpen: false,
    uploadPending: '',
    uploadUsage: '',
    uploadError: '',
    uploadBusy: false,
    usagePlaceholder: '我们的 logo，放在右上角。',

    call(method, payload) {
      return window.studioHost.call(method, payload);
    },

    emitBusy() {
      this.$dispatch('library-albums-busy', this.uploadBusy || this.deleting);
    },

    async init() {
      await this.refresh();
    },

    uploadRefPreview(item) {
      if (!item || !item.id) return '';
      return this.previews[item.id] || '';
    },

    async refresh() {
      if (!this.hostReady) return;
      this.error = '';
      const data = await this.call('listLibraryUploadRefs');
      if (!data || data.ok === false) {
        this.uploadRefs = [];
        this.error = (data && data.message) || '读库失败';
        if (this.error) this.$dispatch('library-toast', this.error);
        return;
      }
      this.uploadRefs = Array.isArray(data.uploadRefs) ? data.uploadRefs : [];
      await this.loadPreviews();
    },

    async loadPreviews() {
      const next = { ...this.previews };
      let changed = false;
      const live = new Set();
      for (const item of this.uploadRefs) {
        live.add(item.id);
        if (next[item.id]) continue;
        const result = await this.call('previewLibraryUploadRef', { id: item.id });
        if (result && result.ok && result.dataUrl) {
          next[item.id] = result.dataUrl;
          changed = true;
        }
      }
      for (const key of Object.keys(next)) {
        if (live.has(key)) continue;
        delete next[key];
        changed = true;
      }
      if (changed) this.previews = next;
    },

    /**
     * 上传框交出的 dataUrl → 打开写图片用法。
     * @param {{ dataUrl?: string } | string | undefined} detail
     */
    onIntakeDataUrl(detail) {
      if (!this.hostReady || this.uploadBusy || this.deleting) return;
      const dataUrl = typeof detail === 'string'
        ? detail
        : (detail && typeof detail.dataUrl === 'string' ? detail.dataUrl : '');
      if (!dataUrl) {
        this.error = '没有可上传的图';
        if (this.error) this.$dispatch('library-toast', this.error);
        return;
      }
      this.uploadPending = dataUrl;
      this.uploadUsage = '';
      this.uploadError = '';
      this.error = '';
      this.uploadOpen = true;
    },

    closeUpload(force) {
      if (this.uploadBusy && !force) return;
      this.uploadOpen = false;
      this.uploadPending = '';
      this.uploadUsage = '';
      this.uploadError = '';
      this.uploadBusy = false;
      this.emitBusy();
    },

    async draftUploadUsage() {
      if (!this.uploadPending || this.uploadBusy) return;
      this.uploadBusy = true;
      this.uploadError = '';
      this.emitBusy();
      try {
        const result = await this.call('draftUploadRefUsage', { dataUrl: this.uploadPending });
        if (!result || result.ok === false) {
          this.uploadError = (result && result.message) || '自动识别失败';
          if (this.uploadError) this.$dispatch('library-toast', this.uploadError);
          return;
        }
        this.uploadUsage = String(result.usage || '');
      } finally {
        this.uploadBusy = false;
        this.emitBusy();
      }
    },

    async confirmUpload() {
      if (!this.uploadPending || this.uploadBusy) return;
      const usage = String(this.uploadUsage || '').trim();
      if (!usage) {
        this.uploadError = '请写上图片用法';
        if (this.uploadError) this.$dispatch('library-toast', this.uploadError);
        return;
      }
      this.uploadBusy = true;
      this.uploadError = '';
      this.emitBusy();
      try {
        const result = await this.call('addLibraryUploadRef', {
          dataUrl: this.uploadPending,
          usage,
        });
        if (!result || result.ok === false) {
          this.uploadError = (result && result.message) || '入库失败';
          if (this.uploadError) this.$dispatch('library-toast', this.uploadError);
          return;
        }
        this.closeUpload(true);
        this.$dispatch('library-toast', { message: '已保存', type: 'success' });
        await this.refresh();
      } finally {
        this.uploadBusy = false;
        this.emitBusy();
      }
    },

    async openDetail(item) {
      if (!item || this.deleting || this.uploadBusy) return;
      this.detailTarget = item;
      this.detailPreview = this.uploadRefPreview(item) || '';
      this.detailOpen = true;
      if (!this.detailPreview) {
        const result = await this.call('previewLibraryUploadRef', { id: item.id });
        if (result && result.ok && result.dataUrl) {
          this.detailPreview = result.dataUrl;
          this.previews = { ...this.previews, [item.id]: result.dataUrl };
        }
      }
    },

    closeDetail() {
      if (this.deleteOpen || this.uploadBusy) return;
      this.detailOpen = false;
      this.detailTarget = null;
      this.detailPreview = '';
    },

    askDelete(item) {
      if (!item || this.deleting || this.uploadBusy) return;
      this.deleteTarget = item;
      this.deleteOpen = true;
    },

    askDeleteFromDetail() {
      if (!this.detailTarget) return;
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
        const result = await this.call('deleteLibraryUploadRef', { id: this.deleteTarget.id });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '删除失败';
          if (this.error) this.$dispatch('library-toast', this.error);
          return;
        }
        const deletedId = this.deleteTarget.id;
        this.deleteOpen = false;
        this.deleteTarget = null;
        if (this.detailTarget && this.detailTarget.id === deletedId) {
          this.closeDetail();
        }
        this.$dispatch('library-toast', { message: '已删除', type: 'success' });
        await this.refresh();
      } finally {
        this.deleting = false;
        this.emitBusy();
      }
    },
  };
}
