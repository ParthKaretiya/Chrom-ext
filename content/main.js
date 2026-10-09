/*
 * WP Screen Blur - content script entry point.
 * Wires the popup/service-worker messages to the region manager and selection mode,
 * keeps settings in sync across tabs, follows single-page-app navigation and shuts
 * itself down cleanly when the extension is reloaded or updated.
 */
(function () {
  'use strict';
  const NS = globalThis.WPSB;
  if (NS.__skipLoad) return;
  const { Shared, Utils, Store, Root, Regions, Selection } = NS;
  const MSG = Shared.MSG;

  const lifecycle = new AbortController();
  let alive = true;
  let settings = Shared.normalizeSettings(null);
  let currentKey = '';
  let urlTimer = 0;
  let badgeCount = -1;

  /* ------------------------------ extension plumbing ------------------------------ */

  function isAlive() {
    return alive && Utils.isContextValid();
  }

  function reportBadge(count) {
    if (count === badgeCount || !Utils.isContextValid()) return;
    badgeCount = count;
    try {
      chrome.runtime.sendMessage({ type: MSG.BADGE, count: count }).catch(function () {});
    } catch (error) {
      /* the service worker is not reachable; the badge is cosmetic */
    }
  }

  function applySettings(next) {
    settings = next;
    Regions.applySettings(next);
  }

  /* --------------------------------- selection --------------------------------- */

  function handleSelection(rect) {
    let result;
    try {
      result = Regions.createFromRect(rect);
    } catch (error) {
      console.error('[WP Screen Blur]', error);
      Root.toast('Could not blur that area. Try a slightly different selection.');
      return false;
    }
    if (!result.ok) {
      Root.toast(result.reason);
      return false;
    }
    return true;
  }

  async function startSelection() {
    if (!settings.enabled) {
      applySettings(await Store.patchSettings({ enabled: true }));
    }
    Selection.start({
      onComplete: handleSelection,
      shouldContinue: function () { return settings.keepSelecting; },
      onEnd: function () {}
    });
  }

  /* ------------------------------- page / SPA handling ------------------------------- */

  async function loadPage() {
    const key = Store.pageKey();
    currentKey = key;
    const saved = settings.remember ? await Store.loadRegions(key) : [];
    if (!alive || key !== currentKey) return; // navigated again while loading
    Regions.loadPage(key, saved);
  }

  async function checkUrl() {
    const key = Store.pageKey();
    if (key === currentKey) return;
    Selection.cancel();
    Regions.unloadPage();
    await loadPage();
  }

  function tick() {
    if (!isAlive()) {
      teardown();
      return;
    }
    checkUrl();
  }

  /* ---------------------------------- messages ---------------------------------- */

  function describeState() {
    return {
      ok: true,
      selecting: Selection.isActive(),
      enabled: settings.enabled,
      regions: Regions.list()
    };
  }

  async function handleMessage(message) {
    switch (message.type) {
      case MSG.PING:
        return { ok: true };
      case MSG.GET_STATE:
        return describeState();
      case MSG.START_SELECTION:
        await startSelection();
        return { ok: true };
      case MSG.CANCEL_SELECTION:
        Selection.cancel();
        return { ok: true };
      case MSG.CLEAR_ALL:
        Regions.clearAll();
        return describeState();
      case MSG.REMOVE_REGION:
        Regions.removeRegion(String(message.id));
        return describeState();
      case MSG.HIGHLIGHT_REGION:
        return { ok: true, shown: Regions.highlight(String(message.id), Boolean(message.reveal)) };
      default:
        return { ok: false, error: 'Unknown message' };
    }
  }

  let ready = Promise.resolve();

  function onMessage(message, sender, sendResponse) {
    if (!isAlive() || sender.id !== chrome.runtime.id) return false;
    if (!message || typeof message.type !== 'string') return false;
    ready
      .then(function () { return handleMessage(message); })
      .then(sendResponse, function (error) {
        sendResponse({ ok: false, error: String((error && error.message) || error) });
      });
    return true; // the response is sent asynchronously
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local' || !changes[Shared.STORAGE_SETTINGS_KEY]) return;
    applySettings(Shared.normalizeSettings(changes[Shared.STORAGE_SETTINGS_KEY].newValue));
  }

  /* ---------------------------------- lifecycle ---------------------------------- */

  function teardown() {
    if (!alive) return;
    alive = false;
    clearInterval(urlTimer);
    lifecycle.abort();
    try { Selection.cancel(); } catch (error) { /* already gone */ }
    try { Regions.destroy(); } catch (error) { /* already gone */ }
    try { Root.destroy(); } catch (error) { /* already gone */ }
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch (error) {
      /* extension context was invalidated: the listeners died with it */
    }
  }

  async function init() {
    settings = await Store.loadSettings();
    if (!alive) return;
    Regions.init({ settings: settings, isSelecting: Selection.isActive, onChange: reportBadge });
    await loadPage();
  }

  NS.Main = Object.freeze({ isAlive: isAlive, teardown: teardown });

  // Listen straight away so the popup can talk to us even while settings are still loading.
  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorageChanged);

  const signal = lifecycle.signal;
  const flush = function () { Regions.flush(); };
  window.addEventListener('pagehide', flush, { signal: signal });
  document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); }, { signal: signal });
  window.addEventListener('popstate', checkUrl, { signal: signal });
  window.addEventListener('hashchange', checkUrl, { signal: signal });
  if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigatesuccess', checkUrl, { signal: signal });
  }
  urlTimer = setInterval(tick, 1000);

  ready = init().catch(function (error) {
    console.error('[WP Screen Blur] Failed to start:', error);
  });
})();
