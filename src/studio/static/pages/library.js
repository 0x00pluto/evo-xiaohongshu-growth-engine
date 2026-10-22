function libraryPage() {
  return {
    hostReady: window.studioHost.ready,
    tabs: [
      { id: 'albums', label: '图库' },
      { id: 'upload-refs', label: '上传参考' },
      { id: 'article-samples', label: '范文' },
    ],
    activeTab: 'albums',
    createOpen: false,
    albumsBusy: false,
    toast: '',
    toastTimer: null,

    init() {},

    selectTab(id) {
      if (!id) return;
      this.activeTab = id;
    },

    onAlbumsBusy(detail) {
      this.albumsBusy = Boolean(detail);
    },

    clearToast() {
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
      this.toast = '';
    },

    showToast(message) {
      const text = String(message || '').trim();
      if (!text) return;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toast = text;
      this.toastTimer = setTimeout(() => {
        this.toast = '';
        this.toastTimer = null;
      }, 2000);
    },

    onLibraryToast(detail) {
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

    onCreateAlbums() {
      this.closeCreate();
      this.activeTab = 'albums';
      this.$dispatch('library-pick-image');
    },

    onCreateUploadRefs() {
      this.closeCreate();
      this.activeTab = 'upload-refs';
      this.$nextTick(() => {
        this.$dispatch('library-pick-upload-ref');
      });
    },

    onCreateArticleSamples() {
      this.closeCreate();
      this.activeTab = 'article-samples';
      this.$nextTick(() => {
        this.$dispatch('library-create-article-sample');
      });
    },
  };
}
