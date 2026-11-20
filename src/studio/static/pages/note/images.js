/**
 * 笔记图槽位：槽位同步、预览、画图、选版本、复制图/文案、全屏。
 * 依赖宿主 note 页：images / editor / prompts / draft / job / pendingCall / hostReady、activeSlot 等 getter、call / refresh / ensurePoll / noteRejection / showToast。
 * getter 不能放进工厂：对象展开会把 get 求值成静态值，所以仍留在 note.js。
 */
window.createNoteImages = function createNoteImages() {
  return {
    previews: {},
    slots: [],
    promptOpen: {},
    activeKey: 'cover-0',
    previewMode: 'note',
    copyFeedbackKey: '',
    copyFeedbackOk: null,
    copyFeedbackTimer: null,
    fullscreenPreview: '',
    slotPromptExpanded: false,

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
        prompt: String((this.editor && this.editor.cover) || ''),
      }];
      const total = this.committedGalleryCount();
      for (let index = 1; index <= total; index += 1) {
        const image = (this.images.gallery && this.images.gallery[index - 1]) || { status: '空', path: '' };
        const prompt = (this.editor && this.editor.gallery && this.editor.gallery[index - 1]) || '';
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
    promptKey(item) {
      return `${item.slot}-${item.index}`;
    },
    promptIsOpen(item) {
      return Boolean(item && this.promptOpen[this.promptKey(item)]);
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
    slotCanCopy(item) {
      return Boolean(
        item
        && item.image
        && item.image.status === '成功'
        && item.image.path
        && this.slotPreview(item)
      );
    },
    drawKey(item) {
      // 键带上能不能点，以及这张图的修订号。列表复用旧节点时，disabled 和图片都会停在第一次的结果。
      const status = item && item.image && item.image.status ? item.image.status : '空';
      const revised = item && item.image && item.image.revisedAt ? item.image.revisedAt : 0;
      const selected = item && item.image && item.image.selected ? item.image.selected : 0;
      return `${this.promptKey(item)}-${status}-${revised}-${selected}-${this.slotDrawDisabled(item) ? 'off' : 'on'}`;
    },
    selectImage(item) {
      if (!item) return;
      this.activeKey = this.promptKey(item);
    },
    toggleSlotPromptExpanded() {
      if (!this.canOpenSlotPrompt) {
        this.slotPromptExpanded = false;
        return;
      }
      this.slotPromptExpanded = !this.slotPromptExpanded;
      if (this.slotPromptExpanded) {
        this.aspectPanelOpen = false;
        this.albumStyleOpen = false;
        this.uploadRefsPanelOpen = false;
        this.uploadRefAddMenuOpen = false;
      }
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
    setSlotPrompt(item) {
      const value = String(item.prompt || '');
      const editor = this.editor && typeof this.editor === 'object'
        ? this.editor
        : { cover: '', gallery: [] };
      if (item.slot === 'cover') {
        this.editor = { ...editor, cover: value };
        return;
      }
      const gallery = Array.isArray(editor.gallery) ? editor.gallery.slice() : [];
      while (gallery.length < item.index) gallery.push('');
      gallery[item.index - 1] = value;
      this.editor = { ...editor, gallery };
    },
    slotDrawDisabled(item) {
      return !this.hostReady
        || this.job.running
        || this.pendingCall
        || !this.draft;
    },
    drawLabel(item) {
      return item.image && item.image.status === '成功' ? '再画一张' : '画这张';
    },
    async onDraw(item) {
      if (!item || this.slotDrawDisabled(item)) return;
      this.pendingCall = true;
      try {
        const result = await this.call('generateImages', {
          slot: item.slot,
          index: item.index,
          look: this.selectedLook,
          promptEdits: {
            cover: this.editor && this.editor.cover ? this.editor.cover : '',
            gallery: this.editor && Array.isArray(this.editor.gallery) ? this.editor.gallery.slice() : [],
          },
        });
        if (this.noteRejection(result)) return;
        this.ensurePoll();
        await this.refresh();
      } finally {
        this.pendingCall = false;
      }
    },
    async onChooseVersion(item, version) {
      if (!this.hostReady || this.job.running || !item) return;
      const result = await this.call('chooseImage', {
        slot: item.slot,
        index: item.index,
        version,
      });
      if (result && result.ok === false) {
        this.showToast(result.message || '没有这一张');
        return;
      }
      await this.refresh();
    },
    async onReveal(item) {
      if (!this.hostReady || !item) return;
      const result = await this.call('revealImage', { slot: item.slot, index: item.index });
      if (result && result.ok === false) this.showToast(result.message || '打不开文件夹');
    },
    async onCopyPost() {
      const text = this.postText();
      if (!text) return;
      await this.writeClipboard(text);
    },
    markCopyFeedback(key, ok) {
      if (this.copyFeedbackTimer) {
        clearTimeout(this.copyFeedbackTimer);
        this.copyFeedbackTimer = null;
      }
      this.copyFeedbackKey = key;
      this.copyFeedbackOk = ok;
      this.copyFeedbackTimer = setTimeout(() => {
        this.copyFeedbackKey = '';
        this.copyFeedbackOk = null;
        this.copyFeedbackTimer = null;
      }, 2000);
    },
    async dataUrlToPngBlob(dataUrl) {
      const raw = String(dataUrl || '').trim();
      if (!raw) throw new Error('empty');
      const img = new Image();
      img.decoding = 'async';
      img.src = raw;
      if (typeof img.decode === 'function') await img.decode();
      else {
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('load'));
        });
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      if (!canvas.width || !canvas.height) throw new Error('size');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('ctx');
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((part) => {
          if (part) resolve(part);
          else reject(new Error('toBlob'));
        }, 'image/png');
      });
      return blob;
    },
    async onCopySlotImage(item) {
      if (!this.slotCanCopy(item)) return;
      const key = this.promptKey(item);
      const dataUrl = this.slotPreview(item);
      try {
        const blob = await this.dataUrlToPngBlob(dataUrl);
        if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
          throw new Error('clipboard');
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.markCopyFeedback(key, true);
        this.showToast('已复制', { type: 'success' });
      } catch (err) {
        this.markCopyFeedback(key, false);
        this.showToast('没有复制成功');
      }
    },
    openImageFullscreen() {
      const src = this.activeSlot ? this.slotPreview(this.activeSlot) : '';
      if (!src) return;
      this.fullscreenPreview = src;
      const dialog = this.$refs.imageFullscreen;
      if (!dialog || typeof dialog.showModal !== 'function') return;
      if (!dialog.open) dialog.showModal();
      this.ensureFullscreenLightDismiss(dialog);
    },
    closeImageFullscreen() {
      const dialog = this.$refs.imageFullscreen;
      if (dialog && dialog.open) dialog.close();
    },
    onFullscreenDialogClick(event) {
      const dialog = this.$refs.imageFullscreen;
      if (!dialog) return;
      if (event.target === dialog) dialog.close();
    },
    ensureFullscreenLightDismiss(dialog) {
      if (!dialog || dialog.dataset.lightDismissBound === '1') return;
      if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) {
        dialog.dataset.lightDismissBound = '1';
        return;
      }
      const outside = (e, node) => {
        const r = node.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && outside(e, dialog) && dialog.open) dialog.close();
      });
      dialog.dataset.lightDismissBound = '1';
    },
    async writeClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        this.showToast('已复制', { type: 'success' });
      } catch (err) {
        this.showToast('没有复制成功');
      }
    },
  };
};
