/*
 * Screen Blur - drag-to-select mode.
 *
 * While selection mode is active a transparent capture layer covers the viewport so
 * the page (and any iframe) never receives the drag. Wheel scrolling is forwarded to
 * whatever scrolls under the pointer, dragging near an edge auto-scrolls the document,
 * and Escape leaves the mode. When selection mode is off nothing from this file is in
 * the page at all.
 */
(function () {
  'use strict';
  const NS = globalThis.WPSB;
  if (NS.__skipLoad) return;
  const { Utils, Root } = NS;

  const MIN_SIZE = 8;
  const EDGE_ZONE = 40;
  const MAX_SCROLL_STEP = 24;
  const LINE_HEIGHT_PX = 16;

  let session = null;

  /* --------------------------------- scrolling --------------------------------- */

  function normalizeWheel(delta, mode) {
    if (mode === 1) return delta * LINE_HEIGHT_PX;
    if (mode === 2) return delta * window.innerHeight;
    return delta;
  }

  function canScroll(el, dx, dy) {
    const style = getComputedStyle(el);
    const scrollableY = /^(auto|scroll|overlay)$/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const scrollableX = /^(auto|scroll|overlay)$/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (dy !== 0 && scrollableY) {
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    if (dx !== 0 && scrollableX) {
      if (dx > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0) return true;
    }
    return false;
  }

  function scrollDocument(dx, dy) {
    const scroller = document.scrollingElement || document.documentElement;
    scroller.scrollBy({ left: dx, top: dy, behavior: 'instant' });
  }

  /** Scrolls the innermost scrollable element under (x, y), chaining outwards like a normal wheel. */
  function scrollAt(x, y, dx, dy) {
    const stack = document.elementsFromPoint(x, y);
    let el = null;
    for (let i = 0; i < stack.length; i++) {
      if (!Utils.isOwnNode(stack[i])) {
        el = stack[i];
        break;
      }
    }
    while (el && el !== document.body && el !== document.documentElement) {
      if (canScroll(el, dx, dy)) {
        el.scrollBy({ left: dx, top: dy, behavior: 'instant' });
        return;
      }
      el = el.parentElement;
    }
    scrollDocument(dx, dy);
  }

  function edgeVelocity(position, size) {
    if (position < EDGE_ZONE) return -Math.ceil(((EDGE_ZONE - position) / EDGE_ZONE) * MAX_SCROLL_STEP);
    if (position > size - EDGE_ZONE) return Math.ceil(((position - (size - EDGE_ZONE)) / EDGE_ZONE) * MAX_SCROLL_STEP);
    return 0;
  }

  /* --------------------------------- rendering --------------------------------- */

  /** The drag rectangle in client coordinates. The start point is kept in page coordinates so scrolling mid-drag grows it. */
  function currentRect(drag) {
    return Utils.normalizeRect(drag.startX - window.scrollX, drag.startY - window.scrollY, drag.x, drag.y);
  }

  function render() {
    if (!session || !session.drag) return;
    const rect = currentRect(session.drag);
    const viewport = Utils.viewportRect();
    const visible = Utils.intersect(rect, viewport) || rect;
    const { box, badge } = session;

    box.hidden = false;
    box.style.left = Math.round(visible.left) + 'px';
    box.style.top = Math.round(visible.top) + 'px';
    box.style.width = Math.round(visible.width) + 'px';
    box.style.height = Math.round(visible.height) + 'px';

    badge.hidden = false;
    badge.textContent = Math.round(rect.width) + ' \u00d7 ' + Math.round(rect.height);
    const below = visible.bottom + 8;
    const top = below > viewport.height - 28 ? (visible.top - 28 < 4 ? visible.top + 6 : visible.top - 28) : below;
    badge.style.left = Math.round(Utils.clamp(visible.left, 4, viewport.width - 100)) + 'px';
    badge.style.top = Math.round(top) + 'px';
  }

  function setHint(mode) {
    const hint = session.hint;
    hint.replaceChildren();
    if (mode === 'next') {
      hint.append('Area blurred. Drag another one, or press ');
    } else {
      hint.append('Drag over the area you want to blur \u00b7 press ');
    }
    const key = document.createElement('kbd');
    key.textContent = 'Esc';
    hint.append(key, mode === 'next' ? ' to finish' : ' to cancel');
  }

  /* ---------------------------------- drag flow ---------------------------------- */

  function stopAutoScroll() {
    if (session && session.scrollRaf) cancelAnimationFrame(session.scrollRaf);
    if (session) session.scrollRaf = 0;
  }

  function autoScrollLoop() {
    if (!session || !session.drag) return;
    const drag = session.drag;
    if (drag.moved) {
      const viewport = Utils.viewportRect();
      const dx = edgeVelocity(drag.x, viewport.width);
      const dy = edgeVelocity(drag.y, viewport.height);
      if (dx || dy) {
        scrollDocument(dx, dy);
        render();
      }
    }
    session.scrollRaf = requestAnimationFrame(autoScrollLoop);
  }

  function resetDrag() {
    if (!session) return;
    stopAutoScroll();
    session.drag = null;
    session.box.hidden = true;
    session.badge.hidden = true;
  }

  function onPointerDown(event) {
    if (!session || session.drag || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    try {
      session.capture.setPointerCapture(event.pointerId);
    } catch (error) {
      /* pointer capture is a convenience only */
    }
    session.drag = {
      pointerId: event.pointerId,
      startX: event.clientX + window.scrollX,
      startY: event.clientY + window.scrollY,
      x: event.clientX,
      y: event.clientY,
      moved: false
    };
    render();
    session.scrollRaf = requestAnimationFrame(autoScrollLoop);
  }

  function onPointerMove(event) {
    if (!session || !session.drag || event.pointerId !== session.drag.pointerId) return;
    const viewport = Utils.viewportRect();
    const drag = session.drag;
    drag.x = Utils.clamp(event.clientX, 0, viewport.width);
    drag.y = Utils.clamp(event.clientY, 0, viewport.height);
    if (!drag.moved && Math.abs(drag.x - (drag.startX - window.scrollX)) + Math.abs(drag.y - (drag.startY - window.scrollY)) > 6) {
      drag.moved = true;
    }
    render();
  }

  function onPointerUp(event) {
    if (!session || !session.drag || event.pointerId !== session.drag.pointerId) return;
    const viewport = Utils.viewportRect();
    session.drag.x = Utils.clamp(event.clientX, 0, viewport.width);
    session.drag.y = Utils.clamp(event.clientY, 0, viewport.height);
    const rect = currentRect(session.drag);
    try {
      session.capture.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* already released */
    }
    resetDrag();

    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
      Root.toast('That selection is too small. Drag over a larger area.');
      return;
    }

    const options = session.options;
    session.capture.hidden = true; // let hit-testing reach the page while the area is analysed
    let accepted = false;
    try {
      accepted = options.onComplete(rect) !== false;
    } catch (error) {
      console.error('[Screen Blur]', error);
    }

    if (accepted && options.shouldContinue()) {
      session.capture.hidden = false;
      setHint('next');
    } else if (accepted) {
      end('completed');
    } else {
      session.capture.hidden = false;
    }
  }

  function onWheel(event) {
    event.preventDefault();
    const dx = normalizeWheel(event.deltaX, event.deltaMode);
    const dy = normalizeWheel(event.deltaY, event.deltaMode);
    scrollAt(event.clientX, event.clientY, dx, dy);
    if (session && session.drag) render();
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    end('escape');
  }

  /* ---------------------------------- public API ---------------------------------- */

  /**
   * Starts selection mode.
   * options: onComplete(rect) -> false to reject, shouldContinue() -> boolean, onEnd(reason)
   */
  function start(options) {
    if (session) return false;
    Root.ensureMounted();
    const layer = Root.layer('selection');

    const controller = new AbortController();
    const capture = Root.el('div', 'capture');
    const box = Root.el('div', 'sel');
    const badge = Root.el('div', 'badge');
    const hint = Root.el('div', 'hint');
    box.hidden = true;
    badge.hidden = true;
    hint.setAttribute('role', 'status');
    layer.append(capture, box, badge, hint);

    session = {
      options: options,
      controller: controller,
      capture: capture,
      box: box,
      badge: badge,
      hint: hint,
      drag: null,
      scrollRaf: 0
    };
    setHint('first');

    const signal = controller.signal;
    capture.addEventListener('pointerdown', onPointerDown, { signal: signal });
    capture.addEventListener('pointermove', onPointerMove, { signal: signal });
    capture.addEventListener('pointerup', onPointerUp, { signal: signal });
    capture.addEventListener('pointercancel', resetDrag, { signal: signal });
    capture.addEventListener('wheel', onWheel, { signal: signal, passive: false });
    capture.addEventListener('contextmenu', function (event) { event.preventDefault(); }, { signal: signal });
    capture.addEventListener('dragstart', function (event) { event.preventDefault(); }, { signal: signal });
    window.addEventListener('keydown', onKeyDown, { signal: signal, capture: true });
    window.addEventListener('blur', resetDrag, { signal: signal });
    window.addEventListener('scroll', render, { signal: signal, passive: true });
    window.addEventListener('resize', render, { signal: signal });
    return true;
  }

  /** Leaves selection mode and removes every piece of its UI. */
  function end(reason) {
    if (!session) return;
    const finished = session;
    stopAutoScroll();
    finished.controller.abort();
    finished.capture.remove();
    finished.box.remove();
    finished.badge.remove();
    finished.hint.remove();
    session = null;
    try {
      finished.options.onEnd(reason);
    } catch (error) {
      console.error('[Screen Blur]', error);
    }
  }

  NS.Selection = Object.freeze({
    start: start,
    cancel: function () { end('cancelled'); },
    isActive: function () { return session !== null; }
  });
})();
