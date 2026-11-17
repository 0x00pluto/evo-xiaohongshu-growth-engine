function notePage() {
  /** 与 src/prompts/article-combo.js 同源；静态页无打包 import，须保持同步 */
  const RECOMMENDED_GOALS_BY_PERSONA = {
    素人: ['种草', '搜索'],
    KOC: ['种草', '涨粉', '搜索'],
    达人: ['种草', '涨粉', '曝光', '搜索'],
    官号: ['引流', '曝光', '搜索', '转化'],
    创始人: ['种草', '引流', '涨粉', '曝光', '转化'],
    店主: ['引流', '搜索', '转化'],
    员工: ['种草', '引流', '搜索', '转化'],
  };

  const REFERENCES_MAX = 5;

  return {
    ...window.createStudioToast(),
    ...window.createRiskPanel(),
    ...window.createNoteReferences(),
    ...window.createNoteSamples(),
    ...window.createNoteUploadRefs(),
    ...window.createNoteImages(),
    ...window.createNoteAlbums(),
    riskPersistToDraft: true,
    business: '',
    sampleTitle: '',
    sampleBody: '',
    references: [],
    referencesMax: REFERENCES_MAX,
    articleType: '涨粉',
    persona: '素人',
    personaOptions: ['素人', 'KOC', '达人', '官号', '创始人', '店主', '员工'],
    goalOptions: ['种草', '引流', '涨粉', '曝光', '搜索', '转化'],
    galleryCount: 1,
    draft: null,
    emptyCopyDraft: { title: '', body: '', topics: [] },
    prompts: {
      cover: '',
      storyType: '',
      look: '',
      gallery: [],
      galleryLines: [],
      galleryRoles: [],
      style: '',
      stale: false,
      basis: null,
    },
    images: { cover: { status: '空', path: '', selected: 0, revisedAt: 0, versions: [] }, gallery: [] },
    job: { running: false, step: '', error: '' },
    pendingCall: false,
    errors: { business: '', sampleBody: '', references: '', galleryCount: '' },
    notice: '',
    lastToastedJobError: '',
    directory: '',
    pollTimer: null,
    phase: 'materials',
    postId: '',
    bodyDraft: '',
    editor: { cover: '', gallery: [] },
    postUploadRefs: [],
    picks: { cover: { materialIds: [], overrides: {} }, gallery: [] },

    hostReady: window.studioHost.ready,
    get sampleLength() {
      return Array.from(String(this.sampleBody || '').trim()).length;
    },
    isRecommendedCombo(persona, goal) {
      const goals = RECOMMENDED_GOALS_BY_PERSONA[persona];
      return Array.isArray(goals) && goals.includes(goal);
    },
    goalOptionLabel(goal) {
      return this.isRecommendedCombo(this.persona, goal) ? `★ ${goal}` : goal;
    },
    get canGenerateDraft() {
      return Boolean(this.hostReady && !this.job.running && !this.pendingCall && String(this.business || '').trim());
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
    get copyDraft() {
      return this.draft || this.emptyCopyDraft;
    },
    postText() {
      if (!this.draft) return '';
      const title = String(this.draft.title || '').trim();
      const body = String(this.draft.body || '').trim();
      const topics = this.formatTopics(this.draft.topics);
      return [title, body, topics].filter(Boolean).join('\n\n');
    },
    riskGetFields() {
      const draft = this.draft || this.emptyCopyDraft;
      return [
        { id: 'title', text: String(draft.title || '') },
        { id: 'body', text: String(draft.body || '') },
        { id: 'topics', text: this.formatTopics(draft.topics) },
      ];
    },
    riskReadField(fieldId) {
      const draft = this.draft || this.emptyCopyDraft;
      if (fieldId === 'title') return String(draft.title || '');
      if (fieldId === 'body') return String(draft.body || '');
      if (fieldId === 'topics') return this.formatTopics(draft.topics);
      return '';
    },
    riskWriteField(fieldId, text) {
      if (!this.draft) {
        this.draft = {
          title: '',
          body: '',
          topics: [],
        };
      }
      if (fieldId === 'title') {
        this.draft.title = String(text || '');
      } else if (fieldId === 'body') {
        this.draft.body = String(text || '');
        this.syncBodyDraft();
      } else if (fieldId === 'topics') {
        const topics = [...String(text || '').matchAll(/#([^#\n]+)/g)]
          .map((item) => item[1].trim())
          .filter(Boolean);
        this.draft.topics = topics;
        this.syncBodyDraft();
      }
      this.persist();
    },
    riskFieldElement(fieldId) {
      if (fieldId === 'title') return document.getElementById('draft-title');
      if (fieldId === 'body' || fieldId === 'topics') return document.getElementById('draft-body');
      return null;
    },
    riskMapHitToElement(hit) {
      if (!hit) return null;
      if (hit.fieldId === 'title') {
        const el = this.riskFieldElement('title');
        return el ? { el, start: hit.start, end: hit.end } : null;
      }
      if (hit.fieldId === 'body') {
        const el = this.riskFieldElement('body');
        return el ? { el, start: hit.start, end: hit.end } : null;
      }
      if (hit.fieldId === 'topics') {
        const el = this.riskFieldElement('topics');
        if (!el) return null;
        const body = String((this.draft && this.draft.body) || '').replace(/\s+$/, '');
        const offset = body ? body.length + 2 : 0;
        return { el, start: offset + hit.start, end: offset + hit.end };
      }
      return null;
    },
    albumWaitName() {
      const style = this.prompts && String(this.prompts.style || '').trim();
      const look = String(this.selectedLook || (this.prompts && this.prompts.look) || '').trim();
      let label = style;
      if (!label && look) {
        const hit = (this.albums || []).find((item) => item.id === look);
        if (hit && hit.label) label = hit.label;
      }
      const text = String(label || '').trim();
      if (!text) return '';
      const cut = text.split(/[,，、]/)[0].trim();
      return cut || text;
    },
    stepText(step) {
      if (step === '成稿') return '正在写这篇笔记';
      if (step === '定画面') return '正在定这一套图';
      const name = this.albumWaitName();
      if (step === '封面') return name ? `正在用${name}画封面` : '正在画封面';
      if (typeof step === 'string' && step.startsWith('配图')) {
        const number = step.replace(/^配图\s*/, '');
        return name ? `正在用${name}画第 ${number} 张` : `正在画第 ${number} 张`;
      }
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
    get hasGeneratedImage() {
      return this.slots.some((item) => item.image && item.image.status === '成功' && item.image.path);
    },
    get canOpenSlotPrompt() {
      const editor = this.editor && typeof this.editor === 'object' ? this.editor : { cover: '', gallery: [] };
      if (String(editor.cover || '').trim()) return true;
      return (Array.isArray(editor.gallery) ? editor.gallery : []).some((item) => String(item || '').trim());
    },
    get coverSlot() {
      return this.slots.find((item) => item.slot === 'cover') || null;
    },
    get gallerySlots() {
      return this.slots.filter((item) => item.slot === 'gallery');
    },
    setFormError(field, message) {
      const msg = String(message == null ? '' : message).trim();
      this.errors[field] = msg;
      if (msg) this.showToast(msg);
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
      this.errors = { business: '', sampleBody: '', references: '', galleryCount: '' };
      if (!String(this.business || '').trim()) this.errors.business = '先用一句话说你要发什么。';
      if (this.sampleLength > 8000) this.errors.sampleBody = '贴进来的原文太长了，先删到 8000 字以内。';
      if (this.references.length > REFERENCES_MAX) {
        this.errors.references =  `产品资料最多 ${REFERENCES_MAX} 条。`;
      }
      const count = Number(this.galleryCount);
      if (!Number.isInteger(count) || count < 0 || count > 9) {
        this.errors.galleryCount = '笔记内图数量要在 0 到 9 之间。';
      }
      const first = ['business', 'sampleBody', 'references', 'galleryCount'].find((field) => this.errors[field]);
      if (!first) return true;
      this.showToast(this.errors[first]);
      if (first === 'sampleBody') this.sampleOpen = true;
      this.focusField(first === 'sampleBody' ? 'sampleBody' : first);
      return false;
    },
    call(method, payload) {
      return window.studioHost.call(method, payload);
    },
    applyServer(data) {
      const next = data || {};
      const prevId = this.postId;
      this.business = typeof next.business === 'string' ? next.business : '';
      this.sampleTitle = typeof next.sampleTitle === 'string' ? next.sampleTitle : '';
      if (typeof next.sampleBody === 'string') {
        this.sampleBody = next.sampleBody;
      } else if (typeof next.article === 'string') {
        this.sampleBody = next.article;
      } else {
        this.sampleBody = '';
      }
      this.references = Array.isArray(next.references)
        ? next.references.map((item) => this.normalizeReferenceItem(item)).filter(Boolean)
        : [];
      if (next.articleType === '素人') {
        this.articleType = '涨粉';
        this.persona = '素人';
      } else {
        const goals = ['种草', '引流', '涨粉', '曝光', '搜索', '转化'];
        const personas = ['素人', 'KOC', '达人', '官号', '创始人', '店主', '员工'];
        this.articleType = goals.includes(next.articleType) ? next.articleType : '涨粉';
        this.persona = personas.includes(next.persona) ? next.persona : '素人';
      }
      this.galleryCount = next.galleryCount == null ? 1 : next.galleryCount;
      this.draft = next.draft || null;
      if (this.draft) this.emptyCopyDraft = { title: '', body: '', topics: [] };
      this.prompts = next.prompts || {
        cover: '',
        storyType: '',
        look: '',
        gallery: [],
        galleryLines: [],
        galleryRoles: [],
        style: '',
        stale: false,
        basis: null,
      };
      this.images = next.images || { cover: { status: '空', path: '' }, gallery: [] };
      this.postUploadRefs = Array.isArray(next.uploadRefs)
        ? next.uploadRefs
        : (Array.isArray(next.materials) ? next.materials : []);
      this.picks = next.picks && typeof next.picks === 'object'
        ? next.picks
        : { cover: { materialIds: [], overrides: {} }, gallery: [] };
      const prevJobError = this.job && this.job.error ? String(this.job.error) : '';
      this.job = next.job || { running: false, step: '', error: '' };
      const nextJobError = (!this.job.running && this.job.error) ? String(this.job.error).trim() : '';
      if (nextJobError && nextJobError !== prevJobError && nextJobError !== this.lastToastedJobError) {
        this.lastToastedJobError = nextJobError;
        this.showToast(nextJobError, 4000);
      }
      if (!nextJobError) this.lastToastedJobError = '';
      this.directory = next.directory || '';
      this.postId = next.id || '';
      this.editor = next.editor && typeof next.editor === 'object'
        ? {
          cover: typeof next.editor.cover === 'string' ? next.editor.cover : '',
          gallery: Array.isArray(next.editor.gallery)
            ? next.editor.gallery.map((item) => String(item || ''))
            : [],
        }
        : { cover: '', gallery: [] };
      if (Array.isArray(next.aspectRatios) && next.aspectRatios.length) {
        this.aspectRatios = next.aspectRatios.map((item) => String(item));
      }
      this.aspectRatio = typeof next.aspectRatio === 'string' && next.aspectRatio
        ? next.aspectRatio
        : '3:4';
      this.aspectRatioLocked = typeof next.aspectRatioLocked === 'string'
        ? next.aspectRatioLocked
        : '';
      this.aspectRatioCss = typeof next.aspectRatioCss === 'string' && next.aspectRatioCss
        ? next.aspectRatioCss
        : this.cssAspectFromRatio(this.aspectRatio);
      if (!this.canOpenSlotPrompt) this.slotPromptExpanded = false;
      const stamped = typeof this.prompts.look === 'string' ? this.prompts.look : '';
      if (this.postId !== prevId) this.selectedLook = stamped;
      else if (!this.selectedLook) this.selectedLook = stamped;
      this.syncSlots();
      // 成稿后回填/自动本机查词；词库按正文+勾选，AI 按正文；不占 job.running
      if (this.draft && this.postId) {
        const fp = this.riskFingerprint();
        const hydrated = next.risk ? this.riskApplyFromDraft(next.risk, fp) : false;
        if (!hydrated || this.riskLastFingerprint !== fp) {
          void this.riskEnsureAutoCheck();
        }
      } else if (this.postId !== prevId) {
        this.riskStopAiPoll();
        this.riskHits = [];
        this.riskStatus = '';
        this.riskMessage = '';
        this.riskCannotCount = 0;
        this.riskRewriteCount = 0;
        this.riskAiSuggestions = [];
        this.riskAiMessage = '';
        this.riskAiBusy = false;
        this.riskAiRecovering = false;
        this.riskAiId = '';
        this.riskLastFingerprint = '';
        this.riskLastAiFingerprint = '';
        this.riskUndo = null;
        this.riskCloseMarkPopover();
      }
      this.syncBodyDraft();
      this.loadUploadRefPreviews();
    },
    get selectableAlbums() {
      return (this.albums || []).filter((item) => item && item.safetyStatus !== 'flagged');
    },
    resetBrief() {
      this.articleType = '涨粉';
      this.persona = '素人';
      this.sampleOpen = false;
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
        this.showToast(data && data.message ? data.message : '没有读到这一篇');
        return;
      }
      this.applyServer(data);
      if (data.job && data.job.running) this.ensurePoll();
      else this.stopPoll();
      await this.loadPreviews();
    },
    async init() {
      if (!this.hostReady) return;
      await this.loadAlbums();
      await this.riskLoadSetup();
      const intent = window.studioHost.intent;
      window.studioHost.intent = null;
      if (intent && intent.postId) {
        await this.onOpen({ id: intent.postId });
        return;
      }
      const fresh = await this.call('startNew');
      if (fresh && fresh.ok === false) {
        if (await this.resumeRunningJob(fresh)) return;
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
      if (intent && intent.sampleId) {
        await this.applyLibrarySample(String(intent.sampleId));
      }
    },

    /**
     * 从资料库带一篇对标文案进「要发什么」。
     * @param {string} sampleId
     */
    async applyLibrarySample(sampleId) {
      const id = String(sampleId || '').trim();
      if (!id) return;
      const data = await this.call('getLibraryArticleSample', { id });
      if (!data || data.ok === false || !data.sample) {
        this.setFormError('sampleBody', (data && data.message) || '读对标文案失败');
        this.sampleOpen = true;
        return;
      }
      this.sampleTitle = String(data.sample.title || '').trim();
      this.sampleBody = String(data.sample.body || '').trim();
      this.errors.sampleBody = '';
      this.sampleOpen = false;
      this.phase = 'materials';
    },
    editorPayload() {
      return {
        business: this.business,
        sampleTitle: this.sampleTitle,
        sampleBody: this.sampleBody,
        references: this.references,
        articleType: this.articleType,
        persona: this.persona,
        galleryCount: this.galleryCount,
        draft: this.draft,
        promptEdits: {
          cover: this.editor && this.editor.cover ? this.editor.cover : '',
          gallery: this.editor && Array.isArray(this.editor.gallery) ? this.editor.gallery.slice() : [],
        },
      };
    },
    riskCanPersistDraft() {
      return Boolean(this.postId && this.draft);
    },
    async persist() {
      if (!this.hostReady || this.job.running || !this.postId || !this.draft) return;
      const result = await this.call('saveEditor', this.editorPayload());
      if (result && result.ok === false) {
        if (result.message === '正在生成，请等这一轮结束') return;
        this.showToast(result.message || '没有保存');
        return;
      }
      await this.refresh();
      // 文案变了则指纹变，自动重查
      await this.riskEnsureAutoCheck();
    },
    noteRejection(result) {
      if (!result || result.ok !== false) return false;
      if (result.silenced) return true;
      if (result.field && Object.prototype.hasOwnProperty.call(this.errors, result.field)) {
        this.errors[result.field] = result.message;
        if (result.field === 'sampleBody') this.sampleOpen = true;
        this.focusField(result.field === 'sampleBody' ? 'sampleBody' : result.field);
      } else {
        this.showToast(result.message || '没有完成');
      }
      return true;
    },
    async resumeRunningJob(result) {
      if (!result || result.ok !== false) return false;
      if (result.message !== '正在生成，请等这一轮结束') return false;
      if (!result.id || !result.job || !result.job.running) return false;
      this.applyServer(result);
      this.resetPreview();
      this.phase = 'copy';
      if (!this.draft) {
        this.emptyCopyDraft = { title: '', body: '', topics: [] };
        this.syncSlots();
        this.syncBodyDraft();
      }
      this.ensurePoll();
      await this.loadPreviews();
      return true;
    },
    async onGenerateDraft() {
      if (!this.hostReady || this.job.running || this.pendingCall) return;
      if (!this.validateForm()) return;
      this.pendingCall = true;
      try {
        const result = await this.call('generateDraft', {
          business: this.business,
          sampleTitle: this.sampleTitle,
          sampleBody: this.sampleBody,
          references: this.references,
          articleType: this.articleType,
          persona: this.persona,
          galleryCount: this.galleryCount,
        });
        if (await this.resumeRunningJob(result)) return;
        if (this.noteRejection(result)) return;
        this.postId = result.id || this.postId;
        this.emptyCopyDraft = { title: '', body: '', topics: [] };
        this.phase = 'copy';
        this.job = { running: true, step: '成稿', error: '' };
        this.syncSlots();
        this.syncBodyDraft();
        this.ensurePoll();
        await this.refresh();
      } finally {
        this.pendingCall = false;
      }
    },
    async onOpenHistory() {
      this.dismissToast();
      if (!window.studioHost.go) return;
      await window.studioHost.go('history');
    },
    async onNew() {
      if (!this.hostReady || this.job.running) return;
      const fresh = await this.call('startNew');
      if (fresh && fresh.ok === false) {
        if (await this.resumeRunningJob(fresh)) return;
        this.showToast(fresh.message || '没有完成');
        return;
      }
      this.previews = {};
      this.errors = { business: '', sampleBody: '', references: '', galleryCount: '' };
      this.dismissToast();
      this.applyServer(fresh);
      this.resetBrief();
      this.resetPreview();
      this.phase = 'materials';
    },
    async onOpen(item) {
      if (!this.hostReady || this.job.running || !item || item.id === this.postId) return;
      const result = await this.call('openPost', { id: item.id });
      if (!result || result.ok === false) {
        this.showToast(result && result.message ? result.message : '没有这一篇');
        return;
      }
      this.previews = {};
      this.errors = { business: '', sampleBody: '', references: '', galleryCount: '' };
      this.dismissToast();
      this.applyServer(result);
      this.resetBrief();
      this.resetPreview();
      this.phase = result.draft ? 'copy' : 'materials';
      await this.loadPreviews();
    },
    async onCountChange() {
      const count = Number(this.galleryCount);
      if (!Number.isInteger(count) || count < 0 || count > 9) {
        this.setFormError('galleryCount', '笔记内图数量要在 0 到 9 之间。');
        this.focusField('galleryCount');
        return;
      }
      this.errors.galleryCount = '';
      this.phase = 'materials';
      await this.persist();
    },
  };
}
