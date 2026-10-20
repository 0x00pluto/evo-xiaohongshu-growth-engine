/**
 * 题词 #RRGGBB 切分 / 替换 / 吸色取样（浏览器端，挂 window.promptColors）。
 */
(function (global) {
  'use strict';

  const HEX_RE = /#([0-9A-Fa-f]{6})\b/g;
  const LOUPE_ZOOM = 8;
  const LOUPE_RADIUS = 56;

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeHex(value) {
    const text = String(value || '').trim();
    const match = text.match(/^#?([0-9A-Fa-f]{6})$/);
    if (!match) return '';
    return `#${match[1].toUpperCase()}`;
  }

  /**
   * @typedef {{ type: 'text'; value: string } | { type: 'color'; value: string; index: number }} PromptSegment
   * @typedef {{ value: string; index: number }} ColorChip
   */

  /**
   * @param {unknown} text
   * @returns {PromptSegment[]}
   */
  function splitPromptColors(text) {
    const source = String(text || '');
    /** @type {PromptSegment[]} */
    const parts = [];
    let last = 0;
    let index = 0;
    HEX_RE.lastIndex = 0;
    let match = HEX_RE.exec(source);
    while (match) {
      if (match.index > last) {
        parts.push({ type: 'text', value: source.slice(last, match.index) });
      }
      parts.push({
        type: 'color',
        value: `#${match[1].toUpperCase()}`,
        index,
      });
      index += 1;
      last = match.index + match[0].length;
      match = HEX_RE.exec(source);
    }
    if (last < source.length) {
      parts.push({ type: 'text', value: source.slice(last) });
    }
    return parts;
  }

  /**
   * 题词里全部色点（按出现序，保留重复 occurrence）。
   * @param {unknown} text
   * @returns {ColorChip[]}
   */
  function listColorChips(text) {
    return splitPromptColors(text)
      .filter((seg) => seg.type === 'color')
      .map((seg) => ({ value: seg.value, index: seg.index }));
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 副文本 HTML：正文可编辑，色块按钮 contenteditable=false。
   * @param {unknown} text
   * @param {{ disabled?: boolean }} [options]
   * @returns {string}
   */
  function renderPromptHtml(text, options) {
    const disabled = Boolean(options && options.disabled);
    const parts = splitPromptColors(text);
    /** @type {string[]} */
    const html = [];
    for (const seg of parts) {
      if (seg.type === 'text') {
        html.push(escapeHtml(seg.value));
        continue;
      }
      const dis = disabled ? ' disabled' : '';
      html.push(
        `<span class="prompt-color-run">${escapeHtml(seg.value)}`
        + `<button type="button" class="prompt-color-swatch" data-color-index="${seg.index}"`
        + ` contenteditable="false" draggable="false" aria-label="吸色 ${escapeHtml(seg.value)}"`
        + ` style="background:${escapeHtml(seg.value)}"${dis}></button></span>`,
      );
    }
    return html.join('');
  }

  /**
   * 从 contenteditable 根节点序列化回纯文本（忽略色块按钮）。
   * @param {ParentNode | null | undefined} root
   * @returns {string}
   */
  function serializePromptDom(root) {
    if (!root) return '';
    /** @type {string[]} */
    const chunks = [];

    /**
     * @param {Node} node
     */
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        chunks.push(node.nodeValue || '');
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = /** @type {HTMLElement} */ (node);
      if (el.matches && el.matches('button.prompt-color-swatch, button[data-color-index]')) {
        return;
      }
      if (el.tagName === 'BR') {
        chunks.push('\n');
        return;
      }
      const children = el.childNodes;
      for (let i = 0; i < children.length; i += 1) {
        walk(children[i]);
      }
      if (el.tagName === 'DIV' || el.tagName === 'P') {
        const next = el.nextSibling;
        if (next) chunks.push('\n');
      }
    }

    const kids = root.childNodes;
    for (let i = 0; i < kids.length; i += 1) {
      walk(kids[i]);
    }
    return chunks.join('').replace(/\u00a0/g, ' ');
  }

  /**
   * @param {unknown} text
   * @param {unknown} occurrenceIndex
   * @param {unknown} nextHex
   * @returns {string}
   */
  function replaceHexAt(text, occurrenceIndex, nextHex) {
    const source = String(text || '');
    const hex = normalizeHex(nextHex);
    const target = Number(occurrenceIndex);
    if (!hex || !Number.isInteger(target) || target < 0) return source;
    HEX_RE.lastIndex = 0;
    let index = 0;
    return source.replace(HEX_RE, (full) => {
      if (index === target) {
        index += 1;
        return hex;
      }
      index += 1;
      return full;
    });
  }

  /**
   * @param {HTMLImageElement} image
   * @param {DOMRect} rect
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ px: number; py: number } | null}
   */
  function clientToPixel(image, rect, clientX, clientY) {
    if (!image || !image.naturalWidth || !rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    const offsetX = rect.left + (rect.width - drawW) / 2;
    const offsetY = rect.top + (rect.height - drawH) / 2;
    const x = clientX - offsetX;
    const y = clientY - offsetY;
    if (x < 0 || y < 0 || x >= drawW || y >= drawH) return null;
    const px = Math.min(image.naturalWidth - 1, Math.max(0, Math.floor(x / scale)));
    const py = Math.min(image.naturalHeight - 1, Math.max(0, Math.floor(y / scale)));
    return { px, py };
  }

  /**
   * 离屏缓存图，mousemove 只读像素。
   * @param {HTMLImageElement} image
   * @returns {{
   *   sampleAt: (clientX: number, clientY: number, rect: DOMRect) => { r: number; g: number; b: number; hex: string; px: number; py: number } | null;
   *   drawLoupe: (loupeCanvas: HTMLCanvasElement, px: number, py: number) => void;
   * }}
   */
  function createImageSampler(image) {
    const source = document.createElement('canvas');
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    if (!sourceCtx) {
      return {
        sampleAt: () => null,
        drawLoupe: () => {},
      };
    }
    sourceCtx.drawImage(image, 0, 0);

    /**
     * @param {number} clientX
     * @param {number} clientY
     * @param {DOMRect} rect
     */
    function sampleAt(clientX, clientY, rect) {
      const pos = clientToPixel(image, rect, clientX, clientY);
      if (!pos) return null;
      const data = sourceCtx.getImageData(pos.px, pos.py, 1, 1).data;
      const r = data[0];
      const g = data[1];
      const b = data[2];
      const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
      return { r, g, b, hex, px: pos.px, py: pos.py };
    }

    /**
     * 放大镜中心对准 (px, py)；十字准星标取样点。
     * @param {HTMLCanvasElement} loupeCanvas
     * @param {number} px
     * @param {number} py
     */
    function drawLoupe(loupeCanvas, px, py) {
      const size = LOUPE_RADIUS * 2;
      loupeCanvas.width = size;
      loupeCanvas.height = size;
      const ctx = loupeCanvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(LOUPE_RADIUS, LOUPE_RADIUS, LOUPE_RADIUS - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      const half = LOUPE_RADIUS / LOUPE_ZOOM;
      ctx.drawImage(
        source,
        px - half,
        py - half,
        half * 2,
        half * 2,
        0,
        0,
        size,
        size,
      );
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(LOUPE_RADIUS, LOUPE_RADIUS, LOUPE_RADIUS - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LOUPE_RADIUS - 10, LOUPE_RADIUS);
      ctx.lineTo(LOUPE_RADIUS + 10, LOUPE_RADIUS);
      ctx.moveTo(LOUPE_RADIUS, LOUPE_RADIUS - 10);
      ctx.lineTo(LOUPE_RADIUS, LOUPE_RADIUS + 10);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(LOUPE_RADIUS - 1, LOUPE_RADIUS - 1, 2, 2);
    }

    return { sampleAt, drawLoupe };
  }

  /**
   * @deprecated 兼容旧调用；优先 createImageSampler
   * @param {HTMLImageElement} image
   * @param {number} clientX
   * @param {number} clientY
   * @param {DOMRect} rect
   */
  function sampleImageColor(image, clientX, clientY, rect) {
    const sampler = createImageSampler(image);
    return sampler.sampleAt(clientX, clientY, rect);
  }

  global.promptColors = {
    LOUPE_RADIUS,
    normalizeHex,
    splitPromptColors,
    listColorChips,
    escapeHtml,
    renderPromptHtml,
    serializePromptDom,
    replaceHexAt,
    createImageSampler,
    sampleImageColor,
    clientToPixel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
