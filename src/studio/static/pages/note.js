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

  const PERSONA_HELP = {
    素人: '真实体验口吻，像身边朋友随手分享，少官腔。',
    KOC: '有一点垂直经验的真实用户，能讲清对比与取舍。',
    达人: '领域熟练者，结构清晰、有方法或清单感。',
    官号: '品牌/机构官方口径，稳、可信、信息完整。',
    创始人: '以当事人身份讲判断与故事，带温度也带立场。',
    店主: '一线卖货视角，讲库存、价格、到店/下单路径。',
    员工: '一线服务或交付视角，讲真实接待与答疑。',
  };

  const GOAL_HELP = {
    种草: '让人想试、想买：共鸣 + 具体好处，轻推行动。',
    引流: '把人引到私信/外链/群：说清下一步怎么联系。',
    涨粉: '让人想关注你：人设记忆点 + 持续看下去的理由。',
    曝光: '拉开覆盖面：话题更宽、钩子更强、适合传播。',
    搜索: '覆盖查询意图：标题与正文对准用户会搜的词。',
    转化: '推动下单或报名：卖点、价格/名额、行动指令清楚。',
  };

  /** 与 docs/references/xhs-prompt-taxonomy.md 对齐；标签在 comboBriefHtml 里加粗 */
  const PERSONA_BRIEF = {
    素人: {
      identity: '普通用户，低粉，不是博主。',
      tone: '第一人称，口语化，可以吐槽、带情绪。给人的感觉是「我在用，顺便告诉你」，不是「我特意来推荐」。',
    },
    KOC: {
      identity: '某个领域有经验的普通博主，半专业。',
      tone: '像朋友，但有自己的判断；可用 emoji 帮排版。',
    },
    达人: {
      identity: '测评师、从业者等专业博主。',
      tone: '理性、敢下结论，术语要翻成白话。',
    },
    官号: {
      identity: '代表品牌或机构，要有统一人格。',
      tone: '调性统一，不发空洞口号，要讲具体场景。',
    },
    创始人: {
      identity: '品牌创始人/主理人，真人出镜。',
      tone: '真实、有观点，可客观点评竞品但不能贬低。',
    },
    店主: {
      identity: '本地门店老板。',
      tone: '讲亮点、环境、单品与人均，不留站外联系方式。',
    },
    员工: {
      identity: '一线服务或交付同事。',
      tone: '像帮客户办事，讲真实接待、答疑与落地细节。',
    },
  };

  const GOAL_BRIEF = {
    种草: '建立信任，让读者产生想试、想买的欲望。',
    引流: '把有意向的人引到站内入口（私信、群聊、店铺、留资）。',
    涨粉: '让人收藏、评论、关注，愿意持续看你。',
    曝光: '让读者知道这个品牌是谁、和别人有什么不同。',
    搜索: '靠长尾关键词获得长期的搜索流量。',
    转化: '面向正在做购买决定的用户，推动下单或报名。',
  };

  const REFERENCES_MAX = 5;

  return {
    business: '',
    sampleTitle: '',
    sampleBody: '',
    references: [],
    articleType: '涨粉',
    persona: '素人',
    personaOptions: ['素人', 'KOC', '达人', '官号', '创始人', '店主', '员工'],
    goalOptions: ['种草', '引流', '涨粉', '曝光', '搜索', '转化'],
    sampleOpen: false,
    pickSampleOpen: false,
    pickSampleError: '',
    pickSampleBusy: false,
    libraryArticleSamples: [],
    createSampleOpen: false,
    createSamplePaste: '',
    createSampleError: '',
    createSampleBusy: false,
    referenceHoverOpen: false,
    referenceHoverText: '',
    referenceHoverStyle: '',
    referenceEditorOpen: false,
    referenceEditorIndex: -1,
    referenceEditorText: '',
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
    albumStyleOpen: false,
    albums: [],
    selectedLook: '',
    albumSamples: {},
    albumDetailOpen: false,
    albumDetail: null,
    albumDetailSample: '',
    postUploadRefs: [],
    picks: { cover: { materialIds: [], overrides: {} }, gallery: [] },
    uploadRefPreviews: {},
    slotPromptExpanded: false,
    uploadRefEditorOpen: false,
    uploadRefEditorTarget: null,
    uploadRefEditorUsage: '',
    uploadRefEditorPreview: '',
    uploadRefEditorError: '',
    uploadRefEditorBusy: false,
    uploadRefAddMenuOpen: false,
    uploadRefHoverOpen: false,
    uploadRefHoverText: '',
    uploadRefHoverPreview: '',
    uploadRefHoverStyle: '',
    uploadRefUploadOpen: false,
    uploadPending: '',
    uploadUsage: '',
    uploadError: '',
    uploadRefUploading: false,
    deleteUploadRefOpen: false,
    deleteUploadRefTarget: null,
    uploadRefDeleting: false,
    saveToLibraryOpen: false,
    saveToLibraryTarget: null,
    saveToLibraryUsage: '',
    saveToLibraryError: '',
    saveToLibraryBusy: false,
    pickFromLibraryOpen: false,
    pickFromLibraryError: '',
    pickFromLibraryBusy: false,
    libraryUploadRefs: [],
    libraryPreviews: {},
    usagePlaceholder: '人物照片。按 Hero 放在画面中央，锁脸。',

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
    personaHelp(name) {
      return PERSONA_HELP[name] || '';
    },
    goalHelp(name) {
      return GOAL_HELP[name] || '';
    },
    comboBriefHtml() {
      const persona = PERSONA_BRIEF[this.persona];
      const goal = GOAL_BRIEF[this.articleType] || '';
      if (!persona || !goal) return '';
      const label = (text) => `<span class="font-medium text-base-content">${text}</span>`;
      return `${label('身份：')}${persona.identity}${label('语气：')}${persona.tone}${label('目标：')}${goal}`;
    },
    addReference() {
      if (this.job.running) return;
      if (this.references.length >= REFERENCES_MAX) {
        this.errors.references = `参考资料最多 ${REFERENCES_MAX} 条。`;
        return;
      }
      this.errors.references = '';
      this.references = [...this.references, ''];
      this.persist();
      this.openReferenceEditor(this.references.length - 1);
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
      const text = String(this.references[index] || '').trim();
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
      this.referenceEditorIndex = i;
      this.referenceEditorText = String(this.references[i] || '');
      this.referenceEditorOpen = true;
    },
    closeReferenceEditor() {
      this.referenceEditorOpen = false;
      this.referenceEditorIndex = -1;
      this.referenceEditorText = '';
    },
    confirmReferenceEditor() {
      const i = this.referenceEditorIndex;
      if (!Number.isInteger(i) || i < 0 || i >= this.references.length) {
        this.closeReferenceEditor();
        return;
      }
      const next = this.references.slice();
      next[i] = String(this.referenceEditorText || '');
      this.references = next;
      this.errors.references = '';
      this.persist();
      this.closeReferenceEditor();
    },
    deleteReferenceFromEditor() {
      const i = this.referenceEditorIndex;
      this.closeReferenceEditor();
      if (Number.isInteger(i) && i >= 0) this.removeReference(i);
    },
    splitPasteToSample(paste) {
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
    },
    sampleSummary() {
      if (!this.sampleLength && !String(this.sampleTitle || '').trim()) return '未填写';
      const title = String(this.sampleTitle || '').trim();
      return title || `${this.sampleLength} 字`;
    },
    get canGenerateDraft() {
      return Boolean(this.hostReady && !this.job.running && !this.pendingCall && String(this.business || '').trim());
    },
    clearSample() {
      if (this.job.running) return;
      this.sampleTitle = '';
      this.sampleBody = '';
      this.sampleOpen = false;
      this.errors.sampleBody = '';
      this.persist();
    },
    async openPickSample() {
      if (!this.hostReady || this.job.running) return;
      this.pickSampleError = '';
      this.pickSampleBusy = false;
      this.pickSampleOpen = true;
      const data = await this.call('listLibraryArticleSamples');
      if (!data || data.ok === false) {
        this.libraryArticleSamples = [];
        this.pickSampleError = (data && data.message) || '读库失败';
        return;
      }
      this.libraryArticleSamples = Array.isArray(data.samples) ? data.samples : [];
    },
    closePickSample() {
      if (this.pickSampleBusy) return;
      this.pickSampleOpen = false;
      this.pickSampleError = '';
      this.libraryArticleSamples = [];
    },
    async confirmPickSample(item) {
      if (!item || this.pickSampleBusy || this.job.running) return;
      this.pickSampleBusy = true;
      this.pickSampleError = '';
      try {
        const data = await this.call('getLibraryArticleSample', { id: item.id });
        if (!data || data.ok === false || !data.sample) {
          this.pickSampleError = (data && data.message) || '读范文失败';
          return;
        }
        this.sampleTitle = String(data.sample.title || item.title || '').trim();
        this.sampleBody = String(data.sample.body || '').trim();
        this.errors.sampleBody = '';
        this.sampleOpen = false;
        this.pickSampleOpen = false;
        await this.persist();
      } finally {
        this.pickSampleBusy = false;
      }
    },
    openCreateSample() {
      if (!this.hostReady || this.job.running) return;
      this.createSamplePaste = '';
      this.createSampleError = '';
      this.createSampleBusy = false;
      this.createSampleOpen = true;
    },
    closeCreateSample() {
      if (this.createSampleBusy) return;
      this.createSampleOpen = false;
      this.createSamplePaste = '';
      this.createSampleError = '';
    },
    async confirmCreateSample() {
      if (this.createSampleBusy || this.job.running) return;
      const { title, body } = this.splitPasteToSample(this.createSamplePaste);
      if (!title) {
        this.createSampleError = '请粘贴全文，第一行当标题';
        return;
      }
      if (!body) {
        this.createSampleError = '请粘贴正文（第一行后的内容）';
        return;
      }
      if (Array.from(body).length > 8000) {
        this.createSampleError = '贴进来的原文太长了，先删到 8000 字以内。';
        return;
      }
      this.createSampleBusy = true;
      this.createSampleError = '';
      try {
        const result = await this.call('saveLibraryArticleSample', { title, body });
        if (!result || result.ok === false) {
          this.createSampleError = (result && result.message) || '保存失败';
          return;
        }
        this.sampleTitle = title;
        this.sampleBody = body;
        this.errors.sampleBody = '';
        this.sampleOpen = false;
        this.createSampleOpen = false;
        await this.persist();
      } finally {
        this.createSampleBusy = false;
      }
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
    },
    toggleSlotPromptExpanded() {
      this.slotPromptExpanded = !this.slotPromptExpanded;
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
      this.errors = { business: '', sampleBody: '', references: '', galleryCount: '' };
      if (!String(this.business || '').trim()) this.errors.business = '先用一句话说你要发什么。';
      if (this.sampleLength > 8000) this.errors.sampleBody = '贴进来的原文太长了，先删到 8000 字以内。';
      if (this.references.length > REFERENCES_MAX) {
        this.errors.references = `参考资料最多 ${REFERENCES_MAX} 条。`;
      }
      const count = Number(this.galleryCount);
      if (!Number.isInteger(count) || count < 0 || count > 9) {
        this.errors.galleryCount = '配图张数要在 0 到 9 之间。';
      }
      const first = ['business', 'sampleBody', 'references', 'galleryCount'].find((field) => this.errors[field]);
      if (!first) return true;
      if (first === 'sampleBody') this.sampleOpen = true;
      this.focusField(first === 'sampleBody' ? 'sampleBody' : first);
      return false;
    },
    call(method, payload) {
      return window.studioHost.call(method, payload);
    },
    applyServer(data) {
      const next = data || {};
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
        ? next.references.map((item) => String(item))
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
      this.job = next.job || { running: false, step: '', error: '' };
      this.directory = next.directory || '';
      this.postId = next.id || '';
      this.selectedLook = typeof this.prompts.look === 'string' ? this.prompts.look : '';
      this.syncSlots();
      this.syncBodyDraft();
      this.loadUploadRefPreviews();
    },
    albumStyleLabel() {
      const style = this.prompts && String(this.prompts.style || '').trim();
      if (style) return style;
      const look = this.prompts && String(this.prompts.look || '').trim();
      if (look) {
        const hit = (this.albums || []).find((item) => item.id === look);
        if (hit && hit.label) return hit.label;
        return look;
      }
      return '尚未选定';
    },
    albumSamplePreview(album) {
      if (!album || !album.id) return '';
      return this.albumSamples[album.id] || '';
    },
    async loadAlbums() {
      if (!this.hostReady) return;
      const data = await this.call('listAlbums');
      if (!data || data.ok === false || !Array.isArray(data.albums)) {
        this.albums = [];
        return;
      }
      this.albums = data.albums;
      if (!this.selectedLook && this.prompts.look) this.selectedLook = this.prompts.look;
      await this.loadAlbumSamples();
    },
    async loadAlbumSamples() {
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
    async toggleAlbumStyle() {
      if (this.job.running) return;
      this.albumStyleOpen = !this.albumStyleOpen;
      if (this.albumStyleOpen) {
        if (!this.albums.length) await this.loadAlbums();
        else await this.loadAlbumSamples();
        if (!this.selectedLook && this.prompts.look) this.selectedLook = this.prompts.look;
      }
    },
    async openAlbumDetail(album) {
      if (this.job.running || !album || !album.id) return;
      this.notice = '';
      this.selectedLook = album.id;
      const detail = await this.call('getAlbumDetail', { id: album.id });
      if (!detail || detail.ok === false) {
        this.notice = (detail && detail.message) || '没有读到这一册';
        return;
      }
      this.albumDetail = detail;
      this.albumDetailSample = this.albumSamplePreview(album) || '';
      if (!this.albumDetailSample && detail.hasSample) {
        const sample = await this.call('previewAlbumSample', { id: album.id });
        if (sample && sample.ok && sample.dataUrl) {
          this.albumDetailSample = sample.dataUrl;
          this.albumSamples = { ...this.albumSamples, [album.id]: sample.dataUrl };
        }
      }
      this.albumDetailOpen = true;
    },
    closeAlbumDetail() {
      this.albumDetailOpen = false;
      this.albumDetail = null;
      this.albumDetailSample = '';
    },
    canRegenAlbumPrompts() {
      return Boolean(
        this.hostReady
        && !this.job.running
        && this.draft
        && this.albumDetail
        && String(this.albumDetail.id || this.selectedLook || '').trim(),
      );
    },
    async onRegenAlbumPrompts() {
      if (!this.canRegenAlbumPrompts()) return;
      const look = (this.albumDetail && this.albumDetail.id) || this.selectedLook;
      this.notice = '';
      this.selectedLook = look;
      const result = await this.call('generatePrompts', {
        look,
        draft: this.draft,
        galleryCount: this.galleryCount,
      });
      if (this.noteRejection(result)) return;
      this.closeAlbumDetail();
      this.job = { running: true, step: '提示词', error: '' };
      this.ensurePoll();
      await this.refresh();
    },
    resetBrief() {
      this.articleType = '涨粉';
      this.persona = '素人';
      this.sampleOpen = false;
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
      await this.loadAlbums();
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
        prompts: {
          cover: this.prompts.cover,
          gallery: this.prompts.gallery,
        },
      };
    },
    async persist() {
      if (!this.hostReady || this.job.running || !this.postId || !this.draft) return;
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
      if (result.silenced) return true;
      if (result.field && Object.prototype.hasOwnProperty.call(this.errors, result.field)) {
        this.errors[result.field] = result.message;
        if (result.field === 'sampleBody') this.sampleOpen = true;
        this.focusField(result.field === 'sampleBody' ? 'sampleBody' : result.field);
      } else {
        this.notice = result.message || '没有完成';
      }
      return true;
    },
    async resumeRunningJob(result) {
      if (!result || result.ok !== false) return false;
      if (result.message !== '正在生成，请等这一轮结束') return false;
      if (!result.id || !result.job || !result.job.running) return false;
      this.notice = '';
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
      this.notice = '';
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
        || this.pendingCall
        || !this.draft
        || !String(item.prompt || '').trim();
    },
    drawLabel(item) {
      return item.image && item.image.status === '成功' ? '再抽一张' : '生成这张';
    },
    async onDraw(item) {
      if (!item || this.slotDrawDisabled(item)) return;
      this.notice = '';
      this.pendingCall = true;
      try {
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
      } finally {
        this.pendingCall = false;
      }
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
        if (await this.resumeRunningJob(fresh)) return;
        this.notice = fresh.message || '没有完成';
        return;
      }
      this.previews = {};
      this.errors = { business: '', sampleBody: '', references: '', galleryCount: '' };
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
      this.errors = { business: '', sampleBody: '', references: '', galleryCount: '' };
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
    uploadRefPreview(item) {
      if (!item || !item.id) return '';
      return this.uploadRefPreviews[item.id] || '';
    },
    libraryPreview(item) {
      if (!item || !item.id) return '';
      return this.libraryPreviews[item.id] || '';
    },
    activeSlotPick() {
      if (!this.activeSlot) return { materialIds: [], overrides: {} };
      if (this.activeSlot.slot === 'cover') {
        return this.picks.cover || { materialIds: [], overrides: {} };
      }
      const index = this.activeSlot.index - 1;
      const gallery = Array.isArray(this.picks.gallery) ? this.picks.gallery : [];
      return gallery[index] || { materialIds: [], overrides: {} };
    },
    slotHasUploadRef(id) {
      const pick = this.activeSlotPick();
      return Array.isArray(pick.materialIds) && pick.materialIds.includes(id);
    },
    slotUploadRefSelectedCount() {
      const pick = this.activeSlotPick();
      return Array.isArray(pick.materialIds) ? pick.materialIds.length : 0;
    },
    async persistSlotPick(materialIds, overrides) {
      if (!this.activeSlot || this.job.running) return false;
      const result = await this.call('setSlotPick', {
        slot: this.activeSlot.slot,
        index: this.activeSlot.index,
        materialIds,
        overrides,
      });
      if (!result || result.ok === false) {
        this.notice = (result && result.message) || '勾选失败';
        return false;
      }
      if (result.picks) this.picks = result.picks;
      return true;
    },
    async toggleSlotUploadRef(item) {
      if (!item || !this.activeSlot || this.job.running) return;
      const pick = this.activeSlotPick();
      let materialIds = Array.isArray(pick.materialIds) ? pick.materialIds.slice() : [];
      const overrides = { ...(pick.overrides || {}) };
      if (materialIds.includes(item.id)) {
        materialIds = materialIds.filter((id) => id !== item.id);
        delete overrides[item.id];
      } else {
        if (materialIds.length >= 9) {
          this.notice = '一张图最多勾 9 张上传参考';
          return;
        }
        materialIds.push(item.id);
      }
      await this.persistSlotPick(materialIds, overrides);
    },
    toggleUploadRefAddMenu() {
      if (!this.hostReady || this.job.running || this.postUploadRefs.length >= 48) return;
      this.uploadRefAddMenuOpen = !this.uploadRefAddMenuOpen;
    },
    chooseAddFromLibrary() {
      this.uploadRefAddMenuOpen = false;
      this.openPickFromLibrary();
    },
    chooseAddUpload() {
      this.uploadRefAddMenuOpen = false;
      this.onPickUploadRefFile();
    },
    showUploadRefHover(item, event) {
      if (!item) return;
      const text = String(item.usage || '').trim();
      const preview = this.uploadRefPreview(item) || '';
      if (!text && !preview) return;
      this.uploadRefHoverText = text;
      this.uploadRefHoverPreview = preview;
      const rect = event && event.currentTarget && event.currentTarget.getBoundingClientRect
        ? event.currentTarget.getBoundingClientRect()
        : null;
      if (rect) {
        const cardWidth = 208;
        const gap = 8;
        // 预估：方图 208 + 用法区约 72 + 边框
        const cardHeight = 208 + (text ? 72 : 0) + 4;
        let left = rect.left + (rect.width / 2) - (cardWidth / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - cardWidth - 8));
        let top = rect.top - cardHeight - gap;
        if (top < 8) top = Math.min(rect.bottom + gap, window.innerHeight - cardHeight - 8);
        this.uploadRefHoverStyle = `left:${left}px;top:${Math.max(8, top)}px;`;
      } else {
        this.uploadRefHoverStyle = '';
      }
      this.uploadRefHoverOpen = true;
    },
    hideUploadRefHover() {
      this.uploadRefHoverOpen = false;
      this.uploadRefHoverText = '';
      this.uploadRefHoverPreview = '';
      this.uploadRefHoverStyle = '';
    },
    openUploadRefEditor(item) {
      if (!item || this.job.running) return;
      this.uploadRefEditorTarget = item;
      this.uploadRefEditorUsage = String(item.usage || '');
      this.uploadRefEditorPreview = this.uploadRefPreview(item) || '';
      this.uploadRefEditorError = '';
      this.uploadRefEditorOpen = true;
    },
    closeUploadRefEditor(force) {
      if (this.uploadRefEditorBusy && !force) return;
      this.uploadRefEditorOpen = false;
      this.uploadRefEditorTarget = null;
      this.uploadRefEditorUsage = '';
      this.uploadRefEditorPreview = '';
      this.uploadRefEditorError = '';
      this.uploadRefEditorBusy = false;
    },
    async confirmUploadRefEditor() {
      if (!this.uploadRefEditorTarget || this.uploadRefEditorBusy) return;
      const usage = String(this.uploadRefEditorUsage || '').trim();
      if (!usage) {
        this.uploadRefEditorError = '请写上用法句';
        return;
      }
      this.uploadRefEditorBusy = true;
      this.uploadRefEditorError = '';
      try {
        const result = await this.call('updateUploadRefUsage', {
          id: this.uploadRefEditorTarget.id,
          usage,
        });
        if (!result || result.ok === false) {
          this.uploadRefEditorError = (result && result.message) || '保存失败';
          return;
        }
        if (Array.isArray(result.uploadRefs)) this.postUploadRefs = result.uploadRefs;
        this.closeUploadRefEditor(true);
      } finally {
        this.uploadRefEditorBusy = false;
      }
    },
    openSaveToLibraryFromEditor() {
      if (!this.uploadRefEditorTarget) return;
      const item = this.uploadRefEditorTarget;
      this.closeUploadRefEditor(true);
      this.openSaveToLibrary(item);
    },
    askDeleteFromEditor() {
      if (!this.uploadRefEditorTarget) return;
      const item = this.uploadRefEditorTarget;
      this.closeUploadRefEditor(true);
      this.askDeleteUploadRef(item);
    },
    async loadUploadRefPreviews() {
      if (!this.hostReady) return;
      const next = { ...this.uploadRefPreviews };
      let changed = false;
      const live = new Set();
      for (const item of this.postUploadRefs) {
        live.add(item.id);
        if (next[item.id]) continue;
        const result = await this.call('previewUploadRef', { id: item.id });
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
      if (changed) this.uploadRefPreviews = next;
    },
    onPickUploadRefFile() {
      if (!this.hostReady || this.job.running || this.postUploadRefs.length >= 48) return;
      const input = this.$refs.uploadRefFileInput;
      if (input) {
        input.value = '';
        input.click();
      }
    },
    onUploadRefFileChange(event) {
      const input = event && event.target;
      const file = input && input.files && input.files[0];
      if (!file) return;
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type)) {
        this.notice = '只支持 JPEG、PNG、WebP';
        input.value = '';
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        this.notice = '单张不超过 8MB';
        input.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        this.uploadPending = String(reader.result || '');
        this.uploadUsage = '';
        this.uploadError = '';
        this.uploadRefUploadOpen = true;
      };
      reader.onerror = () => {
        this.notice = '读图失败';
      };
      reader.readAsDataURL(file);
      input.value = '';
    },
    closeUploadRefUpload() {
      if (this.uploadRefUploading) return;
      this.uploadRefUploadOpen = false;
      this.uploadPending = '';
      this.uploadUsage = '';
      this.uploadError = '';
    },
    async confirmUploadRefUpload() {
      if (this.uploadRefUploading || !this.uploadPending) return;
      const usage = String(this.uploadUsage || '').trim();
      if (!usage) {
        this.uploadError = '请写上用法句';
        return;
      }
      this.uploadRefUploading = true;
      this.uploadError = '';
      try {
        const result = await this.call('addUploadRef', {
          dataUrl: this.uploadPending,
          usage,
        });
        if (!result || result.ok === false) {
          this.uploadError = (result && result.message) || '上传失败';
          return;
        }
        this.postUploadRefs = Array.isArray(result.uploadRefs) ? result.uploadRefs : this.postUploadRefs;
        if (result.picks) this.picks = result.picks;
        this.uploadRefUploadOpen = false;
        this.uploadPending = '';
        this.uploadUsage = '';
        await this.loadUploadRefPreviews();
      } finally {
        this.uploadRefUploading = false;
      }
    },
    askDeleteUploadRef(item) {
      if (!item || this.job.running) return;
      this.deleteUploadRefTarget = item;
      this.deleteUploadRefOpen = true;
    },
    cancelDeleteUploadRef() {
      if (this.uploadRefDeleting) return;
      this.deleteUploadRefOpen = false;
      this.deleteUploadRefTarget = null;
    },
    async confirmDeleteUploadRef() {
      if (!this.deleteUploadRefTarget || this.uploadRefDeleting) return;
      this.uploadRefDeleting = true;
      try {
        const result = await this.call('deleteUploadRef', { id: this.deleteUploadRefTarget.id });
        if (!result || result.ok === false) {
          this.notice = (result && result.message) || '删除失败';
          return;
        }
        this.postUploadRefs = Array.isArray(result.uploadRefs) ? result.uploadRefs : [];
        if (result.picks) this.picks = result.picks;
        this.deleteUploadRefOpen = false;
        this.deleteUploadRefTarget = null;
        await this.loadUploadRefPreviews();
      } finally {
        this.uploadRefDeleting = false;
      }
    },
    openSaveToLibrary(item) {
      if (!item || this.job.running) return;
      this.saveToLibraryTarget = item;
      this.saveToLibraryUsage = String(item.usage || '');
      this.saveToLibraryError = '';
      this.saveToLibraryOpen = true;
    },
    closeSaveToLibrary(force) {
      if (this.saveToLibraryBusy && !force) return;
      this.saveToLibraryOpen = false;
      this.saveToLibraryTarget = null;
      this.saveToLibraryUsage = '';
      this.saveToLibraryError = '';
      this.saveToLibraryBusy = false;
    },
    async draftSaveUsage() {
      if (!this.saveToLibraryTarget || this.saveToLibraryBusy) return;
      const dataUrl = this.uploadRefPreview(this.saveToLibraryTarget);
      if (!dataUrl) {
        this.saveToLibraryError = '还没有预览，请稍后再试';
        return;
      }
      this.saveToLibraryBusy = true;
      this.saveToLibraryError = '';
      try {
        const result = await this.call('draftUploadRefUsage', { dataUrl });
        if (!result || result.ok === false) {
          this.saveToLibraryError = (result && result.message) || '识图失败';
          return;
        }
        this.saveToLibraryUsage = String(result.usage || '');
      } finally {
        this.saveToLibraryBusy = false;
      }
    },
    async confirmSaveToLibrary() {
      if (!this.saveToLibraryTarget || this.saveToLibraryBusy) return;
      const usage = String(this.saveToLibraryUsage || '').trim();
      if (!usage) {
        this.saveToLibraryError = '请写上用法句';
        return;
      }
      this.saveToLibraryBusy = true;
      this.saveToLibraryError = '';
      try {
        const result = await this.call('saveUploadRefToLibrary', {
          id: this.saveToLibraryTarget.id,
          usage,
        });
        if (!result || result.ok === false) {
          this.saveToLibraryError = (result && result.message) || '存进库失败';
          return;
        }
        if (Array.isArray(result.uploadRefs)) this.postUploadRefs = result.uploadRefs;
        this.notice = '已存进资料库';
        this.closeSaveToLibrary(true);
      } finally {
        this.saveToLibraryBusy = false;
      }
    },
    async openPickFromLibrary() {
      if (!this.hostReady || this.job.running || this.postUploadRefs.length >= 48) return;
      this.pickFromLibraryError = '';
      this.pickFromLibraryOpen = true;
      const data = await this.call('listLibraryUploadRefs');
      if (!data || data.ok === false) {
        this.libraryUploadRefs = [];
        this.pickFromLibraryError = (data && data.message) || '读库失败';
        return;
      }
      this.libraryUploadRefs = Array.isArray(data.uploadRefs) ? data.uploadRefs : [];
      await this.loadLibraryPreviews();
    },
    closePickFromLibrary() {
      if (this.pickFromLibraryBusy) return;
      this.pickFromLibraryOpen = false;
      this.pickFromLibraryError = '';
    },
    async loadLibraryPreviews() {
      const next = { ...this.libraryPreviews };
      let changed = false;
      for (const item of this.libraryUploadRefs) {
        if (next[item.id]) continue;
        const result = await this.call('previewLibraryUploadRef', { id: item.id });
        if (result && result.ok && result.dataUrl) {
          next[item.id] = result.dataUrl;
          changed = true;
        }
      }
      if (changed) this.libraryPreviews = next;
    },
    async confirmPickFromLibrary(item) {
      if (!item || this.pickFromLibraryBusy || this.postUploadRefs.length >= 48) return;
      this.pickFromLibraryBusy = true;
      this.pickFromLibraryError = '';
      try {
        const result = await this.call('pickLibraryUploadRef', { id: item.id });
        if (!result || result.ok === false) {
          this.pickFromLibraryError = (result && result.message) || '挑库失败';
          return;
        }
        this.postUploadRefs = Array.isArray(result.uploadRefs) ? result.uploadRefs : this.postUploadRefs;
        if (result.picks) this.picks = result.picks;
        this.pickFromLibraryOpen = false;
        await this.loadUploadRefPreviews();
      } finally {
        this.pickFromLibraryBusy = false;
      }
    },
  };
}
