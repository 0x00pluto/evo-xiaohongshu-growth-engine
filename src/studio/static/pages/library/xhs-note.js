function libraryXhsNote() {
  return {
    hostReady: window.studioHost.ready,
    open: false,
    step: 'url', // url | choose | done
    url: '',
    error: '',
    busy: false,
    /** @type {'idle'|'checking'|'ok'|'bridge_down'|'version_low'} */
    checkStatus: 'idle',
    checkMessage: '',
    extensionVersion: '',

    /** @type {null | Record<string, unknown>} */
    note: null,
    inputUrl: '',
    parts: {
      title: '',
      body: '',
      tagOnlyBody: false,
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
    /** @type {null | { id: string; noteId?: string; sourceUrl?: string; title?: string }} */
    link: null,
    wantArticle: false,
    imageQueue: [],
    learningLabel: '',

    async call(method, payload) {
      return window.studioHost.call(method, payload);
    },

    init() {
      // 由壳上的 library-create-xhs-note 打开
    },

    get bridgeOk() {
      return this.checkStatus === 'ok';
    },

    openModal() {
      if (!this.hostReady || this.busy) return;
      this.reset();
      this.open = true;
      this.runBridgeCheck();
    },

    reset() {
      this.step = 'url';
      this.url = '';
      this.error = '';
      this.busy = false;
      this.checkStatus = 'idle';
      this.checkMessage = '';
      this.extensionVersion = '';
      this.note = null;
      this.inputUrl = '';
      this.parts = {
        title: '',
        body: '',
        tagOnlyBody: false,
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
      this.link = null;
      this.wantArticle = false;
      this.imageQueue = [];
      this.learningLabel = '';
    },

    close() {
      if (this.busy) return;
      this.open = false;
      this.reset();
    },

    async runBridgeCheck() {
      this.checkStatus = 'checking';
      this.checkMessage = '';
      this.extensionVersion = '';
      this.error = '';
      try {
        const result = await this.call('checkXhsNoteBridge', {});
        if (result && result.ok) {
          this.checkStatus = 'ok';
          this.extensionVersion = String(result.version || '');
          this.checkMessage = '';
          this.$nextTick(() => {
            const el = this.$refs && this.$refs.urlInput;
            if (el) el.focus();
          });
          return;
        }
        const code = result && result.code ? String(result.code) : 'BRIDGE_DOWN';
        this.checkStatus = code === 'VERSION_LOW' ? 'version_low' : 'bridge_down';
        this.checkMessage = (result && result.message)
          || (code === 'VERSION_LOW'
            ? '当前 Chrome 扩展版本过低，需 ≥ 0.9.0 才支持读取。'
            : '连不上本机读取通道。请安装或打开内部特供版，并打开「允许 Dex Buddy 连接」。');
        this.extensionVersion = result && result.version ? String(result.version) : '';
      } catch (err) {
        this.checkStatus = 'bridge_down';
        this.checkMessage = err && err.message
          ? String(err.message)
          : '连不上本机读取通道。请安装或打开内部特供版，并打开「允许 Dex Buddy 连接」。';
      }
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
      if (this.busy || !this.bridgeOk) return;
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
          this.error = (result && result.message) || '读取失败';
          return;
        }
        this.inputUrl = String(result.inputUrl || url);
        this.note = result.note || null;
        const parts = result.parts || {};
        this.parts = {
          title: String(parts.title || ''),
          body: String(parts.body || ''),
          tagOnlyBody: Boolean(parts.tagOnlyBody),
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
        this.error = err && err.message ? err.message : '读取失败';
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
        const wantArticle = this.learnArticle && Boolean(this.parts.body);
        const wantCover = this.learnCover && this.parts.hasCover;
        const wantInner = this.learnInner && this.parts.innerCount > 0;
        const selectedInner = wantInner
          ? (this.parts.inners || []).find((item) => Number(item.index) === Number(this.innerIndex))
          : null;
        const result = await this.call('importXhsNote', {
          url: this.inputUrl || this.url,
          note: this.note,
          learnArticle: wantArticle,
          learnCover: wantCover,
          learnInner: wantInner,
          innerIndex: this.innerIndex,
          coverDataUrl: wantCover ? String(this.parts.coverPreviewUrl || '') : '',
          innerDataUrl: selectedInner ? String(selectedInner.previewUrl || '') : '',
          innerPreviews: (this.parts.inners || []).map((item) => ({
            index: Number(item.index) || 0,
            previewUrl: String(item.previewUrl || ''),
          })),
        });
        if (!result || result.ok === false) {
          this.error = (result && result.message) || '保存失败';
          return;
        }
        this.link = result.link || null;
        this.wantArticle = Boolean(result.wantArticle);
        this.articleSample = null;
        this.imageQueue = Array.isArray(result.learnImages) ? result.learnImages.slice() : [];
        if (result.skippedImages) {
          this.$dispatch('library-toast', '有图片下载失败，已跳过');
        }
        if (this.imageQueue.length) {
          this.open = false;
          await this.runImageQueue();
        }
        if (this.wantArticle && this.link && this.link.id && this.note) {
          const articleResult = await this.call('saveXhsNoteArticle', {
            linkId: this.link.id,
            note: this.note,
          });
          if (!articleResult || articleResult.ok === false) {
            this.error = (articleResult && articleResult.message) || '写入对标文案失败';
            this.step = 'done';
            this.open = true;
            return;
          }
          this.articleSample = articleResult.articleSample || null;
        }
        this.step = 'done';
        this.open = true;
      } catch (err) {
        this.error = err && err.message ? err.message : '保存失败';
      } finally {
        this.busy = false;
      }
    },

    /**
     * 串行：切到风格 Tab → 交 dataUrl 学草稿 → 等确定/放弃。
     */
    async runImageQueue() {
      const queue = this.imageQueue.slice();
      for (const item of queue) {
        const dataUrl = item && item.dataUrl ? String(item.dataUrl) : '';
        if (!dataUrl) continue;
        this.learningLabel = (item && item.label) || '图片';
        this.$dispatch('library-select-tab', 'albums');
        // eslint-disable-next-line no-await-in-loop
        await this.learnOneAlbum(dataUrl, item && item.source ? item.source : null);
      }
      this.imageQueue = [];
      this.learningLabel = '';
    },

    /**
     * @param {string} dataUrl
     * @param {Record<string, unknown> | null} source
     * @returns {Promise<{ action: string }>}
     */
    learnOneAlbum(dataUrl, source) {
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
        this.$dispatch('library-learn-album-dataurl', { dataUrl, source: source || undefined });
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
