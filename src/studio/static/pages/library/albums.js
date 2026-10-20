function libraryAlbums() {
  return {
    hostReady: window.studioHost.ready,
    albums: [],
    albumSamples: {},
    notice: '',
    error: '',
    learning: false,
    committing: false,
    deleting: false,

    detailOpen: false,
    detail: null,
    detailSample: '',

    draftOpen: false,
    draft: null,

    deleteOpen: false,
    deleteTarget: null,

    async call(method, payload) {
      return window.studioHost.call(method, payload);
    },

    emitBusy() {
      this.$dispatch('library-albums-busy', this.learning || this.committing);
    },

    albumSamplePreview(album) {
      if (!album || !album.id) return '';
      return this.albumSamples[album.id] || '';
    },

    async init() {
      this.$watch('learning', () => this.emitBusy());
      this.$watch('committing', () => this.emitBusy());
      this.emitBusy();
      if (!this.hostReady) return;
      await this.refresh();
    },

    async refresh() {
      this.error = '';
      const data = await this.call('listAlbums');
      if (!data || data.ok === false || !Array.isArray(data.albums)) {
        this.albums = [];
        this.error = (data && data.message) || '没有读到图册列表';
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
      if (!album || !album.id || this.learning || this.committing) return;
      this.notice = '';
      this.error = '';
      const detail = await this.call('getAlbumDetail', { id: album.id });
      if (!detail || detail.ok === false) {
        this.error = (detail && detail.message) || '没有读到这一册';
        return;
      }
      this.detail = detail;
      this.detailSample = this.albumSamplePreview(album) || '';
      if (!this.detailSample && detail.hasSample) {
        const sample = await this.call('previewAlbumSample', { id: album.id });
        if (sample && sample.ok && sample.dataUrl) {
          this.detailSample = sample.dataUrl;
          this.albumSamples = { ...this.albumSamples, [album.id]: sample.dataUrl };
        }
      }
      this.detailOpen = true;
    },

    closeDetail() {
      this.detailOpen = false;
      this.detail = null;
      this.detailSample = '';
    },

    onPickImage() {
      if (!this.hostReady || this.learning || this.committing) return;
      const input = this.$refs && this.$refs.fileInput;
      if (input) {
        input.value = '';
        input.click();
      }
    },

    /**
     * @param {Event} event
     */
    async onFileChange(event) {
      const input = event && event.target;
      const file = input && input.files && input.files[0];
      if (!file) return;
      this.error = '';
      this.notice = '';
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name || '')) {
        this.error = '只支持 JPEG、PNG、WebP 参考图';
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        this.error = '参考图太大，请换一张不超过 8MB 的图';
        return;
      }
      this.learning = true;
      try {
        const dataUrl = await this.readFileAsDataUrl(file);
        const result = await this.call('learnAlbum', { dataUrl });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '学习失败';
          return;
        }
        this.draft = result.draft;
        this.draftOpen = true;
        this.closeDetail();
      } catch (err) {
        this.error = err && err.message ? err.message : '学习失败';
      } finally {
        this.learning = false;
      }
    },

    /**
     * @param {File} file
     * @returns {Promise<string>}
     */
    readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读图失败'));
        reader.readAsDataURL(file);
      });
    },

    async onCommitDraft() {
      if (!this.draft || this.committing) return;
      this.committing = true;
      this.error = '';
      try {
        const result = await this.call('commitAlbum', { draftId: this.draft.draftId });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '写入失败';
          return;
        }
        this.draftOpen = false;
        this.draft = null;
        this.notice = '已写入图库';
        await this.refresh();
      } finally {
        this.committing = false;
      }
    },

    async onDiscardDraft() {
      if (this.committing) return;
      await this.call('discardAlbum', {});
      this.draftOpen = false;
      this.draft = null;
      this.notice = '已放弃草稿';
    },

    askDelete(album) {
      if (!album || !album.deletable || this.learning || this.committing) return;
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
          return;
        }
        const id = this.deleteTarget.id;
        this.cancelDelete();
        this.closeDetail();
        this.notice = '已删除这本图册';
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
