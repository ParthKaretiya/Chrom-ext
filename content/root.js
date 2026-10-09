/*
 * Screen Blur - overlay root.
 * One custom element appended to <html>, with a closed Shadow DOM, holds every
 * piece of extension UI that lives inside a web page (blur overlays, the selection
 * rectangle, the remove button, toasts). The page's CSS cannot reach into it and it
 * is created lazily, so pages that never use the extension are left untouched.
 */
(function () {
  'use strict';
  const NS = globalThis.WPSB;
  if (NS.__skipLoad) return;
  const { Utils } = NS;

  const ACCENT = '#12a594';
  const STYLE = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }

    .region {
      position: fixed; left: 0; top: 0; width: 0; height: 0;
      pointer-events: none;
      border-radius: 3px;
      -webkit-backdrop-filter: blur(var(--wpsb-blur, 8px));
      backdrop-filter: blur(var(--wpsb-blur, 8px));
      will-change: transform;
    }

    .remove {
      position: fixed; left: 0; top: 0; width: 22px; height: 22px;
      margin: 0; padding: 0; display: grid; place-items: center;
      border: 1.5px solid rgba(255, 255, 255, 0.92); border-radius: 50%;
      background: #17202a; color: #fff; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      opacity: 0; transform: scale(0.85); pointer-events: none;
      transition: opacity 0.12s ease, transform 0.12s ease, background-color 0.12s ease;
    }
    .remove.show { opacity: 1; transform: scale(1); pointer-events: auto; }
    .remove:hover { background: #c0352b; }
    .remove:focus-visible { outline: 2px solid #5aa9ff; outline-offset: 2px; }
    .remove svg { width: 10px; height: 10px; display: block; }

    .hl {
      position: fixed; left: 0; top: 0; width: 0; height: 0;
      border: 2px solid ${ACCENT}; border-radius: 4px;
      background: rgba(18, 165, 148, 0.14);
      pointer-events: none; opacity: 0;
      animation: wpsb-pulse 1.5s ease-out 1 forwards;
    }
    @keyframes wpsb-pulse {
      0% { opacity: 0; } 12% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; }
    }

    .capture {
      position: fixed; inset: 0; cursor: crosshair; pointer-events: auto;
      touch-action: none; user-select: none; -webkit-user-select: none;
      background: rgba(12, 22, 38, 0.07);
    }
    .sel {
      position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none;
      border: 2px solid ${ACCENT}; border-radius: 3px;
      background: rgba(18, 165, 148, 0.16);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.85), inset 0 0 0 1px rgba(255, 255, 255, 0.55);
    }
    .badge {
      position: fixed; left: 0; top: 0; pointer-events: none;
      padding: 1px 8px; border-radius: 999px;
      background: #0b5f56; color: #fff;
      font: 600 11px/18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .hint, .toast {
      position: fixed; left: 50%; transform: translateX(-50%); pointer-events: none;
      max-width: calc(100vw - 32px);
      padding: 9px 16px; border-radius: 999px;
      background: rgba(15, 23, 32, 0.94); color: #f4f8fb;
      font: 500 13px/18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .hint { top: 14px; }
    .toast { bottom: 28px; background: rgba(160, 36, 28, 0.96); }
    .hint kbd {
      display: inline-block; margin: 0 2px; padding: 0 6px; border-radius: 5px;
      background: rgba(255, 255, 255, 0.16); font: inherit; font-weight: 600;
    }

    @media print { :host { display: none !important; } }
  `;

  let host = null;
  let shadow = null;
  let layers = null;
  let guard = null;
  let blurPx = 8;
  let toastTimer = 0;

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function applyHostStyles(node) {
    const s = node.style;
    s.setProperty('all', 'initial', 'important');
    s.setProperty('display', 'block', 'important');
    s.setProperty('position', 'fixed', 'important');
    s.setProperty('top', '0', 'important');
    s.setProperty('left', '0', 'important');
    s.setProperty('width', '0', 'important');
    s.setProperty('height', '0', 'important');
    s.setProperty('overflow', 'visible', 'important');
    s.setProperty('pointer-events', 'none', 'important');
    s.setProperty('z-index', '2147483647', 'important');
    s.setProperty('--wpsb-blur', blurPx + 'px');
  }

  function build() {
    host = document.createElement(Utils.OWN_TAG);
    applyHostStyles(host);
    shadow = host.attachShadow({ mode: 'closed' });

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(STYLE);
      shadow.adoptedStyleSheets = [sheet];
    } catch (error) {
      const style = document.createElement('style');
      style.textContent = STYLE;
      shadow.appendChild(style);
    }

    layers = {
      regions: el('div'),
      ui: el('div'),
      selection: el('div')
    };
    shadow.append(layers.regions, layers.ui, layers.selection);
  }

  /** Creates the host on first use and re-attaches it if a page script removes it. */
  function ensureMounted() {
    if (!host) build();
    if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host);

    if (!guard && document.documentElement) {
      guard = new MutationObserver(function () {
        if (host && !host.isConnected && document.documentElement) document.documentElement.appendChild(host);
      });
      guard.observe(document.documentElement, { childList: true });
    }
    return host;
  }

  function layer(name) {
    ensureMounted();
    return layers[name];
  }

  function setBlur(px) {
    blurPx = px;
    if (host) host.style.setProperty('--wpsb-blur', px + 'px');
  }

  function createRegionElement() {
    const node = el('div', 'region');
    node.hidden = true;
    layer('regions').appendChild(node);
    return node;
  }

  function createRemoveButton() {
    const button = el('button', 'remove');
    button.type = 'button';
    button.setAttribute('aria-label', 'Remove this blurred area');
    button.title = 'Remove this blurred area';
    button.innerHTML =
      '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
    layer('ui').appendChild(button);
    return button;
  }

  function toast(message) {
    const container = layer('ui');
    const previous = container.querySelector('.toast');
    if (previous) previous.remove();
    clearTimeout(toastTimer);
    const node = el('div', 'toast');
    node.setAttribute('role', 'status');
    node.textContent = message;
    container.appendChild(node);
    toastTimer = setTimeout(function () {
      node.remove();
    }, 2600);
  }

  function destroy() {
    clearTimeout(toastTimer);
    if (guard) {
      guard.disconnect();
      guard = null;
    }
    if (host) {
      host.remove();
      host = null;
      shadow = null;
      layers = null;
    }
  }

  NS.Root = Object.freeze({
    el: el,
    ensureMounted: ensureMounted,
    layer: layer,
    setBlur: setBlur,
    createRegionElement: createRegionElement,
    createRemoveButton: createRemoveButton,
    toast: toast,
    destroy: destroy
  });
})();
