/**
 * 相册风格与画幅：相册列表、样张、风格选择、比例面板。
 * 依赖宿主 note 页：prompts / postId / job / pendingCall / hostReady、selectableAlbums getter、call / showToast。
 */
window.createNoteAlbums = function createNoteAlbums() {
  return {
    albumStyleOpen: false,
    aspectPanelOpen: false,
    albums: [],
    selectedLook: '',
    albumSamples: {},
    aspectRatios: ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9'],
    aspectRatio: '3:4',
    aspectRatioLocked: '',
    aspectRatioCss: '3 / 4',

    cssAspectFromRatio(ratio) {
      const text = String(ratio || '3:4');
      const parts = text.split(':');
      if (parts.length !== 2) return '3 / 4';
      return `${parts[0]} / ${parts[1]}`;
    },
    syncAspectFromAlbum() {
      if (this.aspectRatioLocked) return;
      const look = String(this.selectedLook || (this.prompts && this.prompts.look) || '').trim();
      if (!look) {
        this.aspectRatio = '3:4';
        this.aspectRatioCss = '3 / 4';
        return;
      }
      const hit = (this.albums || []).find((item) => item.id === look);
      const ratio = hit && hit.aspectRatio ? hit.aspectRatio : '3:4';
      this.aspectRatio = ratio;
      this.aspectRatioCss = (hit && hit.aspectRatioCss) || this.cssAspectFromRatio(ratio);
    },
    ratioBoxWidth(ratio) {
      const css = this.cssAspectFromRatio(ratio);
      const parts = String(css).split('/');
      const w = Number(parts[0]);
      const h = Number(parts[1]);
      if (!(w > 0) || !(h > 0)) return '1.5rem';
      // 竖图用固定宽，横图用固定高，格子里都能看见画幅。
      if (w / h <= 1) return '1.15rem';
      return `${Math.min(2.25, 1.15 * (w / h)).toFixed(2)}rem`;
    },
    toggleAspectPanel() {
      if (this.job.running || this.pendingCall || !this.postId) return;
      this.aspectPanelOpen = !this.aspectPanelOpen;
      if (this.aspectPanelOpen) {
        this.albumStyleOpen = false;
        this.slotPromptExpanded = false;
        this.uploadRefsPanelOpen = false;
        this.uploadRefAddMenuOpen = false;
      }
    },
    async onSetAspectRatio(ratio) {
      if (!this.hostReady || this.job.running || this.pendingCall || !this.postId) return;
      const next = String(ratio || '').trim();
      if (!next) return;
      this.pendingCall = true;
      try {
        const result = await this.call('setAspectRatio', { aspectRatio: next });
        if (result && result.ok === false) {
          this.showToast(result.message || '比例改不了');
          return;
        }
        if (result && result.ok) {
          this.aspectRatio = result.aspectRatio || next;
          this.aspectRatioLocked = result.aspectRatioLocked || next;
          this.aspectRatioCss = result.aspectRatioCss || this.cssAspectFromRatio(this.aspectRatio);
          this.aspectPanelOpen = false;
        }
      } finally {
        this.pendingCall = false;
      }
    },
    albumStyleLabel() {
      const selected = String(this.selectedLook || '').trim();
      if (selected) {
        const hit = (this.albums || []).find((item) => item.id === selected);
        if (hit && hit.safetyStatus === 'flagged') return '尚未选定';
        if (hit && hit.label) return hit.label;
      }
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
      this.clearFlaggedSelectedLook();
      this.syncAspectFromAlbum();
      await this.loadAlbumSamples();
    },
    clearFlaggedSelectedLook() {
      const selected = String(this.selectedLook || '').trim();
      if (!selected) return;
      const hit = (this.albums || []).find((item) => item && item.id === selected);
      if (hit && hit.safetyStatus === 'flagged') this.selectedLook = '';
    },
    async loadAlbumSamples() {
      const next = { ...this.albumSamples };
      let changed = false;
      for (const album of this.selectableAlbums) {
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
        this.aspectPanelOpen = false;
        this.slotPromptExpanded = false;
        this.uploadRefsPanelOpen = false;
        this.uploadRefAddMenuOpen = false;
        if (!this.albums.length) await this.loadAlbums();
        else await this.loadAlbumSamples();
        if (!this.selectedLook && this.prompts.look) this.selectedLook = this.prompts.look;
        this.clearFlaggedSelectedLook();
      }
    },
    selectAlbumStyle(album) {
      if (this.job.running || !album || !album.id) return;
      if (album.safetyStatus === 'flagged') return;
      this.selectedLook = album.id;
      this.syncAspectFromAlbum();
      this.albumStyleOpen = false;
    },
  };
};
