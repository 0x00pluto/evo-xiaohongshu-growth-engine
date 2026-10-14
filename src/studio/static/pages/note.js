function notePage() {
  return {
    business: '',
    article: '',
    galleryCount: 1,
    draft: null,
    prompts: { cover: '', gallery: [], stale: false, basis: null },
    images: { cover: { status: '空', path: '' }, gallery: [] },
    job: { running: false, step: '', error: '' },
    errors: { business: '', article: '', galleryCount: '' },
    notice: '',
    copied: '',
    copiedTimer: null,
    directory: '',
    previews: {},
    pollTimer: null,
    phase: 'materials',
    postId: '',
    slots: [],

    hostReady: window.studioHost.ready,
    get articleLength() {
      return Array.from(String(this.article || '').trim()).length;
    },
    get promptsWaiting() {
      if (!this.draft) return false;
      if (this.prompts.stale) return true;
      if (!this.prompts.basis) return Boolean(String(this.prompts.cover || '').trim());
      const basis = this.prompts.basis;
      const topics = (this.draft.topics || []).map((topic) => String(topic).trim());
      const basisTopics = Array.isArray(basis.topics) ? basis.topics : [];
      return basis.title !== String(this.draft.title || '').trim()
        || basis.body !== String(this.draft.body || '').trim()
        || basis.coverLine !== String(this.draft.coverLine || '').trim()
        || Number(basis.galleryCount) !== Number(this.galleryCount)
        || basisTopics.length !== topics.length
        || basisTopics.some((topic, index) => topic !== topics[index]);
    },
    syncSlots() {
      const cover = this.images.cover || { status: '空', path: '' };
      const slots = [{
        slot: 'cover',
        index: 0,
        label: '封面',
        image: cover,
        prompt: String(this.prompts.cover || ''),
      }];
      const count = Number(this.galleryCount);
      const total = Number.isInteger(count) && count > 0 ? count : 0;
      for (let index = 1; index <= total; index += 1) {
        const image = (this.images.gallery && this.images.gallery[index - 1]) || { status: '空', path: '' };
        const prompt = (this.prompts.gallery && this.prompts.gallery[index - 1]) || '';
        slots.push({
          slot: 'gallery',
          index,
          label: `配图 ${index}`,
          image,
          prompt: String(prompt),
        });
      }
      this.slots = slots;
    },

    formatTopics(topics) {
      return (topics || [])
        .map((topic) => String(topic).trim())
        .filter(Boolean)
        .map((topic) => (topic.startsWith('#') ? topic : `#${topic}`))
        .join(' ');
    },
    postText() {
      if (!this.draft) return '';
      const title = String(this.draft.title || '').trim();
      const body = String(this.draft.body || '').trim();
      const topics = this.formatTopics(this.draft.topics);
      return [title, body, topics].filter(Boolean).join('\n\n');
    },
    stepText(step) {
      if (step === '成稿') return '正在写这篇笔记';
      if (step === '提示词') return '正在让画面跟上';
      if (step === '封面') return '正在做封面';
      if (typeof step === 'string' && step.startsWith('配图')) return `正在做${step}`;
      return step || '';
    },
    statusLabel(status) {
      if (status === '生成中') return '进行中';
      if (status === '成功') return '成功';
      if (status === '失败') return '失败';
      if (status === '作废') return '作废';
      return '等待';
    },
    stepOn(name) {
      const order = { materials: 1, copy: 2, images: 3 };
      return order[this.phase] >= order[name];
    },
    canGo(name) {
      if (name === 'materials') return true;
      if (name === 'copy') return Boolean(this.draft) || this.phase === 'copy';
      return Boolean(this.draft) && !this.promptsWaiting && Boolean(String(this.prompts.cover || '').trim());
    },
    go(name) {
      if (!this.canGo(name)) return;
      this.phase = name;
    },
    clearError(field) {
      this.errors[field] = '';
    },
    focusField(name) {
      this.$nextTick(() => {
        const el = this.$refs[name];
        if (el && typeof el.focus === 'function') el.focus();
      });
    },
    validateForm() {
      this.errors = { business: '', article: '', galleryCount: '' };
      if (!String(this.business || '').trim()) this.errors.business = '先用一句话说你要发什么。';
      if (this.articleLength > 8000) this.errors.article = '贴进来的原文太长了，先删到 8000 字以内。';
      const count = Number(this.galleryCount);
      if (!Number.isInteger(count) || count < 0 || count > 9) {
        this.errors.galleryCount = '配图张数要在 0 到 9 之间。';
      }
      const first = ['business', 'article', 'galleryCount'].find((field) => this.errors[field]);
      if (!first) return true;
      this.focusField(first);
      return false;
    },
    call(method, payload) {
      return window.studioHost.call(method, payload);
    },
    applyServer(data) {
      const next = data || {};
      this.business = typeof next.business === 'string' ? next.business : '';
      this.article = typeof next.article === 'string' ? next.article : '';
      this.galleryCount = next.galleryCount == null ? 1 : next.galleryCount;
      this.draft = next.draft || null;
      this.prompts = next.prompts || { cover: '', gallery: [], stale: false, basis: null };
      this.images = next.images || { cover: { status: '空', path: '' }, gallery: [] };
      this.job = next.job || { running: false, step: '', error: '' };
      this.directory = next.directory || '';
      this.postId = next.id || '';
      this.syncSlots();
    },
    async loadPreviews() {
      for (const item of this.slots) {
        if (item.image.status !== '成功' || !item.image.path || this.previews[item.image.path]) continue;
        const result = await this.call('previewImage', { slot: item.slot, index: item.index });
        if (result && result.ok && result.dataUrl) this.previews[item.image.path] = result.dataUrl;
      }
    },
    stopPoll() {
      if (!this.pollTimer) return;
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    },
    ensurePoll() {
      if (this.pollTimer) return;
      this.pollTimer = setInterval(() => {
        this.refresh();
      }, 1500);
    },
    async refresh() {
      if (!this.hostReady || !this.postId) return;
      const data = await this.call('loadLatest');
      if (!data || data.ok === false) {
        this.notice = data && data.message ? data.message : '没有读到这一篇';
        return;
      }
      this.applyServer(data);
      if (data.job && data.job.running) this.ensurePoll();
      else this.stopPoll();
      await this.loadPreviews();
    },
    async init() {
      if (!this.hostReady) return;
      const intent = window.studioHost.intent;
      window.studioHost.intent = null;
      if (intent && intent.postId) {
        await this.onOpen({ id: intent.postId });
        return;
      }
      const fresh = await this.call('startNew');
      if (fresh && fresh.ok === false) {
        await this.refresh();
        if (this.draft) this.phase = 'copy';
        return;
      }
      this.applyServer(fresh);
      this.phase = 'materials';
    },
    editorPayload() {
      return {
        business: this.business,
        article: this.article,
        galleryCount: this.galleryCount,
        draft: this.draft,
        prompts: {
          cover: this.prompts.cover,
          gallery: this.prompts.gallery,
        },
      };
    },
    async persist() {
      if (!this.hostReady || this.job.running || !this.postId) return;
      const result = await this.call('saveEditor', this.editorPayload());
      if (result && result.ok === false) {
        if (result.message === '正在生成，请等这一轮结束') return;
        this.notice = result.message || '没有保存';
        return;
      }
      await this.refresh();
    },
    noteRejection(result) {
      if (!result || result.ok !== false) return false;
      if (result.field && Object.prototype.hasOwnProperty.call(this.errors, result.field)) {
        this.errors[result.field] = result.message;
        this.focusField(result.field);
      } else {
        this.notice = result.message || '没有完成';
      }
      return true;
    },
    async onGenerateDraft() {
      if (!this.hostReady || this.job.running) return;
      this.notice = '';
      if (!this.validateForm()) return;
      const result = await this.call('generateDraft', {
        business: this.business,
        article: this.article,
        galleryCount: this.galleryCount,
      });
      if (this.noteRejection(result)) return;
      this.postId = result.id || this.postId;
      this.phase = 'copy';
      this.job = { running: true, step: '成稿', error: '' };
      this.ensurePoll();
      await this.refresh();
    },
    async onGeneratePrompts() {
      if (!this.hostReady || this.job.running || !this.draft) return;
      this.notice = '';
      const result = await this.call('generatePrompts', {
        draft: this.draft,
        galleryCount: this.galleryCount,
      });
      if (this.noteRejection(result)) return;
      this.job = { running: true, step: '提示词', error: '' };
      this.ensurePoll();
      await this.refresh();
    },
    setSlotPrompt(item) {
      const value = String(item.prompt || '');
      if (item.slot === 'cover') {
        this.prompts.cover = value;
        return;
      }
      const gallery = Array.isArray(this.prompts.gallery) ? this.prompts.gallery.slice() : [];
      while (gallery.length < item.index) gallery.push('');
      gallery[item.index - 1] = value;
      this.prompts.gallery = gallery;
    },
    slotDrawDisabled(item) {
      return !this.hostReady
        || this.job.running
        || !this.draft
        || this.promptsWaiting
        || !String(item.prompt || '').trim();
    },
    drawLabel(item) {
      return item.image && item.image.status === '成功' ? '再抽一张' : '生成这张';
    },
    async onDraw(item) {
      if (this.slotDrawDisabled(item)) return;
      this.notice = '';
      const count = Number(this.galleryCount) || 0;
      const result = await this.call('generateImages', {
        slot: item.slot,
        index: item.index,
        prompts: {
          cover: this.prompts.cover,
          gallery: (this.prompts.gallery || []).slice(0, count),
        },
      });
      if (this.noteRejection(result)) return;
      this.job = { running: true, step: item.slot === 'cover' ? '封面' : item.label, error: '' };
      this.ensurePoll();
      await this.refresh();
    },
    async onReveal(item) {
      if (!this.hostReady || item.image.status !== '成功') return;
      const result = await this.call('revealImage', { slot: item.slot, index: item.index });
      if (result && result.ok === false) this.notice = result.message || '没有找到这张图';
    },
    async onCopyPost() {
      const text = this.postText();
      if (!text) return;
      await this.writeClipboard(text);
    },
    async onOpenHistory() {
      this.clearCopied();
      if (!window.studioHost.go) return;
      await window.studioHost.go('history');
    },
    clearCopied() {
      if (this.copiedTimer) {
        clearTimeout(this.copiedTimer);
        this.copiedTimer = null;
      }
      this.copied = '';
    },
    showCopied(message) {
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copied = message;
      this.copiedTimer = setTimeout(() => {
        this.copied = '';
        this.copiedTimer = null;
      }, 2000);
    },
    async writeClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        this.showCopied('已复制');
      } catch (err) {
        this.showCopied('没有复制成功');
      }
    },
    async onNew() {
      if (!this.hostReady || this.job.running) return;
      const fresh = await this.call('startNew');
      if (fresh && fresh.ok === false) {
        this.notice = fresh.message || '没有完成';
        return;
      }
      this.previews = {};
      this.errors = { business: '', article: '', galleryCount: '' };
      this.clearCopied();
      this.applyServer(fresh);
      this.phase = 'materials';
    },
    async onOpen(item) {
      if (!this.hostReady || this.job.running || !item || item.id === this.postId) return;
      const result = await this.call('openPost', { id: item.id });
      if (!result || result.ok === false) {
        this.notice = result && result.message ? result.message : '没有这一篇';
        return;
      }
      this.previews = {};
      this.errors = { business: '', article: '', galleryCount: '' };
      this.clearCopied();
      this.applyServer(result);
      this.phase = result.draft ? 'copy' : 'materials';
    },
    async onCountChange() {
      const count = Number(this.galleryCount);
      if (!Number.isInteger(count) || count < 0 || count > 9) {
        this.errors.galleryCount = '配图张数要在 0 到 9 之间。';
        this.focusField('galleryCount');
        return;
      }
      this.errors.galleryCount = '';
      await this.persist();
    },
  };
}
