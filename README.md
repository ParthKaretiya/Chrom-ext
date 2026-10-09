<div align="center">

# 🔒 WP Screen Blur

**A high-performance, universal Chrome extension to blur sensitive information on *any* webpage in real time before sharing your screen or taking screenshots.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Brave%20%7C%20Edge%20%7C%20Chromium-blue.svg?style=flat-square)](https://www.google.com/chrome/)
[![Scope](https://img.shields.io/badge/Scope-All%20Websites%20(%3Call__urls%3E)-purple.svg?style=flat-square)](#-key-features)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Client--Side-success.svg?style=flat-square)](#-privacy--security)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg?style=flat-square)](LICENSE)

<br/>

[Key Features](#-key-features) •
[Installation](#-installation-guide) •
[How to Use](#-how-to-use) •
[How It Works](#-how-it-works-under-the-hood) •
[Architecture](#-project-structure) •
[Permissions](#-permissions) •
[Limitations](#-limitations--disclosure)

</div>

---

## 📖 Overview

**WP Screen Blur** is an advanced, lightweight Chrome extension built on **Manifest V3** that allows you to drag-and-select any area or element on **any website** and blur it instantly.

Whether you are:
- Sharing your screen on Zoom, Google Meet, Microsoft Teams, or Discord,
- Recording video demos, presentations, or courses,
- Working in public spaces (cafes, co-working spaces, flights), or
- Taking screenshots of dashboards, chats, invoices, or customer data,

**WP Screen Blur** keeps sensitive information (names, emails, credit cards, profile pictures, API tokens, phone numbers, and balances) private and hidden from view.

Unlike basic extensions that only work on one site or break when pages scroll, WP Screen Blur works across **all websites** (WhatsApp Web, Gmail, LinkedIn, Slack, Twitter/X, Stripe, AWS Console, CRM portals, etc.) and uses an intelligent dual-blur engine that anchors blurs to internal scroll containers.

---

## ✨ Key Features

- 🌐 **Universal Web Support**: Works seamlessly on any website across the internet, not restricted to any single platform.
- 🎯 **Intuitive Drag-to-Select Blur**: Simply click and drag a rectangular bounding box over whatever you want to conceal. Supports auto-scrolling when dragging near page boundaries.
- ⚙️ **Dual-Engine Blur Technology**:
  - **Element Blur (`filter: blur(...)`)**: Automatically detected when selection tightly wraps page elements (avatars, names, badges). Locks into page layout naturally.
  - **Adaptive Overlay Blur (`backdrop-filter`)**: Anchored to the closest container element, computing real-time clip chains so blurs cleanly scroll inside nested panes (chat feeds, sidebars, tables).
- 🎛️ **Live Intensity Slider (2px – 20px)**: Adjust blur intensity with immediate real-time preview and instant multi-tab sync.
- 💾 **Per-Page Memory & SPA Support**: Remembers your blurred areas per URL path (`chrome.storage.local`). Intelligently tracks Single-Page Application (SPA) navigation (`pushState`, `popstate`, Navigation API) and DOM mutations.
- 🔄 **Continuous Selection Mode**: Enable "Stay in selection mode" to draw multiple blur zones in succession without re-opening the popup.
- ⌨️ **Global Keyboard Shortcut**: Trigger selection immediately using <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> (Mac: <kbd>Option</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>), or tap <kbd>Esc</kbd> to cancel.
- 🎨 **Modern Popup with Dark/Light Mode**: Sleek UI with theme toggle (Auto / Light / Dark), active blur counter badge on toolbar icon, and list of active blur regions with scroll-to-highlight functionality.
- ❌ **Per-Region Quick Removal**: Hover over any blurred zone to reveal a discrete delete button, or manage them directly from the popup list.
- 🛡️ **Zero Tracking & Isolated Shadow DOM**: 100% offline and client-side. Uses closed Shadow DOM roots so the extension UI never clashes with host website styles.

---

## 🚀 Installation Guide

Install in Google Chrome, Microsoft Edge, Brave, or any Chromium-based browser in less than a minute:

1. **Clone or Download this Repository**:
   ```bash
   git clone https://github.com/ParthKaretiya/Chrom-ext.git
   ```
   *(Or download and extract the ZIP file from GitHub).*

2. **Open Extensions Management**:
   - In Chrome, navigate to `chrome://extensions/`
   - In Edge, navigate to `edge://extensions/`
   - In Brave, navigate to `brave://extensions/`

3. **Enable Developer Mode**:
   - Toggle the **Developer mode** switch in the top-right corner.

4. **Load the Extension**:
   - Click **Load unpacked** in the top-left corner.
   - Select the repository root folder (the folder containing `manifest.json`).

5. **Pin to Toolbar**:
   - Click the extensions puzzle icon in your browser toolbar and pin **WP Screen Blur** for quick access.

---

## 🛠️ How to Use

### 1. Blurring an Area
- Click the extension icon in the toolbar and select **"Select Area to Blur"**, or press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>.
- Click and drag a rectangle over the content you wish to obscure.
- Release your mouse button to apply the blur.
- Press <kbd>Esc</kbd> at any time to cancel selection.

### 2. Managing Blurred Regions
| Action | How to do it |
| :--- | :--- |
| **Remove a single region** | Hover over the blurred area on the page and click the floating **×** button, or click the trash icon next to it in the popup list. |
| **Locate a blurred region** | Click any item in the popup list — the page will smoothly scroll to it and highlight it with a pulse effect. |
| **Adjust blur strength** | Drag the **Blur strength** slider (2px to 20px) in the popup. Changes apply live to all open tabs. |
| **Temporarily pause blur** | Click **Disable Blur** in the popup to reveal content temporarily; click **Enable Blur** to restore all areas. |
| **Clear everything on page** | Click **Clear All Blurs** in the popup to remove all active overlays on the current page. |
| **Continuous drawing** | Toggle on **"Stay in selection mode"** to draw multiple blur zones in a row without reopening the popup. |

---

## 🧠 How It Works Under the Hood

### Dual-Blur Engine Architecture
WP Screen Blur dynamically selects the best rendering mechanism depending on what you select:

```
                          User Selection Box
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       [Tightly wraps elements]       [Partial text / arbitrary area]
                  │                               │
         Element Blur Engine            Overlay Blur Engine
         (CSS `filter: blur()`)        (CSS `backdrop-filter: blur()`)
                  │                               │
       Locked into page DOM layout       Anchored to closest container
       Follows reflow & scroll          Clips across parent scroll chains
```

1. **Element Blur**: When selection wraps entire HTML nodes (like an avatar image, a button, or a header tag), CSS `filter: blur(...)` is applied directly. The browser's native rendering pipeline keeps it perfectly in position.
2. **Overlay Blur**: When selection crosses partial lines of text, canvas, video, or arbitrary page boundaries, an overlay element is positioned using CSS `backdrop-filter`. The overlay is mathematically anchored to the nearest ancestor element and dynamically clipped to all scrollable parent containers (`clip-path`), ensuring it never overflows or bleeds outside its container while scrolling.

### Closed Shadow DOM Isolation
All extension UI elements (selection guides, hover remove buttons, toast notifications) are rendered inside an isolated **closed Shadow DOM root**. This guarantees that:
- Host page styles (CSS resets, conflicting `z-index`, layout rules) cannot corrupt extension controls.
- The extension's styles cannot inadvertently leak or alter the webpage's appearance.

---

## 📂 Project Structure

```plaintext
Chrom-ext/
├── manifest.json                  # Manifest V3 extension configuration & permissions
├── background/
│   └── service-worker.js          # Background service worker (badge counts, shortcut handling, cache pruning)
├── content/
│   ├── locator.js                 # Anchor detection, selectors, DOM fingerprints, clip-chain calculations
│   ├── main.js                    # Content script coordinator, lifecycle, SPA navigation listeners
│   ├── regions.js                 # Dual-engine blur rendering, position updates, mutation observers
│   ├── root.js                    # Closed Shadow DOM host, toast notifications, remove buttons
│   ├── selection.js               # Crosshair canvas overlay, drag-to-select geometry & auto-scroll
│   ├── store.js                   # LocalStorage / chrome.storage.local bridge with page-key hashing
│   └── utils.js                   # Geometry utilities, debouncing, context validation
├── popup/
│   ├── popup.html                 # Extension popup interface
│   ├── popup.css                  # Modern responsive styling with Dark/Light mode tokens
│   └── popup.js                   # Popup controller, real-time messaging, state synchronization
├── shared/
│   └── constants.js               # Shared constants, default settings, message action protocols
├── icons/                         # Extension icons (16px, 32px, 48px, 128px)
├── LICENSE                        # MIT License
└── README.md                      # Documentation
```

---

## 🔐 Permissions

| Permission | Purpose |
| :--- | :--- |
| `storage` | Stores user preferences (blur intensity, theme, selection mode) and saved page blur areas locally on this device. |
| `activeTab` & `scripting` | Allows on-demand injection of content scripts into tabs opened prior to extension installation. |
| `<all_urls>` | Allows content scripts to run across websites so that saved blurs can be restored automatically when you revisit pages. |

> **Privacy Guarantee**: WP Screen Blur makes **zero network requests**, includes **no external tracking or analytics**, and sends **no data outside your machine**. All processing and storage occur entirely within your local browser instance.

---

## ⚠️ Limitations & Disclosure

> [!NOTE]
> **Visual Privacy Aid**: This extension creates visual CSS blur effects over rendered elements. The underlying DOM nodes and text content remain in the page structure and could still be inspected via browser DevTools, Ctrl+F page search, or accessibility screen readers. This tool is designed for **visual privacy** during screen sharing, recordings, and shoulder-surfing defense.

> [!TIP]
> **Hardware Acceleration**: Overlay blur utilizes CSS `backdrop-filter`, which relies on Chromium's GPU hardware acceleration. Ensure hardware acceleration is enabled in your browser settings (*Settings > System > Use graphics acceleration when available*) for peak performance.

> [!WARNING]
> **Protected Browser Pages**: In accordance with Chromium security architecture, extensions cannot run on internal browser URLs (`chrome://`, `edge://`, `chrome-extension://`), Chrome Web Store pages, or built-in PDF viewers.

---

## 🤝 Contributing

Contributions, feedback, and suggestions are welcome!

1. Fork the Repository
2. Create a Feature Branch (`git checkout -b feature/NewFeature`)
3. Commit your Changes (`git commit -m 'feat: Add NewFeature'`)
4. Push to the Branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.
