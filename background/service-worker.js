/*
 * WP Screen Blur - service worker.
 * Responsibilities: first-run defaults, the Alt+Shift+B shortcut, the per-tab badge
 * with the number of blurred areas, and pruning old per-page data. All blur logic
 * lives in the content scripts.
 */
importScripts('../shared/constants.js');

const Shared = self.WPSB.Shared;
const MSG = Shared.MSG;

async function pruneStoredPages() {
  try {
    const all = await chrome.storage.local.get(null);
    const pages = Object.keys(all)
      .filter(function (key) { return key.startsWith(Shared.STORAGE_PAGE_PREFIX); })
      .map(function (key) { return { key: key, updated: (all[key] && all[key].updated) || 0 }; })
      .sort(function (a, b) { return b.updated - a.updated; });
    const stale = pages.slice(Shared.MAX_STORED_PAGES).map(function (p) { return p.key; });
    if (stale.length) await chrome.storage.local.remove(stale);
  } catch (error) {
    console.warn('[WP Screen Blur] Could not prune stored pages:', error);
  }
}

chrome.runtime.onInstalled.addListener(async function () {
  try {
    const key = Shared.STORAGE_SETTINGS_KEY;
    const stored = await chrome.storage.local.get(key);
    await chrome.storage.local.set({ [key]: Shared.normalizeSettings(stored[key]) });
  } catch (error) {
    console.warn('[WP Screen Blur] Could not write default settings:', error);
  }
  pruneStoredPages();
});

chrome.runtime.onStartup.addListener(pruneStoredPages);

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.PING });
    return;
  } catch (error) {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: Shared.CONTENT_SCRIPT_FILES.slice() });
  }
  await chrome.tabs.sendMessage(tabId, { type: MSG.PING });
}

function flashBadge(tabId, text) {
  chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#b4322a' }).catch(function () {});
  chrome.action.setBadgeText({ tabId: tabId, text: text }).catch(function () {});
  setTimeout(function () {
    chrome.action.setBadgeText({ tabId: tabId, text: '' }).catch(function () {});
  }, 2500);
}

chrome.commands.onCommand.addListener(async function (command, tab) {
  if (command !== 'start-selection') return;
  let target = tab;
  if (!target || target.id == null) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    target = tabs[0];
  }
  if (!target || target.id == null) return;
  if (Shared.isRestrictedUrl(target.url)) {
    flashBadge(target.id, '!');
    return;
  }
  try {
    await ensureContentScript(target.id);
    await chrome.tabs.sendMessage(target.id, { type: MSG.START_SELECTION });
  } catch (error) {
    flashBadge(target.id, '!');
  }
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (sender.id !== chrome.runtime.id || !message || message.type !== MSG.BADGE) return false;
  if (!sender.tab || sender.tab.id == null) return false;
  const count = Number.isInteger(message.count) && message.count > 0 ? Math.min(message.count, 999) : 0;
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#0f766e' }).catch(function () {});
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: count ? String(count) : '' }).catch(function () {});
  sendResponse({ ok: true });
  return false;
});
