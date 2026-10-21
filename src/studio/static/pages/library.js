function libraryPage() {
  return {
    hostReady: window.studioHost.ready,
    tabs: [
      { id: 'albums', label: '图库' },
      { id: 'upload-refs', label: '上传参考' },
    ],
    activeTab: 'albums',
    createOpen: false,
    albumsBusy: false,

    init() {},

    selectTab(id) {
      if (!id) return;
      this.activeTab = id;
    },

    onAlbumsBusy(detail) {
      this.albumsBusy = Boolean(detail);
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
  };
}
