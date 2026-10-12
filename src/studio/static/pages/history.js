function historyPage() {
  return {
    posts: [],
    notice: '',
    copied: '',
    hostReady: window.studioHost.ready,

    when(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (part) => String(part).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },
    async init() {
      if (!this.hostReady) return;
      const data = await window.studioHost.call('listPosts');
      this.posts = data && Array.isArray(data.posts) ? data.posts : [];
    },
    async onCopy(item) {
      if (!item || !item.postText) return;
      try {
        await navigator.clipboard.writeText(item.postText);
        this.copied = '已复制这篇笔记';
      } catch (err) {
        this.copied = '没有复制成功';
      }
    },
    async onOpen(item) {
      if (!item || !window.studioHost.go) return;
      await window.studioHost.go('note', { postId: item.id });
    },
    async onWriteNew() {
      if (!window.studioHost.go) return;
      await window.studioHost.go('note');
    },
  };
}
