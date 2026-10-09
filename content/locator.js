/*
 * WP Screen Blur - DOM locator.
 * Everything that needs to understand the page structure lives here:
 *  - choosing the element a blurred area is anchored to,
 *  - deciding whether a selection can be blurred by filtering whole elements,
 *  - building / resolving CSS selectors so areas can be restored later,
 *  - working out which scroll containers clip an anchored area.
 */
(function () {
  'use strict';
  const NS = globalThis.WPSB;
  if (NS.__skipLoad) return;
  const { Utils } = NS;

  const MAX_VISITED_NODES = 6000;
  const CONTAIN_RATIO = 0.9;
  const MIN_TARGET_SIZE = 4;
  const MIN_COVERAGE = 0.4;
  const MAX_TARGETS = 25;
  const MAX_FILTER_SUBTREE = 400;
  const MAX_SELECTOR_LENGTH = 3000;
  const FINGERPRINT_TEXT_LIMIT = 160;

  const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'template', 'head', 'title', 'base']);
  const CONTENT_TAGS = new Set([
    'img', 'video', 'canvas', 'svg', 'iframe', 'object', 'embed', 'input', 'textarea', 'select', 'button', 'audio'
  ]);

  /* ----------------------------- anchors & scrolling ----------------------------- */

  /** True when positions should be expressed in document coordinates instead of relative to an element. */
  function isDocumentAnchor(el) {
    if (!el || el === document.documentElement) return true;
    return el === document.body && document.scrollingElement === document.body;
  }

  /**
   * Viewport position of an element's scrollable content origin. A stored offset
   * measured from this point stays correct while the element (or any ancestor)
   * scrolls, moves or sits inside a fixed/sticky parent.
   */
  function originOf(el) {
    const box = el.getBoundingClientRect();
    return {
      x: box.left + (el.clientLeft || 0) - (el.scrollLeft || 0),
      y: box.top + (el.clientTop || 0) - (el.scrollTop || 0)
    };
  }

  function documentOrigin() {
    return { x: -window.scrollX, y: -window.scrollY };
  }

  /**
   * The smallest element whose box fully contains the selection. Starts from the
   * element under the middle of the visible part of the selection and climbs up.
   * Returns null when only the document itself contains it.
   */
  function pickAnchorElement(rect) {
    const visible = Utils.intersect(rect, Utils.viewportRect());
    if (!visible) return null;
    const x = (visible.left + visible.right) / 2;
    const y = (visible.top + visible.bottom) / 2;

    let el = null;
    const stack = document.elementsFromPoint(x, y);
    for (let i = 0; i < stack.length; i++) {
      if (!Utils.isOwnNode(stack[i])) {
        el = stack[i];
        break;
      }
    }

    while (el && el !== document.documentElement) {
      const box = el.getBoundingClientRect();
      if (
        box.width > 0 && box.height > 0 &&
        box.left <= rect.left + 1 && box.top <= rect.top + 1 &&
        box.right >= rect.right - 1 && box.bottom >= rect.bottom - 1
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  /** The clipping rectangle (padding box) of an overflow container, or null if it does not clip. */
  function clipRectOf(el) {
    if (!el.clientWidth && !el.clientHeight) return null;
    const box = el.getBoundingClientRect();
    const left = box.left + (el.clientLeft || 0);
    const top = box.top + (el.clientTop || 0);
    return Utils.makeRect(left, top, left + el.clientWidth, top + el.clientHeight);
  }

  /** Ancestors (including the anchor) that clip their content because overflow is not "visible". */
  function clipChain(anchor) {
    const chain = [];
    for (let el = anchor; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        if (el.clientWidth || el.clientHeight) chain.push(el);
      }
    }
    return chain;
  }

  /* --------------------------- selectors & fingerprints --------------------------- */

  function isStableToken(token) {
    return (
      typeof token === 'string' &&
      /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(token) &&
      !/\d{4,}/.test(token) &&
      !/[A-Fa-f0-9]{10,}/.test(token)
    );
  }

  function countMatches(selector) {
    try {
      return document.querySelectorAll(selector).length;
    } catch (error) {
      return 0;
    }
  }

  function segmentFor(node) {
    const parent = node.parentElement;
    if (!parent) return node.localName;
    const index = Array.prototype.indexOf.call(parent.children, node) + 1;
    return node.localName + ':nth-child(' + index + ')';
  }

  /**
   * Builds a CSS selector for an element and verifies that it resolves back to that
   * exact element. Returns null for elements that cannot be addressed this way
   * (for example nodes inside a page's own shadow DOM).
   */
  function buildSelector(el) {
    if (!el || el.nodeType !== 1 || el === document.documentElement) return null;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node === document.body) {
        parts.unshift('body');
        break;
      }
      if (isStableToken(node.id)) {
        const byId = '#' + CSS.escape(node.id);
        if (countMatches(byId) === 1) {
          parts.unshift(byId);
          break;
        }
      }
      parts.unshift(segmentFor(node));
      node = node.parentElement;
    }
    const selector = parts.join(' > ');
    if (selector.length > MAX_SELECTOR_LENGTH) return null;
    try {
      return document.querySelector(selector) === el ? selector : null;
    } catch (error) {
      return null;
    }
  }

  function readTextSample(el, limit) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let out = '';
    let node = walker.nextNode();
    while (node && out.length < limit * 4) {
      const parent = node.parentElement;
      if (!parent || !SKIP_TAGS.has(parent.localName)) out += ' ' + node.nodeValue;
      node = walker.nextNode();
    }
    return out.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, limit);
  }

  /**
   * A short hash of the element's tag and leading text. It lets a restored area
   * check that it found the same content again; the text itself is never stored.
   */
  function fingerprint(el) {
    const sample = readTextSample(el, FINGERPRINT_TEXT_LIMIT);
    return el.localName + ':' + (sample ? Utils.hash32(sample) : '');
  }

  function matchesFingerprint(el, fp) {
    if (!fp) return true;
    const cut = fp.lastIndexOf(':');
    const tag = fp.slice(0, cut);
    const hash = fp.slice(cut + 1);
    if (el.localName !== tag) return false;
    if (!hash) return true;
    return fingerprint(el) === fp;
  }

  /** Finds a previously stored element again; null when it is missing or its content changed. */
  function resolve(selector, fp) {
    if (!selector) return null;
    let el = null;
    try {
      el = document.querySelector(selector);
    } catch (error) {
      return null;
    }
    if (!el || Utils.isOwnNode(el)) return null;
    return matchesFingerprint(el, fp) ? el : null;
  }

  /* ------------------------------ element analysis ------------------------------ */

  function mayOverflow(el) {
    const style = getComputedStyle(el);
    return style.overflowX === 'visible' && style.overflowY === 'visible';
  }

  function hasOwnContent(el) {
    if (CONTENT_TAGS.has(el.localName)) return true;
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim() !== '') return true;
    }
    const bg = getComputedStyle(el).backgroundImage;
    return Boolean(bg) && bg !== 'none';
  }

  function isPaintable(el) {
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && parseFloat(style.opacity) !== 0;
  }

  /** Filtering an ancestor of position:fixed content would change its containing block, so avoid it. */
  function hasFixedDescendant(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
    let count = 0;
    let node = walker.nextNode();
    while (node) {
      if (++count > MAX_FILTER_SUBTREE) return true;
      if (getComputedStyle(node).position === 'fixed') return true;
      node = walker.nextNode();
    }
    return false;
  }

  function coverageOf(selection, rects) {
    const steps = 24;
    let hits = 0;
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const x = selection.left + ((i + 0.5) * selection.width) / steps;
        const y = selection.top + ((j + 0.5) * selection.height) / steps;
        for (let k = 0; k < rects.length; k++) {
          const r = rects[k];
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            hits++;
            break;
          }
        }
      }
    }
    return hits / (steps * steps);
  }

  /**
   * Looks at what lies under a selection (client coordinates).
   * `elements` is true when every piece of visible content that touches the
   * selection is fully inside it, so filtering those elements blurs exactly what the
   * user selected. Anything cut by the selection edge forces the overlay approach.
   */
  function analyze(selection) {
    const root = document.body || document.documentElement;
    const targets = [];
    let partialContent = false;
    let visited = 0;
    let exhausted = false;

    function visit(el) {
      if (exhausted) return;
      if (++visited > MAX_VISITED_NODES) {
        exhausted = true;
        return;
      }
      if (Utils.isOwnNode(el) || SKIP_TAGS.has(el.localName)) return;

      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        const rect = Utils.fromDOMRect(box);
        const overlap = Utils.intersect(rect, selection);
        if (!overlap) {
          if (!mayOverflow(el)) return;
        } else if (Utils.area(overlap) / Utils.area(rect) >= CONTAIN_RATIO) {
          if (rect.width >= MIN_TARGET_SIZE && rect.height >= MIN_TARGET_SIZE && isPaintable(el)) targets.push(el);
          return;
        } else if (hasOwnContent(el)) {
          partialContent = true;
        }
      }
      for (let child = el.firstElementChild; child; child = child.nextElementSibling) visit(child);
    }

    for (let child = root.firstElementChild; child; child = child.nextElementSibling) visit(child);

    if (exhausted) return { elements: false, targets: [], coverage: 0 };

    const rects = targets.map(function (el) {
      return Utils.fromDOMRect(el.getBoundingClientRect());
    });
    const coverage = targets.length ? coverageOf(selection, rects) : 0;
    const usable =
      !partialContent &&
      targets.length > 0 &&
      targets.length <= MAX_TARGETS &&
      coverage >= MIN_COVERAGE &&
      targets.every(function (el) {
        return !hasFixedDescendant(el);
      });

    return { elements: usable, targets: usable ? targets : [], coverage: coverage };
  }

  NS.Locator = Object.freeze({
    isDocumentAnchor: isDocumentAnchor,
    originOf: originOf,
    documentOrigin: documentOrigin,
    pickAnchorElement: pickAnchorElement,
    clipRectOf: clipRectOf,
    clipChain: clipChain,
    buildSelector: buildSelector,
    fingerprint: fingerprint,
    resolve: resolve,
    analyze: analyze
  });
})();
