function libraryXhsNote() {
  return {
    hostReady: window.studioHost.ready,
    open: false,
    step: 'url', // url | choose | done
    url: '',
    error: '',
    busy: false,

    /** @type {null | Record<string, unknown>} */
    note: null,
    inputUrl: '',
    parts: {
      title: '',
      body: '',
      hasCover: false,
      coverUrl: '',
      coverPreviewUrl: '',
      innerCount: 0,
      inners: [],
    },
    learnArticle: true,
    learnCover: true,
    learnInner: true,
    innerIndex: 0,

    bodyOpen: false,
    hoverOpen: false,
    hoverPreview: '',
    hoverStyle: '',

    /** @type {null | { id: string; title: string }} */
    articleSample: null,
    imageQueue: [],
    learningLabel: '',

    async call(method, payload) {
      return window.studioHost.call(method, payload);
    },

    init() {
      // 由壳上的 library-create-xhs-note 打开
    },

    openModal() {
      if (!this.hostReady || this.busy) return;
      this.reset();
      this.open = true;
      this.$nextTick(() => {
        const el = this.$refs && this.$refs.urlInput;
        if (el) el.focus();
      });
    },

    reset() {
      this.step = 'url';
      this.url = '';
      this.error = '';
      this.busy = false;
      this.note = null;
      this.inputUrl = '';
      this.parts = {
        title: '',
        body: '',
        hasCover: false,
        coverUrl: '',
        coverPreviewUrl: '',
        innerCount: 0,
        inners: [],
      };
      this.learnArticle = true;
      this.learnCover = true;
      this.learnInner = true;
      this.innerIndex = 0;
      this.bodyOpen = false;
      this.hideInnerHover();
      this.articleSample = null;
      this.imageQueue = [];
      this.learningLabel = '';
    },

    close() {
      if (this.busy) return;
      this.open = false;
      this.reset();
    },

    get canConfirmLearn() {
      const article = this.learnArticle && Boolean(this.parts.body);
      const cover = this.learnCover && this.parts.hasCover;
      const inner = this.learnInner && this.parts.innerCount > 0;
      return article || cover || inner;
    },

    bodySummary() {
      const body = String(this.parts.body || '').trim();
      if (!body) return '笔记内容';
      const len = Array.from(body).length;
      const head = Array.from(body).slice(0, 24).join('');
      const more = len > 24 ? '…' : '';
      return `笔记内容 · ${len} 字 · ${head}${more}`;
    },

    showInnerHover(event, item) {
      if (!item) return;
      const preview = String(item.previewUrl || item.url || '').trim();
      this.hoverPreview = preview;
      const rect = event && event.currentTarget && event.currentTarget.getBoundingClientRect
        ? event.currentTarget.getBoundingClientRect()
        : null;
      if (rect) {
        const cardWidth = 240;
        const gap = 8;
        const cardHeight = Math.round(cardWidth * 4 / 3) + 4;
        let left = rect.left + (rect.width / 2) - (cardWidth / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - cardWidth - 8));
        let top = rect.top - cardHeight - gap;
        if (top < 8) top = Math.min(rect.bottom + gap, window.innerHeight - cardHeight - 8);
        this.hoverStyle = `left:${left}px;top:${Math.max(8, top)}px;`;
      } else {
        this.hoverStyle = '';
      }
      this.hoverOpen = true;
    },

    hideInnerHover() {
      this.hoverOpen = false;
      this.hoverPreview = '';
      this.hoverStyle = '';
    },

    async onResolve() {
      if (this.busy) return;
      this.error = '';
      const url = String(this.url || '').trim();
      if (!url) {
        this.error = '请粘贴小红书笔记链接';
        return;
      }
      this.busy = true;
      try {
        const result = await this.call('resolveXhsNote', { url });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '取料失败';
          return;
        }
        this.inputUrl = String(result.inputUrl || url);
        this.note = result.note || null;
        const parts = result.parts || {};
        this.parts = {
          title: String(parts.title || ''),
          body: String(parts.body || ''),
          hasCover: Boolean(parts.hasCover),
          coverUrl: String(parts.coverUrl || ''),
          coverPreviewUrl: String(parts.coverPreviewUrl || ''),
          innerCount: Number(parts.innerCount) || 0,
          inners: Array.isArray(parts.inners) ? parts.inners : [],
        };
        this.learnArticle = Boolean(this.parts.body);
        this.learnCover = Boolean(this.parts.hasCover);
        this.learnInner = this.parts.innerCount > 0;
        this.innerIndex = 0;
        this.bodyOpen = false;
        this.hideInnerHover();
        this.step = 'choose';
      } catch (err) {
        this.error = err && err.message ? err.message : '取料失败';
      } finally {
        this.busy = false;
      }
    },

    async onConfirmLearn() {
      if (this.busy || !this.canConfirmLearn || !this.note) return;
      this.error = '';
      this.busy = true;
      this.hideInnerHover();
      try {
        const result = await this.call('importXhsNote', {
          url: this.inputUrl || this.url,
          note: this.note,
          learnArticle: this.learnArticle && Boolean(this.parts.body),
          learnCover: this.learnCover && this.parts.hasCover,
          learnInner: this.learnInner && this.parts.innerCount > 0,
          innerIndex: this.innerIndex,
        });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '收录失败';
          return;
        }
        this.articleSample = result.articleSample || null;
        this.imageQueue = Array.isArray(result.learnImages) ? result.learnImages.slice() : [];
        if (result.skippedImages) {
          this.$dispatch('library-toast', '有图片下载失败，已跳过');
        }
        if (this.imageQueue.length) {
          this.open = false;
          await this.runImageQueue();
        }
        this.step = 'done';
        this.open = true;
      } catch (err) {
        this.error = err && err.message ? err.message : '收录失败';
      } finally {
        this.busy = false;
      }
    },

    /**
     * 串行：切到图库 Tab → 交 dataUrl 学草稿 → 等确定/放弃。
     */
    async runImageQueue() {
      const queue = this.imageQueue.slice();
      for (const item of queue) {
        const dataUrl = item && item.dataUrl ? String(item.dataUrl) : '';
        if (!dataUrl) continue;
        this.learningLabel = (item && item.label) || '图片';
        this.$dispatch('library-select-tab', 'albums');
        // eslint-disable-next-line no-await-in-loop
        await this.learnOneAlbum(dataUrl);
      }
      this.imageQueue = [];
      this.learningLabel = '';
    },

    /**
     * @param {string} dataUrl
     * @returns {Promise<{ action: string }>}
     */
    learnOneAlbum(dataUrl) {
      return new Promise((resolve) => {
        const onSettled = (event) => {
          window.removeEventListener('library-album-draft-settled', onSettled);
          const detail = event && event.detail ? event.detail : { action: 'discard' };
          if (detail.action === 'error') {
            this.$dispatch('library-toast', detail.message || '学图失败');
          }
          resolve(detail);
        };
        window.addEventListener('library-album-draft-settled', onSettled);
        this.$dispatch('library-learn-album-dataurl', { dataUrl });
      });
    },

    async goWriteWithSample() {
      if (!this.articleSample || !this.articleSample.id) return;
      this.open = false;
      await window.studioHost.go('note', { sampleId: this.articleSample.id });
      this.reset();
    },

    finishDone() {
      this.close();
      if (this.articleSample) {
        this.$dispatch('library-select-tab', 'article-samples');
      } else {
        this.$dispatch('library-select-tab', 'albums');
      }
    },
  };
}
