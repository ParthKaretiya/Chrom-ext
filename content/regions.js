/*
 * Screen Blur - region manager.
 *
 * A "region" is one blurred area. Two kinds exist:
 *  - "elements": the selection tightly wrapped whole elements, so those elements get
 *    CSS filter: blur(). The page's own layout keeps them in the right place.
 *  - "overlay": a positioned layer using backdrop-filter. It is anchored to the
 *    smallest element containing the selection (or the document), so it follows
 *    scrolling inside any container, fixed/sticky parents, resizes and layout shifts.
 */
(function () {
  'use strict';
  const NS = globalThis.WPSB;
  if (NS.__skipLoad) return;
  const { Shared, Utils, Locator, Root, Store } = NS;

  const SAVE_DELAY_MS = 350;
  const POLL_MS = 700;
  const RETRY_MS = 400;
  const RECONCILE_DELAY_MS = 120;
  const HOVER_SLOP = 8;
  const REMOVE_SIZE = 22;

  let settings = Shared.normalizeSettings(null);
  let isSelecting = function () { return false; };
  let onCountChange = function () {};

  let pageKey = null;
  let regions = [];
  let observing = null;
  let resizeObserver = null;

  let rafId = 0;
  let settleFrames = 0;
  let saveTimer = 0;
  let reconcileTimer = 0;
  let hoverRaf = 0;
  let highlightTimer = 0;

  let pointer = null;
  let removeButton = null;
  let highlightEl = null;

  /** Element -> { count, prev, prevPriority, applied } for every element we put a blur filter on. */
  const filtered = new Map();

  /* --------------------------------- filters --------------------------------- */

  function attachFilter(region, el) {
    if (region.filteredEls.has(el)) return;
    region.filteredEls.add(el);
    let rec = filtered.get(el);
    if (!rec) {
      rec = {
        count: 0,
        prev: el.style.getPropertyValue('filter'),
        prevPriority: el.style.getPropertyPriority('filter'),
        applied: false
      };
      filtered.set(el, rec);
    }
    rec.count++;
  }

  function restoreFilter(el, rec) {
    if (rec.prev) el.style.setProperty('filter', rec.prev, rec.prevPriority);
    else el.style.removeProperty('filter');
    rec.applied = false;
  }

  function detachFilter(region, el) {
    if (!region.filteredEls.delete(el)) return;
    const rec = filtered.get(el);
    if (!rec) return;
    rec.count--;
    if (rec.count > 0) return;
    filtered.delete(el);
    if (rec.applied) restoreFilter(el, rec);
  }

  /** Applies, refreshes or removes the filter on every element. Writes only when something changed. */
  function syncFilters() {
    const value = 'blur(' + settings.intensity + 'px)';
    filtered.forEach(function (rec, el) {
      if (!el.isConnected) return;
      if (settings.enabled) {
        if (el.style.getPropertyValue('filter') !== value || el.style.getPropertyPriority('filter') !== 'important') {
          el.style.setProperty('filter', value, 'important');
        }
        rec.applied = true;
      } else if (rec.applied) {
        restoreFilter(el, rec);
      }
    });
  }

  /* ------------------------------ region lifecycle ------------------------------ */

  function createRuntime(data) {
    const region = {
      data: data,
      overlay: null,
      anchorEl: null,
      clip: [],
      targetEls: [],
      filteredEls: new Set(),
      status: 'waiting',
      hit: null,
      box: null,
      lastTry: 0,
      placed: '',
      volatile: false
    };
    if (data.mode === 'overlay') region.overlay = Root.createRegionElement();
    regions.push(region);
    startObserving();
    return region;
  }

  function setAnchor(region, el) {
    region.anchorEl = el;
    region.clip = Locator.clipChain(el);
    if (resizeObserver) {
      resizeObserver.observe(el);
      region.clip.forEach(function (c) {
        resizeObserver.observe(c);
      });
    }
  }

  function teardownRegion(region) {
    Array.from(region.filteredEls).forEach(function (el) {
      detachFilter(region, el);
    });
    if (resizeObserver && region.anchorEl) resizeObserver.unobserve(region.anchorEl);
    if (region.overlay) region.overlay.remove();
    region.overlay = null;
    region.anchorEl = null;
    region.targetEls = [];
  }

  function teardownAll() {
    regions.forEach(teardownRegion);
    regions = [];
  }

  function needsResolve(region) {
    if (region.data.mode === 'overlay') {
      if (region.data.anchor.type === 'document') return false;
      return !region.anchorEl || !region.anchorEl.isConnected;
    }
    const specs = region.data.targets;
    for (let i = 0; i < specs.length; i++) {
      const el = region.targetEls[i];
      if (!el || !el.isConnected) return true;
    }
    return false;
  }

  function resolveRegion(region) {
    region.lastTry = Date.now();

    if (region.data.mode === 'overlay') {
      const anchor = region.data.anchor;
      if (anchor.type === 'document') {
        region.status = 'visible';
        return true;
      }
      if (region.anchorEl && region.anchorEl.isConnected) return true;
      if (resizeObserver && region.anchorEl) resizeObserver.unobserve(region.anchorEl);
      region.anchorEl = null;
      region.clip = [];
      const el = Locator.resolve(anchor.selector, anchor.fp);
      if (!el) {
        region.status = 'waiting';
        return false;
      }
      setAnchor(region, el);
      return true;
    }

    const specs = region.data.targets;
    let found = 0;
    for (let i = 0; i < specs.length; i++) {
      let el = region.targetEls[i];
      if (!el || !el.isConnected) {
        if (el) detachFilter(region, el);
        el = Locator.resolve(specs[i].selector, specs[i].fp);
        region.targetEls[i] = el || null;
        if (el) attachFilter(region, el);
      }
      if (region.targetEls[i]) found++;
    }
    if (!found) region.status = 'waiting';
    return found === specs.length;
  }

  function createElementsRegion(targets) {
    const specs = [];
    for (let i = 0; i < targets.length; i++) {
      const selector = Locator.buildSelector(targets[i]);
      if (!selector) return null;
      specs.push({ selector: selector, fp: Locator.fingerprint(targets[i]) });
    }
    const region = createRuntime({ id: Utils.uid(), mode: 'elements', created: Date.now(), targets: specs });
    targets.forEach(function (el, i) {
      region.targetEls[i] = el;
      attachFilter(region, el);
    });
    region.status = 'visible';
    return region;
  }

  function createOverlayRegion(rect) {
    let anchorEl = Locator.pickAnchorElement(rect);
    let anchor;
    let volatile = false;

    if (Locator.isDocumentAnchor(anchorEl)) {
      anchorEl = null;
      anchor = {
        type: 'document',
        selector: '',
        fp: '',
        ox: rect.left + window.scrollX,
        oy: rect.top + window.scrollY
      };
    } else {
      const origin = Locator.originOf(anchorEl);
      const selector = Locator.buildSelector(anchorEl);
      volatile = !selector; // cannot be addressed again (e.g. inside a page's shadow DOM): live only
      anchor = {
        type: 'element',
        selector: selector || '',
        fp: Locator.fingerprint(anchorEl),
        ox: rect.left - origin.x,
        oy: rect.top - origin.y
      };
    }

    const region = createRuntime({
      id: Utils.uid(),
      mode: 'overlay',
      created: Date.now(),
      size: { w: rect.width, h: rect.height },
      anchor: anchor
    });
    region.volatile = volatile;
    if (anchorEl) setAnchor(region, anchorEl);
    region.status = 'visible';
    return region;
  }

  /**
   * Turns a finished drag selection (client coordinates) into a blurred area.
   * Returns { ok: true, id, mode } or { ok: false, reason }.
   */
  function createFromRect(rect) {
    if (regions.length >= Shared.MAX_REGIONS_PER_PAGE) {
      return { ok: false, reason: 'Limit of ' + Shared.MAX_REGIONS_PER_PAGE + ' blurred areas reached on this page.' };
    }
    const analysis = Locator.analyze(rect);
    let region = analysis.elements ? createElementsRegion(analysis.targets) : null;
    if (!region) region = createOverlayRegion(rect);

    scheduleSave();
    notify();
    schedule(4);
    return { ok: true, id: region.data.id, mode: region.data.mode };
  }

  function find(id) {
    for (let i = 0; i < regions.length; i++) {
      if (regions[i].data.id === id) return regions[i];
    }
    return null;
  }

  function removeRegion(id) {
    const region = find(id);
    if (!region) return false;
    teardownRegion(region);
    regions.splice(regions.indexOf(region), 1);
    hideRemove();
    scheduleSave();
    notify();
    if (regions.length === 0) stopObserving();
    return true;
  }

  function clearAll() {
    const count = regions.length;
    teardownAll();
    hideRemove();
    stopObserving();
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (pageKey) Store.removeRegions(pageKey);
    notify();
    return count;
  }

  /* --------------------------------- positioning --------------------------------- */

  function hideOverlay(region) {
    region.hit = null;
    if (region.overlay && !region.overlay.hidden) {
      region.overlay.hidden = true;
      region.placed = '';
    }
  }

  function placeOverlay(region, viewport) {
    const anchor = region.data.anchor;
    const size = region.data.size;
    let origin;

    if (anchor.type === 'document') {
      origin = Locator.documentOrigin();
    } else {
      const el = region.anchorEl;
      if (!el || !el.isConnected) {
        region.status = 'waiting';
        hideOverlay(region);
        return;
      }
      origin = Locator.originOf(el);
    }

    const left = origin.x + anchor.ox;
    const top = origin.y + anchor.oy;
    let visible = Utils.intersect(Utils.makeRect(left, top, left + size.w, top + size.h), viewport);
    for (let i = 0; visible && i < region.clip.length; i++) {
      const container = region.clip[i];
      if (!container.isConnected) continue;
      const clip = Locator.clipRectOf(container);
      if (clip) visible = Utils.intersect(visible, clip);
    }

    if (!visible) {
      region.status = 'offscreen';
      hideOverlay(region);
      return;
    }

    region.status = 'visible';
    region.hit = visible;
    region.box = Utils.makeRect(left, top, left + size.w, top + size.h);

    const x = Math.round(visible.left);
    const y = Math.round(visible.top);
    const w = Math.round(visible.right) - x;
    const h = Math.round(visible.bottom) - y;
    const key = x + ',' + y + ',' + w + ',' + h;
    const node = region.overlay;
    if (key !== region.placed) {
      node.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      node.style.width = w + 'px';
      node.style.height = h + 'px';
      region.placed = key;
    }
    if (node.hidden) node.hidden = false;
  }

  function placeElements(region, viewport) {
    let bounds = null;
    let anyConnected = false;
    for (let i = 0; i < region.targetEls.length; i++) {
      const el = region.targetEls[i];
      if (!el || !el.isConnected) continue;
      anyConnected = true;
      const rect = Utils.fromDOMRect(el.getBoundingClientRect());
      if (rect.width > 0 && rect.height > 0) bounds = Utils.union(bounds, rect);
    }
    region.box = bounds;
    if (!anyConnected) {
      region.status = 'waiting';
      region.hit = null;
      return;
    }
    region.hit = bounds ? Utils.intersect(bounds, viewport) : null;
    region.status = region.hit ? 'visible' : 'offscreen';
  }

  function updateAll() {
    const viewport = Utils.viewportRect();
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      if (!settings.enabled) {
        hideOverlay(region);
        continue;
      }
      if (region.data.mode === 'overlay') placeOverlay(region, viewport);
      else placeElements(region, viewport);
    }
    syncFilters();
    refreshHover();
  }

  function tick() {
    rafId = 0;
    settleFrames = Math.max(0, settleFrames - 1);
    updateAll();
    if (settleFrames > 0) rafId = requestAnimationFrame(tick);
  }

  /** Re-position on the next frame, and keep doing so for `frames` frames to follow transitions. */
  function schedule(frames) {
    settleFrames = Math.max(settleFrames, frames);
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function reconcile() {
    const now = Date.now();
    let changed = false;
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      if (needsResolve(region) && now - region.lastTry >= RETRY_MS) {
        resolveRegion(region);
        changed = true;
      }
    }
    if (changed) schedule(2);
  }

  function scheduleReconcile() {
    if (reconcileTimer) return;
    reconcileTimer = setTimeout(function () {
      reconcileTimer = 0;
      reconcile();
    }, RECONCILE_DELAY_MS);
  }

  /* ------------------------------- observers ------------------------------- */

  function startObserving() {
    if (observing) return;
    const controller = new AbortController();
    const passive = { signal: controller.signal, capture: true, passive: true };
    const plain = { signal: controller.signal };

    const onScroll = function () { schedule(1); };
    const onResize = function () { schedule(8); };
    const onSettle = function () { schedule(3); };

    window.addEventListener('scroll', onScroll, passive); // capture: also fires for scrolling inside any element
    window.addEventListener('resize', onResize, plain);
    document.addEventListener('transitionend', onSettle, passive);
    document.addEventListener('animationend', onSettle, passive);
    document.addEventListener('mousemove', onPointerMove, passive);
    window.addEventListener('blur', hideRemove, plain);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize, plain);
      window.visualViewport.addEventListener('scroll', onScroll, plain);
    }

    const mutation = new MutationObserver(function () {
      scheduleReconcile();
      schedule(6);
    });
    mutation.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden']
    });

    resizeObserver = new ResizeObserver(function () { schedule(2); });
    regions.forEach(function (region) {
      if (region.anchorEl) {
        resizeObserver.observe(region.anchorEl);
        region.clip.forEach(function (c) { resizeObserver.observe(c); });
      }
    });

    // Safety net for movement no event announces (JS-driven animation, carousels...).
    const poll = setInterval(function () {
      if (document.hidden) return;
      reconcile();
      schedule(1);
    }, POLL_MS);

    observing = { controller: controller, mutation: mutation, poll: poll };
  }

  function stopObserving() {
    if (!observing) return;
    observing.controller.abort();
    observing.mutation.disconnect();
    clearInterval(observing.poll);
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    observing = null;
    cancelAnimationFrame(rafId);
    rafId = 0;
    settleFrames = 0;
    clearTimeout(reconcileTimer);
    reconcileTimer = 0;
  }

  /* ------------------------------ hover + remove ------------------------------ */

  function onPointerMove(event) {
    pointer = { x: event.clientX, y: event.clientY };
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(function () {
      hoverRaf = 0;
      refreshHover();
    });
  }

  function ensureRemoveButton() {
    if (removeButton && removeButton.isConnected) return removeButton;
    removeButton = Root.createRemoveButton();
    const swallow = function (event) { event.stopPropagation(); };
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach(function (name) {
      removeButton.addEventListener(name, swallow);
    });
    removeButton.addEventListener('click', function (event) {
      event.stopPropagation();
      event.preventDefault();
      const id = removeButton.dataset.regionId;
      if (id) removeRegion(id);
    });
    return removeButton;
  }

  function hideRemove() {
    if (removeButton) removeButton.classList.remove('show');
  }

  function refreshHover() {
    if (!pointer || !settings.enabled || regions.length === 0 || isSelecting()) {
      hideRemove();
      return;
    }
    let best = null;
    let bestArea = Infinity;
    for (let i = 0; i < regions.length; i++) {
      const hit = regions[i].hit;
      if (!hit) continue;
      if (
        pointer.x >= hit.left - HOVER_SLOP && pointer.x <= hit.right + HOVER_SLOP &&
        pointer.y >= hit.top - HOVER_SLOP && pointer.y <= hit.bottom + HOVER_SLOP
      ) {
        const size = hit.width * hit.height;
        if (size < bestArea) {
          best = regions[i];
          bestArea = size;
        }
      }
    }
    if (!best) {
      hideRemove();
      return;
    }

    const hit = best.hit;
    const viewport = Utils.viewportRect();
    let x = hit.right - REMOVE_SIZE - 4;
    let y = hit.top + 4;
    if (hit.width < REMOVE_SIZE * 2 + 8 || hit.height < REMOVE_SIZE * 2 + 8) {
      x = hit.right - REMOVE_SIZE / 2;
      y = hit.top - REMOVE_SIZE / 2;
    }
    x = Utils.clamp(x, 2, viewport.width - REMOVE_SIZE - 2);
    y = Utils.clamp(y, 2, viewport.height - REMOVE_SIZE - 2);

    const button = ensureRemoveButton();
    button.dataset.regionId = best.data.id;
    button.style.left = Math.round(x) + 'px';
    button.style.top = Math.round(y) + 'px';
    button.classList.add('show');
  }

  /* ------------------------------ popup helpers ------------------------------ */

  function round(n) {
    return Math.round(n);
  }

  function list() {
    return regions.map(function (region, index) {
      const box = region.data.mode === 'overlay' ? region.data.size : region.box;
      return {
        id: region.data.id,
        label: 'Area ' + (index + 1),
        mode: region.data.mode,
        status: region.status,
        width: box ? round(box.width !== undefined ? box.width : box.w) : 0,
        height: box ? round(box.height !== undefined ? box.height : box.h) : 0,
        bounds: region.hit
          ? { left: round(region.hit.left), top: round(region.hit.top), width: round(region.hit.width), height: round(region.hit.height) }
          : null
      };
    });
  }

  function revealRegion(region) {
    if (region.data.mode === 'overlay' && region.data.anchor.type === 'document') {
      const anchor = region.data.anchor;
      window.scrollTo({
        left: Math.max(0, anchor.ox - 40),
        top: Math.max(0, anchor.oy - window.innerHeight / 3),
        behavior: 'instant'
      });
      return;
    }
    const node =
      region.data.mode === 'overlay'
        ? region.anchorEl
        : region.targetEls.find(function (el) { return el && el.isConnected; });
    if (node && node.isConnected) node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  }

  function showHighlight(rect) {
    if (highlightEl) highlightEl.remove();
    clearTimeout(highlightTimer);
    highlightEl = Root.el('div', 'hl');
    highlightEl.style.left = Math.round(rect.left) + 'px';
    highlightEl.style.top = Math.round(rect.top) + 'px';
    highlightEl.style.width = Math.round(rect.width) + 'px';
    highlightEl.style.height = Math.round(rect.height) + 'px';
    Root.layer('ui').appendChild(highlightEl);
    const node = highlightEl;
    highlightTimer = setTimeout(function () {
      node.remove();
      if (highlightEl === node) highlightEl = null;
    }, 1600);
  }

  function highlight(id, reveal) {
    const region = find(id);
    if (!region) return false;
    if (reveal && !region.hit) revealRegion(region);
    updateAll();
    if (!region.hit) return false;
    showHighlight(region.hit);
    return true;
  }

  /* ------------------------------ persistence ------------------------------ */

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!pageKey || !settings.remember) return;
    const persistent = regions
      .filter(function (region) { return !region.volatile; })
      .map(function (region) { return region.data; });
    Store.saveRegions(pageKey, persistent);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  }

  function flush() {
    if (saveTimer) saveNow();
  }

  function notify() {
    onCountChange(regions.length);
  }

  /* --------------------------------- public API --------------------------------- */

  function init(options) {
    settings = options.settings;
    isSelecting = options.isSelecting || isSelecting;
    onCountChange = options.onChange || onCountChange;
    Root.setBlur(settings.intensity);
  }

  function applySettings(next) {
    const previous = settings;
    settings = next;
    Root.setBlur(next.intensity);
    if (!previous.remember && next.remember) scheduleSave();
    syncFilters();
    if (regions.length) schedule(3);
  }

  /** Replaces the page's areas with the stored ones (used on load and on SPA navigation). */
  function loadPage(key, saved) {
    teardownAll();
    pageKey = key;
    saved.forEach(function (data) {
      const region = createRuntime(data);
      resolveRegion(region);
    });
    if (regions.length) schedule(10);
    else stopObserving();
    notify();
  }

  /** Detaches every area from the page without deleting what is stored for it. */
  function unloadPage() {
    flush();
    teardownAll();
    hideRemove();
    stopObserving();
    notify();
  }

  function destroy() {
    stopObserving();
    clearTimeout(saveTimer);
    clearTimeout(highlightTimer);
    teardownAll();
    removeButton = null;
    highlightEl = null;
  }

  NS.Regions = Object.freeze({
    init: init,
    applySettings: applySettings,
    createFromRect: createFromRect,
    loadPage: loadPage,
    unloadPage: unloadPage,
    removeRegion: removeRegion,
    clearAll: clearAll,
    list: list,
    highlight: highlight,
    flush: flush,
    destroy: destroy,
    count: function () { return regions.length; }
  });
})();
