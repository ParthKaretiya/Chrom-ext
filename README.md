<div align="center">

# 🔒 WhatsApp Area Blur

**A lightweight Chrome extension to obscure sensitive content on WhatsApp Web with customizable, drag-and-drop blur zones.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Brave%20%7C%20Edge-blue.svg?style=flat-square)](https://www.google.com/chrome/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Client--Side-success.svg?style=flat-square)](#-privacy--limitations)
[![License](https://img.shields.io/badge/License-MIT-orange.svg?style=flat-square)](LICENSE)

</div>

---

## 📖 Overview

**WhatsApp Area Blur** allows you to selectively obscure any area on **WhatsApp Web** (`web.whatsapp.com`). Whether you are sharing your screen during a presentation, recording a video tutorial, or working in a public space, this tool ensures your chats, contact names, phone numbers, and media remain private.

Unlike standard extensions that blur entire chat columns, **WhatsApp Area Blur** lets you drag-select arbitrary rectangular zones anywhere on the screen with precision.

---

## ✨ Key Features

- 🎯 **Custom Drag-to-Select Blur**: Simply click and drag a bounding box over any part of the screen (profile photos, contact headers, specific messages, or input fields).
- 👁️ **Instant Toggle Visibility**: Hide or unhide all active blur areas with a single click.
- 🧹 **One-Click Clear**: Easily remove all blurred regions at once.
- ⌨️ **Keyboard Shortcuts**: Press <kbd>Esc</kbd> at any point during selection to cancel without applying.
- ⚡ **Lightweight & High Performance**: Built with Manifest V3 using hardware-accelerated CSS `backdrop-filter: blur(12px)`.
- 🛡️ **Privacy-First & Zero Tracking**: Runs 100% locally in your browser. No telemetry, no external network requests, and no data stored or transmitted.

---

## 🚀 Installation Guide

Since this is an unpacked extension, you can install it in Google Chrome or any Chromium-based browser (Brave, Microsoft Edge, Opera, Vivaldi) in under a minute:

1. **Clone or Download this Repository**:
   ```bash
   git clone https://github.com/ParthKaretiya/Chrom-ext.git
   ```
   *(Alternatively, click **Code** > **Download ZIP** on GitHub and extract the folder).*

2. **Open Extensions Page**:
   - In Google Chrome, navigate to `chrome://extensions/` (or Edge: `edge://extensions/`).

3. **Enable Developer Mode**:
   - Toggle the **Developer mode** switch in the top-right corner.

4. **Load the Extension**:
   - Click the **Load unpacked** button in the top-left corner.
   - Select the folder containing `manifest.json`.

5. **Pin & Refresh**:
   - Pin **WhatsApp Area Blur** to your Chrome toolbar for quick access.
   - Open or reload [web.whatsapp.com](https://web.whatsapp.com/).

---

## 🛠️ How to Use

1. **Navigate to WhatsApp Web**: Open [web.whatsapp.com](https://web.whatsapp.com/) in your active browser tab.
2. **Activate Selection**:
   - Click the extension icon in the toolbar.
   - Click **＋ Select area to blur**.
3. **Draw Your Area**:
   - A crosshair cursor will appear with a guide overlay.
   - Click and drag over any sensitive element you want to conceal.
   - Release the mouse button to apply the blur filter.
4. **Manage Blur Zones**:
   - **Hide / show blur**: Temporarily reveal or restore blur overlays.
   - **Clear all blur areas**: Remove all existing blur overlays.
   - **Cancel selection**: Hit <kbd>Esc</kbd> while dragging if you change your mind.

---

## 📂 Project Structure

```plaintext
Chrom-ext/
├── manifest.json       # Chrome Extension Manifest V3 configuration
├── content.js          # Content script handling DOM selection & blur overlays
├── popup.html          # Extension action popup interface
├── popup.css           # Styling for popup controls and layout
├── popup.js            # Controller script connecting popup actions to content script
└── README.md           # Project documentation
```

---

## 🔒 Privacy & Limitations

> [!NOTE]
> **Visual Privacy Aid**: This extension creates a visual CSS backdrop blur overlay directly over the rendered page. The underlying DOM elements remain present in the page structure and could still be read through browser DevTools or screen readers. This is designed for visual privacy during screen sharing, screen recording, and shoulder-surfing protection.

> [!IMPORTANT]
> **Viewport-Fixed Overlays**: Blur regions are positioned relative to the browser viewport. When you scroll through chats or resize your window, blur areas stay in place. Simply re-select or clear areas as needed.

---

## 🤝 Contributing

Contributions, feedback, and feature requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.
