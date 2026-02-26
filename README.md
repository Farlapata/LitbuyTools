# 🚀 LitbuyTools

![Version](https://img.shields.io/badge/version-0.9.0-blue.svg)
![Status](https://img.shields.io/badge/status-BETA-yellow.svg)
![Chrome](https://img.shields.io/badge/chrome-extension-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Chrome extension for Litbuy power users: QC automation, UI cleanup tools, image previews, and Reddit link helpers.

> ⚠️ **BETA VERSION** - Active development. Expect frequent updates and occasional bugs.

## 🔗 Quick Navigation
[🎯 Features](#-features) • [📥 Installation](#-installation-unpacked) • [🎮 Usage](#-usage) • [⚙️ Settings](#-settings) • [🔧 Troubleshooting](#-troubleshooting) • [💬 Support](#-support)

---

## 🎯 Features

### Litbuy Tools
- ✅ **QC Check Button**
  - Adds `Check QC` beside product actions.
  - Supports both URL styles:
    - `/products/details?id=...&channel=...`
    - `/product/.../...`
  - Opens UUFinds and runs automated QC lookup.
- 🧹 **Remove Ads & Clutter**
  - Hides banners, popups, side ads, trend blocks, and optional sections.
- 🚫 **Auto Remove Purchase Warning**
  - Dismisses purchase warning modal and optional overlay.
- 🖼️ **Hover Image Preview**
  - Enlarged product preview on hover with delay/size controls.
- 🔍 **Cart Image Preview**
  - Click cart/product images for fullscreen preview.

### Reddit Tools
- 🔀 **Link Choice Popup**
  - For supported links, choose between Original site or Litbuy.
- 🧵 **Thread Harvester**
  - Dedupe, queue, copy, and bulk-open links from a thread.
  - Supports queue actions and subreddit search by item ID.
  - Appears only on comments pages:
    - `https://www.reddit.com/r/<subreddit>/comments/<post_id>/...`

### 📸 Tool In Action
![Anti-Clutter Feature](https://raw.githubusercontent.com/Farlapata/litbuytools/refs/heads/main/Demo/ClutterFilter.gif)

*Before and after using the Anti-Clutter mode*

***View all tools below.***

---

## 📥 Installation (Unpacked)
1. Download or clone this repo.
2. Open `chrome://extensions/`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this project folder.

---

## 🎮 Usage

### QC Check
1. Open a Litbuy product page.
2. Click `Check QC` in the top action row.
3. UUFinds opens and starts QC lookup.

### Reddit Tools
1. Open a Reddit comments thread with marketplace links.
2. Use Thread Harvester panel for batch actions.
3. Click supported links to get Original vs Litbuy popup.

---

## ⚙️ Settings
All modules are configurable in the extension popup.

Current modules:
- QC Check Button
- Link Choice Popup
- Thread Harvester
- Auto Remove Purchase Warning
- Remove Ads & Clutter
- Hover Image Preview
- Cart Image Preview

---

## 📋 Supported Marketplace Links
- **1688**
  - `detail.1688.com/offer/...`
  - `m.1688.com/offer/...`
- **Taobao**
  - `item.taobao.com/item.htm?id=...`
  - mobile variants + short links (`e.tb.cn`, `m.tb.cn`, `tb.cn`)
- **Weidian**
  - `*.weidian.com/item.html?itemID=...`
  - includes shop subdomains
- **TMall**
  - `detail.tmall.com/item.htm?id=...`

---

## 🔧 Troubleshooting
- QC button not visible:
  - Refresh after navigation.
  - Ensure `QC Check Button` is enabled in popup.
  - Confirm page is a Litbuy product URL.
- Thread Harvester not visible:
  - It only appears on `/r/.../comments/...` pages (not homepage/search).
- After updating extension files:
  - Reload in `chrome://extensions/`.
  - Hard refresh affected tabs.

---

## 🧠 Development Notes
- Background worker: `background.js`
- Litbuy content script: `content.js`
- Reddit tools: `link_router.js`, `link_router.css`
- Popup UI/settings: `popup.html`, `popup.css`, `popup.js`

---

## 💬 Support

- 🐛 **Report Bugs**: [GitHub Issues](https://github.com/Farlapata/litbuytools/issues)
- 💡 **Feature Requests**: [Create an issue](https://github.com/Farlapata/litbuytools/issues/new)
- 👤 **Contact**: [@Farlapata](https://github.com/Farlapata)

### ⚠️ Important Disclaimers

**Please read**: This extension comes with important legal disclaimers. Check out the [DISCLAIMER](DISCLAIMER) file for details about warranties, liabilities, and terms of use.

---

## 📚 Useful Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [Litbuy Website](https://litbuy.com)
- [UUFinds QC Tool](https://www.uufinds.com/qcfinds)

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

## 🎉 Made with ❤️ by [@Farlapata](https://github.com/Farlapata)

**Enjoying LitbuyTools?** Give it a ⭐ on GitHub!

---

### ⚡ Beta Testing Notice

This extension is under active development. Features may change, break, or work unexpectedly.  
Your feedback helps make it better for everyone!

**Current Version:** 0.9.0 BETA

</div>


