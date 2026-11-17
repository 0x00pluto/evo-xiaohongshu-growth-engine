/**
 * 我们的图（uploadRefs）：面板、勾选、上传、改用法、删除、存资料库、从资料库挑。
 * 依赖宿主 note 页：postUploadRefs / picks / activeSlot / job / hostReady、call / showToast。
 */
window.createNoteUploadRefs = function createNoteUploadRefs() {
  return {
    uploadRefPreviews: {},
    uploadRefsPanelOpen: false,
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
    usagePlaceholder: '我们的 logo，放在右上角。',

    toggleUploadRefsPanel() {
      if (this.job.running) return;
      this.uploadRefsPanelOpen = !this.uploadRefsPanelOpen;
      if (this.uploadRefsPanelOpen) {
        this.aspectPanelOpen = false;
        this.albumStyleOpen = false;
        this.slotPromptExpanded = false;
      } else {
        this.uploadRefAddMenuOpen = false;
      }
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
        this.showToast((result && result.message) || '勾选失败');
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
          this.showToast('一张图最多 9 张我们的图');
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
        this.uploadRefEditorError = '请写上图片用法';
        if (this.uploadRefEditorError) this.showToast(this.uploadRefEditorError);
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
        if (this.uploadRefEditorError) this.showToast(this.uploadRefEditorError);
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
      const mimeOk = /^image\/(jpeg|jpg|pjpeg|png|webp|bmp|x-ms-bmp)$/i.test(file.type || '');
      const extOk = /\.(jpe?g|jfif|pjpeg|png|webp|bmp)$/i.test(file.name || '');
      if (!mimeOk && !extOk) {
        this.showToast('只支持 JPEG、PNG、WebP、BMP');
        input.value = '';
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        this.showToast('单张不超过 8MB');
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
        this.showToast('读图失败');
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
        this.uploadError = '请写上图片用法';
        if (this.uploadError) this.showToast(this.uploadError);
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
        if (this.uploadError) this.showToast(this.uploadError);
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
          this.showToast((result && result.message) || '删除失败');
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
        if (this.saveToLibraryError) this.showToast(this.saveToLibraryError);
        return;
      }
      this.saveToLibraryBusy = true;
      this.saveToLibraryError = '';
      try {
        const result = await this.call('draftUploadRefUsage', { dataUrl });
        if (!result || result.ok === false) {
          this.saveToLibraryError = (result && result.message) || '自动识别失败';
        if (this.saveToLibraryError) this.showToast(this.saveToLibraryError);
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
        this.saveToLibraryError = '请写上图片用法';
        if (this.saveToLibraryError) this.showToast(this.saveToLibraryError);
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
          this.saveToLibraryError = (result && result.message) || '保存到资料库失败';
        if (this.saveToLibraryError) this.showToast(this.saveToLibraryError);
          return;
        }
        if (Array.isArray(result.uploadRefs)) this.postUploadRefs = result.uploadRefs;
        this.showToast('已保存到资料库', { type: 'success' });
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
        if (this.pickFromLibraryError) this.showToast(this.pickFromLibraryError);
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
        if (this.pickFromLibraryError) this.showToast(this.pickFromLibraryError);
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
};
