/*
 * WP Screen Blur - shared constants.
 * Loaded by the content scripts, the popup and the service worker, so it only
 * depends on `globalThis` and exposes everything under `WPSB.Shared`.
 */
(function (root) {
  'use strict';

  // If a live instance of the content script already exists in this page (for
  // example the popup injected the files a second time), flag it so that the
  // remaining files of this injection do nothing.
  const previous = root.WPSB;
  if (previous && previous.Main && typeof previous.Main.isAlive === 'function' && previous.Main.isAlive()) {
    previous.__skipLoad = true;
    return;
  }

  const NS = (root.WPSB = {});

  const BLUR_MIN = 2;
  const BLUR_MAX = 20;
  const BLUR_DEFAULT = 8;
  const THEMES = ['auto', 'light', 'dark'];

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    intensity: BLUR_DEFAULT,
    keepSelecting: false,
    remember: true,
    theme: 'auto'
  });

  function clampIntensity(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return BLUR_DEFAULT;
    return Math.min(BLUR_MAX, Math.max(BLUR_MIN, n));
  }

  function normalizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_SETTINGS.enabled,
      intensity: clampIntensity(src.intensity == null ? BLUR_DEFAULT : src.intensity),
      keepSelecting: typeof src.keepSelecting === 'boolean' ? src.keepSelecting : DEFAULT_SETTINGS.keepSelecting,
      remember: typeof src.remember === 'boolean' ? src.remember : DEFAULT_SETTINGS.remember,
      theme: THEMES.indexOf(src.theme) !== -1 ? src.theme : DEFAULT_SETTINGS.theme
    };
  }

  // Pages where Chrome never runs extension content scripts.
  const RESTRICTED_URL_PATTERNS = [
    /^chrome:/i,
    /^chrome-untrusted:/i,
    /^chrome-search:/i,
    /^chrome-extension:/i,
    /^devtools:/i,
    /^edge:/i,
    /^brave:/i,
    /^about:/i,
    /^view-source:/i,
    /^data:/i,
    /^blob:/i,
    /^https:\/\/chromewebstore\.google\.com(\/|$)/i,
    /^https:\/\/chrome\.google\.com\/webstore(\/|$)/i
  ];

  function isRestrictedUrl(url) {
    if (typeof url !== 'string' || url === '') return false;
    return RESTRICTED_URL_PATTERNS.some(function (pattern) {
      return pattern.test(url);
    });
  }

  NS.Shared = Object.freeze({
    BLUR_MIN: BLUR_MIN,
    BLUR_MAX: BLUR_MAX,
    BLUR_DEFAULT: BLUR_DEFAULT,
    THEMES: THEMES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    STORAGE_SETTINGS_KEY: 'wpsb_settings',
    STORAGE_PAGE_PREFIX: 'wpsb_page:',
    MAX_REGIONS_PER_PAGE: 60,
    MAX_STORED_PAGES: 200,
    MSG: Object.freeze({
      PING: 'WPSB_PING',
      GET_STATE: 'WPSB_GET_STATE',
      START_SELECTION: 'WPSB_START_SELECTION',
      CANCEL_SELECTION: 'WPSB_CANCEL_SELECTION',
      CLEAR_ALL: 'WPSB_CLEAR_ALL',
      REMOVE_REGION: 'WPSB_REMOVE_REGION',
      HIGHLIGHT_REGION: 'WPSB_HIGHLIGHT_REGION',
      BADGE: 'WPSB_BADGE'
    }),
    // Must stay in the same order as manifest.json -> content_scripts[0].js.
    CONTENT_SCRIPT_FILES: Object.freeze([
      'shared/constants.js',
      'content/utils.js',
      'content/store.js',
      'content/locator.js',
      'content/root.js',
      'content/regions.js',
      'content/selection.js',
      'content/main.js'
    ]),
    clampIntensity: clampIntensity,
    normalizeSettings: normalizeSettings,
    isRestrictedUrl: isRestrictedUrl
  });
})(globalThis);
