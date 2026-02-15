/**
 * LitbuyTools - Content Script
 * Injects "Check QC" button on Litbuy product pages
 */

(function() {
  'use strict';

  const BUTTON_ID = 'litbuy-qc-check-btn';

  // Default settings
  const DEFAULT_SETTINGS = {
    qcCheckEnabled: true,
    buttonPosition: 'left',
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
    cartPreviewEnabled: true
  };

  let currentSettings = { ...DEFAULT_SETTINGS };

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

  /**
   * Get product info from CURRENT URL (always fresh)
   */
  function getCurrentProductInfo() {
    const url = window.location.href;
    const params = new URLSearchParams(window.location.search);
    let id = params.get('id');
    let channel = params.get('channel');
    
    // If no query params, try to extract from path for URLs like /products/{channel}/{id}
    if (!id || !channel) {
      const pathMatch = url.match(/\/products\/([^\/]+)\/([^\/\?]+)/);
      if (pathMatch) {
        channel = pathMatch[1];
        id = pathMatch[2];
      }
    }
    
    return { id, channel, url };
  }

  /**
   * Build the marketplace source URL
   */
  function buildSourceUrl(id, channel) {
    if (!id || !channel) return null;
    const builder = SOURCE_URLS[channel.toLowerCase()];
    return builder ? builder(id) : null;
  }

  /**
   * The click handler - reads URL fresh each time
   */
  function onCheckQCClick() {
    const { id, channel, url } = getCurrentProductInfo();
    console.log('[LitbuyTools] Click! URL:', url, 'ID:', id, 'Channel:', channel);
    
    const sourceUrl = buildSourceUrl(id, channel);
    if (!sourceUrl) {
      alert('Could not extract product info.\nURL: ' + url);
      return;
    }

    // Extract product name from h1 tag
    const h1Element = document.querySelector('h1[data-v-7b82a5f4]') || document.querySelector('h1');
    const productName = h1Element ? h1Element.textContent.trim() : '';
    console.log('[LitbuyTools] Product name:', productName);

    console.log('[LitbuyTools] Sending:', sourceUrl);
    chrome.runtime.sendMessage({ 
      action: 'openQCCheck', 
      sourceUrl: sourceUrl,
      productName: productName
    });
  }

  /**
   * Find the container that holds "Force refresh" and "Product Link"
   */
  function findButtonArea() {
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent.trim();
      if (text === 'Force refresh') {
        // Go up to find the container that holds all buttons
        let container = span.parentElement;
        // Keep going up until we find a container with multiple children
        for (let i = 0; i < 5; i++) {
          if (container && container.children.length >= 2) {
            return { container, refSpan: span, refElement: container.children[0] };
          }
          container = container ? container.parentElement : null;
        }
        // Fallback: just use the parent
        return { container: span.parentElement, refSpan: span, refElement: span };
      }
    }
    return null;
  }

  /**
   * Create the Check QC button element (NOT cloned - built from scratch)
   */
  function createQCButton(refElement) {
    // Create a wrapper span that matches the style of the reference
    const btn = document.createElement('span');
    btn.id = BUTTON_ID;
    
    // Copy the computed styles from the reference element
    const refStyles = window.getComputedStyle(refElement);
    
    // Apply matching styles
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      cursor: pointer;
      color: ${refStyles.color || '#333'};
      font-size: ${refStyles.fontSize || '14px'};
      font-family: ${refStyles.fontFamily || 'inherit'};
      margin-right: 16px;
      user-select: none;
      -webkit-user-select: none;
    `;

    // Copy all data-v-* attributes from the reference for Vue scoped CSS
    for (const attr of refElement.attributes) {
      if (attr.name.startsWith('data-v-')) {
        btn.setAttribute(attr.name, attr.value);
      }
    }

    btn.innerHTML = `
      <span style="margin-right: 4px; display: inline-flex; align-items: center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5C7 5 2.73 8.11 1 12.5 2.73 16.89 7 20 12 20s9.27-3.11 11-7.5C21.27 8.11 17 5 12 5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
        </svg>
      </span>
      <span>Check QC</span>
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
      return false;
    }

    if (document.getElementById(BUTTON_ID)) return true;

    const area = findButtonArea();
    if (!area) return false;

    const btn = createQCButton(area.refElement);
    
    // Insert based on button position setting
    if (currentSettings.buttonPosition === 'left') {
      area.container.insertBefore(btn, area.container.firstChild);
    } else {
      area.container.appendChild(btn);
    }

    console.log('[LitbuyTools] ✅ Button injected!');
    return true;
  }

  /**
   * Remove existing button
   */
  function removeButton() {
    const el = document.getElementById(BUTTON_ID);
    if (el) el.remove();
  }

  /**
   * Remove purchase warning modals
   */
  function removePurchaseWarnings() {
    if (!currentSettings.removeWarningEnabled) return;

    setTimeout(() => {
      console.log('[LitbuyTools] Checking for purchase warning modals...');
      let removedCount = 0;
      
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

    const { id, channel } = getCurrentProductInfo();
    if (!id || !channel) {
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
      
      // Clean up preview when navigating away
      hidePreview(true);
      if (previewTimeout) {
        clearTimeout(previewTimeout);
        previewTimeout = null;
      }
      
      const { id, channel } = getCurrentProductInfo();
      if (id && channel) {
        let retries = 0;
        const interval = setInterval(() => {
          retries++;
          if (tryInject() || retries >= 20) clearInterval(interval);
        }, 500);
      }
    }
  }, 300);

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
