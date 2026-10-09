/*
 * WP Screen Blur - small, dependency-free helpers used by the other content files.
 */
(function () {
  'use strict';
  const NS = globalThis.WPSB;
  if (NS.__skipLoad) return;

  const OWN_TAG = 'wp-screen-blur-root';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /** Plain rectangle with both edges and size, in whatever coordinate space the caller uses. */
  function makeRect(left, top, right, bottom) {
    return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
  }

  /** Builds a rectangle from two corner points given in any order (drag in any direction). */
  function normalizeRect(x1, y1, x2, y2) {
    return makeRect(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
  }

  function fromDOMRect(r) {
    return makeRect(r.left, r.top, r.right, r.bottom);
  }

  /** Intersection of two rectangles, or null when they do not overlap. */
  function intersect(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    if (right <= left || bottom <= top) return null;
    return makeRect(left, top, right, bottom);
  }

  function union(a, b) {
    if (!a) return b;
    if (!b) return a;
    return makeRect(
      Math.min(a.left, b.left),
      Math.min(a.top, b.top),
      Math.max(a.right, b.right),
      Math.max(a.bottom, b.bottom)
    );
  }

  function area(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  /** The visible layout viewport (excludes scrollbars), in client coordinates. */
  function viewportRect() {
    const de = document.documentElement;
    const width = (de && de.clientWidth) || window.innerWidth;
    const height = (de && de.clientHeight) || window.innerHeight;
    return makeRect(0, 0, width, height);
  }

  function uid() {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return buf[0].toString(36) + buf[1].toString(36);
  }

  /** 32-bit FNV-1a hash as base36. Used for short, non-reversible text fingerprints. */
  function hash32(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  /** False once the extension was reloaded/updated and this content script is orphaned. */
  function isContextValid() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (error) {
      return false;
    }
  }

  function isOwnNode(node) {
    return Boolean(node) && node.nodeType === 1 && node.localName === OWN_TAG;
  }

  function debounce(fn, wait) {
    let timer = 0;
    return function debounced() {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        timer = 0;
        fn.apply(null, args);
      }, wait);
    };
  }

  NS.Utils = Object.freeze({
    OWN_TAG: OWN_TAG,
    clamp: clamp,
    makeRect: makeRect,
    normalizeRect: normalizeRect,
    fromDOMRect: fromDOMRect,
    intersect: intersect,
    union: union,
    area: area,
    viewportRect: viewportRect,
    uid: uid,
    hash32: hash32,
    isContextValid: isContextValid,
    isOwnNode: isOwnNode,
    debounce: debounce
  });
})();
