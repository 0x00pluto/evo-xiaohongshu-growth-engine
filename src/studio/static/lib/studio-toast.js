// @ts-check
(function () {
  const LEAVE_MS = 160;

  /**
   * Alpine 页共用：感叹号错误 / 绿对勾成功 + 顶部落入淡出。
   * @returns {{
   *   toastText: string,
   *   toastType: 'error' | 'success',
   *   toastOpen: boolean,
   *   toastTimer: ReturnType<typeof setTimeout> | null,
   *   toastLeaveTimer: ReturnType<typeof setTimeout> | null,
   *   dismissToast: () => void,
   *   clearToast: () => void,
   *   showToast: (message: unknown, opts?: number | { type?: string, ms?: number }) => void,
   * }}
   */
  window.createStudioToast = function createStudioToast() {
    return {
      toastText: '',
      toastType: 'error',
      toastOpen: false,
      toastTimer: null,
      toastLeaveTimer: null,

      dismissToast() {
        if (this.toastTimer) {
          clearTimeout(this.toastTimer);
          this.toastTimer = null;
        }
        if (this.toastLeaveTimer) {
          clearTimeout(this.toastLeaveTimer);
          this.toastLeaveTimer = null;
        }
        this.toastOpen = false;
        this.toastLeaveTimer = setTimeout(() => {
          this.toastText = '';
          this.toastLeaveTimer = null;
        }, LEAVE_MS);
      },

      clearToast() {
        this.dismissToast();
      },

      /**
       * @param {unknown} message
       * @param {number | { type?: string, ms?: number }} [opts]
       */
      showToast(message, opts) {
        const text = String(message == null ? '' : message).trim();
        if (!text) return;
        /** @type {'error' | 'success'} */
        let type = 'error';
        /** @type {number | undefined} */
        let ms;
        if (typeof opts === 'number') {
          ms = opts;
        } else if (opts && typeof opts === 'object') {
          if (opts.type === 'success') type = 'success';
          else if (opts.type === 'error') type = 'error';
          if (typeof opts.ms === 'number') ms = opts.ms;
        }
        if (this.toastTimer) clearTimeout(this.toastTimer);
        if (this.toastLeaveTimer) {
          clearTimeout(this.toastLeaveTimer);
          this.toastLeaveTimer = null;
        }
        this.toastText = text;
        this.toastType = type;
        this.toastOpen = true;
        const wait = typeof ms === 'number' && ms > 0
          ? ms
          : (text.length > 40 ? 4000 : 2000);
        this.toastTimer = setTimeout(() => {
          this.toastTimer = null;
          this.dismissToast();
        }, wait);
      },
    };
  };
}());
