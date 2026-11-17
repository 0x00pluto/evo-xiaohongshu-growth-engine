function libraryRiskWords() {
  return {
    hostReady: window.studioHost.ready,
    riskPersonalWords: [],
    riskPersonalDraft: '',
    riskPersonalSearch: '',
    riskPersonalUndo: null,
    riskPersonalUndoTimer: null,
    error: '',
    busy: false,

    call(method, payload) {
      return window.studioHost.call(method, payload);
    },

    riskVisiblePersonalWords() {
      const q = String(this.riskPersonalSearch || '').trim().toLowerCase();
      const list = Array.isArray(this.riskPersonalWords) ? this.riskPersonalWords : [];
      if (!q) return list;
      return list.filter((item) => String(item.text || '').toLowerCase().includes(q));
    },

    async init() {
      await this.refresh();
    },

    async refresh() {
      if (!this.hostReady) return;
      this.error = '';
      const data = await this.call('getRiskSetup');
      if (!data || data.ok === false) {
        this.riskPersonalWords = [];
        this.error = (data && data.message) || '读个人违禁词库失败';
        if (this.error) this.$dispatch('library-toast', this.error);
        return;
      }
      this.riskPersonalWords = Array.isArray(data.personalWords) ? data.personalWords : [];
    },

    async riskAddPersonalWords() {
      if (this.busy) return;
      const text = String(this.riskPersonalDraft || '');
      if (!text.trim()) return;
      this.busy = true;
      try {
        const data = await this.call('addPersonalRiskWords', { text });
        if (!data || data.ok === false) {
          this.$dispatch('library-toast', (data && data.message) || '没有加进去');
          return;
        }
        this.riskPersonalWords = Array.isArray(data.personalWords) ? data.personalWords : [];
        this.riskPersonalDraft = '';
        if (Array.isArray(data.rejected) && data.rejected.length) {
          const lines = data.rejected.map((item) => `第 ${item.line} 行`).join('、');
          this.$dispatch('library-toast', `${lines}超过 50 字，未加入`);
        } else {
          this.$dispatch('library-toast', { message: '已加入个人违禁词', type: 'success' });
        }
      } finally {
        this.busy = false;
      }
    },

    async riskDeletePersonalWord(word) {
      if (this.busy) return;
      const text = word && word.text ? word.text : String(word || '');
      if (!text) return;
      this.busy = true;
      try {
        const data = await this.call('deletePersonalRiskWord', { text });
        if (!data || data.ok === false) {
          this.$dispatch('library-toast', (data && data.message) || '没有删掉');
          return;
        }
        this.riskPersonalWords = Array.isArray(data.personalWords) ? data.personalWords : [];
        this.riskPersonalUndo = data.removed || { text, severity: '要改口' };
        if (this.riskPersonalUndoTimer) clearTimeout(this.riskPersonalUndoTimer);
        this.riskPersonalUndoTimer = setTimeout(() => {
          this.riskPersonalUndo = null;
          this.riskPersonalUndoTimer = null;
        }, 8000);
      } finally {
        this.busy = false;
      }
    },

    async riskUndoPersonalDelete() {
      if (this.busy) return;
      const item = this.riskPersonalUndo;
      if (!item || !item.text) return;
      this.busy = true;
      try {
        const data = await this.call('addPersonalRiskWords', {
          words: [{ text: item.text, severity: item.severity || '要改口' }],
        });
        if (!data || data.ok === false) {
          this.$dispatch('library-toast', (data && data.message) || '没有加回来');
          return;
        }
        this.riskPersonalWords = Array.isArray(data.personalWords) ? data.personalWords : [];
        this.riskPersonalUndo = null;
        if (this.riskPersonalUndoTimer) {
          clearTimeout(this.riskPersonalUndoTimer);
          this.riskPersonalUndoTimer = null;
        }
      } finally {
        this.busy = false;
      }
    },
  };
}
