/**
 * 对标文案（sample）：粘贴拆标题、从资料库挑选、新建并写库。
 * 依赖宿主 note 页：sampleTitle / sampleBody / errors / job / hostReady、call / persist / showToast。
 */
window.createNoteSamples = function createNoteSamples() {
  return {
    sampleOpen: false,
    pickSampleOpen: false,
    pickSampleError: '',
    pickSampleBusy: false,
    libraryArticleSamples: [],
    createSampleOpen: false,
    createSamplePaste: '',
    createSampleError: '',
    createSampleBusy: false,

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
        if (this.pickSampleError) this.showToast(this.pickSampleError);
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
          this.pickSampleError = (data && data.message) || '读对标文案失败';
        if (this.pickSampleError) this.showToast(this.pickSampleError);
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
        if (this.createSampleError) this.showToast(this.createSampleError);
        return;
      }
      if (!body) {
        this.createSampleError = '请粘贴正文（第一行后的内容）';
        if (this.createSampleError) this.showToast(this.createSampleError);
        return;
      }
      if (Array.from(body).length > 8000) {
        this.createSampleError = '贴进来的原文太长了，先删到 8000 字以内。';
        if (this.createSampleError) this.showToast(this.createSampleError);
        return;
      }
      this.createSampleBusy = true;
      this.createSampleError = '';
      try {
        const result = await this.call('saveLibraryArticleSample', { title, body });
        if (!result || result.ok === false) {
          this.createSampleError = (result && result.message) || '保存失败';
        if (this.createSampleError) this.showToast(this.createSampleError);
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
  };
};
