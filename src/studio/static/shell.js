(function () {
  const loaded = new Set();

  function hostReady() {
    return Boolean(
      (window.dex && typeof window.dex.call === 'function')
      || (window.location.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname)),
    );
  }

  // Alpine 等代理不能进 IPC；dex 前打成普通对象（HTTP 分支已有 stringify）。
  function plain(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  async function call(method, payload) {
    try {
      if (window.dex && typeof window.dex.call === 'function') {
        const args = payload === undefined ? [] : [plain(payload)];
        return await window.dex.call('onePost', method, args);
      }
      const response = await fetch(`/api/one-post/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload === undefined ? {} : payload),
      });
      const data = await response.json();
      if (!response.ok && (!data || data.ok !== false)) {
        return { ok: false, message: '没有完成' };
      }
      return data;
    } catch (err) {
      return { ok: false, message: err && err.message ? err.message : '没有完成' };
    }
  }

  window.studioHost = {
    ready: hostReady(),
    call,
    intent: null,
    go(pageId, extras) {
      window.studioHost.intent = extras || null;
      const shellData = window.Alpine && window.Alpine.$data(document.body);
      if (!shellData || typeof shellData.mount !== 'function') return Promise.resolve();
      return shellData.mount(pageId);
    },
  };

  function loadScript(src) {
    if (loaded.has(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        loaded.add(src);
        resolve();
      };
      script.onerror = () => reject(new Error('没有打开这一页'));
      document.head.appendChild(script);
    });
  }

  const NAV_COLLAPSED_KEY = 'xhs-studio-nav-collapsed';

  function readNavCollapsed() {
    try {
      return window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeNavCollapsed(value) {
    try {
      window.localStorage.setItem(NAV_COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      // 隐私模式等写不进 localStorage 时仍可当次会话收起。
    }
  }

  window.shell = function shell() {
    return {
      hostReady: window.studioHost.ready,
      page: '',
      pageError: '',
      navCollapsed: readNavCollapsed(),
      menu: [
        { id: 'note', label: '生成笔记', ready: true, icon: 'lucide:notebook-pen' },
        { id: 'library', label: '资料库', ready: true, icon: 'lucide:library' },
        { id: 'topics', label: '选题', ready: false, icon: 'lucide:lightbulb' },
        { id: 'role', label: '角色', ready: false, icon: 'lucide:user-round' },
        { id: 'risk', label: '危险词', ready: false, icon: 'lucide:shield-alert' },
        { id: 'results', label: '记下结果', ready: false, icon: 'lucide:clipboard-check' },
        { id: 'words', label: '词库', ready: false, icon: 'lucide:book-a' },
        { id: 'follow', label: '承接', ready: false, icon: 'lucide:handshake' },
      ],
      get visibleMenu() {
        return this.menu.filter((entry) => entry.ready);
      },
      async init() {
        const first = this.menu.find((item) => item.ready);
        if (first) await this.mount(first.id);
      },
      toggleNav() {
        this.navCollapsed = !this.navCollapsed;
        writeNavCollapsed(this.navCollapsed);
      },
      async open(item) {
        if (!item.ready) return;
        window.studioHost.intent = null;
        if (this.page === item.id) {
          if (item.id !== 'note') return;
          await this.mount(item.id);
          return;
        }
        await this.mount(item.id);
      },
      async mount(id) {
        this.pageError = '';
        const slot = this.$refs.workspace;
        if (!slot) return;
        try {
          await loadScript(`pages/${id}.js`);
          // 资料库壳下面还有资源 Tab 模块，须在 initTree 前挂好。
          if (id === 'library') {
            await loadScript('lib/prompt-colors.js');
            await loadScript('pages/library/albums.js');
            await loadScript('pages/library/upload-refs.js');
            await loadScript('pages/library/article-samples.js');
          }
          const response = await fetch(`pages/${id}.html`);
          if (!response.ok) throw new Error('没有打开这一页');
          const html = await response.text();
          if (window.Alpine.destroyTree) window.Alpine.destroyTree(slot);
          window.Alpine.mutateDom(() => {
            slot.innerHTML = html;
          });
          this.page = id;
          if (this.$refs.drawer) this.$refs.drawer.checked = false;
          window.Alpine.initTree(slot);
        } catch (err) {
          this.page = '';
          this.pageError = err && err.message ? err.message : '没有打开这一页';
        }
      },
    };
  };
}());
