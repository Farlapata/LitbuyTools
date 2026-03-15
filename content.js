/**
 * LitbuyTools - Content Script
 * Injects "Check QC" button on Litbuy product pages
 */

(function() {
  'use strict';

    const BUTTON_ID = 'litbuy-qc-check-btn';
    const PRODUCT_WEIGHT_ID = 'litbuy-item-weight-card';
    const PRODUCT_SHIPPING_ID = 'litbuy-shipping-estimate-card';
    const PRODUCT_PRICE_SUMMARY_ID = 'litbuy-product-price-summary';
    const PRODUCT_PANEL_ID = 'litbuy-product-addon-panel';
    const PRODUCT_METRICS_ROW_ID = 'litbuy-product-metrics-row';
    const PRODUCT_ACTIONS_ROW_ID = 'litbuy-product-actions-row';
    const WEIGHT_STYLE_ID = 'litbuy-item-weight-style';
    const CART_WEIGHT_CLASS = 'litbuy-cart-weight-badge';
    const CART_TOTAL_WEIGHT_ID = 'litbuy-cart-total-weight';
    const CART_FOOTER_SUMMARY_ID = 'litbuy-cart-summary-panel';
    const CART_ITEMS_SUBTOTAL_ID = 'litbuy-cart-items-subtotal';
    const CART_TOTAL_SHIPPING_ID = 'litbuy-cart-total-shipping';
    const CART_TOTAL_WITH_SHIPPING_ID = 'litbuy-cart-total-with-shipping';
    const CART_WEIGHT_HEADER_CLASS = 'litbuy-cart-weight-header';
    const CART_WEIGHT_CELL_CLASS = 'litbuy-cart-weight-cell';
    const PRODUCT_LINK_CONTROL_ID = 'litbuy-product-link-control';
  const PRODUCT_LINK_SOURCE_ATTR = 'data-litbuy-product-link-source';

  // Default settings
  const DEFAULT_SETTINGS = {
    qcCheckEnabled: true,
    qcCacheMode: 'click',
    buttonPosition: 'left',
    productLinkEnabled: true,
    productShippingEnabled: true,
    productPriceSummaryEnabled: true,
    removeWarningEnabled: false,
    warningDelay: 100,
    removeOverlayEnabled: true,
    removeClutterEnabled: false,
    removeBanners: true,
    removePopups: true,
    removeSidebarAds: true,
    removeCartFlow: true,
    removeLitline: true,
    removeFAQ: true,
    removeTipLine: true,
    removeTrending: true,
    removeMemoryMenu: false,
    hideRecommendations: false,
    compactMode: false,
    hoverPreviewEnabled: true,
    hoverDelay: 1500,
    previewSize: '400',
    showCloseButton: true,
    cartPreviewEnabled: true,
    cartSummaryEnabled: true,
    cartCleanupEnabled: true,
    deleteConfirmationsEnabled: true,
    itemWeightEnabled: true,
    itemWeightProductEnabled: true,
    itemWeightCartEnabled: true
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let itemWeightObserver = null;
  let itemWeightScanTimeout = null;
  let cartTotalWeightTimeout = null;
  let productWeightScanTimeout = null;
  let productWeightRenderToken = 0;
  let qcLaunchInFlight = false;
  let qcLaunchResetTimeout = null;
  let productLinkCollapseTimeout = null;
  let qcPrewarmKey = '';
  let weightRequestSequence = 0;
  const pendingWeightLookups = new Map();
  const productWeightState = {
    lookupKey: '',
    status: 'idle',
    requestId: ''
  };

  // Load settings from chrome.storage
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        currentSettings = settings;
        resolve(settings);
      });
    });
  }

  const SOURCE_URLS = {
    '1688': (id) => `https://detail.1688.com/offer/${id}.html`,
    'taobao': (id) => `https://item.taobao.com/item.htm?id=${id}`,
    'weidian': (id) => `https://weidian.com/item.html?itemID=${id}`,
    'tmall': (id) => `https://detail.tmall.com/item.htm?id=${id}`
  };

  const CHANNEL_ALIASES = {
    '0': 'taobao',
    '1': 'tmall',
    '2': '1688',
    '3': 'weidian',
    'tb': 'taobao',
    'taobao': 'taobao',
    'tm': 'tmall',
    'tmall': 'tmall',
    '1688': '1688',
    'ali_1688': '1688',
    'wd': 'weidian',
    'weidian': 'weidian'
  };

  function normalizeChannel(channel) {
    if (!channel) return '';
    const key = String(channel).trim().toLowerCase();
    return CHANNEL_ALIASES[key] || '';
  }

  function isProductWeightLookupEnabled() {
    return Boolean(currentSettings.itemWeightProductEnabled || currentSettings.productShippingEnabled);
  }

  function isCartWeightLookupEnabled() {
    return Boolean(currentSettings.itemWeightCartEnabled || currentSettings.cartSummaryEnabled);
  }

  function isAnyWeightLookupEnabled() {
    return isProductWeightLookupEnabled() || isCartWeightLookupEnabled();
  }

  function isLitbuyProductPage() {
    const path = window.location.pathname || '';
    return /^\/products\/details(?:\/|$)/i.test(path) ||
      /^\/products\/[^\/?#]+\/\d+/i.test(path) ||
      /^\/product\/[^\/?#]+\/\d+/i.test(path) ||
      /^\/product\/\d+/i.test(path);
  }

  /**
   * Get product info from CURRENT URL (always fresh)
   */
  function getCurrentProductInfo() {
    const currentUrl = window.location.href;
    let parsedUrl;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      return { id: '', channel: '', channelRaw: '', url: currentUrl };
    }

    const params = parsedUrl.searchParams;
    let id = params.get('id') || params.get('item_id') || '';
    let channelRaw = params.get('channel') || params.get('platform') || '';

    if (!id || !channelRaw) {
      const path = parsedUrl.pathname || '';

      const detailsPathMatch = path.match(/\/products\/([^\/?#]+)\/(\d+)/i);
      if (detailsPathMatch) {
        channelRaw = channelRaw || detailsPathMatch[1];
        id = id || detailsPathMatch[2];
      }

      const compactProductMatch = path.match(/\/product\/([^\/?#]+)\/(\d+)/i);
      if (compactProductMatch) {
        channelRaw = channelRaw || compactProductMatch[1];
        id = id || compactProductMatch[2];
      }

      const bareProductMatch = path.match(/\/product\/(\d+)/i);
      if (bareProductMatch) {
        id = id || bareProductMatch[1];
      }
    }

    const channel = normalizeChannel(channelRaw);
    return { id, channel, channelRaw, url: currentUrl };
  }

  function getProductInfoFromUrl(urlLike) {
    if (!urlLike) return null;

    let parsedUrl;
    try {
      parsedUrl = new URL(urlLike, window.location.origin);
    } catch {
      return null;
    }

    const params = parsedUrl.searchParams;
    let id = params.get('id') || params.get('item_id') || '';
    let channelRaw = params.get('channel') || params.get('platform') || '';
    const path = parsedUrl.pathname || '';

    if (!id || !channelRaw) {
      const detailsPathMatch = path.match(/\/products\/([^\/?#]+)\/(\d+)/i);
      if (detailsPathMatch) {
        channelRaw = channelRaw || detailsPathMatch[1];
        id = id || detailsPathMatch[2];
      }

      const compactProductMatch = path.match(/\/product\/([^\/?#]+)\/(\d+)/i);
      if (compactProductMatch) {
        channelRaw = channelRaw || compactProductMatch[1];
        id = id || compactProductMatch[2];
      }

      const bareProductMatch = path.match(/\/product\/(\d+)/i);
      if (bareProductMatch) {
        id = id || bareProductMatch[1];
      }
    }

    if (!id) return null;

    return {
      id,
      channel: normalizeChannel(channelRaw),
      channelRaw,
      url: parsedUrl.toString()
    };
  }

  /**
   * Build the marketplace source URL
   */
  function buildSourceUrl(id, channel, channelRaw = '') {
    if (!id) return null;

    const normalizedChannel = normalizeChannel(channel) || normalizeChannel(channelRaw);
    const builder = SOURCE_URLS[normalizedChannel];
    if (builder) return builder(id);

    // Fallback for new path format where channel can be missing/obfuscated.
    return SOURCE_URLS.taobao(id);
  }

  function isLitbuyCartPage() {
    const path = window.location.pathname || '';
    return /^\/cart(?:\/|$)/i.test(path) ||
      /^\/shopping(?:\/|$)/i.test(path) ||
      /^\/shopping-cart(?:\/|$)/i.test(path) ||
      /^\/account\/shopping-cart(?:\/|$)/i.test(path);
  }

  function getWeightLookupKey(productInfo) {
    if (!productInfo?.id) return '';
    return `${String(productInfo.channel || productInfo.channelRaw || 'unknown').trim().toLowerCase()}:${String(productInfo.id).trim()}`;
  }

  function injectItemWeightStyles() {
    let style = document.getElementById(WEIGHT_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = WEIGHT_STYLE_ID;
    }

    const cartCleanupStyles = currentSettings.cartCleanupEnabled ? `
      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row,
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row {
        display: grid !important;
        grid-template-columns: minmax(160px, 1.2fr) minmax(320px, 3.2fr) minmax(112px, 0.9fr) minmax(128px, 1fr) minmax(90px, 0.7fr) minmax(70px, 0.45fr) minmax(84px, 0.58fr);
        align-items: center !important;
        column-gap: 14px;
      }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col,
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col {
        width: auto !important;
        max-width: none !important;
        flex: none !important;
      }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(3),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(3) {
        display: none !important;
      }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(1),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(1) { grid-column: 1; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(2),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(2) { grid-column: 2; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(4),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(4) { grid-column: 3; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(5),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(5) { grid-column: 4; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(6),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(6) { grid-column: 5; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(7),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(7) { grid-column: 6; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(8),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(8) { grid-column: 7; }

      .${CART_WEIGHT_HEADER_CLASS} {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .${CART_WEIGHT_HEADER_CLASS} .th {
        font-family: inherit;
        font-size: inherit;
        font-weight: 600;
        color: inherit;
        white-space: nowrap;
        text-align: center;
      }

      .${CART_WEIGHT_CELL_CLASS} {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .${CART_WEIGHT_CELL_CLASS} .td {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        font-family: inherit;
        font-size: 16px;
        font-weight: 700;
        color: #1f1f1f;
        line-height: 1.2;
        text-align: center;
      }

      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(8) .td {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(8) .td .btn {
        position: relative;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        min-width: 34px;
        min-height: 34px;
        padding: 0 !important;
        border-radius: 10px;
        color: transparent !important;
        font-size: 0 !important;
        line-height: 0 !important;
        transition: background-color 140ms ease, transform 140ms ease;
      }

      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(8) .td .btn::before {
        content: '';
        width: 18px;
        height: 18px;
        background: center / contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 11h12a2 2 0 0 0 2-2V8H4v10a2 2 0 0 0 2 2Z' fill='%23858585'/%3E%3C/svg%3E");
        opacity: 0.92;
      }

      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(8) .td .btn:hover {
        background: rgba(24, 24, 24, 0.04);
      }
    ` : `
      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row,
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row {
        display: grid !important;
        grid-template-columns: minmax(160px, 1.2fr) minmax(320px, 3.2fr) minmax(112px, 0.9fr) minmax(128px, 1fr) minmax(118px, 0.95fr) minmax(90px, 0.7fr) minmax(70px, 0.45fr) minmax(84px, 0.58fr);
        align-items: center !important;
        column-gap: 14px;
      }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col,
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col {
        width: auto !important;
        max-width: none !important;
        flex: none !important;
      }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(1),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(1) { grid-column: 1; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(2),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(2) { grid-column: 2; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(3),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(3) { grid-column: 3; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(4),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(4) { grid-column: 4; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(5),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(5) { grid-column: 5; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(6),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(6) { grid-column: 6; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(7),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(7) { grid-column: 7; }

      .table-wrap .table-header .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(8),
      .table-wrap .table-content .table-body > .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(8) { grid-column: 8; }

      .${CART_WEIGHT_HEADER_CLASS} {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .${CART_WEIGHT_HEADER_CLASS} .th {
        font-family: inherit;
        font-size: inherit;
        font-weight: 600;
        color: inherit;
        white-space: nowrap;
        text-align: center;
      }

      .${CART_WEIGHT_CELL_CLASS} {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .${CART_WEIGHT_CELL_CLASS} .td {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        font-family: inherit;
        font-size: 16px;
        font-weight: 700;
        color: #1f1f1f;
        line-height: 1.2;
        text-align: center;
      }
    `;

    style.textContent = `
      #${PRODUCT_PANEL_ID} {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        margin: 0 0 8px;
        clear: both;
      }

      #${PRODUCT_ACTIONS_ROW_ID} {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        width: 100%;
      }

      #${PRODUCT_METRICS_ROW_ID} {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        width: 100%;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 140, 26, 0.16);
      }

      #${PRODUCT_METRICS_ROW_ID} > :only-child {
        grid-column: 1 / -1;
      }

      #${PRODUCT_WEIGHT_ID},
      #${PRODUCT_SHIPPING_ID} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        max-width: none;
        min-width: 0;
        min-height: 68px;
        margin: 0;
        padding: 11px 14px;
        border: 1px solid rgba(255, 140, 26, 0.2);
        border-radius: 14px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(255, 248, 242, 0.98) 100%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 140, 26, 0.04) 100%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.7),
          0 4px 12px rgba(255, 140, 26, 0.04);
      }

      .litbuy-weight-copy {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }

      .litbuy-weight-label-row {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .litbuy-weight-label {
        font-size: 12px;
        font-weight: 500;
        line-height: 1.2;
        color: #626262;
      }

      .litbuy-weight-info {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 15px;
        height: 15px;
        border: 1px solid rgba(255, 140, 26, 0.28);
        border-radius: 999px;
        color: #ff8c1a;
        font-size: 9px;
        font-weight: 700;
        cursor: help;
        transform: none;
      }

      .litbuy-weight-tooltip {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 10px);
        transform: translateX(-50%) translateY(4px);
        width: 220px;
        padding: 9px 10px;
        border-radius: 10px;
        background: rgba(27, 27, 27, 0.94);
        color: rgba(255, 255, 255, 0.9);
        font-size: 11px;
        line-height: 1.35;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease, transform 180ms ease;
        z-index: 30;
      }

      .litbuy-weight-info:hover .litbuy-weight-tooltip {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .litbuy-weight-subtitle {
        font-size: 11px;
        line-height: 1.2;
        color: #6f6f6f;
      }

      .litbuy-weight-progress {
        display: none;
        width: 84px;
        height: 3px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 140, 26, 0.12);
      }

      .litbuy-weight-progress span {
        display: block;
        width: 45%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(255, 140, 26, 0.35) 0%, #ff8c1a 100%);
        animation: litbuy-weight-progress 1s ease-in-out infinite;
      }

      .litbuy-weight-value {
        flex-shrink: 0;
        font-size: 34px;
        font-weight: 700;
        line-height: 1;
        color: #ff8c1a;
        white-space: nowrap;
        letter-spacing: -0.04em;
      }

      .litbuy-weight-value.is-muted {
        font-size: 13px;
        font-weight: 600;
        color: #696969;
      }

      #${PRODUCT_PRICE_SUMMARY_ID} {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin: 0;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        font-feature-settings: "tnum" 1, "lnum" 1;
        color: #2f2f2f;
        flex: 1 1 auto;
        min-width: 0;
      }

      .good-info .price-wrap {
        display: flex;
        align-items: flex-end;
        gap: 12px;
        flex-wrap: wrap;
      }

      .good-info .price-wrap > .edit {
        align-self: flex-end;
        margin-bottom: 6px;
      }

      .litbuy-price-summary-top {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0;
        color: #8a8a8a;
        text-transform: none;
      }

      .litbuy-price-summary-main {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 8px;
        line-height: 1;
      }

      .litbuy-price-primary {
        font-size: 42px;
        font-weight: 800;
        letter-spacing: -0.05em;
        color: #1f1f1f;
      }

      .litbuy-price-operator,
      .litbuy-price-approx {
        font-size: 16px;
        font-weight: 600;
        color: #949494;
      }

      .litbuy-price-shipping {
        font-size: 18px;
        font-weight: 600;
        color: #c17a2a;
      }

      .litbuy-price-total {
        font-size: 26px;
        font-weight: 700;
        color: #434343;
      }

      .good-info .title h1,
      .good-info .title-left .text h1,
      h1[data-v-7b82a5f4] {
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif !important;
        font-size: 19px !important;
        line-height: 1.38 !important;
        font-weight: 700 !important;
        letter-spacing: -0.015em;
        color: #222222 !important;
      }

      #${PRODUCT_WEIGHT_ID}[data-weight-state="loading"] .litbuy-weight-progress,
      #${PRODUCT_SHIPPING_ID}[data-weight-state="loading"] .litbuy-weight-progress {
        display: block;
      }

      @keyframes litbuy-weight-progress {
        0% { transform: translateX(-110%); }
        100% { transform: translateX(260%); }
      }

      ${cartCleanupStyles}

      .${CART_WEIGHT_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        max-width: 100%;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        font-family: inherit;
        font-size: inherit;
        line-height: 1.2;
        color: inherit;
      }

      .${CART_WEIGHT_CLASS} .litbuy-weight-tag {
        display: none;
      }

      .${CART_WEIGHT_CLASS} .litbuy-weight-value-text {
        min-width: 0;
        font: inherit;
        color: inherit;
        white-space: nowrap;
        text-align: center;
      }

      .${CART_WEIGHT_CLASS}[data-weight-state="loading"] .litbuy-weight-tag,
      .${CART_WEIGHT_CLASS}[data-weight-state="error"] .litbuy-weight-tag,
      .${CART_WEIGHT_CLASS}[data-weight-state="loading"] .litbuy-weight-value-text,
      .${CART_WEIGHT_CLASS}[data-weight-state="error"] .litbuy-weight-value-text {
        color: #8f8f8f;
      }

      .litbuy-cart-footer-enhanced {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 18px !important;
        flex-wrap: nowrap !important;
        padding: 4px 0 !important;
      }

      .litbuy-cart-footer-enhanced > .left {
        display: none !important;
      }

      #${CART_FOOTER_SUMMARY_ID} {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 22px;
        min-width: 0;
        flex: 1 1 auto;
      }

      .litbuy-cart-summary-ledger {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 220px;
        max-width: 250px;
      }

      .litbuy-cart-summary-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
      }

      .litbuy-cart-summary-line-copy {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }

      .litbuy-cart-summary-line-label-row {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .litbuy-cart-summary-line-label {
        font-size: 13px;
        font-weight: 700;
        line-height: 1.15;
        color: #6f6f6f;
        letter-spacing: 0.01em;
      }

      .litbuy-cart-summary-line-subtitle {
        font-size: 12px;
        line-height: 1.2;
        color: #979797;
      }

      .litbuy-cart-summary-line-value {
        font-size: 22px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.035em;
        color: #242424;
        white-space: nowrap;
        flex: 0 0 auto;
      }

      #${CART_TOTAL_SHIPPING_ID} .litbuy-cart-summary-line-value {
        color: #cc7a16;
      }

      .litbuy-cart-summary-subtitle-strong {
        display: inline-block;
        margin-left: 4px;
        font-size: inherit;
        font-weight: 700;
        line-height: inherit;
        letter-spacing: inherit;
        color: #cc7a16;
        vertical-align: baseline;
      }

      .litbuy-cart-summary-info {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 1px solid rgba(255, 140, 26, 0.35);
        color: #dd8519;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        cursor: default;
      }

      .litbuy-cart-summary-info::before {
        content: '';
        position: absolute;
        left: 50%;
        bottom: 100%;
        transform: translateX(-50%);
        width: 280px;
        height: 132px;
      }

      .litbuy-cart-summary-info::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: 100%;
        transform: translateX(-50%);
        width: 40px;
        height: 14px;
      }

      .litbuy-cart-summary-tooltip {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 2px);
        transform: translateX(-50%) translateY(6px);
        width: 260px;
        padding: 11px 12px;
        border-radius: 12px;
        border: 1px solid rgba(24, 24, 24, 0.08);
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 18px 32px rgba(18, 18, 18, 0.12);
        color: #444;
        font-size: 12px;
        line-height: 1.45;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 160ms ease, transform 160ms ease, visibility 160ms ease;
        z-index: 40;
        text-align: left;
      }

      .litbuy-cart-summary-info:is(:hover, :focus-within) .litbuy-cart-summary-tooltip {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) translateY(0);
      }

      .litbuy-cart-shipping-tooltip-body {
        white-space: pre-line;
        color: #3c3c3c;
      }

      .litbuy-cart-shipping-tooltip-note {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(24, 24, 24, 0.08);
        color: #757575;
        white-space: pre-line;
      }

      .litbuy-cart-summary-prices {
        min-width: 420px;
      }

      .litbuy-cart-summary-combo {
        position: relative;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: stretch;
        min-height: 76px;
        border: 1px solid rgba(24, 24, 24, 0.08);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(247, 247, 247, 0.96) 100%);
        box-shadow: 0 8px 18px rgba(20, 20, 20, 0.04);
        overflow: hidden;
      }

      .litbuy-cart-summary-combo::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 19%;
        transform: translateX(-50%);
        width: 1px;
        height: 62%;
        background: linear-gradient(180deg, rgba(24, 24, 24, 0) 0%, rgba(24, 24, 24, 0.13) 20%, rgba(24, 24, 24, 0.13) 80%, rgba(24, 24, 24, 0) 100%);
      }

      .litbuy-cart-summary-card {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
        min-height: 76px;
        padding: 14px 20px;
        min-width: 0;
      }

      .litbuy-cart-summary-label {
        font-size: 11px;
        font-weight: 700;
        line-height: 1.1;
        color: #8a8a8a;
        text-transform: uppercase;
        letter-spacing: 0.025em;
      }

      .litbuy-cart-summary-subtitle {
        font-size: 11px;
        line-height: 1.2;
        color: #8f8f8f;
        white-space: normal;
      }

      .litbuy-cart-summary-value {
        font-size: 22px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.035em;
        color: #232323;
        white-space: nowrap;
      }

      .litbuy-cart-summary-combo .litbuy-cart-summary-value {
        font-size: 26px;
        color: #202020;
      }

      .litbuy-cart-summary-combo .litbuy-cart-summary-subtitle {
        font-size: 12px;
      }

      .litbuy-cart-checkout-anchor {
        order: 20 !important;
        flex: 0 0 auto !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 58px !important;
        min-width: 134px !important;
        padding: 0 22px !important;
        margin-left: auto !important;
        border-radius: 16px !important;
        border: 1px solid rgba(255, 140, 26, 0.2) !important;
        background: linear-gradient(180deg, rgba(255, 250, 245, 0.98) 0%, rgba(255, 242, 228, 0.95) 100%) !important;
        box-shadow: 0 10px 22px rgba(255, 140, 26, 0.07) !important;
        color: #a05f12 !important;
        font-weight: 800 !important;
        font-size: 18px !important;
        line-height: 1 !important;
        white-space: nowrap !important;
        text-decoration: none !important;
      }

      @media (max-width: 1180px) {
        #${CART_FOOTER_SUMMARY_ID} {
          flex-direction: column;
          align-items: stretch;
        }

        .litbuy-cart-summary-prices {
          min-width: 0;
        }
      }

      .litbuy-cart-checkout-anchor > button,
      .litbuy-cart-checkout-anchor > a,
      .litbuy-cart-checkout-anchor > span,
      .litbuy-cart-checkout-anchor > div {
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        color: inherit !important;
        font: inherit !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      .litbuy-cart-total-price-box,
      .litbuy-cart-footer-enhanced > #${CART_TOTAL_WEIGHT_ID} {
        display: none !important;
      }

      [data-litbuy-qc-controls="true"] {
        display: contents !important;
      }

      #${PRODUCT_LINK_CONTROL_ID} {
        position: relative;
        display: inline-flex;
        align-items: stretch;
        justify-content: center;
        order: 20;
        width: 100%;
        min-width: 0;
        height: 42px;
        overflow: visible;
        transition:
          transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
          opacity 180ms ease;
        user-select: none;
        -webkit-user-select: none;
      }

      .litbuy-product-link-shell {
        position: relative;
        display: flex;
        align-items: stretch;
        justify-content: flex-end;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border: 1px solid rgba(255, 140, 26, 0.22);
        border-radius: 12px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(255, 244, 234, 0.98) 100%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 140, 26, 0.05) 100%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.65),
          0 4px 10px rgba(255, 140, 26, 0.04);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        transition:
          width 260ms cubic-bezier(0.22, 1, 0.36, 1),
          box-shadow 260ms ease,
          border-color 260ms ease;
      }

      #${PRODUCT_LINK_CONTROL_ID}:hover .litbuy-product-link-shell {
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.72),
          0 6px 12px rgba(255, 140, 26, 0.08);
        border-color: rgba(255, 140, 26, 0.32);
      }

      #${PRODUCT_LINK_CONTROL_ID}[data-expanded="true"] .litbuy-product-link-shell {
        width: 100%;
      }

      .litbuy-product-link-trigger,
      .litbuy-product-link-action {
        border: 0;
        background: transparent;
        color: #444444;
        font: inherit;
      }

      .litbuy-product-link-trigger {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 0 12px;
        cursor: pointer;
        transition:
          opacity 220ms ease,
          transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
          letter-spacing 220ms ease;
      }

      #${PRODUCT_LINK_CONTROL_ID}[data-expanded="true"] .litbuy-product-link-trigger {
        opacity: 0;
        transform: scale(0.92);
        pointer-events: none;
        letter-spacing: 0.03em;
      }

      .litbuy-product-link-actions {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        align-items: stretch;
        gap: 0;
        opacity: 0;
        transform: scaleX(0.84);
        pointer-events: none;
        transition:
          opacity 220ms ease,
          transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      #${PRODUCT_LINK_CONTROL_ID}[data-expanded="true"] .litbuy-product-link-actions {
        opacity: 1;
        transform: scaleX(1);
        pointer-events: auto;
      }

      .litbuy-product-link-action {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        color: #3f3f3f;
        transition:
          background-color 180ms ease,
          color 180ms ease,
          transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .litbuy-product-link-action:hover {
        background: rgba(255, 140, 26, 0.08);
        color: #ff8c1a;
      }

      .litbuy-product-link-action:active {
        transform: scale(0.97);
      }

      .litbuy-product-link-action + .litbuy-product-link-action::before {
        content: '';
        position: absolute;
        left: 0;
        top: 9px;
        bottom: 9px;
        width: 1px;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(255, 140, 26, 0) 0%, rgba(255, 140, 26, 0.28) 18%, rgba(255, 140, 26, 0.3) 82%, rgba(255, 140, 26, 0) 100%);
      }

      .litbuy-product-link-label {
        white-space: nowrap;
        font-size: 12px;
        font-weight: 700;
      }

      #${BUTTON_ID} {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        order: 10;
        width: 100%;
        min-width: 0;
        height: 42px;
        padding: 0 12px;
        border: 1px solid rgba(255, 140, 26, 0.22);
        border-radius: 12px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(255, 244, 234, 0.98) 100%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 140, 26, 0.05) 100%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.65),
          0 4px 10px rgba(255, 140, 26, 0.04);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        color: #3f3f3f;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        transition:
          transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
          box-shadow 220ms ease,
          border-color 220ms ease,
          color 180ms ease,
          opacity 180ms ease;
      }

      #${BUTTON_ID}:hover {
        border-color: rgba(255, 140, 26, 0.32);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.72),
          0 6px 12px rgba(255, 140, 26, 0.08);
      }

      #${BUTTON_ID}[data-qc-state="launching"],
      #${BUTTON_ID}[data-qc-state="opening"],
      #${BUTTON_ID}[data-qc-state="searching"] {
        color: #4b4b4b;
      }

      #${BUTTON_ID}[data-qc-state="done"] {
        color: #ff8c1a;
      }

      #${BUTTON_ID}[data-qc-state="error"] {
        color: #5f5f5f;
      }

      .litbuy-qc-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 13px;
        height: 13px;
        flex-shrink: 0;
      }

      .litbuy-qc-label {
        white-space: nowrap;
        font-size: 12px;
        font-weight: 700;
      }

      @media (max-width: 1080px) {
        #${PRODUCT_ACTIONS_ROW_ID},
        #${PRODUCT_METRICS_ROW_ID} {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .litbuy-qc-busy-dot {
        display: none;
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #ff8c1a;
        box-shadow: 0 0 0 0 rgba(255, 140, 26, 0.3);
        animation: litbuy-qc-pulse 1.2s ease-in-out infinite;
      }

      #${BUTTON_ID}[data-qc-state="launching"] .litbuy-qc-busy-dot,
      #${BUTTON_ID}[data-qc-state="opening"] .litbuy-qc-busy-dot,
      #${BUTTON_ID}[data-qc-state="searching"] .litbuy-qc-busy-dot {
        display: inline-block;
      }

      @keyframes litbuy-qc-pulse {
        0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(255, 140, 26, 0.34); }
        70% { transform: scale(1.05); box-shadow: 0 0 0 8px rgba(255, 140, 26, 0); }
        100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(255, 140, 26, 0); }
      }
    `;

    if (!style.parentElement) {
      document.head.appendChild(style);
    }
  }

  function formatWeightGrams(weightGrams) {
    const numericWeight = Number(weightGrams);
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) return '';
    return `${Number.isInteger(numericWeight) ? numericWeight : numericWeight} g`;
  }

  function formatWeightDisplay(response) {
    if (response?.noWeight) return '--';
    const typicalWeight = formatWeightGrams(response?.typicalWeightGrams);
    if (typicalWeight) return typicalWeight;
    const minWeight = formatWeightGrams(response?.minWeightGrams);
    const maxWeight = formatWeightGrams(response?.maxWeightGrams);
    if (minWeight && maxWeight) {
      if (response.minWeightGrams === response.maxWeightGrams) {
        return minWeight;
      }
      return `${minWeight} - ${maxWeight}`;
    }
    return formatWeightGrams(response?.weightGrams);
  }

  function formatEuroSuffix(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return '';
    return `${numericValue.toFixed(2)}€`;
  }

  function parseProductPriceValues() {
    const priceWrap = document.querySelector('.good-info .price-wrap') || document.querySelector('.price-wrap');
    if (!priceWrap) return null;

    const nativePriceNode = priceWrap.querySelector('.price');
    if (!nativePriceNode) return null;

    const priceText = nativePriceNode.textContent || '';
    const cnyMatch = priceText.match(/CNY\s*([0-9]+(?:\.[0-9]+)?)/i);
    const eurMatch = priceText.match(/EUR\s*([0-9]+(?:\.[0-9]+)?)/i);
    const cnyPrice = cnyMatch ? Number(cnyMatch[1]) : NaN;
    const eurPrice = eurMatch ? Number(eurMatch[1]) : NaN;

    if (!Number.isFinite(eurPrice) || eurPrice <= 0) return null;

    return {
      priceWrap,
      nativePriceNode,
      cnyPrice: Number.isFinite(cnyPrice) && cnyPrice > 0 ? cnyPrice : null,
      eurPrice
    };
  }

  function removeProductPriceSummary() {
    const summary = document.getElementById(PRODUCT_PRICE_SUMMARY_ID);
    if (summary) summary.remove();

    const nativePriceNode = document.querySelector('.good-info .price-wrap .price') || document.querySelector('.price-wrap .price');
    if (nativePriceNode) {
      nativePriceNode.style.display = '';
    }
  }

  function renderProductPriceSummary(shippingEstimateEur = null) {
    if (!currentSettings.productPriceSummaryEnabled) {
      removeProductPriceSummary();
      return false;
    }

    const parsed = parseProductPriceValues();
    if (!parsed) {
      removeProductPriceSummary();
      return false;
    }

    const { priceWrap, nativePriceNode, cnyPrice, eurPrice } = parsed;
    nativePriceNode.style.display = 'none';

    let summary = document.getElementById(PRODUCT_PRICE_SUMMARY_ID);
    if (!summary) {
      summary = document.createElement('div');
      summary.id = PRODUCT_PRICE_SUMMARY_ID;
    }

    const shippingValue = Number(shippingEstimateEur);
    const hasShipping = Number.isFinite(shippingValue) && shippingValue > 0;
    const totalValue = hasShipping ? eurPrice + shippingValue : eurPrice;
    const cnyLabel = cnyPrice ? `CNY ${Number.isInteger(cnyPrice) ? cnyPrice : cnyPrice.toFixed(2)}` : 'Source price';

    summary.innerHTML = `
      <div class="litbuy-price-summary-top">${cnyLabel}</div>
      <div class="litbuy-price-summary-main">
        <span class="litbuy-price-primary">${formatEuroSuffix(eurPrice)}</span>
        ${hasShipping ? '<span class="litbuy-price-operator">+</span>' : ''}
        ${hasShipping ? `<span class="litbuy-price-shipping">${formatEuroSuffix(shippingValue)}</span>` : ''}
        ${hasShipping ? '<span class="litbuy-price-approx">≈</span>' : ''}
        ${hasShipping ? `<span class="litbuy-price-total">${formatEuroSuffix(totalValue)}</span>` : ''}
      </div>
    `;

    const approxNode = summary.querySelector('.litbuy-price-approx');
    if (approxNode) {
      approxNode.innerHTML = '&#8776;';
    }

    if (summary.parentElement !== priceWrap) {
      priceWrap.insertBefore(summary, nativePriceNode.nextSibling);
    }

    return true;
  }

  function refreshStandaloneProductPriceSummary() {
    if (!isLitbuyProductPage()) return;
    if (!currentSettings.productPriceSummaryEnabled) {
      removeProductPriceSummary();
      return;
    }

    const shippingEstimate = currentSettings.productShippingEnabled
      ? getCurrentProductShippingEstimate()
      : null;
    renderProductPriceSummary(shippingEstimate);
  }

  function getCurrentProductShippingEstimate() {
    const shippingCard = document.getElementById(PRODUCT_SHIPPING_ID);
    const storedValue = Number(shippingCard?.dataset.shippingEstimateEur);
    if (!Number.isFinite(storedValue) || storedValue <= 0) return null;
    return storedValue;
  }

  function estimateNetherlandsShipping(weightGrams) {
    const weight = Number(weightGrams);
    if (!Number.isFinite(weight) || weight <= 0) return null;
    const baseFee = 12;

    const pricingPoints = [
      [500, 16.05], [750, 18.06], [1000, 19.39], [1250, 21.24], [1500, 22.74],
      [1750, 24.74], [2000, 26.08], [2250, 28.08], [2500, 28.42], [2750, 31.43],
      [3000, 32.77], [3250, 34.77], [3500, 36.11], [3750, 38.11], [4000, 39.45],
      [4250, 41.46], [4500, 42.79], [4750, 44.81], [5000, 45.14], [5500, 49.48],
      [6000, 52.23], [6500, 56.17], [7000, 59.51], [7500, 62.85], [8000, 65.19],
      [8500, 69.54], [9000, 72.28], [9500, 76.23], [10000, 79.57], [11000, 86.25],
      [12000, 92.94], [13000, 99.63], [14000, 106.31], [15000, 113.09]
    ];

    if (weight <= 500) {
      const lowWeightEstimate = (16.05 - baseFee) * (weight / 500);
      return { estimateGrams: weight, estimateEur: Number(lowWeightEstimate.toFixed(2)) };
    }

    for (let i = 0; i < pricingPoints.length; i += 1) {
      const [pointWeight, pointPrice] = pricingPoints[i];
      if (weight === pointWeight) {
        return { estimateGrams: weight, estimateEur: Number(Math.max(0, pointPrice - baseFee).toFixed(2)) };
      }
      if (weight < pointWeight) {
        const [prevWeight, prevPrice] = pricingPoints[i - 1];
        const ratio = (weight - prevWeight) / (pointWeight - prevWeight);
        const interpolatedPrice = prevPrice + ((pointPrice - prevPrice) * ratio);
        return { estimateGrams: weight, estimateEur: Number(Math.max(0, interpolatedPrice - baseFee).toFixed(2)) };
      }
    }

    if (weight > 15000) {
      const estimatedPrice = 6.7 * (weight / 1000);
      return { estimateGrams: weight, estimateEur: Number(estimatedPrice.toFixed(2)) };
    }

    return null;
  }

  function formatWeightRangeSubtitle(response) {
    if (response?.noWeight) return '';

    const minWeight = formatWeightGrams(response?.minWeightGrams);
    const maxWeight = formatWeightGrams(response?.maxWeightGrams);
    if (!minWeight && !maxWeight) return '';
    if (minWeight && maxWeight) {
      if (response.minWeightGrams === response.maxWeightGrams) {
        return '';
      }
      return `${minWeight} - ${maxWeight}`;
    }

    return minWeight || maxWeight || '';
  }

  function getWeightNumberForTotals(response) {
    const typical = Number(response?.typicalWeightGrams);
    if (Number.isFinite(typical) && typical > 0) return typical;

    const exact = Number(response?.weightGrams);
    if (Number.isFinite(exact) && exact > 0) return exact;

    const min = Number(response?.minWeightGrams);
    const max = Number(response?.maxWeightGrams);
    if (Number.isFinite(min) && min > 0 && Number.isFinite(max) && max > 0) {
      return (min + max) / 2;
    }

    if (Number.isFinite(min) && min > 0) return min;
    if (Number.isFinite(max) && max > 0) return max;
    return 0;
  }

  function formatTotalWeight(weightGrams) {
    const value = Number(weightGrams);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value >= 1000) {
      const kg = value / 1000;
      return `${kg >= 10 ? kg.toFixed(1) : kg.toFixed(2)} kg`;
    }
    return `${Math.round(value)} g`;
  }

  function formatWeightDebug(debug) {
    if (!debug || typeof debug !== 'object') return '';

    const parts = [];
    if (debug.stage) parts.push(`stage=${debug.stage}`);
    if (debug.attempt) parts.push(`try=${debug.attempt}`);
    if (debug.attempts) parts.push(`tries=${debug.attempts}`);
    if (Number.isFinite(debug.directNodeCount)) parts.push(`direct=${debug.directNodeCount}`);
    if (Array.isArray(debug.parsedWeights) && debug.parsedWeights.length) {
      parts.push(`weights=${debug.parsedWeights.join(',')}`);
    }

    return parts.join(' | ');
  }

  function setWeightDisplayState(container, state, text, subtitle = '') {
    if (!container) return;

    const valueNode = container.querySelector('.litbuy-weight-value');
    const subtitleNode = container.querySelector('.litbuy-weight-subtitle');
    if (!valueNode) return;

    container.dataset.weightState = state;
    valueNode.textContent = text;
    valueNode.classList.toggle('is-muted', state !== 'loaded');

    if (subtitleNode) {
      subtitleNode.textContent = subtitle;
      subtitleNode.style.display = subtitle ? '' : 'none';
    }
  }

  function setMetricDisplayState(container, state, text, subtitle = '') {
    setWeightDisplayState(container, state, text, subtitle);
  }

  function ensureProductAddonPanel() {
    injectItemWeightStyles();

    const buttonArea = findButtonArea();
    const titleBar = document.querySelector('.good-info .title-sty') ||
      buttonArea?.container?.closest('.title-sty') ||
      buttonArea?.container?.parentElement ||
      null;
    const host = titleBar?.closest('.good-info') || titleBar?.parentElement || null;
    if (!titleBar || !host) return null;

    const titleBlock = Array.from(host.children || []).find((child) =>
      child !== titleBar &&
      child.id !== PRODUCT_PANEL_ID &&
      child.classList?.contains('title')
    ) || null;

    let panel = document.getElementById(PRODUCT_PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PRODUCT_PANEL_ID;
    }

    const desiredNextSibling = titleBlock || titleBar.nextSibling;
    if (panel.parentElement !== host || panel.nextElementSibling !== titleBlock || panel.previousElementSibling !== titleBar) {
      host.insertBefore(panel, desiredNextSibling);
    }

    let actionsRow = panel.querySelector(`#${PRODUCT_ACTIONS_ROW_ID}`);
    if (!actionsRow) {
      actionsRow = document.createElement('div');
      actionsRow.id = PRODUCT_ACTIONS_ROW_ID;
      panel.appendChild(actionsRow);
    }

    let metricsRow = panel.querySelector(`#${PRODUCT_METRICS_ROW_ID}`);
    if (!metricsRow) {
      metricsRow = document.createElement('div');
      metricsRow.id = PRODUCT_METRICS_ROW_ID;
      panel.appendChild(metricsRow);
    }

    return { panel, actionsRow, metricsRow, titleBar, titleBlock, host, buttonArea };
  }

  function ensureProductWeightCard() {
    const addonPanel = ensureProductAddonPanel();
    let card = document.getElementById(PRODUCT_WEIGHT_ID);
    const metricsRow = addonPanel?.metricsRow || null;
    if (!metricsRow) return null;

    if (!card) {
      card = document.createElement('div');
      card.id = PRODUCT_WEIGHT_ID;
      card.innerHTML = `
        <div class="litbuy-weight-copy">
          <div class="litbuy-weight-label-row">
            <div class="litbuy-weight-label">Item Weight</div>
            <div class="litbuy-weight-info">i
              <div class="litbuy-weight-tooltip">Typical weight is based on the main cluster of recent QC weights, so common variants matter more than rare outliers.</div>
            </div>
          </div>
          <div class="litbuy-weight-subtitle"></div>
          <div class="litbuy-weight-progress"><span></span></div>
        </div>
        <div class="litbuy-weight-value is-muted">Checking...</div>
      `;
    }

    if (card.parentElement !== metricsRow) {
      metricsRow.appendChild(card);
    }

    return card;
  }

  function ensureProductShippingCard() {
    const addonPanel = ensureProductAddonPanel();
    let card = document.getElementById(PRODUCT_SHIPPING_ID);
    const metricsRow = addonPanel?.metricsRow || null;
    if (!metricsRow) return null;

    if (!card) {
      card = document.createElement('div');
      card.id = PRODUCT_SHIPPING_ID;
      card.innerHTML = `
        <div class="litbuy-weight-copy">
          <div class="litbuy-weight-label-row">
            <div class="litbuy-weight-label">Shipping Estimate</div>
            <div class="litbuy-weight-info">i
              <div class="litbuy-weight-tooltip">Raw Netherlands variable shipping estimate for this single item only. LitBuy base or minimum fees are not included here and can be added later in cart-level calculation.</div>
            </div>
          </div>
          <div class="litbuy-weight-subtitle">Netherlands · raw only</div>
          <div class="litbuy-weight-progress"><span></span></div>
        </div>
        <div class="litbuy-weight-value is-muted">Waiting...</div>
      `;
    }

    if (card.parentElement !== metricsRow) {
      metricsRow.appendChild(card);
    }

    return card;
  }

  function normalizeShippingCardSubtitle(card) {
    const subtitleNode = card?.querySelector('.litbuy-weight-subtitle');
    if (subtitleNode) {
      subtitleNode.textContent = 'Netherlands | raw only';
    }
  }

  function removeWeightDisplays() {
    const card = document.getElementById(PRODUCT_WEIGHT_ID);
    if (card) card.remove();
    const shippingCard = document.getElementById(PRODUCT_SHIPPING_ID);
    if (shippingCard) shippingCard.remove();
    removeProductPriceSummary();
    document.querySelectorAll(`.${CART_WEIGHT_CLASS}`).forEach((el) => el.remove());
    const cartTotal = document.getElementById(CART_TOTAL_WEIGHT_ID);
    if (cartTotal) cartTotal.remove();
    productWeightState.lookupKey = '';
    productWeightState.status = 'idle';
    productWeightState.requestId = '';
  }

  async function lookupProductWeight(productInfo, options = {}) {
    const sourceUrl = buildSourceUrl(productInfo?.id, productInfo?.channel, productInfo?.channelRaw);
    const lookupKey = getWeightLookupKey(productInfo);

    if (!lookupKey || !sourceUrl) {
      return { success: false, error: 'Unsupported product URL for weight lookup' };
    }

    if (pendingWeightLookups.has(lookupKey) && !options.forceRefresh) {
      return pendingWeightLookups.get(lookupKey);
    }

    const lookupPromise = Promise.race([
      new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'fetchProductWeight',
          id: productInfo.id,
          channel: productInfo.channel,
          channelRaw: productInfo.channelRaw,
          sourceUrl,
          productName: options.productName || '',
          forceRefresh: Boolean(options.forceRefresh),
          requestId: options.requestId || ''
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message || 'Weight lookup failed' });
            return;
          }
          resolve(response || { success: false, error: 'No weight response received' });
        });
      }),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: false, error: 'Weight lookup timed out' });
        }, 20000);
      })
    ]);

    pendingWeightLookups.set(lookupKey, lookupPromise);

    try {
      return await lookupPromise;
    } finally {
      pendingWeightLookups.delete(lookupKey);
    }
  }

  async function renderProductWeight(forceRefresh = false) {
    if (!isLitbuyProductPage() || !isProductWeightLookupEnabled()) {
      document.getElementById(PRODUCT_WEIGHT_ID)?.remove();
      document.getElementById(PRODUCT_SHIPPING_ID)?.remove();
      refreshStandaloneProductPriceSummary();
      productWeightState.lookupKey = '';
      productWeightState.status = 'idle';
      productWeightState.requestId = '';
      return false;
    }

    const productInfo = getCurrentProductInfo();
    if (!productInfo.id) {
      refreshStandaloneProductPriceSummary();
      return false;
    }

    const weightCard = currentSettings.itemWeightProductEnabled ? ensureProductWeightCard() : null;
    const shippingCard = currentSettings.productShippingEnabled ? ensureProductShippingCard() : null;
    if (!currentSettings.itemWeightProductEnabled) {
      document.getElementById(PRODUCT_WEIGHT_ID)?.remove();
    }
    if (!currentSettings.productShippingEnabled) {
      document.getElementById(PRODUCT_SHIPPING_ID)?.remove();
    }
    if (!weightCard && !shippingCard) {
      refreshStandaloneProductPriceSummary();
      return false;
    }
    if (shippingCard) {
      normalizeShippingCardSubtitle(shippingCard);
    }

    const lookupKey = getWeightLookupKey(productInfo);
    if (!lookupKey) {
      refreshStandaloneProductPriceSummary();
      return false;
    }

    if (
      !forceRefresh &&
      (!weightCard || (weightCard.dataset.weightKey === lookupKey && weightCard.dataset.weightState === 'loaded')) &&
      (!shippingCard || (shippingCard.dataset.weightKey === lookupKey && shippingCard.dataset.weightState === 'loaded'))
    ) {
      refreshStandaloneProductPriceSummary();
      return true;
    }

    if (!forceRefresh && productWeightState.lookupKey === lookupKey && productWeightState.status === 'loading') {
      return false;
    }

    const requestId = `product:${lookupKey}:${++weightRequestSequence}`;
    if (weightCard) {
      weightCard.dataset.weightKey = lookupKey;
      weightCard.dataset.weightRequestId = requestId;
      setWeightDisplayState(weightCard, 'loading', 'Opening UUFinds...', '');
    }
    if (shippingCard) {
      shippingCard.dataset.weightKey = lookupKey;
      shippingCard.dataset.weightRequestId = requestId;
      shippingCard.dataset.shippingEstimateEur = '';
      setMetricDisplayState(shippingCard, 'loading', 'Estimating...', 'Netherlands | raw only');
      normalizeShippingCardSubtitle(shippingCard);
    }

    productWeightState.lookupKey = lookupKey;
    productWeightState.status = 'loading';
    productWeightState.requestId = requestId;
    refreshStandaloneProductPriceSummary();

    const productTitle = (document.querySelector('h1[data-v-7b82a5f4]') || document.querySelector('h1'))?.textContent?.trim() || '';
    const renderToken = ++productWeightRenderToken;
    const response = await lookupProductWeight(productInfo, {
      forceRefresh,
      productName: productTitle,
      requestId
    });
    if (response?.debug) {
      console.warn('[LitbuyTools][WeightDebug]', response.debug);
    }

    if (
      renderToken !== productWeightRenderToken ||
      (weightCard && (weightCard.dataset.weightKey !== lookupKey || weightCard.dataset.weightRequestId !== requestId)) ||
      (shippingCard && (shippingCard.dataset.weightKey !== lookupKey || shippingCard.dataset.weightRequestId !== requestId)) ||
      productWeightState.requestId !== requestId
    ) {
      return false;
    }

    if (response?.success && (response.weightGrams || response.minWeightGrams || response.maxWeightGrams || response.noWeight)) {
      productWeightState.status = 'loaded';
      const estimatedWeight = getWeightNumberForTotals(response);
      const shippingEstimate = estimateNetherlandsShipping(estimatedWeight);

      if (weightCard) {
        setWeightDisplayState(
          weightCard,
          'loaded',
          formatWeightDisplay(response),
          formatWeightRangeSubtitle(response)
        );
      }

      if (shippingCard && shippingEstimate?.estimateEur) {
        setMetricDisplayState(
          shippingCard,
          'loaded',
          formatEuroSuffix(shippingEstimate.estimateEur),
          'Netherlands | raw only'
        );
        shippingCard.dataset.shippingEstimateEur = String(shippingEstimate.estimateEur);
        normalizeShippingCardSubtitle(shippingCard);
      } else if (shippingCard) {
        setMetricDisplayState(
          shippingCard,
          'error',
          'No estimate',
          'Netherlands | raw only'
        );
        shippingCard.dataset.shippingEstimateEur = '';
        normalizeShippingCardSubtitle(shippingCard);
      }

      renderProductPriceSummary(currentSettings.productShippingEnabled ? shippingEstimate?.estimateEur : null);
      return true;
    }

    productWeightState.status = 'error';
    if (weightCard) {
      setWeightDisplayState(weightCard, 'error', 'Weight unavailable', '');
    }
    if (shippingCard) {
      setMetricDisplayState(shippingCard, 'error', 'No estimate', 'Netherlands | raw only');
      shippingCard.dataset.shippingEstimateEur = '';
      normalizeShippingCardSubtitle(shippingCard);
    }
    refreshStandaloneProductPriceSummary();
    return false;

    /*
    if (!currentSettings.itemWeightEnabled || !currentSettings.itemWeightProductEnabled || !isLitbuyProductPage()) {
      const existingCard = document.getElementById(PRODUCT_WEIGHT_ID);
      if (existingCard) existingCard.remove();
      const existingShippingCard = document.getElementById(PRODUCT_SHIPPING_ID);
      if (existingShippingCard) existingShippingCard.remove();
      removeProductPriceSummary();
      productWeightState.lookupKey = '';
      productWeightState.status = 'idle';
      productWeightState.requestId = '';
      return false;
    }

    const productInfo = getCurrentProductInfo();
    if (!productInfo.id) return false;

    const weightCard = ensureProductWeightCard();
    const shippingCard = ensureProductShippingCard();
    if (!weightCard || !shippingCard) return false;
    normalizeShippingCardSubtitle(shippingCard);

    const lookupKey = getWeightLookupKey(productInfo);
    if (!lookupKey) return false;

    if (
      !forceRefresh &&
      weightCard.dataset.weightKey === lookupKey &&
      weightCard.dataset.weightState === 'loaded' &&
      shippingCard.dataset.weightKey === lookupKey &&
      shippingCard.dataset.weightState === 'loaded'
    ) {
      renderProductPriceSummary(getCurrentProductShippingEstimate());
      return true;
    }

    if (!forceRefresh && productWeightState.lookupKey === lookupKey && productWeightState.status === 'loading') {
      return false;
    }

    const requestId = `product:${lookupKey}:${++weightRequestSequence}`;
    weightCard.dataset.weightKey = lookupKey;
    weightCard.dataset.weightRequestId = requestId;
    shippingCard.dataset.weightKey = lookupKey;
    shippingCard.dataset.weightRequestId = requestId;
    productWeightState.lookupKey = lookupKey;
    productWeightState.status = 'loading';
    productWeightState.requestId = requestId;
    const productTitle = (document.querySelector('h1[data-v-7b82a5f4]') || document.querySelector('h1'))?.textContent?.trim() || '';
    setWeightDisplayState(weightCard, 'loading', 'Opening UUFinds...', '');
    shippingCard.dataset.shippingEstimateEur = '';
    renderProductPriceSummary(null);
    setMetricDisplayState(shippingCard, 'loading', 'Estimating...', 'Netherlands · raw only');

    normalizeShippingCardSubtitle(shippingCard);
    const renderToken = ++productWeightRenderToken;
    const response = await lookupProductWeight(productInfo, {
      forceRefresh,
      productName: productTitle,
      requestId
    });
    if (response?.debug) {
      console.warn('[LitbuyTools][WeightDebug]', response.debug);
    }

    if (
      renderToken !== productWeightRenderToken ||
      weightCard.dataset.weightKey !== lookupKey ||
      weightCard.dataset.weightRequestId !== requestId ||
      shippingCard.dataset.weightKey !== lookupKey ||
      shippingCard.dataset.weightRequestId !== requestId ||
      productWeightState.requestId !== requestId
    ) {
      return false;
    }

    if (response?.success && (response.weightGrams || response.minWeightGrams || response.maxWeightGrams || response.noWeight)) {
      productWeightState.status = 'loaded';
      const estimatedWeight = getWeightNumberForTotals(response);
      const shippingEstimate = estimateNetherlandsShipping(estimatedWeight);
      setWeightDisplayState(
        weightCard,
        'loaded',
        formatWeightDisplay(response),
        formatWeightRangeSubtitle(response)
      );
      if (shippingEstimate?.estimateEur) {
        setMetricDisplayState(
          shippingCard,
          'loaded',
          formatEuroSuffix(shippingEstimate.estimateEur),
          'Netherlands · raw only'
        );
        shippingCard.dataset.shippingEstimateEur = String(shippingEstimate.estimateEur);
        normalizeShippingCardSubtitle(shippingCard);
        renderProductPriceSummary(shippingEstimate.estimateEur);
      } else {
        setMetricDisplayState(
          shippingCard,
          'error',
          'No estimate',
          'Netherlands · raw only'
        );
        shippingCard.dataset.shippingEstimateEur = '';
        normalizeShippingCardSubtitle(shippingCard);
        renderProductPriceSummary(null);
      }
      return true;
    }

    productWeightState.status = 'error';
    setWeightDisplayState(
      weightCard,
      'error',
      'Weight unavailable',
      ''
    );
    setMetricDisplayState(
      shippingCard,
      'error',
      'No estimate',
      'Netherlands · raw only'
    );
    shippingCard.dataset.shippingEstimateEur = '';
    normalizeShippingCardSubtitle(shippingCard);
    renderProductPriceSummary(null);
    return false;
    */
  }

  function scheduleProductWeightRender(delay = 180, forceRefresh = false) {
    if (productWeightScanTimeout) {
      clearTimeout(productWeightScanTimeout);
    }

    productWeightScanTimeout = setTimeout(() => {
      renderProductWeight(forceRefresh);
    }, delay);
  }

  function getCartRows() {
    const explicitRows = Array.from(document.querySelectorAll('.table-content > .table-tr'));
    if (explicitRows.length) return explicitRows;

    return Array.from(document.querySelectorAll('.table-tr, .commodity-item, .commodity-box, .goods-item, .cart-item'));
  }

  function ensureCartTableStructure() {
    const headerRow = document.querySelector('.table-wrap .table-header .ivu-row');
    if (headerRow) {
      headerRow.classList.add('litbuy-cart-grid-row');
      let weightHeader = headerRow.querySelector(`.${CART_WEIGHT_HEADER_CLASS}`);
      if (!weightHeader) {
        weightHeader = document.createElement('div');
        weightHeader.className = `ivu-col ivu-col-span-2 ${CART_WEIGHT_HEADER_CLASS}`;
        weightHeader.innerHTML = `<div class="th">Weight</div>`;
      }

      const columns = Array.from(headerRow.children || []).filter((child) => child.classList?.contains('ivu-col'));
      const totalPriceColumn = columns[4];
      if (totalPriceColumn && weightHeader.parentElement !== headerRow) {
        totalPriceColumn.insertAdjacentElement('afterend', weightHeader);
      } else if (!weightHeader.parentElement) {
        headerRow.appendChild(weightHeader);
      }
    }

    getCartRows().forEach((rowWrap) => {
      const bodyRow = rowWrap.querySelector('.table-body > .ivu-row') || rowWrap.querySelector('.ivu-row');
      if (!bodyRow) return;
      bodyRow.classList.add('litbuy-cart-grid-row');

      let weightColumn = bodyRow.querySelector(`.${CART_WEIGHT_CELL_CLASS}`);
      if (!weightColumn) {
        weightColumn = document.createElement('div');
        weightColumn.className = `ivu-col ivu-col-span-2 ${CART_WEIGHT_CELL_CLASS}`;
        weightColumn.innerHTML = `<div class="td"></div>`;
      }

      const columns = Array.from(bodyRow.children || []).filter((child) => child.classList?.contains('ivu-col'));
      const totalPriceColumn = columns[4];
      if (totalPriceColumn && weightColumn.parentElement !== bodyRow) {
        totalPriceColumn.insertAdjacentElement('afterend', weightColumn);
      } else if (!weightColumn.parentElement) {
        bodyRow.appendChild(weightColumn);
      }
    });
  }

  function findCartItemContainer(anchor) {
    return anchor.closest('.table-tr, .commodity-item, .commodity-box, .goods-item, .cart-item, li, tr') || anchor.parentElement;
  }

  function findCartWeightHost(itemContainer, anchor) {
    if (!itemContainer) return anchor?.parentElement || null;

    const explicitWeightCell = itemContainer.querySelector(`.${CART_WEIGHT_CELL_CLASS} .td`);
    if (explicitWeightCell) return explicitWeightCell;

    return itemContainer.querySelector(
      '.commodity-right, .goods-info, .item-info, .commodity-name, [class*="commodity-right"], [class*="goods-info"], [class*="item-info"], [class*="title"]'
    ) || anchor?.parentElement || itemContainer;
  }

  function findCartPriceHost(itemContainer, anchor) {
    if (!itemContainer) return anchor?.parentElement || null;

    const row = itemContainer.querySelector?.('.table-body > .ivu-row') ||
      (itemContainer.matches?.('.ivu-row') ? itemContainer : itemContainer.querySelector?.('.ivu-row') || itemContainer.closest?.('.ivu-row'));
    if (row) {
      const columns = Array.from(row.children || []).filter((child) => child.classList?.contains('ivu-col'));
      const totalPriceColumn = columns[4];
      const totalPriceHost = totalPriceColumn?.querySelector('.td');
      if (totalPriceHost) return totalPriceHost;
    }

    const explicitPriceHost = itemContainer.querySelector(
      '.td, .price, .commodity-price, .goods-price, .item-price, .price-box, [class*="commodity-price"], [class*="goods-price"], [class*="item-price"], [class*="price-box"]'
    );
    if (explicitPriceHost) return explicitPriceHost;

    const nodes = Array.from(itemContainer.querySelectorAll('div, span, p, strong'));
    for (const node of nodes) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (/(cny|eur|usd|¥|\$|€)\s*\d/i.test(text) || /\d+(?:\.\d+)?\s*(cny|eur|usd|¥|€)/i.test(text)) {
        return node.parentElement || node;
      }
    }

    return findCartWeightHost(itemContainer, anchor);
  }

  function getCartItemTotalPrice(itemContainer) {
    if (!itemContainer) return 0;

    const row = itemContainer.querySelector?.('.table-body > .ivu-row') ||
      (itemContainer.matches?.('.ivu-row') ? itemContainer : itemContainer.querySelector?.('.ivu-row') || itemContainer.closest?.('.ivu-row'));

    if (row) {
      const columns = Array.from(row.children || []).filter((child) => child.classList?.contains('ivu-col'));
      const totalPriceColumn = columns[4];
      const totalText = (totalPriceColumn?.textContent || '').replace(/\s+/g, ' ').trim();
      const totalAmount = parseFooterEuroAmount(totalText);
      if (totalAmount > 0) return totalAmount;
    }

    const explicitTotalNode = Array.from(itemContainer.querySelectorAll('.td, div, span, strong')).find((node) => {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      return /^EUR\s*[0-9.,]+$/i.test(text) || /^[0-9.,]+\s*â‚¬$/i.test(text);
    });

    return explicitTotalNode ? parseFooterEuroAmount(explicitTotalNode.textContent || '') : 0;
  }

  function ensureCartWeightBadge(itemContainer, host, lookupKey) {
    injectItemWeightStyles();

    if (!itemContainer || !host || !lookupKey) return null;

    itemContainer.querySelectorAll(`.${CART_WEIGHT_CLASS}`).forEach((existing, index) => {
      if (index > 0) existing.remove();
    });

    let badge = itemContainer.querySelector(`.${CART_WEIGHT_CLASS}`);
    if (!badge) {
      badge = document.createElement('div');
      badge.className = CART_WEIGHT_CLASS;
      badge.innerHTML = `
        <span class="litbuy-weight-tag">Weight</span>
        <span class="litbuy-weight-value-text">Checking...</span>
      `;
    }

    badge.dataset.weightKey = lookupKey;

    if (badge.parentElement !== host) {
      host.appendChild(badge);
    }

    return badge;
  }

  function ensureCartTotalWeightBox(host, beforeNode = null) {
    injectItemWeightStyles();
    if (!host) return null;

    let box = document.getElementById(CART_TOTAL_WEIGHT_ID);
    if (!box) {
      box = document.createElement('div');
      box.id = CART_TOTAL_WEIGHT_ID;
      box.innerHTML = `
        <div class="litbuy-cart-total-weight-copy">
          <div class="litbuy-cart-total-weight-label">Weight</div>
          <div class="litbuy-cart-total-weight-subtitle">selected items</div>
        </div>
        <div class="litbuy-cart-total-weight-value">--</div>
      `;
    }

    if (box.parentElement !== host) {
      if (beforeNode && beforeNode.parentElement === host) {
        host.insertBefore(box, beforeNode);
      } else {
        host.appendChild(box);
      }
    }

    return box;
  }

  function findCartFooterPriceNode(host) {
    if (!host) return null;

    const candidates = Array.from(host.querySelectorAll('strong, b, span, div, p')).filter((node) => {
      if (node.id === CART_TOTAL_WEIGHT_ID) return false;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return false;
      if (/weight|checkout|selected|select all|delete selected/i.test(text)) return false;
      return /^(?:cny|eur|usd|Â¥|\$|â‚¬)\s*\d[\d.,]*$/i.test(text);
    });

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const textDelta = (a.textContent || '').trim().length - (b.textContent || '').trim().length;
      if (textDelta !== 0) return textDelta;
      return b.getBoundingClientRect().left - a.getBoundingClientRect().left;
    });

    return candidates[0];
  }

  function formatFooterCurrencyText(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    const eurMatch = normalized.match(/^EUR\s*([0-9.,]+)$/i);
    if (eurMatch) {
      return `${eurMatch[1]}€`;
    }
    return normalized;
  }

  function parseFooterEuroAmount(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    const eurMatch = normalized.match(/EUR\s*([0-9.,]+)/i) || normalized.match(/([0-9.,]+)\s*€/i);
    if (!eurMatch) return 0;
    const value = Number(String(eurMatch[1]).replace(/,/g, ''));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function estimateNetherlandsShippingWithBase(weightGrams) {
    const rawEstimate = estimateNetherlandsShipping(weightGrams);
    if (!rawEstimate?.estimateEur && rawEstimate?.estimateEur !== 0) return null;
    return {
      estimateGrams: rawEstimate.estimateGrams,
      estimateEur: Number((rawEstimate.estimateEur + 12).toFixed(2))
    };
  }

  function getNetherlandsBillableWeight(weightGrams) {
    const weight = Number(weightGrams);
    if (!Number.isFinite(weight) || weight <= 0) return 0;
    if (weight <= 500) return 500;
    if (weight <= 5000) return Math.ceil(weight / 250) * 250;
    if (weight <= 10000) return Math.ceil(weight / 500) * 500;
    return Math.ceil(weight / 1000) * 1000;
  }

  function ensureCartFooterSummary(host, beforeNode = null) {
    if (!host) return null;

    let panel = document.getElementById(CART_FOOTER_SUMMARY_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = CART_FOOTER_SUMMARY_ID;
      panel.innerHTML = `
        <div class="litbuy-cart-summary-ledger">
        <div class="litbuy-cart-summary-card" id="${CART_ITEMS_SUBTOTAL_ID}">
          <div class="litbuy-cart-summary-label">Items</div>
          <div class="litbuy-cart-summary-subtitle">items subtotal</div>
          <div class="litbuy-cart-summary-value">0.00€</div>
        </div>
        <div class="litbuy-cart-summary-card" id="${CART_TOTAL_WEIGHT_ID}">
          <div class="litbuy-cart-summary-label">Weight</div>
          <div class="litbuy-cart-summary-subtitle">billed --</div>
          <div class="litbuy-cart-summary-value">--</div>
        </div>
        <div class="litbuy-cart-summary-card is-accent" id="${CART_TOTAL_SHIPPING_ID}">
          <div class="litbuy-cart-summary-label">Shipping</div>
          <div class="litbuy-cart-summary-subtitle">Netherlands incl. base</div>
          <div class="litbuy-cart-summary-value">--</div>
        </div>
        </div>
        <div class="litbuy-cart-summary-card is-total" id="${CART_TOTAL_WITH_SHIPPING_ID}">
          <div class="litbuy-cart-summary-label">Total</div>
          <div class="litbuy-cart-summary-subtitle">estimated total</div>
          <div class="litbuy-cart-summary-value">0.00€</div>
        </div>
      `;
    }

    panel.innerHTML = `
      <div class="litbuy-cart-summary-ledger">
        <div class="litbuy-cart-summary-line" id="${CART_TOTAL_WEIGHT_ID}">
          <div class="litbuy-cart-summary-line-copy">
            <div class="litbuy-cart-summary-line-label">Weight</div>
            <div class="litbuy-cart-summary-subtitle">raw selected load</div>
          </div>
          <div class="litbuy-cart-summary-line-value">--</div>
        </div>
        <div class="litbuy-cart-summary-line is-shipping" id="${CART_TOTAL_SHIPPING_ID}">
          <div class="litbuy-cart-summary-line-copy">
            <div class="litbuy-cart-summary-line-label-row">
              <div class="litbuy-cart-summary-line-label">Shipping</div>
              <div class="litbuy-cart-summary-info">i
                <div class="litbuy-cart-summary-tooltip">
                  <div class="litbuy-cart-shipping-tooltip-body">Raw: --\nBase: --\nWith base: --</div>
                  <div class="litbuy-cart-shipping-tooltip-note">Estimate only, not LitBuy's exact live quote.\nBuilt from our pricing model and may be slightly off.\nModel last updated on 3/15/2026.</div>
                </div>
              </div>
            </div>
            <div class="litbuy-cart-summary-subtitle">with base --</div>
          </div>
          <div class="litbuy-cart-summary-line-value">--</div>
        </div>
      </div>
      <div class="litbuy-cart-summary-prices">
        <div class="litbuy-cart-summary-combo">
        <div class="litbuy-cart-summary-card" id="${CART_ITEMS_SUBTOTAL_ID}">
          <div class="litbuy-cart-summary-label">Items</div>
          <div class="litbuy-cart-summary-subtitle">selected subtotal</div>
          <div class="litbuy-cart-summary-value">0.00€</div>
        </div>
        <div class="litbuy-cart-summary-card" id="${CART_TOTAL_WITH_SHIPPING_ID}">
          <div class="litbuy-cart-summary-label">Total</div>
          <div class="litbuy-cart-summary-subtitle">items + shipping</div>
          <div class="litbuy-cart-summary-value">0.00€</div>
        </div>
        </div>
      </div>
    `;

    if (panel.parentElement !== host) {
      if (beforeNode && beforeNode.parentElement === host) {
        host.insertBefore(panel, beforeNode);
      } else {
        host.appendChild(panel);
      }
    }

    return panel;
  }

  function enhanceCartFooterLayout(host, beforeNode = null) {
    if (!host) return null;

    host.classList.add('litbuy-cart-footer-enhanced');

    const checkoutNode = beforeNode || Array.from(host.querySelectorAll('button, a, div, span')).find((node) => {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      return /^checkout$/i.test(text) || /checkout/i.test(text);
    });

    if (checkoutNode) {
      checkoutNode.classList.add('litbuy-cart-checkout-anchor');
    }

    const totalPriceNode = findCartFooterPriceNode(host);
    if (totalPriceNode) {
      totalPriceNode.classList.add('litbuy-cart-total-price-box');
      totalPriceNode.dataset.litbuyDisplayPrice = formatFooterCurrencyText(totalPriceNode.textContent);
    }

    return { checkoutNode, totalPriceNode };
  }

  function setCartWeightBadgeState(badge, state, text) {
    if (!badge) return;
    badge.dataset.weightState = state;
    const textNode = badge.querySelector('.litbuy-weight-value-text');
    if (textNode) {
      textNode.textContent = text;
    }
  }

  async function hydrateCartWeight(anchor, itemContainerOverride = null) {
    const productInfo = getProductInfoFromUrl(anchor?.href);
    if (!productInfo?.id) return;

    const itemContainer = itemContainerOverride || findCartItemContainer(anchor);
    const host = findCartWeightHost(itemContainer, anchor);
    const lookupKey = getWeightLookupKey(productInfo);
    const badge = ensureCartWeightBadge(itemContainer, host, lookupKey);
    if (!badge) return;
    const requestId = `cart:${lookupKey}:${++weightRequestSequence}`;
    badge.dataset.weightRequestId = requestId;

    if (badge.dataset.weightState === 'loaded' && badge.dataset.weightKey === lookupKey) {
      return;
    }

    setCartWeightBadgeState(badge, 'loading', 'Opening...');

    const fallbackName = (anchor?.textContent || host?.textContent || '').replace(/\s+/g, ' ').trim();
    const response = await lookupProductWeight(productInfo, {
      productName: fallbackName,
      requestId
    });
    if (response?.debug) {
      console.warn('[LitbuyTools][CartWeightDebug]', response.debug);
    }
    if (!badge.isConnected || badge.dataset.weightKey !== lookupKey || badge.dataset.weightRequestId !== requestId) {
      return;
    }

    if (response?.success && (response.weightGrams || response.minWeightGrams || response.maxWeightGrams || response.noWeight)) {
      const numericWeight = getWeightNumberForTotals(response);
      badge.dataset.weightTypical = numericWeight > 0 ? String(numericWeight) : '';
      badge.dataset.weightLoaded = response?.noWeight ? '0' : '1';
      setCartWeightBadgeState(badge, 'loaded', formatWeightDisplay(response));
      scheduleCartTotalWeightUpdate(80);
      return;
    }

    badge.dataset.weightTypical = '';
    badge.dataset.weightLoaded = '0';
    setCartWeightBadgeState(badge, 'error', 'Unavailable');
    scheduleCartTotalWeightUpdate(80);
  }

  function scanCartWeights() {
    if (!isCartWeightLookupEnabled() || !isLitbuyCartPage()) {
      document.querySelectorAll(`.${CART_WEIGHT_CLASS}`).forEach((el) => el.remove());
      document.querySelectorAll(`.${CART_WEIGHT_HEADER_CLASS}, .${CART_WEIGHT_CELL_CLASS}`).forEach((el) => el.remove());
      const existingTotal = document.getElementById(CART_TOTAL_WEIGHT_ID);
      if (existingTotal) existingTotal.remove();
      const existingSummary = document.getElementById(CART_FOOTER_SUMMARY_ID);
      if (existingSummary) existingSummary.remove();
      return;
    }

    ensureCartTableStructure();

    const rows = getCartRows();
    const activeRows = new Set(rows);

    document.querySelectorAll(`.${CART_WEIGHT_CLASS}`).forEach((badge) => {
      const row = badge.closest('.table-tr, .commodity-item, .commodity-box, .goods-item, .cart-item');
      if (!row || !activeRows.has(row)) {
        badge.remove();
      }
    });

    rows.forEach((row) => {
      const anchor = row.querySelector('.commodity-content a[href*="/goods/details"], .commodity-content a[href*="/products/details"], a[href*="/goods/details"], a[href*="/products/details"], a[href*="/products/"], a[href*="/product/"]');
      if (!anchor) return;
      const productInfo = getProductInfoFromUrl(anchor.href);
      if (!productInfo?.id) return;
      hydrateCartWeight(anchor, row);
    });

    scheduleCartTotalWeightUpdate(220);
  }

  function scheduleCartWeightScan(delay = 120) {
    if (itemWeightScanTimeout) {
      clearTimeout(itemWeightScanTimeout);
    }

    itemWeightScanTimeout = setTimeout(() => {
      scanCartWeights();
    }, delay);
  }

  function getCartItemQuantity(itemContainer) {
    if (!itemContainer) return 1;

    const qtyInput = itemContainer.querySelector('input[type="number"], .nut-inputnumber input, [class*="input-number"] input');
    const qtyValue = Number(qtyInput?.value);
    if (Number.isFinite(qtyValue) && qtyValue > 0) {
      return Math.max(1, Math.round(qtyValue));
    }

    const nodes = Array.from(itemContainer.querySelectorAll('input, span, div, p'));
    for (const node of nodes) {
      const text = (node.value || node.textContent || '').trim();
      if (!text) continue;
      if (/^x?\d+$/.test(text)) {
        const qty = Number(text.replace(/^x/i, ''));
        if (Number.isFinite(qty) && qty > 0) return qty;
      }
    }

    return 1;
  }

  function isCartItemSelected(itemContainer) {
    if (!itemContainer) return false;

    const hasSelectionControl = itemContainer.querySelector('input[type="checkbox"], input[type="radio"], [role="checkbox"], [aria-checked], [class*="checkbox"]');

    const checkedInput = itemContainer.querySelector('input[type="checkbox"]:checked, input[type="radio"]:checked');
    if (checkedInput) return true;

    const checkedWrapper = itemContainer.querySelector('.ivu-checkbox-checked, .ivu-radio-checked');
    if (checkedWrapper) return true;

    const checkedRole = itemContainer.querySelector('[role="checkbox"][aria-checked="true"], [aria-checked="true"]');
    if (checkedRole) return true;

    const checkedClassNode = itemContainer.querySelector('.is-checked, .checked, .active, [class*="checked"]');
    if (checkedClassNode) {
      const text = (checkedClassNode.className || '').toLowerCase();
      if (text.includes('checked') || text.includes('active')) return true;
    }

    return !hasSelectionControl;
  }

  function findCartTotalHost() {
    const checkoutNode = Array.from(document.querySelectorAll('button, a, div, span')).find((node) => {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      return /^checkout$/i.test(text) || /checkout/i.test(text);
    });

    if (checkoutNode) {
      let cursor = checkoutNode.parentElement;
      while (cursor && cursor !== document.body) {
        const text = (cursor.textContent || '').replace(/\s+/g, ' ').trim();
        const hasPrice = /(cny|eur|usd|Â¥|\$|â‚¬)\s*\d/i.test(text) || /\d+(?:\.\d+)?\s*(cny|eur|usd|Â¥|â‚¬)/i.test(text);
        const hasCartCue = /select all|selected|checkout/i.test(text);
        if (hasPrice && hasCartCue) {
          return { host: checkoutNode.parentElement || cursor, beforeNode: checkoutNode };
        }
        cursor = cursor.parentElement;
      }
    }

    const explicitHost = document.querySelector(
      '.settlement, .cart-footer, .shopping-footer, .submit-bar, .total-box, .shopping-cart-footer, [class*="settlement"], [class*="cart-footer"], [class*="shopping-footer"], [class*="submit-bar"], [class*="checkout"], [class*="total-box"], [class*="shopping-cart-footer"], [class*="bottom-bar"], [class*="order-footer"]'
    );
    if (explicitHost) return { host: explicitHost, beforeNode: null };

    const footerCandidates = Array.from(document.querySelectorAll('div, section, aside, footer')).filter((node) => {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return false;
      const hasPrice = /(cny|eur|usd|¥|\$|€)\s*\d/i.test(text) || /\d+(?:\.\d+)?\s*(cny|eur|usd|¥|€)/i.test(text);
      const hasCheckoutCue = /select all|checkout|submit|total/i.test(text);
      return hasPrice && hasCheckoutCue;
    });
    if (footerCandidates.length) {
      footerCandidates.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
      return { host: footerCandidates[0], beforeNode: null };
    }

    const nodes = Array.from(document.querySelectorAll('div, section, aside, footer'));
    for (const node of nodes) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (!/(cny|eur|usd|¥|\$|€)\s*\d/i.test(text) && !/\d+(?:\.\d+)?\s*(cny|eur|usd|¥|€)/i.test(text)) {
        continue;
      }
      const style = window.getComputedStyle(node);
      if (style.position === 'fixed' || style.position === 'sticky') {
        return { host: node, beforeNode: null };
      }
    }

    return null;
  }

  function updateCartTotalWeight() {
    if (!currentSettings.cartSummaryEnabled || !isLitbuyCartPage()) {
      const existing = document.getElementById(CART_TOTAL_WEIGHT_ID);
      if (existing) existing.remove();
      const existingSummary = document.getElementById(CART_FOOTER_SUMMARY_ID);
      if (existingSummary) existingSummary.remove();
      return;
    }

    const mount = findCartTotalHost();
    if (!mount?.host) return;
    const footerLayout = enhanceCartFooterLayout(mount.host, mount.beforeNode || null);
    const summaryPanel = ensureCartFooterSummary(mount.host, mount.beforeNode || null);
    if (!summaryPanel) return;

    let totalWeight = 0;
    let selectedCount = 0;
    let subtotalAmount = 0;
    const rows = getCartRows();
    for (const row of rows) {
      if (!isCartItemSelected(row)) continue;
      const qty = getCartItemQuantity(row);
      selectedCount += qty;
      subtotalAmount += getCartItemTotalPrice(row);
      const badge = row.querySelector(`.${CART_WEIGHT_CLASS}[data-weight-loaded="1"]`);
      const itemWeight = Number(badge?.dataset.weightTypical || 0);
      if (Number.isFinite(itemWeight) && itemWeight > 0) {
        totalWeight += itemWeight * qty;
      }
    }

    const subtotalCard = summaryPanel.querySelector(`#${CART_ITEMS_SUBTOTAL_ID} .litbuy-cart-summary-value`);
    const subtotalSubtitle = summaryPanel.querySelector(`#${CART_ITEMS_SUBTOTAL_ID} .litbuy-cart-summary-subtitle`);
    const weightValueNode = summaryPanel.querySelector(`#${CART_TOTAL_WEIGHT_ID} .litbuy-cart-summary-line-value`);
    const weightSubtitleNode = summaryPanel.querySelector(`#${CART_TOTAL_WEIGHT_ID} .litbuy-cart-summary-subtitle`);
    const shippingValueNode = summaryPanel.querySelector(`#${CART_TOTAL_SHIPPING_ID} .litbuy-cart-summary-line-value`);
    const shippingSubtitleNode = summaryPanel.querySelector(`#${CART_TOTAL_SHIPPING_ID} .litbuy-cart-summary-subtitle`);
    const shippingTooltipBodyNode = summaryPanel.querySelector(`#${CART_TOTAL_SHIPPING_ID} .litbuy-cart-shipping-tooltip-body`);
    const totalValueNode = summaryPanel.querySelector(`#${CART_TOTAL_WITH_SHIPPING_ID} .litbuy-cart-summary-value`);
    const totalSubtitleNode = summaryPanel.querySelector(`#${CART_TOTAL_WITH_SHIPPING_ID} .litbuy-cart-summary-subtitle`);
    if (!subtotalCard || !subtotalSubtitle || !weightValueNode || !weightSubtitleNode || !shippingValueNode || !shippingSubtitleNode || !shippingTooltipBodyNode || !totalValueNode || !totalSubtitleNode) return;

    if (!(subtotalAmount > 0)) {
      subtotalAmount = parseFooterEuroAmount(footerLayout?.totalPriceNode?.textContent || '');
    }

    if (selectedCount <= 0 || totalWeight <= 0) {
      subtotalCard.textContent = formatEuroSuffix(subtotalAmount) || '0.00€';
      subtotalSubtitle.textContent = 'selected subtotal';
      weightValueNode.textContent = '--';
      weightSubtitleNode.textContent = 'raw selected load';
      shippingValueNode.textContent = '--';
      shippingSubtitleNode.innerHTML = 'without base <span class="litbuy-cart-summary-subtitle-strong">--</span>';
      shippingTooltipBodyNode.textContent = 'Raw: --\nBase: --\nWith base: --';
      totalValueNode.textContent = formatEuroSuffix(subtotalAmount) || '0.00€';
      totalSubtitleNode.textContent = 'items + shipping';
      summaryPanel.style.opacity = '0.78';
      return;
    }

    const rawShippingEstimate = estimateNetherlandsShipping(totalWeight);
    const rawShippingAmount = Number(rawShippingEstimate?.estimateEur || 0);
    const shippingEstimate = estimateNetherlandsShippingWithBase(totalWeight);
    const shippingAmount = Number(shippingEstimate?.estimateEur || 0);
    const baseAmount = Math.max(0, shippingAmount - rawShippingAmount);
    const combinedAmount = subtotalAmount + shippingAmount;

    subtotalCard.textContent = formatEuroSuffix(subtotalAmount) || '0.00€';
    subtotalSubtitle.textContent = `${selectedCount} selected`;
    weightValueNode.textContent = formatTotalWeight(totalWeight) || '--';
    weightSubtitleNode.textContent = 'raw selected load';
    shippingValueNode.textContent = formatEuroSuffix(shippingAmount) || '--';
    shippingSubtitleNode.innerHTML = `without base <span class="litbuy-cart-summary-subtitle-strong">${formatEuroSuffix(rawShippingAmount) || '--'}</span>`;
    shippingTooltipBodyNode.textContent = `Raw: ${formatEuroSuffix(rawShippingAmount) || '--'}\nBase: ${formatEuroSuffix(baseAmount) || '--'}\nWith base: ${formatEuroSuffix(shippingAmount) || '--'}`;
    totalValueNode.textContent = formatEuroSuffix(combinedAmount) || formatEuroSuffix(subtotalAmount) || '0.00€';
    totalSubtitleNode.textContent = 'items + shipping';
    summaryPanel.style.opacity = '1';
  }

  function scheduleCartTotalWeightUpdate(delay = 120) {
    if (cartTotalWeightTimeout) {
      clearTimeout(cartTotalWeightTimeout);
    }

    cartTotalWeightTimeout = setTimeout(() => {
      updateCartTotalWeight();
    }, delay);
  }

  function confirmCartAction(message) {
    if (!currentSettings.deleteConfirmationsEnabled) return true;
    return window.confirm(message);
  }

  function watchItemWeights() {
    if (itemWeightObserver) {
      itemWeightObserver.disconnect();
      itemWeightObserver = null;
    }

    if (!isAnyWeightLookupEnabled()) {
      removeWeightDisplays();
      refreshStandaloneProductPriceSummary();
      return;
    }

    injectItemWeightStyles();
    scheduleProductWeightRender(500);
    scheduleCartWeightScan(0);

    itemWeightObserver = new MutationObserver(() => {
      if (isProductWeightLookupEnabled() && isLitbuyProductPage()) {
        scheduleProductWeightRender(250);
      }

      if (isCartWeightLookupEnabled() && isLitbuyCartPage()) {
        scheduleCartWeightScan();
        scheduleCartTotalWeightUpdate(200);
      }
    });

    itemWeightObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener('change', () => {
    if (isLitbuyProductPage()) {
      scheduleProductWeightRender(90);
    }

    if (isLitbuyCartPage()) {
      scheduleCartTotalWeightUpdate(80);
    }
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (isLitbuyCartPage() && target instanceof Element) {
      const deleteSelectedTrigger = target.closest('.all-select-footer .tag');
      const rowDeleteTrigger = target.closest('.table-content .ivu-row.litbuy-cart-grid-row > .ivu-col:nth-child(8) .td .btn');
      const deleteTrigger = deleteSelectedTrigger || rowDeleteTrigger;
      if (deleteTrigger) {
        if (deleteTrigger.dataset.litbuyConfirmBypass === '1') {
          deleteTrigger.dataset.litbuyConfirmBypass = '0';
        } else {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const message = deleteSelectedTrigger
            ? 'Are you sure you want to delete the selected items?'
            : 'Are you sure you want to delete this item?';
          if (confirmCartAction(message)) {
            deleteTrigger.dataset.litbuyConfirmBypass = '1';
            deleteTrigger.click();
          }
          return;
        }
      }
    }

    if (
      isLitbuyProductPage() &&
      target instanceof Element &&
      target.closest('.select-type, .comm-size, .size-list, .size-item, .goods-image, .goods-text, .type-item, .quantity-sty')
    ) {
      scheduleProductWeightRender(90);
    }

    if (isLitbuyCartPage()) {
      scheduleCartTotalWeightUpdate(120);
    }
  }, true);

  /**
   * The click handler - reads URL fresh each time
   */
  function onCheckQCClick() {
    if (qcLaunchInFlight) {
      return;
    }

    const { id, channel, channelRaw, url } = getCurrentProductInfo();
    console.log('[LitbuyTools] Click! URL:', url, 'ID:', id, 'Channel:', channel);
    
    const sourceUrl = buildSourceUrl(id, channel, channelRaw);
    if (!sourceUrl) {
      alert('Could not extract product info.\nURL: ' + url);
      return;
    }

    // Extract product name from h1 tag
    const h1Element = document.querySelector('h1[data-v-7b82a5f4]') || document.querySelector('h1');
    const productName = h1Element ? h1Element.textContent.trim() : '';
    console.log('[LitbuyTools] Product name:', productName);

    console.log('[LitbuyTools] Sending:', sourceUrl);
    qcLaunchInFlight = true;
    updateQCButtonState('launching');
    chrome.runtime.sendMessage({ 
      action: 'openQCCheck', 
      sourceUrl: sourceUrl,
      productName: productName
    }, (response) => {
      if (chrome.runtime.lastError) {
        qcLaunchInFlight = false;
        updateQCButtonState('error');
        console.error('[LitbuyTools] QC launch runtime error:', chrome.runtime.lastError);
        alert('QC launch failed:\n' + chrome.runtime.lastError.message);
        return;
      }

      if (!response?.success) {
        qcLaunchInFlight = false;
        updateQCButtonState('error');
        console.error('[LitbuyTools] QC launch failed:', response);
        alert('QC launch failed:\n' + (response?.error || 'Unknown background error'));
        return;
      }

      updateQCButtonState('opening');
      console.log('[LitbuyTools] QC launch started successfully');
    });
  }

  function updateQCButtonState(state, customLabel = '') {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;

    const label = button.querySelector('.litbuy-qc-label');
    if (!label) return;

    if (qcLaunchResetTimeout) {
      clearTimeout(qcLaunchResetTimeout);
      qcLaunchResetTimeout = null;
    }

    button.dataset.qcState = state;

    const labels = {
      idle: 'Check QC',
      launching: 'Starting QC...',
      opening: 'Opening UUFinds...',
      searching: 'Searching QC...',
      done: 'QC Ready',
      error: 'Retry QC'
    };

    const isBusy = state === 'launching';
    button.style.pointerEvents = isBusy ? 'none' : '';
    button.style.opacity = isBusy ? '0.7' : '';
    label.textContent = customLabel || labels[state] || labels.idle;
    qcLaunchInFlight = isBusy;

    if (isBusy) {
      return;
    }

    if (state === 'done') {
      qcLaunchResetTimeout = setTimeout(() => {
        qcLaunchInFlight = false;
        updateQCButtonState('idle');
      }, 700);
      return;
    }

    if (state === 'error') {
      qcLaunchResetTimeout = setTimeout(() => {
        qcLaunchInFlight = false;
        updateQCButtonState('idle');
      }, 1400);
      return;
    }
  }

  function updateProductWeightProgress(request) {
    const card = document.getElementById(PRODUCT_WEIGHT_ID);
    const shippingCard = document.getElementById(PRODUCT_SHIPPING_ID);
    if (!card && !shippingCard) return;

    const lookupKey = String(request?.lookupKey || '').trim();
    const requestId = String(request?.requestId || '').trim();
    if (lookupKey && card?.dataset.weightKey && card.dataset.weightKey !== lookupKey) {
      return;
    }
    if (requestId && card?.dataset.weightRequestId && card.dataset.weightRequestId !== requestId) {
      return;
    }

    if (card && card.dataset.weightState !== 'loading' && shippingCard?.dataset.weightState !== 'loading') {
      return;
    }

    const labels = {
      opening: 'Opening UUFinds...',
      searching: 'Searching QC...',
      reading: 'Reading weights...',
      error: 'Weight unavailable'
    };

    const nextText = String(request?.label || '').trim() || labels[request?.state] || 'Checking...';
    if (card) {
      setWeightDisplayState(card, request?.state === 'error' ? 'error' : 'loading', nextText, '');
    }
    if (shippingCard) {
      setMetricDisplayState(
        shippingCard,
        request?.state === 'error' ? 'error' : 'loading',
        request?.state === 'error' ? 'No estimate' : 'Estimating...',
        'Netherlands · single item'
      );
    }
  }

  function updateCartWeightProgress(request) {
    const lookupKey = String(request?.lookupKey || '').trim();
    const requestId = String(request?.requestId || '').trim();
    if (!lookupKey || !window.CSS?.escape) return;

    const badge = document.querySelector(`.${CART_WEIGHT_CLASS}[data-weight-key="${CSS.escape(lookupKey)}"]`);
    if (!badge || badge.dataset.weightState !== 'loading') {
      return;
    }
    if (requestId && badge.dataset.weightRequestId && badge.dataset.weightRequestId !== requestId) {
      return;
    }

    const labels = {
      opening: 'Opening...',
      searching: 'Searching...',
      reading: 'Reading...',
      error: 'Unavailable'
    };

    const nextText = String(request?.label || '').trim() || labels[request?.state] || 'Checking...';
    setCartWeightBadgeState(badge, request?.state === 'error' ? 'error' : 'loading', nextText);
  }

  function getCurrentSourceUrl() {
    const { id, channel, channelRaw } = getCurrentProductInfo();
    return buildSourceUrl(id, channel, channelRaw);
  }

  function maybePrewarmQcCache(delay = 900) {
    if (currentSettings.qcCacheMode !== 'pageOpen' || !isLitbuyProductPage()) {
      return;
    }

    const sourceUrl = getCurrentSourceUrl();
    const productTitle = (document.querySelector('h1[data-v-7b82a5f4]') || document.querySelector('h1'))?.textContent?.trim() || '';
    const cacheKey = `${sourceUrl}::${productTitle}`;
    if (!sourceUrl || !productTitle || qcPrewarmKey === cacheKey) {
      return;
    }

    qcPrewarmKey = cacheKey;
    window.setTimeout(() => {
      chrome.runtime.sendMessage({
        action: 'warmQcCache',
        sourceUrl,
        productName: productTitle
      }, () => {
        void chrome.runtime.lastError;
      });
    }, delay);
  }

  function scheduleProductLinkCollapse(control, delay = 3000) {
    if (productLinkCollapseTimeout) {
      clearTimeout(productLinkCollapseTimeout);
      productLinkCollapseTimeout = null;
    }

    productLinkCollapseTimeout = setTimeout(() => {
      if (!control?.isConnected) return;
      if (control.matches(':hover')) return;
      control.dataset.expanded = 'false';
    }, delay);
  }

  async function copyProductSourceUrl(sourceUrl, control) {
    if (!sourceUrl) return;

    try {
      await navigator.clipboard.writeText(sourceUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = sourceUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    control.dataset.expanded = 'false';
  }

  function openProductSourceUrl(sourceUrl, control) {
    if (!sourceUrl) return;
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
    control.dataset.expanded = 'false';
  }

  function createProductLinkControl(sourceUrl) {
    const control = document.createElement('div');
    control.id = PRODUCT_LINK_CONTROL_ID;
    control.dataset.expanded = 'false';
    control.setAttribute(PRODUCT_LINK_SOURCE_ATTR, sourceUrl || '');
    control.innerHTML = `
      <div class="litbuy-product-link-shell">
        <button type="button" class="litbuy-product-link-trigger" aria-expanded="false">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M10.59 13.41a1 1 0 0 1 0-1.41l2.41-2.41a3 3 0 1 1 4.24 4.24l-2.12 2.12a3 3 0 0 1-4.24 0 1 1 0 1 1 1.41-1.41 1 1 0 0 0 1.42 0l2.12-2.12a1 1 0 0 0-1.42-1.42l-2.41 2.41a1 1 0 0 1-1.41 0Z" fill="currentColor"></path>
            <path d="M13.41 10.59a1 1 0 0 1 0 1.41L11 14.41a3 3 0 0 1-4.24-4.24l2.12-2.12a3 3 0 0 1 4.24 0 1 1 0 1 1-1.41 1.41 1 1 0 0 0-1.42 0l-2.12 2.12a1 1 0 1 0 1.42 1.42l2.41-2.41a1 1 0 0 1 1.41 0Z" fill="currentColor"></path>
          </svg>
          <span class="litbuy-product-link-label">Product Link</span>
        </button>
        <div class="litbuy-product-link-actions">
          <button type="button" class="litbuy-product-link-action" data-action="open">Open</button>
          <button type="button" class="litbuy-product-link-action" data-action="copy">Copy</button>
        </div>
      </div>
    `;

    const trigger = control.querySelector('.litbuy-product-link-trigger');
    const actions = control.querySelectorAll('.litbuy-product-link-action');

    trigger?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isExpanded = control.dataset.expanded === 'true';
      control.dataset.expanded = isExpanded ? 'false' : 'true';
      trigger.setAttribute('aria-expanded', String(!isExpanded));
      if (!isExpanded) {
        scheduleProductLinkCollapse(control, 3000);
      }
    });

    actions.forEach((actionButton) => {
      actionButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const currentSourceUrl = control.getAttribute(PRODUCT_LINK_SOURCE_ATTR) || '';
        const action = actionButton.getAttribute('data-action');
        if (action === 'open') {
          openProductSourceUrl(currentSourceUrl, control);
          return;
        }
        if (action === 'copy') {
          await copyProductSourceUrl(currentSourceUrl, control);
        }
      });
    });

    control.addEventListener('mouseenter', () => {
      if (productLinkCollapseTimeout) {
        clearTimeout(productLinkCollapseTimeout);
        productLinkCollapseTimeout = null;
      }
    });

    control.addEventListener('mouseleave', () => {
      if (control.dataset.expanded === 'true') {
        scheduleProductLinkCollapse(control, 3000);
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (!control.isConnected || control.dataset.expanded !== 'true') return;
      if (control.contains(event.target)) return;
      control.dataset.expanded = 'false';
    });

    return control;
  }

  function getLegacyActionGroup(container, labelText) {
    if (!container) return null;
    const normalizedLabel = String(labelText || '').trim().toLowerCase();
    const directChildren = Array.from(container.children || []);

    for (const child of directChildren) {
      const text = (child.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.includes(normalizedLabel)) {
        return child;
      }
    }

    const descendants = Array.from(container.querySelectorAll('button, span, a, div'));
    for (const node of descendants) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text !== normalizedLabel) continue;

      let candidate = node;
      while (candidate && candidate.parentElement && candidate.parentElement !== container) {
        candidate = candidate.parentElement;
      }

      if (candidate && candidate !== container) {
        return candidate;
      }
    }

    return null;
  }

  function enhanceProductLinkControl() {
    if (!currentSettings.productLinkEnabled) {
      const existingControl = document.getElementById(PRODUCT_LINK_CONTROL_ID);
      if (existingControl) existingControl.remove();
      return false;
    }

    const sourceUrl = getCurrentSourceUrl();
    if (!sourceUrl || !isLitbuyProductPage()) return false;

    const addonPanel = ensureProductAddonPanel();
    const area = addonPanel?.buttonArea || findButtonArea();
    const actionHost = addonPanel?.actionsRow || null;
    if (!area?.container || !actionHost) return false;

    area.container.setAttribute('data-litbuy-qc-controls', 'true');

    const existingControl = document.getElementById(PRODUCT_LINK_CONTROL_ID);
    if (existingControl) {
      existingControl.setAttribute(PRODUCT_LINK_SOURCE_ATTR, sourceUrl);
      if (existingControl.parentElement !== actionHost) {
        actionHost.appendChild(existingControl);
      }
      const forceRefreshGroup = getLegacyActionGroup(area.container, 'force refresh');
      if (forceRefreshGroup) {
        forceRefreshGroup.style.display = 'none';
        forceRefreshGroup.dataset.litbuyHiddenAction = 'force-refresh';
      }
      if (area.container) {
        area.container.style.display = 'none';
        area.container.dataset.litbuyHiddenAction = 'legacy-actions';
      }
      return true;
    }

    const originalProductLinkGroup = getLegacyActionGroup(area.container, 'product link');
    if (!originalProductLinkGroup) return false;

    const forceRefreshGroup = getLegacyActionGroup(area.container, 'force refresh');
    if (forceRefreshGroup) {
      forceRefreshGroup.style.display = 'none';
      forceRefreshGroup.dataset.litbuyHiddenAction = 'force-refresh';
    }

    originalProductLinkGroup.style.display = 'none';
    originalProductLinkGroup.dataset.litbuyHiddenAction = 'product-link';
    const customControl = createProductLinkControl(sourceUrl);
    actionHost.appendChild(customControl);
    if (area.container) {
      area.container.style.display = 'none';
      area.container.dataset.litbuyHiddenAction = 'legacy-actions';
    }
    return true;
  }

  /**
   * Find the container that holds "Force refresh" and "Product Link"
   */
  function findButtonArea() {
    const controls = document.querySelectorAll('button, span, a');
    for (const control of controls) {
      const text = (control.textContent || '').trim().toLowerCase();
      if (text !== 'force refresh' && text !== 'product link') continue;

      let container = control.parentElement;
      for (let i = 0; i < 7; i++) {
        if (!container) break;
        const buttonLikeCount = container.querySelectorAll('button, span, a').length;
        if (buttonLikeCount >= 2) {
          return { container, refElement: container.children[0] || control, floating: false };
        }
        container = container.parentElement;
      }

      if (control.parentElement) {
        return { container: control.parentElement, refElement: control };
      }
    }

    return null;
  }

  /**
   * Create the Check QC button element (NOT cloned - built from scratch)
   */
  function createQCButton(refElement) {
    injectItemWeightStyles();

    // Create a wrapper span that matches the style of the reference
    const btn = document.createElement('span');
    btn.id = BUTTON_ID;

    // Copy all data-v-* attributes from the reference for Vue scoped CSS
    if (refElement) {
      for (const attr of refElement.attributes) {
        if (attr.name.startsWith('data-v-')) {
          btn.setAttribute(attr.name, attr.value);
        }
      }
    }

    btn.innerHTML = `
      <span class="litbuy-qc-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5C7 5 2.73 8.11 1 12.5 2.73 16.89 7 20 12 20s9.27-3.11 11-7.5C21.27 8.11 17 5 12 5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
        </svg>
      </span>
      <span class="litbuy-qc-label">Check QC</span>
      <span class="litbuy-qc-busy-dot"></span>
    `;

    // SIMPLE onclick - no cloning, no Vue interference
    btn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      onCheckQCClick();
    };

    return btn;
  }

  /**
   * Inject the button
   */
  function tryInject() {
    if (!currentSettings.qcCheckEnabled) {
      console.log('[LitbuyTools] QC Check disabled, skipping button injection');
      return enhanceProductLinkControl();
    }

    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      // Migrate old floating fallback buttons to inline placement.
      if (existing.style.position === 'fixed') {
        existing.remove();
      } else {
        const addonPanel = ensureProductAddonPanel();
        const actionHost = addonPanel?.actionsRow || null;
        const area = addonPanel?.buttonArea || findButtonArea();
        if (actionHost && existing.parentElement !== actionHost) {
          actionHost.insertBefore(existing, actionHost.firstChild);
        }
        if (area?.container) {
          area.container.style.display = 'none';
          area.container.dataset.litbuyHiddenAction = 'legacy-actions';
        }
        enhanceProductLinkControl();
        return true;
      }
    }

    const addonPanel = ensureProductAddonPanel();
    const area = addonPanel?.buttonArea || findButtonArea();
    const actionHost = addonPanel?.actionsRow || null;
    if (!area || !actionHost) return false;

    const btn = createQCButton(area.refElement);
    
    // Insert based on button position setting
    if (currentSettings.buttonPosition === 'left') {
      actionHost.insertBefore(btn, actionHost.firstChild);
    } else {
      actionHost.appendChild(btn);
    }

    if (area.container) {
      area.container.style.display = 'none';
      area.container.dataset.litbuyHiddenAction = 'legacy-actions';
    }

    enhanceProductLinkControl();

    console.log('[LitbuyTools] ✅ Button injected!');
    return true;
  }

  /**
   * Remove existing button
   */
  function removeButton() {
    const el = document.getElementById(BUTTON_ID);
    if (el) el.remove();
    const productLinkControl = document.getElementById(PRODUCT_LINK_CONTROL_ID);
    if (productLinkControl) productLinkControl.remove();
    document.querySelectorAll('[data-litbuy-hidden-action]').forEach((node) => {
      node.style.display = '';
      delete node.dataset.litbuyHiddenAction;
    });
  }

  /**
   * Remove purchase warning modals
   */
  function isPurchaseWarningModalText(text) {
    if (!text) return false;
    const normalized = String(text).replace(/\s+/g, ' ').trim().toLowerCase();
    let matchCount = 0;
    if (normalized.includes('purchase notice')) matchCount++;
    if (normalized.includes('legal or policy restrictions')) matchCount++;
    if (normalized.includes('assume related legal risks')) matchCount++;
    if (normalized.includes('recommend choosing another item')) matchCount++;
    return matchCount >= 2;
  }

  function isPurchaseWarningModalElement(element) {
    if (!element) return false;
    if (isPurchaseWarningModalText(element.textContent || '')) return true;

    const modalBody = element.querySelector('.ivu-modal-body');
    const modalFooter = element.querySelector('.ivu-modal-footer');
    const footerText = (modalFooter?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const bodyText = (modalBody?.textContent || '').replace(/\s+/g, ' ').trim();
    const hasGhostWarningShell =
      bodyText === '<' &&
      footerText === 'cancel ok' &&
      !!element.querySelector('[data-v-9da2e338]');

    const warningImage = element.querySelector('img[src*="warn1"]');
    const keywordBlock = element.querySelector('.key-sty');
    const riskCheckbox = Array.from(element.querySelectorAll('label, span, p, div')).some(node =>
      (node.textContent || '').toLowerCase().includes('assume related legal risks')
    );
    const warningButtons =
      element.querySelector('.gray-btn') &&
      element.querySelector('.cancel-btn');

    return Boolean(
      hasGhostWarningShell ||
      warningImage ||
      (keywordBlock && warningButtons) ||
      (riskCheckbox && warningButtons)
    );
  }

  function removePurchaseWarnings() {
    if (!currentSettings.removeWarningEnabled) return;

    setTimeout(() => {
      console.log('[LitbuyTools] Checking for purchase warning modals...');
      let removedCount = 0;

      const warningElements = Array.from(document.querySelectorAll('.ivu-modal-content, .ivu-modal-wrap, .v-transfer-dom'))
        .filter(element => isPurchaseWarningModalElement(element));

      const removalTargets = new Set();
      for (const element of warningElements) {
        const wrap = element.closest('.ivu-modal-wrap');
        const transferDom = element.closest('.v-transfer-dom, [data-transfer="true"]');

        if (wrap && isPurchaseWarningModalElement(wrap)) {
          removalTargets.add(wrap);
        } else if (transferDom && isPurchaseWarningModalElement(transferDom)) {
          removalTargets.add(transferDom);
        } else {
          removalTargets.add(element);
        }
      }

      for (const target of removalTargets) {
        const wrap = target.matches('.ivu-modal-wrap') ? target : target.closest('.ivu-modal-wrap');
        const transferDom = target.matches('.v-transfer-dom, [data-transfer="true"]')
          ? target
          : target.closest('.v-transfer-dom, [data-transfer="true"]');

        if (wrap) {
          console.log('[LitbuyTools] Removing purchase warning modal wrap');
          wrap.remove();
          removedCount++;
        } else if (transferDom) {
          console.log('[LitbuyTools] Removing purchase warning transfer container');
          transferDom.remove();
          removedCount++;
        } else {
          console.log('[LitbuyTools] Removing purchase warning modal content');
          content.remove();
          removedCount++;
        }
      }

      if (removedCount > 0 && document.querySelectorAll('.ivu-modal-wrap').length === 0) {
        const masks = document.querySelectorAll('.ivu-modal-mask');
        masks.forEach(mask => {
          console.log('[LitbuyTools] Removing orphaned warning mask');
          mask.remove();
          removedCount++;
        });

        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      }

      if (removedCount > 0) {
        console.log('[LitbuyTools] Removed', removedCount, 'purchase warning elements');
      }

      return;
      
      // STEP 1: Remove all modal wraps with purchase warning content
      const modalWraps = document.querySelectorAll('.ivu-modal-wrap, [class*="modal-wrap"]');
      for (const wrap of modalWraps) {
        const text = wrap.textContent || '';
        const hasWarningContent = 
          text.includes('Purchase Notice') ||
          text.includes('legal or policy restrictions') ||
          text.includes('assume related legal risks');
        
        if (hasWarningContent) {
          console.log('[LitbuyTools] ✓ Removing modal wrap:', wrap.className);
          wrap.remove();
          removedCount++;
        }
      }

      // STEP 2: Remove ALL modal mask overlays (backdrop)
      const masks = document.querySelectorAll('.ivu-modal-mask, [class*="modal-mask"]');
      masks.forEach(mask => {
        console.log('[LitbuyTools] ✓ Removing mask overlay');
        mask.remove();
        removedCount++;
      });

      // STEP 3: Remove ALL v-transfer-dom containers with modals (aggressive removal)
      const transferDoms = document.querySelectorAll('.v-transfer-dom, [data-transfer="true"]');
      for (const dom of transferDoms) {
        // Remove if it contains ANY modal elements (these are teleported modals from Vue)
        const hasModalContent = 
          dom.querySelector('.ivu-modal-wrap') ||
          dom.querySelector('.ivu-modal') ||
          dom.querySelector('[class*="modal"]');
        
        if (hasModalContent) {
          console.log('[LitbuyTools] ✓ Removing v-transfer-dom with modal');
          dom.remove();
          removedCount++;
        }
      }

      // STEP 4: Remove any other modal-related elements with warning content
      const otherModals = document.querySelectorAll('[role="dialog"], [role="alertdialog"], [class*="modal"][class*="show"], [class*="modal"][class*="open"]');
      for (const modal of otherModals) {
        const text = modal.textContent || '';
        if (text.includes('Purchase Notice') || 
            text.includes('legal or policy restrictions') ||
            text.includes('assume related legal risks')) {
          console.log('[LitbuyTools] ✓ Removing additional modal element');
          modal.remove();
          removedCount++;
        }
      }

      // STEP 5: Force remove body scroll locks
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      
      if (removedCount > 0) {
        console.log('[LitbuyTools] ✅ Removed', removedCount, 'purchase warning elements');
      }
    }, currentSettings.warningDelay);
  }

  /**
   * Watch for warning modals appearing
   */
  function watchForWarnings() {
    if (!currentSettings.removeWarningEnabled) return;

    const observer = new MutationObserver(() => {
      removePurchaseWarnings();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also run immediately
    removePurchaseWarnings();
  }

  /**
   * Remove Clutter (Ads & Banners)
   */
  const CLUTTER_STYLE_ID = 'litbuy-clutter-hide-styles';

  function injectClutterHideCSS() {
    // Inject CSS early to prevent flash
    if (!currentSettings.removeClutterEnabled) {
      const existing = document.getElementById(CLUTTER_STYLE_ID);
      if (existing) existing.remove();
      return;
    }

    if (document.getElementById(CLUTTER_STYLE_ID)) return;
    const clutterCSS = `
      /* Hide clutter immediately - LitbuyTools */
      ${currentSettings.removeBanners ? `
      [data-v-61ca79e8].container,
      [data-v-61ca79e8][class*="top-img"],
      [data-v-7ab003cf].flow,
      .flow { display: none !important; }
      ` : ''}
      
      ${currentSettings.removeSidebarAds ? `
      [data-v-49df385c].hand-menu,
      .hand-menu,
      [data-v-74ed38d3].ad,
      [data-v-63e56e70].account-ad,
      .ad,
      .account-ad { display: none !important; }
      ` : ''}
      
      ${currentSettings.removeCartFlow ? `
      img.head-img[src*="car_flow"] { display: none !important; }
      ` : ''}
      
      ${currentSettings.removeLitline ? `
      img.head-img[src*="litline"] { display: none !important; }
      ` : ''}
      
      ${currentSettings.removeFAQ ? `
      .faq-wrap { display: none !important; }
      ` : ''}
      
      ${currentSettings.removeTipLine ? `
      .tip-line { display: none !important; }
      ` : ''}
      
      ${currentSettings.removeTrending ? `
      .big-title:has(+ .goods-list),
      .big-title + .goods-list,
      .big-title + .goods-list + .more { display: none !important; }
      ` : ''}
      
      ${currentSettings.removeMemoryMenu ? `
      .memory-menu { display: none !important; }
      ` : ''}
    `;

    const style = document.createElement('style');
    style.id = CLUTTER_STYLE_ID;
    style.textContent = clutterCSS;
    document.head.appendChild(style);
  }

  function removeClutter() {
    if (!currentSettings.removeClutterEnabled) return;

    const removed = [];

    // Remove banners
    if (currentSettings.removeBanners) {
      const topBanners = document.querySelectorAll('[data-v-61ca79e8].container, [data-v-61ca79e8][class*="top-img"]');
      topBanners.forEach(el => {
        if (el.querySelector('.top-img') || el.classList.contains('top-img')) {
          el.style.display = 'none';
          removed.push('Top banner');
        }
      });

      const flowBanners = document.querySelectorAll('[data-v-7ab003cf].flow, .flow');
      flowBanners.forEach(el => {
        el.style.display = 'none';
        removed.push('Flow banner');
      });
    }

    // Remove sidebar ads
    if (currentSettings.removeSidebarAds) {
      const sideMenus = document.querySelectorAll('[data-v-49df385c].hand-menu, .hand-menu');
      sideMenus.forEach(el => {
        el.style.display = 'none';
        removed.push('Hand menu');
      });

      const ads = document.querySelectorAll('[data-v-74ed38d3].ad, [data-v-63e56e70].account-ad, .ad, .account-ad');
      ads.forEach(el => {
        el.style.display = 'none';
        removed.push('Ad');
      });
    }

    // Block popups
    if (currentSettings.removePopups) {
      const popupOverlays = document.querySelectorAll('[class*="popup-overlay"], [class*="modal-overlay"]');
      popupOverlays.forEach(el => {
        const content = el.textContent.toLowerCase();
        if (!content.includes('purchase') && !content.includes('notice') && !content.includes('warning')) {
          el.style.display = 'none';
          removed.push('Popup overlay');
        }
      });
    }

    // Cart flow image
    if (currentSettings.removeCartFlow) {
      const images = document.querySelectorAll('img.head-img[src*="car_flow"]');
      images.forEach(el => {
        el.style.display = 'none';
        removed.push('Cart flow image');
      });
    }

    // Litline banner
    if (currentSettings.removeLitline) {
      const images = document.querySelectorAll('img.head-img[src*="litline"]');
      images.forEach(el => {
        el.style.display = 'none';
        removed.push('Litline banner');
      });
    }

    // FAQ section
    if (currentSettings.removeFAQ) {
      const faqs = document.querySelectorAll('.faq-wrap');
      faqs.forEach(el => {
        el.style.display = 'none';
        removed.push('FAQ section');
      });
    }

    // Tip line
    if (currentSettings.removeTipLine) {
      const tips = document.querySelectorAll('.tip-line');
      tips.forEach(el => {
        el.style.display = 'none';
        removed.push('Tip line');
      });
    }

    // Trending items
    if (currentSettings.removeTrending) {
      const titles = document.querySelectorAll('.big-title');
      titles.forEach(title => {
        if (title.textContent.includes('Trending')) {
          title.style.display = 'none';
          if (title.nextElementSibling?.classList.contains('goods-list')) {
            title.nextElementSibling.style.display = 'none';
            if (title.nextElementSibling.nextElementSibling?.classList.contains('more')) {
              title.nextElementSibling.nextElementSibling.style.display = 'none';
            }
          }
          removed.push('Trending items');
        }
      });
    }

    // Memory menu (sidebar)
    if (currentSettings.removeMemoryMenu) {
      const menus = document.querySelectorAll('.memory-menu');
      menus.forEach(el => {
        el.style.display = 'none';
        removed.push('Sidebar menu');
      });
    }

    if (removed.length > 0) {
      console.log('[LitbuyTools] Removed clutter:', removed);
    }
  }

  function watchClutter() {
    // Inject CSS immediately to prevent flash
    injectClutterHideCSS();
    
    // Remove on init
    removeClutter();

    // Watch for new elements
    const observer = new MutationObserver(() => {
      if (currentSettings.removeClutterEnabled) {
        removeClutter();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Hover Image Preview
   */
  const PREVIEW_ID = 'litbuy-hover-preview';
  let previewTimeout = null;
  let previewHideTimeout = null;
  let currentPreview = null;
  let currentSwatchElement = null;
  
  // Track mouse position
  let mouseX = 0;
  let mouseY = 0;
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function createPreviewElement() {
    if (!currentSettings.hoverPreviewEnabled) return null;

    const previewSize = currentSettings.previewSize || '400';
    
    const preview = document.createElement('div');
    preview.id = PREVIEW_ID;
    preview.style.cssText = `
      position: fixed;
      z-index: 999;
      width: ${previewSize}px;
      height: ${previewSize}px;
      border: 3px solid #FF8C1A;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      background: white;
      overflow: hidden;
      pointer-events: none;
      opacity: 0;
      transform: scale(0.8);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    const img = document.createElement('img');
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    `;
    preview.appendChild(img);

    if (currentSettings.showCloseButton) {
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        width: 36px;
        height: 36px;
        border: none;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        font-size: 28px;
        font-weight: bold;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 10;
        line-height: 1;
        padding: 0;
      `;
      closeBtn.onmouseover = () => {
        closeBtn.style.background = '#FF8C1A';
        closeBtn.style.transform = 'scale(1.1)';
      };
      closeBtn.onmouseout = () => {
        closeBtn.style.background = 'rgba(0, 0, 0, 0.7)';
        closeBtn.style.transform = 'scale(1)';
      };
      closeBtn.onclick = () => hidePreview();
      preview.appendChild(closeBtn);
    }

    return preview;
  }

  function showPreview(imgSrc, targetElement) {
    if (!currentSettings.hoverPreviewEnabled) return;
    
    // Force remove any existing preview
    if (currentPreview && currentPreview.parentNode) {
      currentPreview.remove();
    }
    currentPreview = null;

    const preview = createPreviewElement();
    if (!preview) return;

    const img = preview.querySelector('img');
    img.src = imgSrc;

    const previewSize = parseInt(currentSettings.previewSize || '400');
    
    // Position next to mouse cursor
    let left = mouseX + 20;
    let top = mouseY - (previewSize / 2);

    // If goes off right edge, put it on left of cursor
    if (left + previewSize > window.innerWidth - 20) {
      left = mouseX - previewSize - 20;
    }

    // If goes off left edge, put it on right
    if (left < 20) {
      left = mouseX + 20;
    }

    // Keep within vertical bounds
    top = Math.max(20, Math.min(top, window.innerHeight - previewSize - 20));

    // Apply position
    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
    
    // Add to DOM
    document.body.appendChild(preview);
    currentPreview = preview;
    currentSwatchElement = targetElement;

    // Setup preview mouse handlers
    preview.addEventListener('mouseenter', () => {
      if (previewHideTimeout) {
        clearTimeout(previewHideTimeout);
        previewHideTimeout = null;
      }
    });

    preview.addEventListener('mouseleave', () => {
      scheduleHide();
    });

    // Trigger animation
    requestAnimationFrame(() => {
      preview.style.opacity = '1';
      preview.style.transform = 'scale(1)';
      preview.style.pointerEvents = 'auto';
    });

    console.log('[LitbuyTools] Preview shown');
  }

  function scheduleHide() {
    if (previewHideTimeout) clearTimeout(previewHideTimeout);
    previewHideTimeout = setTimeout(() => {
      hidePreview();
    }, 300);
  }

  function hidePreview(instant = false) {
    if (previewHideTimeout) {
      clearTimeout(previewHideTimeout);
      previewHideTimeout = null;
    }
    
    if (currentPreview) {
      if (instant) {
        // Instant removal when switching between swatches
        if (currentPreview.parentNode) {
          currentPreview.remove();
        }
        currentPreview = null;
        currentSwatchElement = null;
      } else {
        // Animated removal
        currentPreview.style.opacity = '0';
        currentPreview.style.transform = 'scale(0.8)';
        currentPreview.style.pointerEvents = 'none';
        
        setTimeout(() => {
          if (currentPreview && currentPreview.parentNode) {
            currentPreview.remove();
          }
          currentPreview = null;
          currentSwatchElement = null;
        }, 300);
      }
    }
  }

  function setupHoverPreview() {
    if (!currentSettings.hoverPreviewEnabled) {
      hidePreview();
      return;
    }

    // Target color swatches and product images (NOT the main product preview images)
    const selectors = [
      '.comm-size .size-list .size-item .goods-image',
      '.select-type .size-list .size-item .goods-image',
      '.size-item .goods-image',
      '[class*="color"] > div img',
      '.color-list > div img'
    ];

    const hoverDelay = currentSettings.hoverDelay || 1500;

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        // Skip if already has listeners (check for data attribute)
        if (el.dataset.hoverPreviewAttached) return;
        
        // Skip if this is a main product preview image (those should be clickable by user)
        if (el.classList.contains('picture-image') || el.closest('.picture-image')) return;
        
        el.dataset.hoverPreviewAttached = 'true';

        // Get the size-item parent (the individual swatch container)
        const swatchItem = el.closest('.size-item');
        if (!swatchItem) return;

        swatchItem.addEventListener('mouseenter', function(e) {
          // Clear any scheduled hide
          if (previewHideTimeout) {
            clearTimeout(previewHideTimeout);
            previewHideTimeout = null;
          }

          const img = this.querySelector('img');
          if (!img || !img.src) return;

          const imgSrc = img.src;

          // Clear any existing timeout
          if (previewTimeout) clearTimeout(previewTimeout);
          
          // Hide current preview instantly
          hidePreview(true);

          // Show preview after delay
          previewTimeout = setTimeout(() => {
            showPreview(imgSrc, this);
          }, hoverDelay);
        });

        swatchItem.addEventListener('mouseleave', function() {
          // Clear timeout if mouse leaves before delay
          if (previewTimeout) {
            clearTimeout(previewTimeout);
            previewTimeout = null;
          }
          
          // Schedule hide after a short delay (allows moving to preview)
          if (currentPreview) {
            scheduleHide();
          }
        });
      });
    });

    console.log('[LitbuyTools] Hover preview initialized');
  }

  function watchHoverPreview() {
    setupHoverPreview();

    // Re-setup when DOM changes (e.g., navigation, filters)
    const observer = new MutationObserver(() => {
      if (currentSettings.hoverPreviewEnabled) {
        setupHoverPreview();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Cart Click Preview - Large preview with animations and close button
   */
  let cartPreview = null;

  function createCartPreview() {
    const overlay = document.createElement('div');
    overlay.id = 'litbuy-cart-preview-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      backdrop-filter: blur(4px);
    `;

    const previewBox = document.createElement('div');
    previewBox.style.cssText = `
      position: relative;
      width: 80vw;
      height: 80vh;
      max-width: 1000px;
      max-height: 800px;
      background: white;
      border-radius: 20px;
      box-shadow: 0 30px 100px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      transform: scale(0.7);
      transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;

    const img = document.createElement('img');
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border: none;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      font-size: 36px;
      font-weight: bold;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      z-index: 10;
      line-height: 1;
      padding: 0;
    `;

    closeBtn.onmouseover = () => {
      closeBtn.style.background = '#FF8C1A';
      closeBtn.style.transform = 'scale(1.1) rotate(90deg)';
    };
    closeBtn.onmouseout = () => {
      closeBtn.style.background = 'rgba(0, 0, 0, 0.7)';
      closeBtn.style.transform = 'scale(1) rotate(0deg)';
    };

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeCartPreview();
    };

    overlay.onclick = closeCartPreview;
    previewBox.onclick = (e) => e.stopPropagation();

    previewBox.appendChild(img);
    previewBox.appendChild(closeBtn);
    overlay.appendChild(previewBox);

    return { overlay, img, previewBox };
  }

  function showCartPreview(imgSrc) {
    if (cartPreview) closeCartPreview();

    const { overlay, img, previewBox } = createCartPreview();
    img.src = imgSrc;

    document.body.appendChild(overlay);
    cartPreview = overlay;

    // Trigger animations
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      previewBox.style.transform = 'scale(1)';
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeCartPreview();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  function closeCartPreview() {
    if (!cartPreview) return;

    const overlay = cartPreview;
    const previewBox = overlay.querySelector('div');

    overlay.style.opacity = '0';
    previewBox.style.transform = 'scale(0.7)';

    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.remove();
      }
      cartPreview = null;
    }, 300);
  }

  function setupCartClickPreview() {
    if (!currentSettings.cartPreviewEnabled) return;
    
    // Target cart images specifically
    const selectors = [
      'img.picture-image',  // Cart and product images
      '.product-picture img', // Cart product images
      '.commodity-left img'  // Shopping cart items
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el.dataset.cartClickAttached) return;
        el.dataset.cartClickAttached = 'true';

        // Make clickable with pointer cursor
        el.style.cursor = 'zoom-in';
        el.style.transition = 'transform 0.2s ease';
        
        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.05)';
        });
        
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)';
        });
        
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const imgSrc = el.src;
          if (imgSrc) {
            console.log('[Cart Preview] Opening:', imgSrc);
            showCartPreview(imgSrc);
          }
        });
      });
    });

    console.log('[Cart Preview] Setup complete');
  }

  function watchCartClickPreview() {
    if (!currentSettings.cartPreviewEnabled) return;
    
    setupCartClickPreview();

    // Re-setup when DOM changes
    const observer = new MutationObserver(() => {
      if (currentSettings.cartPreviewEnabled) {
        setupCartClickPreview();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Init with retry and SPA navigation support
   */
  async function init() {
    // Load settings first
    await loadSettings();
    
    console.log('[LitbuyTools] Loaded on:', window.location.href);

    // Inject clutter CSS immediately (prevent flash)
    injectClutterHideCSS();

    // Start watching for warnings (works on all pages)
    watchForWarnings();

    // Start clutter removal
    watchClutter();

    // Start hover preview
    watchHoverPreview();

    // Start cart click preview
    watchCartClickPreview();

    // Start hidden ACBuy item weight lookups
    watchItemWeights();
    maybePrewarmQcCache(1200);

    const { id } = getCurrentProductInfo();
    if (!isLitbuyProductPage() || !id) {
      console.log('[LitbuyTools] Not a product page');
      return;
    }

    // Try to inject immediately
    if (tryInject()) return;

    // Retry with MutationObserver
    const observer = new MutationObserver(() => {
      if (tryInject()) {
        observer.disconnect();
        if (interval) clearInterval(interval);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also retry on interval as backup
    let retries = 0;
    const interval = setInterval(() => {
      retries++;
      if (tryInject() || retries >= 30) {
        clearInterval(interval);
        observer.disconnect();
      }
    }, 500);

    // Cleanup after 20s
    setTimeout(() => { observer.disconnect(); clearInterval(interval); }, 20000);
  }

  // Listen for messages from popup (e.g., settings changes)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'qcStatusUpdate') {
      updateQCButtonState(request.state || 'idle', request.label || '');
      sendResponse({ success: true });
      return true;
    }
    if (request.action === 'weightStatusUpdate') {
      updateProductWeightProgress(request);
      updateCartWeightProgress(request);
      sendResponse({ success: true });
      return true;
    }
    if (request.action === 'cacheInvalidated') {
      if (request.cacheType === 'weight') {
        pendingWeightLookups.clear();
        productWeightRenderToken += 1;
        productWeightState.lookupKey = '';
        productWeightState.status = 'idle';
        productWeightState.requestId = '';
        const existingCard = document.getElementById(PRODUCT_WEIGHT_ID);
        if (existingCard) {
          existingCard.dataset.weightKey = '';
          existingCard.dataset.weightRequestId = '';
          setWeightDisplayState(existingCard, 'loading', 'Refreshing...', '');
        }
        document.querySelectorAll(`.${CART_WEIGHT_CLASS}`).forEach((el) => el.remove());
        if (isLitbuyProductPage()) {
          scheduleProductWeightRender(120, true);
        }
        if (isLitbuyCartPage()) {
          scheduleCartWeightScan(120);
        }
      }
      if (request.cacheType === 'qc') {
        qcPrewarmKey = '';
      }
      sendResponse({ success: true });
      return true;
    }
    if (request.action === 'reloadButton') {
      loadSettings().then(() => {
        removeButton();
        tryInject();
        sendResponse({ success: true });
      });
      return true;
    }
    if (request.action === 'reloadSettings') {
      loadSettings().then(() => {
        // Restart warning watcher with new settings
        watchForWarnings();
        // Update clutter removal
        removeClutter();
        // Re-run item weight feature with latest toggles
        productWeightRenderToken += 1;
        productWeightState.lookupKey = '';
        productWeightState.status = 'idle';
        qcPrewarmKey = '';
        watchItemWeights();
        maybePrewarmQcCache(800);
        sendResponse({ success: true });
      });
      return true;
    }
  });

  // SPA navigation: watch for URL changes
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      console.log('[LitbuyTools] URL changed:', window.location.href);
      lastUrl = window.location.href;
      removeButton();
      productWeightRenderToken += 1;
      removeWeightDisplays();
      qcPrewarmKey = '';
      if (productWeightScanTimeout) {
        clearTimeout(productWeightScanTimeout);
        productWeightScanTimeout = null;
      }
      
      // Clean up preview when navigating away
      hidePreview(true);
      if (previewTimeout) {
        clearTimeout(previewTimeout);
        previewTimeout = null;
      }
      
      const { id } = getCurrentProductInfo();
      if (isLitbuyProductPage() && id) {
        let retries = 0;
        const interval = setInterval(() => {
          retries++;
          if (tryInject() || retries >= 20) clearInterval(interval);
        }, 500);
      }

      scheduleProductWeightRender(700);
      scheduleCartWeightScan(0);
      maybePrewarmQcCache(1400);
    }
  }, 300);

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
