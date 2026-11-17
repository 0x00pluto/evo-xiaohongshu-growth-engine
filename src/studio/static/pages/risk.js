function riskPage() {
  return {
    ...window.createStudioToast(),
    ...window.createRiskPanel(),
    hostReady: window.studioHost.ready,
    pasteText: '',

    riskGetFields() {
      return [{ id: 'paste', text: String(this.pasteText || '') }];
    },
    riskReadField(fieldId) {
      if (fieldId === 'paste') return String(this.pasteText || '');
      return '';
    },
    riskWriteField(fieldId, text) {
      if (fieldId === 'paste') this.pasteText = String(text || '');
    },
    riskFieldElement(fieldId) {
      if (fieldId !== 'paste') return null;
      return document.getElementById('risk-paste');
    },
    riskMapHitToElement(hit) {
      if (!hit || hit.fieldId !== 'paste') return null;
      const el = this.riskFieldElement('paste');
      if (!el) return null;
      return { el, start: hit.start, end: hit.end };
    },

    async init() {
      if (!this.hostReady) return;
      await this.riskLoadSetup();
    },

    async onCopyPaste() {
      const text = String(this.pasteText || '').trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        this.showToast('已复制这段文字', { type: 'success' });
      } catch {
        this.showToast('复制失败');
      }
    },

    goLibraryPersonal() {
      if (!window.studioHost || typeof window.studioHost.go !== 'function') return;
      void window.studioHost.go('library', { tab: 'risk-words' });
    },
  };
}
