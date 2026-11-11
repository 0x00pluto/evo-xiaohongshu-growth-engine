function libraryLearnedNotes() {
  return {
    hostReady: window.studioHost.ready,
    notes: [],
    busy: false,
    detailOpen: false,
    detailLoading: false,
    detail: null,
    slideIndex: 0,
    deleteOpen: false,
    deleting: false,

    async call(method, payload) {
      return window.studioHost.call(method, payload);
    },

    when(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (part) => String(part).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },

    async init() {
      await this.refresh();
    },

    async refresh() {
      if (!this.hostReady) return;
      this.busy = true;
      try {
        const result = await this.call('listLibraryXhsNotes');
        this.notes = result && result.ok && Array.isArray(result.notes) ? result.notes : [];
      } catch {
        this.notes = [];
      } finally {
        this.busy = false;
      }
    },

    onCreate() {
      this.$dispatch('library-create-xhs-note');
    },

    coverPreview(item) {
      if (!item) return '';
      return String(item.coverPreviewUrl || '');
    },

    detailImages() {
      if (!this.detail || !Array.isArray(this.detail.images)) return [];
      return this.detail.images.filter((row) => row && !row.missing && row.previewUrl);
    },

    detailImageCount() {
      return this.detailImages().length;
    },

    currentSlide() {
      const images = this.detailImages();
      if (!images.length) return null;
      const index = Math.min(Math.max(this.slideIndex, 0), images.length - 1);
      return images[index] || null;
    },

    currentPromptExcerpt() {
      const slide = this.currentSlide();
      return slide && slide.promptExcerpt ? String(slide.promptExcerpt) : '';
    },

    articleBody() {
      if (!this.detail) return '';
      if (this.detail.articleMissing) return '';
      if (this.detail.article && this.detail.article.body) return String(this.detail.article.body);
      return '';
    },

    async openDetail(item) {
      if (!item || !item.id || !this.hostReady) return;
      this.detailLoading = true;
      this.detailOpen = true;
      this.slideIndex = 0;
      this.detail = {
        link: {
          id: item.id,
          title: item.title || '',
          sourceUrl: item.sourceUrl || '',
          learnedAt: item.learnedAt || 0,
        },
        images: [],
        article: null,
        articleMissing: false,
        articleSampleId: '',
      };
      try {
        const result = await this.call('getLibraryXhsNote', { id: item.id });
        if (!result || !result.ok) {
          this.$dispatch('library-toast', (result && result.message) || '没有打开这篇');
          this.closeDetail();
          return;
        }
        this.detail = {
          link: result.link || this.detail.link,
          images: Array.isArray(result.images) ? result.images : [],
          article: result.article || null,
          articleMissing: Boolean(result.articleMissing),
          articleSampleId: String(result.articleSampleId || ''),
        };
        this.slideIndex = 0;
      } catch (err) {
        this.$dispatch('library-toast', err && err.message ? err.message : '没有打开这篇');
        this.closeDetail();
      } finally {
        this.detailLoading = false;
      }
    },

    closeDetail() {
      // 删除进行中也要能关：confirmDelete 成功时 deleting 仍为 true
      this.detailOpen = false;
      this.detail = null;
      this.slideIndex = 0;
      this.deleteOpen = false;
    },

    prevSlide() {
      const count = this.detailImageCount();
      if (count <= 1) return;
      this.slideIndex = (this.slideIndex - 1 + count) % count;
    },

    nextSlide() {
      const count = this.detailImageCount();
      if (count <= 1) return;
      this.slideIndex = (this.slideIndex + 1) % count;
    },

    goSlide(index) {
      const count = this.detailImageCount();
      if (!count) return;
      this.slideIndex = Math.min(Math.max(Number(index) || 0, 0), count - 1);
    },

    onDetailKeydown(event) {
      if (!this.detailOpen || this.deleteOpen) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prevSlide();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.nextSlide();
      }
    },

    editCurrentAlbum() {
      const slide = this.currentSlide();
      if (!slide || !slide.albumId || slide.missing) return;
      const albumId = String(slide.albumId);
      this.closeDetail();
      this.$dispatch('library-select-tab', 'albums');
      this.$nextTick(() => {
        this.$dispatch('library-open-album-detail', { id: albumId });
      });
    },

    editArticle() {
      if (!this.detail || this.detail.articleMissing || !this.detail.articleSampleId) return;
      const sampleId = String(this.detail.articleSampleId);
      this.closeDetail();
      this.$dispatch('library-select-tab', 'article-samples');
      this.$nextTick(() => {
        this.$dispatch('library-open-article-sample-detail', { id: sampleId });
      });
    },

    /**
     * 去掉 xsec_token 等 query，按 explore noteId 组规范链；抽不出则原样。
     * @param {unknown} raw
     * @returns {string}
     */
    canonicalNoteUrl(raw) {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text) return '';
      try {
        const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) ? text : `https://${text}`;
        const parsed = new URL(withScheme);
        const path = parsed.pathname || '';
        let match = path.match(/\/explore\/([A-Za-z0-9]+)/);
        if (!match) match = path.match(/\/discovery\/item\/([A-Za-z0-9]+)/);
        if (match && match[1]) {
          return `https://www.xiaohongshu.com/explore/${match[1]}`;
        }
      } catch {
        // 非法 URL：下面退回去 query
      }
      const cut = text.split(/[?#]/)[0];
      return cut || text;
    },

    relearn() {
      if (!this.detail || !this.detail.link) return;
      const link = this.detail.link;
      const noteId = typeof link.noteId === 'string' ? link.noteId.trim() : '';
      const url = noteId
        ? `https://www.xiaohongshu.com/explore/${noteId}`
        : this.canonicalNoteUrl(link.sourceUrl || '');
      this.closeDetail();
      this.$dispatch('library-relearn-xhs-note', {
        linkId: link.id,
        url,
      });
    },

    askDelete() {
      if (!this.detail || !this.detail.link) return;
      this.deleteOpen = true;
    },

    cancelDelete() {
      if (this.deleting) return;
      this.deleteOpen = false;
    },

    async confirmDelete() {
      if (!this.detail || !this.detail.link || !this.detail.link.id || this.deleting) return;
      this.deleting = true;
      try {
        const result = await this.call('deleteLibraryXhsNote', { id: this.detail.link.id });
        if (!result || result.ok === false) {
          this.$dispatch('library-toast', (result && result.message) || '删除失败');
          return;
        }
        if (result.warning) {
          this.$dispatch('library-toast', result.warning);
        } else {
          this.$dispatch('library-toast', { message: '已删除', type: 'success' });
        }
        this.deleteOpen = false;
        this.detailOpen = false;
        this.detail = null;
        this.slideIndex = 0;
        await this.refresh();
      } catch (err) {
        this.$dispatch('library-toast', err && err.message ? err.message : '删除失败');
      } finally {
        this.deleting = false;
      }
    },
  };
}
