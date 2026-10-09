/*
 * Screen Blur - persistence.
 * Settings are global; blurred regions are stored per page (origin + path) in
 * chrome.storage.local, on this device only. Everything read back from storage
 * is validated, so corrupted or hand-edited data can never break a page.
 */
(function () {
  'use strict';
  const NS = globalThis.WPSB;
  if (NS.__skipLoad) return;
  const { Shared, Utils } = NS;

  const MAX_SELECTOR_LENGTH = 3000;
  const MAX_FINGERPRINT_LENGTH = 80;
  const MAX_TARGETS = 25;

  function finite(value, fallback, limit) {
    const max = limit === undefined ? 1e7 : limit;
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max ? value : fallback;
  }

  function text(value, max) {
    return typeof value === 'string' && value.length <= max ? value : '';
  }

  /** Returns a clean region record, or null when the stored value is unusable. */
  function sanitizeRegion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = text(raw.id, 40) || Utils.uid();
    const created = finite(raw.created, Date.now(), 1e15);

    if (raw.mode === 'overlay') {
      const anchor = raw.anchor;
      const size = raw.size;
      if (!anchor || typeof anchor !== 'object' || !size || typeof size !== 'object') return null;
      const type = anchor.type === 'document' || anchor.type === 'element' ? anchor.type : null;
      if (!type) return null;
      const w = finite(size.w, 0);
      const h = finite(size.h, 0);
      if (w < 1 || h < 1) return null;
      const selector = text(anchor.selector, MAX_SELECTOR_LENGTH);
      if (type === 'element' && !selector) return null;
      return {
        id: id,
        mode: 'overlay',
        created: created,
        size: { w: w, h: h },
        anchor: {
          type: type,
          selector: selector,
          fp: text(anchor.fp, MAX_FINGERPRINT_LENGTH),
          ox: finite(anchor.ox, 0),
          oy: finite(anchor.oy, 0)
        }
      };
    }

    if (raw.mode === 'elements') {
      if (!Array.isArray(raw.targets) || raw.targets.length === 0 || raw.targets.length > MAX_TARGETS) return null;
      const targets = [];
      for (let i = 0; i < raw.targets.length; i++) {
        const entry = raw.targets[i];
        const selector = text(entry && entry.selector, MAX_SELECTOR_LENGTH);
        if (!selector) return null;
        targets.push({ selector: selector, fp: text(entry.fp, MAX_FINGERPRINT_LENGTH) });
      }
      return { id: id, mode: 'elements', created: created, targets: targets };
    }

    return null;
  }

  /** Pages are keyed by origin + path (no query string or hash). */
  function pageKey(loc) {
    const l = loc || location;
    return l.protocol + '//' + l.host + l.pathname;
  }

  function storageKey(key) {
    return Shared.STORAGE_PAGE_PREFIX + key;
  }

  async function loadSettings() {
    if (!Utils.isContextValid()) return Shared.normalizeSettings(null);
    try {
      const stored = await chrome.storage.local.get(Shared.STORAGE_SETTINGS_KEY);
      return Shared.normalizeSettings(stored[Shared.STORAGE_SETTINGS_KEY]);
    } catch (error) {
      return Shared.normalizeSettings(null);
    }
  }

  async function patchSettings(patch) {
    const current = await loadSettings();
    const next = Shared.normalizeSettings(Object.assign({}, current, patch));
    if (Utils.isContextValid()) {
      try {
        await chrome.storage.local.set({ [Shared.STORAGE_SETTINGS_KEY]: next });
      } catch (error) {
        console.warn('[Screen Blur] Could not save settings:', error);
      }
    }
    return next;
  }

  async function loadRegions(key) {
    if (!Utils.isContextValid()) return [];
    try {
      const name = storageKey(key);
      const stored = await chrome.storage.local.get(name);
      const entry = stored[name];
      if (!entry || !Array.isArray(entry.regions)) return [];
      const regions = [];
      for (let i = 0; i < entry.regions.length && regions.length < Shared.MAX_REGIONS_PER_PAGE; i++) {
        const clean = sanitizeRegion(entry.regions[i]);
        if (clean) regions.push(clean);
      }
      return regions;
    } catch (error) {
      return [];
    }
  }

  /** Saves the regions for a page; an empty list removes the page entry. */
  async function saveRegions(key, regions) {
    if (!Utils.isContextValid()) return;
    const name = storageKey(key);
    try {
      if (regions.length === 0) {
        await chrome.storage.local.remove(name);
      } else {
        await chrome.storage.local.set({ [name]: { updated: Date.now(), regions: regions } });
      }
    } catch (error) {
      console.warn('[Screen Blur] Could not save blurred areas:', error);
    }
  }

  async function removeRegions(key) {
    if (!Utils.isContextValid()) return;
    try {
      await chrome.storage.local.remove(storageKey(key));
    } catch (error) {
      console.warn('[Screen Blur] Could not clear saved areas:', error);
    }
  }

  NS.Store = Object.freeze({
    pageKey: pageKey,
    sanitizeRegion: sanitizeRegion,
    loadSettings: loadSettings,
    patchSettings: patchSettings,
    loadRegions: loadRegions,
    saveRegions: saveRegions,
    removeRegions: removeRegions
  });
})();
