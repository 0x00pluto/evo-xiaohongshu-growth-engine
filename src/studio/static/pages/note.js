function notePage() {
  return {
    business: '',
    article: '',
    articleType: '素人',
    articleOpen: false,
    galleryCount: 1,
    draft: null,
    prompts: {
      cover: '',
      coverType: '',
      setType: '',
      gallery: [],
      galleryLines: [],
      galleryRoles: [],
      style: '',
      stale: false,
      basis: null,
    },
    images: { cover: { status: '空', path: '', selected: 0, revisedAt: 0, versions: [] }, gallery: [] },
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
    promptOpen: {},
    bodyDraft: '',
    activeKey: 'cover-0',

    hostReady: window.studioHost.ready,
    get articleLength() {
      return Array.from(String(this.article || '').trim()).length;
    },
    get reading() {
      return this.prompts.coverType === 'compare' ? 'compare' : 'breakdown';
    },
    // 表单里的张数是下一次「写成笔记」要用的。笔记上的槽位跟上次写成的结果走。
    committedGalleryCount() {
      const basisCount = this.prompts && this.prompts.basis ? Number(this.prompts.basis.galleryCount) : NaN;
      if (Number.isInteger(basisCount) && basisCount >= 0 && basisCount <= 9) return basisCount;
      const count = Number(this.galleryCount);
      return Number.isInteger(count) && count > 0 ? count : 0;
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
      const total = this.committedGalleryCount();
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

    // 小红书计字：半角两个算一个，全角算一个，半角落单时向上取整。
    charCount(text) {
      let units = 0;
      for (const ch of Array.from(String(text || ''))) {
        units += ch.codePointAt(0) <= 0xff ? 1 : 2;
      }
      return Math.ceil(units / 2);
    },
    composeBody() {
      if (!this.draft) return '';
      const body = String(this.draft.body || '').replace(/\s+$/, '');
      const topics = this.formatTopics(this.draft.topics);
      if (!topics || body.endsWith(topics)) return body;
      return body ? `${body}\n\n${topics}` : topics;
    },
    splitBodyTopics(text) {
      const source = String(text || '');
      const tail = source.match(/((?:\s*#[^#\n]+)+\s*)$/);
      if (!tail) return { body: source.replace(/\s+$/, ''), topics: [] };
      const chunk = tail[1];
      const body = source.slice(0, source.length - chunk.length).replace(/\s+$/, '');
      const topics = [...chunk.matchAll(/#([^#\n]+)/g)].map((item) => item[1].trim()).filter(Boolean);
      return { body, topics };
    },
    syncBodyDraft() {
      this.bodyDraft = this.composeBody();
    },
    onBodyDraft() {
      if (!this.draft) return;
      const text = String(this.bodyDraft || '');
      const split = this.splitBodyTopics(text);
      this.draft.body = split.body;
      this.draft.topics = split.topics;
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
      if (step === '成稿' || step === '提示词') return '正在写这篇笔记';
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
      const order = { materials: 1, copy: 2 };
      return order[this.phase] >= order[name];
    },
    canGo(name) {
      if (name === 'materials') return true;
      return Boolean(this.draft) || this.phase === 'copy';
    },
    go(name) {
      if (!this.canGo(name)) return;
      this.phase = name;
      if (name === 'copy') this.loadPreviews();
    },
    promptKey(item) {
      return `${item.slot}-${item.index}`;
    },
    promptIsOpen(item) {
      return Boolean(item && this.promptOpen[this.promptKey(item)]);
    },
    get activeSlot() {
      return this.slots.find((item) => this.promptKey(item) === this.activeKey) || this.slots[0] || null;
    },
    get activeVersions() {
      const image = this.activeSlot && this.activeSlot.image;
      return image && Array.isArray(image.versions) ? image.versions : [];
    },
    get imageTotal() {
      return this.slots.length;
    },
    get imageIndex() {
      if (!this.slots.length) return 0;
      const index = this.slots.findIndex((item) => this.promptKey(item) === this.activeKey);
      return (index < 0 ? 0 : index) + 1;
    },
    slotSelected(item) {
      const active = this.activeSlot;
      return Boolean(active && item && this.promptKey(active) === this.promptKey(item));
    },
    previewKey(item) {
      const image = item && item.image;
      if (!image || !image.path) return '';
      return `${image.path}@${image.revisedAt || 0}`;
    },
    slotPreview(item) {
      if (!item || !item.image || !item.image.path) return '';
      if (item.image.status !== '成功' && item.image.status !== '生成中') return '';
      return this.previews[this.previewKey(item)] || '';
    },
    versionPreview(version) {
      if (!version || !version.path) return '';
      return this.previews[`${version.path}@${version.revisedAt || 0}`] || '';
    },
    versionChosen(item, index) {
      return Boolean(item && item.image && item.image.selected === index + 1);
    },
    drawKey(item) {
      // 键带上能不能点，以及这张图的修订号。列表复用旧节点时，disabled 和图片都会停在第一次的结果。
      const status = item && item.image && item.image.status ? item.image.status : '空';
      const revised = item && item.image && item.image.revisedAt ? item.image.revisedAt : 0;
      const selected = item && item.image && item.image.selected ? item.image.selected : 0;
      return `${this.promptKey(item)}-${status}-${revised}-${selected}-${this.slotDrawDisabled(item) ? 'off' : 'on'}`;
    },
    get hasGeneratedImage() {
      return this.slots.some((item) => item.image && item.image.status === '成功' && item.image.path);
    },
    selectImage(item) {
      if (!item) return;
      this.activeKey = this.promptKey(item);
      this.promptOpen = { [this.activeKey]: true };
    },
    showSlide(index) {
      const item = this.slots[Number(index)];
      if (!item) return;
      this.activeKey = this.promptKey(item);
      if (Object.values(this.promptOpen).some(Boolean)) {
        this.promptOpen = { [this.activeKey]: true };
      }
    },
    stepImage(delta) {
      if (!this.slots.length) return;
      const index = this.slots.findIndex((item) => this.promptKey(item) === this.activeKey);
      const current = index < 0 ? 0 : index;
      const next = (current + delta + this.slots.length) % this.slots.length;
      this.showSlide(next);
    },
    resetPreview() {
      this.previewMode = 'note';
      this.activeKey = 'cover-0';
      this.promptOpen = {};
    },
    get coverSlot() {
      return this.slots.find((item) => item.slot === 'cover') || null;
    },
    get gallerySlots() {
      return this.slots.filter((item) => item.slot === 'gallery');
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
      if (first === 'article') this.articleOpen = true;
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
      this.prompts = next.prompts || {
        cover: '',
        coverType: '',
        setType: '',
        gallery: [],
        galleryLines: [],
        galleryRoles: [],
        style: '',
        stale: false,
        basis: null,
      };
      this.images = next.images || { cover: { status: '空', path: '' }, gallery: [] };
      this.job = next.job || { running: false, step: '', error: '' };
      this.directory = next.directory || '';
      this.postId = next.id || '';
      this.syncSlots();
      this.syncBodyDraft();
    },
    resetBrief() {
      this.articleType = '素人';
      this.articleOpen = this.articleLength > 0;
    },
    async loadPreviews() {
      const next = { ...this.previews };
      let changed = false;
      const live = new Set();
      for (const item of this.slots) {
        const versions = item.image && Array.isArray(item.image.versions) ? item.image.versions : [];
        for (let index = 0; index < versions.length; index += 1) {
          const version = versions[index];
          const key = `${version.path}@${version.revisedAt || 0}`;
          live.add(key);
          if (next[key]) continue;
          const result = await this.call('previewImage', {
            slot: item.slot,
            index: item.index,
            version: index + 1,
          });
          if (result && result.ok && result.dataUrl) {
            next[key] = result.dataUrl;
            changed = true;
          }
        }
      }
      for (const key of Object.keys(next)) {
        if (live.has(key)) continue;
        delete next[key];
        changed = true;
      }
      if (changed) this.previews = next;
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
        this.resetBrief();
        this.resetPreview();
        if (this.draft) this.phase = 'copy';
        return;
      }
      this.applyServer(fresh);
      this.resetBrief();
      this.resetPreview();
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
        if (result.field === 'article') this.articleOpen = true;
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
    async onReading(next) {
      if (!this.hostReady || this.job.running || !this.draft || next === this.reading) return;
      this.notice = '';
      const result = await this.call('reinterpret', { reading: next });
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
        || !String(item.prompt || '').trim();
    },
    drawLabel(item) {
      return item.image && item.image.status === '成功' ? '再抽一张' : '生成这张';
    },
    async onDraw(item) {
      if (this.slotDrawDisabled(item)) return;
      this.notice = '';
      const result = await this.call('generateImages', {
        slot: item.slot,
        index: item.index,
        prompts: {
          cover: this.prompts.cover,
          gallery: Array.isArray(this.prompts.gallery) ? this.prompts.gallery.slice() : [],
        },
      });
      if (this.noteRejection(result)) return;
      this.job = { running: true, step: item.slot === 'cover' ? '封面' : item.label, error: '' };
      this.ensurePoll();
      await this.refresh();
    },
    async onChooseVersion(item, version) {
      if (!this.hostReady || this.job.running || !item) return;
      this.notice = '';
      const result = await this.call('chooseImage', {
        slot: item.slot,
        index: item.index,
        version,
      });
      if (result && result.ok === false) {
        this.notice = result.message || '没有这一张';
        return;
      }
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
      this.resetBrief();
      this.resetPreview();
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
      this.resetBrief();
      this.resetPreview();
      this.phase = result.draft ? 'copy' : 'materials';
      await this.loadPreviews();
    },
    async onCountChange() {
      const count = Number(this.galleryCount);
      if (!Number.isInteger(count) || count < 0 || count > 9) {
        this.errors.galleryCount = '配图张数要在 0 到 9 之间。';
        this.focusField('galleryCount');
        return;
      }
      this.errors.galleryCount = '';
      this.phase = 'materials';
      await this.persist();
    },
  };
}
