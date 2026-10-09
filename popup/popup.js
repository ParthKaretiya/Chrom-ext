/*
 * WP Screen Blur - popup controller.
 * Talks to the content script of the active tab (injecting it first if the tab was
 * opened before the extension was installed) and stores global settings.
 */
(function () {
  'use strict';
  const Shared = globalThis.WPSB.Shared;
  const MSG = Shared.MSG;
  const SETTINGS_KEY = Shared.STORAGE_SETTINGS_KEY;

  const $ = function (id) { return document.getElementById(id); };
  const els = {
    site: $('siteLabel'),
    theme: $('themeBtn'),
    themeIcon: $('themeIcon'),
    notice: $('notice'),
    select: $('selectBtn'),
    clear: $('clearBtn'),
    toggle: $('toggleBtn'),
    toggleLabel: $('toggleLabel'),
    intensity: $('intensity'),
    intensityOut: $('intensityOut'),
    keep: $('keepSelecting'),
    remember: $('remember'),
    count: $('areaCount'),
    list: $('areaList'),
    empty: $('areaEmpty')
  };

  const THEME_ICONS = {
    auto: 'M10 3a7 7 0 1 0 0 14V3z M10 3a7 7 0 0 1 0 14',
    light: 'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4',
    dark: 'M16 11.5A6.5 6.5 0 0 1 8.5 4 6.5 6.5 0 1 0 16 11.5z'
  };
  const THEME_NAMES = { auto: 'match system', light: 'light', dark: 'dark' };

  let settings = Shared.normalizeSettings(null);
  let tab = null;
  let connected = false;
  let saveTimer = 0;

  /* -------------------------------- settings -------------------------------- */

  async function loadSettings() {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    settings = Shared.normalizeSettings(stored[SETTINGS_KEY]);
  }

  async function saveSettings(patch) {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    settings = Shared.normalizeSettings(Object.assign({}, Shared.normalizeSettings(stored[SETTINGS_KEY]), patch));
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }

  function renderSettings() {
    document.documentElement.dataset.theme = settings.theme;
    els.themeIcon.setAttribute('d', THEME_ICONS[settings.theme]);
    const label = 'Theme: ' + THEME_NAMES[settings.theme];
    els.theme.setAttribute('aria-label', label);
    els.theme.title = label + ' (click to change)';

    els.intensity.value = String(settings.intensity);
    renderIntensity(settings.intensity);
    els.keep.checked = settings.keepSelecting;
    els.remember.checked = settings.remember;

    els.toggleLabel.textContent = settings.enabled ? 'Disable Blur' : 'Enable Blur';
    els.toggle.setAttribute('aria-pressed', String(settings.enabled));
  }

  function renderIntensity(value) {
    els.intensityOut.textContent = value + ' px';
    document.documentElement.style.setProperty('--blur', value + 'px');
  }

  /* ---------------------------------- tab ---------------------------------- */

  async function sendToTab(type, extra) {
    return chrome.tabs.sendMessage(tab.id, Object.assign({ type: type }, extra || {}));
  }

  async function connect() {
    if (!tab || tab.id == null) return 'unreachable';
    if (Shared.isRestrictedUrl(tab.url)) return 'restricted';
    try {
      await sendToTab(MSG.PING);
      return 'ready';
    } catch (error) {
      /* not injected yet (tab opened before install, or still loading) */
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: Shared.CONTENT_SCRIPT_FILES.slice() });
      await sendToTab(MSG.PING);
      return 'ready';
    } catch (error) {
      return 'unreachable';
    }
  }

  function showNotice(text) {
    els.notice.hidden = !text;
    els.notice.textContent = text || '';
  }

  function describeSite() {
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.host;
      if (url.protocol === 'file:') return 'Local file';
    } catch (error) {
      /* url unavailable */
    }
    return 'This page';
  }

  /* -------------------------------- areas list -------------------------------- */

  const STATUS_TEXT = {
    visible: '',
    offscreen: 'Off screen. Click to show',
    waiting: 'Waiting for the content to appear'
  };

  function renderAreas(regions) {
    els.list.replaceChildren();
    els.count.textContent = String(regions.length);
    els.empty.hidden = regions.length > 0;

    regions.forEach(function (region) {
      const item = document.createElement('li');

      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'area-info';
      info.title = 'Show where this area is on the page';
      const name = document.createElement('strong');
      name.textContent = region.label;
      const meta = document.createElement('span');
      const kind = region.mode === 'elements' ? 'Element blur' : 'Overlay';
      const status = STATUS_TEXT[region.status] || '';
      meta.textContent = region.width + ' \u00d7 ' + region.height + ' px \u00b7 ' + kind + (status ? ' \u00b7 ' + status : '');
      info.append(name, meta);
      info.addEventListener('click', function () {
        sendToTab(MSG.HIGHLIGHT_REGION, { id: region.id, reveal: true }).catch(function () {});
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn';
      remove.setAttribute('aria-label', 'Remove ' + region.label);
      remove.title = 'Remove ' + region.label;
      remove.innerHTML =
        '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
      remove.addEventListener('click', async function () {
        try {
          renderAreas((await sendToTab(MSG.REMOVE_REGION, { id: region.id })).regions);
        } catch (error) {
          showNotice('Could not remove that area. Reload the page and try again.');
        }
      });

      item.addEventListener('mouseenter', function () {
        sendToTab(MSG.HIGHLIGHT_REGION, { id: region.id, reveal: false }).catch(function () {});
      });
      item.append(info, remove);
      els.list.appendChild(item);
    });
  }

  async function refreshAreas() {
    if (!connected) {
      renderAreas([]);
      return;
    }
    try {
      const state = await sendToTab(MSG.GET_STATE);
      renderAreas(state && state.regions ? state.regions : []);
    } catch (error) {
      renderAreas([]);
    }
  }

  /* --------------------------------- actions --------------------------------- */

  async function onSelect() {
    try {
      await sendToTab(MSG.START_SELECTION);
      window.close();
    } catch (error) {
      showNotice('Could not start selection on this page. Reload the tab and try again.');
    }
  }

  async function onClear() {
    try {
      const state = await sendToTab(MSG.CLEAR_ALL);
      renderAreas(state.regions);
    } catch (error) {
      showNotice('Could not clear blurs on this page. Reload the tab and try again.');
    }
  }

  function bind() {
    els.select.addEventListener('click', onSelect);
    els.clear.addEventListener('click', onClear);

    els.toggle.addEventListener('click', async function () {
      await saveSettings({ enabled: !settings.enabled });
      renderSettings();
      setTimeout(refreshAreas, 120);
    });

    els.intensity.addEventListener('input', function () {
      const value = Shared.clampIntensity(els.intensity.value);
      renderIntensity(value);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { saveSettings({ intensity: value }); }, 40);
    });

    els.keep.addEventListener('change', function () { saveSettings({ keepSelecting: els.keep.checked }); });
    els.remember.addEventListener('change', function () { saveSettings({ remember: els.remember.checked }); });

    els.theme.addEventListener('click', async function () {
      const order = Shared.THEMES;
      const next = order[(order.indexOf(settings.theme) + 1) % order.length];
      await saveSettings({ theme: next });
      renderSettings();
    });
  }

  async function init() {
    bind();
    await loadSettings();
    renderSettings();

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0] || null;
    els.site.textContent = describeSite();

    const status = await connect();
    connected = status === 'ready';
    els.select.disabled = !connected;
    els.clear.disabled = !connected;

    if (status === 'restricted') {
      showNotice("Chrome doesn't allow extensions on this page. Open a regular website to blur content.");
    } else if (status === 'unreachable') {
      const local = tab && typeof tab.url === 'string' && tab.url.indexOf('file:') === 0;
      showNotice(
        local
          ? 'To use blur on local files, turn on "Allow access to file URLs" for this extension in chrome://extensions.'
          : "Can't reach this page. Reload the tab and try again. Some protected pages never allow extensions."
      );
    }
    await refreshAreas();
  }

  init().catch(function (error) {
    console.error('[WP Screen Blur]', error);
    showNotice('Something went wrong while opening the popup. Close it and try again.');
  });
})();
