function historyPage() {
  return {
    posts: [],
    covers: {},
    notice: '',
    toast: '',
    toastTimer: null,
    hostReady: window.studioHost.ready,
    detailOpen: false,
    detailLoading: false,
    detail: null,
    slideIndex: 0,

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

    when(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (part) => String(part).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },
    coverPreview(item) {
      if (!item || !item.id) return '';
      return this.covers[item.id] || '';
    },
    detailImages() {
      return this.detail && Array.isArray(this.detail.images) ? this.detail.images : [];
    },
    detailImageCount() {
      return this.detailImages().length;
    },
    currentSlide() {
      const images = this.detailImages();
      if (!images.length) return null;
      const index = Math.min(Math.max(this.slideIndex, 0), images.length - 1);
      return images[index] || null;
    },
    detailBodyText() {
      if (!this.detail) return '';
      const body = String(this.detail.body || '').trim();
      const topics = Array.isArray(this.detail.topics)
        ? this.detail.topics
          .map((topic) => String(topic).trim())
          .filter(Boolean)
          .map((topic) => (topic.startsWith('#') ? topic : `#${topic}`))
          .join(' ')
        : '';
      return [body, topics].filter(Boolean).join('\n\n');
    },
    async loadCovers() {
      if (!this.hostReady) return;
      const next = { ...this.covers };
      let changed = false;
      const live = new Set();
      for (const item of this.posts) {
        if (!item || !item.id || !item.hasCover) continue;
        live.add(item.id);
        if (next[item.id]) continue;
        const result = await window.studioHost.call('previewPostCover', { id: item.id });
        if (result && result.ok && result.dataUrl) {
          next[item.id] = result.dataUrl;
          changed = true;
        }
      }
      for (const id of Object.keys(next)) {
        if (live.has(id)) continue;
        delete next[id];
        changed = true;
      }
      if (changed) this.covers = next;
    },
    async init() {
      if (!this.hostReady) return;
      const data = await window.studioHost.call('listPosts');
      this.posts = data && Array.isArray(data.posts) ? data.posts : [];
      await this.loadCovers();
    },
    async onCopy(item) {
      const text = item && item.postText ? item.postText : '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        this.showToast('复制成功');
      } catch (err) {
        this.showToast('没有复制成功');
      }
    },
    async onCopyDetail() {
      if (!this.detail) return;
      await this.onCopy(this.detail);
    },
    async openDetail(item) {
      if (!item || !item.id || !this.hostReady) return;
      this.detailLoading = true;
      this.detailOpen = true;
      this.slideIndex = 0;
      this.detail = {
        id: item.id,
        title: item.title || '',
        body: '',
        topics: [],
        postText: item.postText || '',
        createdAt: item.createdAt || '',
        images: [],
      };
      const result = await window.studioHost.call('previewHistoryPost', { id: item.id });
      this.detailLoading = false;
      if (!result || !result.ok) {
        this.notice = (result && result.message) || '没有打开这一篇';
        this.detailOpen = false;
        this.detail = null;
        return;
      }
      this.detail = {
        id: result.id || item.id,
        title: result.title || item.title || '',
        body: result.body || '',
        topics: Array.isArray(result.topics) ? result.topics : [],
        postText: result.postText || item.postText || '',
        createdAt: result.createdAt || item.createdAt || '',
        images: Array.isArray(result.images) ? result.images : [],
      };
      this.slideIndex = 0;
    },
    closeDetail() {
      this.detailOpen = false;
      this.detailLoading = false;
      this.detail = null;
      this.slideIndex = 0;
    },
    prevSlide() {
      const count = this.detailImageCount();
      if (count <= 1) return;
      this.slideIndex = (this.slideIndex - 1 + count) % count;
    },
    nextSlide() {
      const count = this.detailImageCount();
      if (count <= 1) return;
      this.slideIndex = (this.slideIndex + 1) % count;
    },
    goSlide(index) {
      const count = this.detailImageCount();
      if (!count) return;
      if (!Number.isInteger(index) || index < 0 || index >= count) return;
      this.slideIndex = index;
    },
    onDetailKeydown(event) {
      if (!this.detailOpen || !event) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prevSlide();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.nextSlide();
      }
    },
    async onEdit() {
      if (!this.detail || !this.detail.id || !window.studioHost.go) return;
      const id = this.detail.id;
      this.closeDetail();
      await window.studioHost.go('note', { postId: id });
    },
    async onWriteNew() {
      if (!window.studioHost.go) return;
      await window.studioHost.go('note');
    },
  };
}
