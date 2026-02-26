# LitbuyTools

Chrome extension for Litbuy power users: QC automation, UI cleanup tools, image previews, and Reddit link helpers.

## Current Version
- `0.9.0 BETA` (Manifest V3)

## What It Does

### Litbuy Features
- QC Check Button
  - Injects a `Check QC` action on product pages.
  - Supports Litbuy product URL formats:
    - `/products/details?id=...&channel=...`
    - `/product/.../...`
  - Opens UUFinds and runs auto search flow.
- Auto Remove Purchase Warning
  - Dismisses purchase warning dialogs and optional overlays.
- Remove Ads and Clutter
  - Hides banners, popups, side ads, trend blocks, and other optional UI sections.
- Hover Image Preview
  - Enlarged product image preview on hover (with delay/size options).
- Cart Image Preview
  - Click cart/product images for large fullscreen preview.

### Reddit Features
- Link Choice Popup
  - On supported marketplace links, asks whether to open Original site or Litbuy.
- Thread Harvester
  - Collects and deduplicates supported links in a Reddit thread.
  - Queue, copy, open all in Litbuy, and quick subreddit search by item ID.
  - Appears only on Reddit comments pages:
    - `https://www.reddit.com/r/<subreddit>/comments/<post_id>/...`

## Supported Marketplace Link Types
- 1688
  - `detail.1688.com/offer/...`
  - `m.1688.com/offer/...`
- Taobao
  - `item.taobao.com/item.htm?id=...`
  - mobile variants and supported short links (`e.tb.cn`, `m.tb.cn`, `tb.cn`)
- Weidian
  - `*.weidian.com/item.html?itemID=...`
  - includes shop subdomains
- TMall
  - `detail.tmall.com/item.htm?id=...`

## Install (Unpacked)
1. Download or clone this repo.
2. Open `chrome://extensions/`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the project folder.

## Usage

### QC Check
1. Open a Litbuy product page.
2. Click `Check QC` near the top action row.
3. Extension opens UUFinds and starts QC lookup.

### Reddit Tools
1. Open a Reddit post/comments thread with marketplace links.
2. Use Thread Harvester panel for batch actions.
3. Click marketplace links normally to get Original vs Litbuy choice popup.

## Settings
All tools are configurable from the extension popup.

Main modules in popup:
- QC Check Button
- Link Choice Popup
- Thread Harvester
- Auto Remove Purchase Warning
- Remove Ads and Clutter
- Hover Image Preview
- Cart Image Preview

## Demo Assets
- `Demo/QCButton.png`
- `Demo/ClutterFilter.gif`

## Permissions (Why Needed)
- `tabs`, `activeTab`, `scripting`, `storage`
  - Needed for tab automation, content scripts, and saved settings.
- Host permissions include:
  - `litbuy.com`, `www.litbuy.com`, `uufinds.com`
  - supported marketplace domains (Taobao, TMall, Weidian, 1688, tb short links)
  - Reddit pages for link tools UI

## Troubleshooting
- Check QC button not visible:
  - Refresh the page once after navigation.
  - Confirm `QC Check Button` is enabled in popup.
  - Make sure you are on a Litbuy product page URL.
- Reddit Thread Harvester not visible:
  - It only shows on `/r/.../comments/...` pages, not homepage/search pages.
- After updating files:
  - Reload the extension in `chrome://extensions/`.
  - Hard refresh affected tabs.

## Development Notes
- Background script: `background.js`
- Litbuy content script: `content.js`
- Reddit tools: `link_router.js`, `link_router.css`
- Popup UI and settings: `popup.html`, `popup.css`, `popup.js`

## Disclaimer
See [DISCLAIMER](DISCLAIMER).

## License
MIT - see [LICENSE](LICENSE).
