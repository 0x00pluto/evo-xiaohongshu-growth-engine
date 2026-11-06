function libraryPage() {
  const INTAKE_MAX_BYTES = 8 * 1024 * 1024;

  return {
    ...window.createStudioToast(),
    hostReady: window.studioHost.ready,
    tabs: [
      { id: 'albums', label: '风格' },
      { id: 'upload-refs', label: '我们的图' },
      { id: 'article-samples', label: '对标文案' },
      { id: 'reference-docs', label: '产品资料' },
    ],
    activeTab: 'albums',
    createOpen: false,
    albumsBusy: false,
    intakeOpen: false,
    intakeTarget: '',
    intakeError: '',
    intakeDragOver: false,
    intakeBusy: false,

    init() {},

    selectTab(id) {
      if (!id) return;
      this.activeTab = id;
    },

    onAlbumsBusy(detail) {
      this.albumsBusy = Boolean(detail);
    },

    onLibraryToast(detail) {
      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        const msg = detail.message != null ? detail.message : detail.text;
        this.showToast(msg, {
          type: detail.type === 'success' ? 'success' : 'error',
          ms: typeof detail.ms === 'number' ? detail.ms : undefined,
        });
        return;
      }
      this.showToast(detail);
    },

    toggleCreate() {
      if (!this.hostReady || this.albumsBusy) return;
      this.createOpen = !this.createOpen;
    },

    closeCreate() {
      this.createOpen = false;
    },

    openCreateMenu() {
      if (!this.hostReady || this.albumsBusy) return;
      this.createOpen = true;
    },

    openIntake(target) {
      if (!this.hostReady || this.albumsBusy || this.intakeBusy) return;
      this.intakeTarget = target;
      this.intakeError = '';
      this.intakeDragOver = false;
      this.intakeOpen = true;
      this.focusIntakeZone();
    },

    focusIntakeZone() {
      const focus = () => {
        const zone = this.$refs && this.$refs.intakeZone;
        if (!this.intakeOpen || !zone || typeof zone.focus !== 'function') return;
        zone.focus();
      };
      // 菜单点击收尾可能抢走焦点；x-show 显示后再抢一次。
      this.$nextTick(() => {
        focus();
        setTimeout(focus, 0);
        setTimeout(focus, 50);
      });
    },

    closeIntake() {
      if (this.intakeBusy) return;
      this.intakeOpen = false;
      this.intakeTarget = '';
      this.intakeError = '';
      this.intakeDragOver = false;
      const input = this.$refs && this.$refs.intakeFileInput;
      if (input) input.value = '';
    },

    onCreateAlbums() {
      this.closeCreate();
      this.activeTab = 'albums';
      this.openIntake('album');
    },

    onCreateUploadRefs() {
      this.closeCreate();
      this.activeTab = 'upload-refs';
      this.openIntake('upload-ref');
    },

    onCreateArticleSamples() {
      this.closeCreate();
      this.activeTab = 'article-samples';
      this.$nextTick(() => {
        this.$dispatch('library-create-article-sample');
      });
    },

    onCreateReferenceDocs() {
      this.closeCreate();
      this.activeTab = 'reference-docs';
      this.$nextTick(() => {
        this.$dispatch('library-create-reference-doc');
      });
    },

    onCreateXhsNote() {
      this.closeCreate();
      this.$nextTick(() => {
        this.$dispatch('library-create-xhs-note');
      });
    },

    clickIntakeZone() {
      if (!this.intakeOpen || this.intakeBusy) return;
      const input = this.$refs && this.$refs.intakeFileInput;
      if (!input) return;
      input.value = '';
      input.click();
    },

    /**
     * @param {DragEvent} event
     */
    onIntakeDragEnter(event) {
      if (!this.intakeOpen || this.intakeBusy) return;
      event.preventDefault();
      this.intakeDragOver = true;
    },

    /**
     * @param {DragEvent} event
     */
    onIntakeDragOver(event) {
      if (!this.intakeOpen || this.intakeBusy) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      this.intakeDragOver = true;
    },

    /**
     * @param {DragEvent} event
     */
    onIntakeDragLeave(event) {
      if (!this.intakeOpen) return;
      const zone = this.$refs && this.$refs.intakeZone;
      const related = event.relatedTarget;
      if (zone && related && zone.contains(related)) return;
      this.intakeDragOver = false;
    },

    /**
     * @param {DragEvent} event
     */
    async onIntakeDrop(event) {
      if (!this.intakeOpen || this.intakeBusy) return;
      event.preventDefault();
      this.intakeDragOver = false;
      const files = event.dataTransfer && event.dataTransfer.files
        ? Array.from(event.dataTransfer.files)
        : [];
      await this.acceptIntakeFiles(files, { fromPaste: false });
    },

    /**
     * @param {ClipboardEvent} event
     */
    async onIntakePaste(event) {
      if (!this.intakeOpen || this.intakeBusy) return;
      event.preventDefault();
      const clipboard = event.clipboardData;
      const files = [];
      if (clipboard && clipboard.items) {
        for (const item of Array.from(clipboard.items)) {
          if (!item || item.kind !== 'file') continue;
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (!files.length && clipboard && clipboard.files && clipboard.files.length) {
        files.push(...Array.from(clipboard.files));
      }
      const hasText = Boolean(
        clipboard
        && (
          (clipboard.types && Array.from(clipboard.types).some((t) => /^text\//i.test(t)))
          || Boolean(clipboard.getData && (clipboard.getData('text/plain') || clipboard.getData('text/html')))
        ),
      );
      await this.acceptIntakeFiles(files, { fromPaste: true, hasText });
    },

    /**
     * @param {Event} event
     */
    async onIntakeFileChange(event) {
      if (!this.intakeOpen || this.intakeBusy) return;
      const input = event && event.target;
      const list = input && input.files ? Array.from(input.files) : [];
      if (!list.length) return;
      await this.acceptIntakeFiles(list, { fromPaste: false });
      if (input) input.value = '';
    },

    /**
     * @param {File[]} files
     * @param {{ fromPaste?: boolean; hasText?: boolean }} options
     */
    async acceptIntakeFiles(files, options) {
      const fromPaste = Boolean(options && options.fromPaste);
      const hasText = Boolean(options && options.hasText);
      const imageFiles = (files || []).filter((file) => this.isLikelyImageFile(file));

      if (imageFiles.length > 1) {
        this.intakeError = '一次一张';
        if (this.intakeError) this.showToast(this.intakeError);
        return;
      }
      if (imageFiles.length === 1) {
        await this.handoffIntakeFile(imageFiles[0]);
        return;
      }

      if (fromPaste) {
        if (hasText) {
          this.intakeError = '贴进来的是文字，请改贴一张图片';
          if (this.intakeError) this.showToast(this.intakeError);
          return;
        }
        this.intakeError = '剪贴板里没有图片';
        if (this.intakeError) this.showToast(this.intakeError);
        return;
      }

      if ((files || []).length > 1) {
        this.intakeError = '一次一张';
        if (this.intakeError) this.showToast(this.intakeError);
        return;
      }
      if ((files || []).length === 1) {
        this.intakeError = '只支持 JPEG、PNG、WebP、BMP';
        if (this.intakeError) this.showToast(this.intakeError);
        return;
      }
      this.intakeError = '只支持 JPEG、PNG、WebP、BMP';
      if (this.intakeError) this.showToast(this.intakeError);
    },

    /**
     * @param {File} file
     */
    isLikelyImageFile(file) {
      if (!file) return false;
      if (/^image\/(jpeg|jpg|pjpeg|png|webp|bmp|x-ms-bmp)$/i.test(file.type || '')) return true;
      if (/^image\//i.test(file.type || '')) return true;
      return /\.(jpe?g|jfif|pjpeg|png|webp|bmp)$/i.test(file.name || '');
    },

    /**
     * @param {File} file
     */
    isAllowedImageFile(file) {
      if (!file) return false;
      if (/^image\/(jpeg|jpg|pjpeg|png|webp|bmp|x-ms-bmp)$/i.test(file.type || '')) return true;
      return /\.(jpe?g|jfif|pjpeg|png|webp|bmp)$/i.test(file.name || '');
    },

    /**
     * @param {File} file
     */
    async handoffIntakeFile(file) {
      if (!this.isAllowedImageFile(file)) {
        this.intakeError = '只支持 JPEG、PNG、WebP、BMP';
        if (this.intakeError) this.showToast(this.intakeError);
        return;
      }
      if (file.size > INTAKE_MAX_BYTES) {
        this.intakeError = '单张不超过 8MB';
        if (this.intakeError) this.showToast(this.intakeError);
        return;
      }

      this.intakeBusy = true;
      this.intakeError = '';
      try {
        const dataUrl = await this.readFileAsDataUrl(file);
        const target = this.intakeTarget;
        this.intakeOpen = false;
        this.intakeTarget = '';
        this.intakeError = '';
        this.intakeDragOver = false;
        const input = this.$refs && this.$refs.intakeFileInput;
        if (input) input.value = '';

        if (target === 'album') {
          this.$dispatch('library-learn-album-dataurl', { dataUrl });
        } else if (target === 'upload-ref') {
          this.$dispatch('library-intake-upload-ref', { dataUrl });
        }
      } catch (err) {
        this.intakeError = err && err.message ? err.message : '读图失败';
        if (this.intakeError) this.showToast(this.intakeError);
      } finally {
        this.intakeBusy = false;
      }
    },

    /**
     * @param {File} file
     * @returns {Promise<string>}
     */
    readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读图失败'));
        reader.readAsDataURL(file);
      });
    },
  };
}
