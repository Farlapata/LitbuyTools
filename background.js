/**
 * LitbuyTools - Background Script (Service Worker)
 * Opens UUFinds tab and automates QC lookup
 */

// Default settings
const DEFAULT_SETTINGS = {
  qcCheckEnabled: true,
  resultClickDelay: 0,
  resultTimeout: 30,
  debugMode: false
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openQCCheck') {
    loadSettings().then(settings => {
      if (!settings.qcCheckEnabled) {
        sendResponse({ success: false, error: 'QC Check is disabled' });
        return;
      }

      if (settings.debugMode) {
        console.log('[LitbuyTools BG] Received sourceUrl:', request.sourceUrl);
        console.log('[LitbuyTools BG] Product name:', request.productName);
        console.log('[LitbuyTools BG] Settings:', settings);
      }

      handleQCCheck(request.sourceUrl, request.productName, settings)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error('[LitbuyTools BG] Error:', err);
          sendResponse({ success: false, error: err.message });
        });
    });
    return true; // keep channel open for async
  }
});

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      resolve(settings);
    });
  });
}

async function handleQCCheck(sourceUrl, productName, settings) {
  const tab = await chrome.tabs.create({
    url: 'https://www.uufinds.com/qcfinds',
    active: true
  });

  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId === tab.id && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: automateUUFinds,
        args: [sourceUrl, productName, settings]
      }).catch(err => console.error('[LitbuyTools BG] Inject failed:', err));
    }
  });
}

/**
 * Injected into UUFinds - fully event-driven automation
 */
function automateUUFinds(sourceUrl, productName, settings) {
  const log = (...args) => {
    if (settings.debugMode) console.log('[QC]', ...args);
  };
  
  console.log('[QC] ═══════════════════════════════════════');
  console.log('[QC] Starting automation for:', sourceUrl);
  console.log('[QC] Target product name:', productName);
  console.log('[QC] Settings:', settings);
  console.log('[QC] ═══════════════════════════════════════');

  const IMG_SEL = 'img.majorImg, img[class*="majorImg"]';

  // ── Utility: wait for an element to appear (only used for non-result elements) ──
  function waitFor(selectors, check, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const arr = Array.isArray(selectors) ? selectors : [selectors];
      function scan() {
        for (const sel of arr) {
          for (const el of document.querySelectorAll(sel)) {
            if (!check || check(el)) return el;
          }
        }
        return null;
      }
      const found = scan();
      if (found) { resolve(found); return; }
      const obs = new MutationObserver(() => {
        const f = scan();
        if (f) { obs.disconnect(); resolve(f); }
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('Timeout: ' + arr)); }, timeout);
    });
  }

  // ── Collect all identifying keys for a majorImg element ──
  function getKeys(img) {
    const keys = [];
    
    // Parent link URL
    const parent = img.closest('a');
    if (parent && parent.href) keys.push(parent.href);
    
    // Image sources (multiple possible attributes)
    if (img.src) keys.push(img.src);
    if (img.dataset && img.dataset.src) keys.push(img.dataset.src);
    if (img.getAttribute('data-src')) keys.push(img.getAttribute('data-src'));
    
    // Image element itself as fallback
    if (img.id) keys.push('img-id:' + img.id);
    
    // Card/item IDs (for feed items)
    const card = img.closest('[data-id], [data-item-id], [data-product-id]');
    if (card) {
      if (card.dataset.id) keys.push('card-id:' + card.dataset.id);
      if (card.dataset.itemId) keys.push('item-id:' + card.dataset.itemId);
      if (card.dataset.productId) keys.push('product-id:' + card.dataset.productId);
    }
    
    return keys.filter(k => k && k.length > 0);
  }

  // ── STEP 1: Fill search input and click search IMMEDIATELY ──
  async function step1_fillAndSearch() {
    console.log('[QC] ═══ STARTING QC AUTOMATION ═══');
    console.log('[QC] Target product name:', productName);
    
    if (!productName || productName.trim() === '') {
      console.error('[QC] ERROR: Product name is empty!');
      throw new Error('Product name is required for name-based matching');
    }
    
    // Helper function: Check if an item's name matches the target product name
    function hasMatchingName(img) {
      // Try multiple container strategies
      let container = img.closest('[class*="item"], [class*="card"], [class*="product"]');
      
      // If no container found, try going up a few levels
      if (!container) {
        container = img.parentElement?.parentElement;
      }
      
      if (!container) {
        return false;
      }
      
      // Look for name in multiple ways
      let nameDiv = container.querySelector('div.name');
      if (!nameDiv) nameDiv = container.querySelector('div[class*="name"]');
      if (!nameDiv) nameDiv = container.querySelector('[class*="title"]');
      if (!nameDiv) nameDiv = container.querySelector('.product-name, .item-name');
      
      // Try looking at all text in the container
      if (!nameDiv) {
        const allDivs = container.querySelectorAll('div');
        for (const div of allDivs) {
          const text = div.textContent.trim();
          if (text.length > 20 && text.includes(productName.substring(0, 20))) {
            nameDiv = div;
            break;
          }
        }
      }
      
      if (!nameDiv) {
        return false;
      }
      
      const itemName = nameDiv.textContent.trim();
      const matches = itemName === productName;
      
      if (matches) {
        console.log('[QC] ✓✓ MATCH FOUND ✓✓');
        console.log('[QC]   Item name:', itemName);
        console.log('[QC]   Target name:', productName);
      }
      
      return matches;
    }

    // ── FIND INPUT AND BUTTON FIRST ──
    console.log('[QC] Finding input and button...');
    const input = await waitFor(
      ['input[type="text"]', 'textarea'],
      el => el.getBoundingClientRect().width > 100,
      3000
    );
    
    const btn = await waitFor(
      ['.nut-button', 'button'],
      el => {
        const t = el.textContent.trim().toLowerCase();
        return t.includes('search') || t === '搜索';
      },
      3000
    );
    console.log('[QC] ✓ Found input and button');

    // Prevent form reload
    const form = input.closest('form');
    if (form) {
      form.addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); }, { capture: true });
    }

    // ── FILL INPUT ──
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, sourceUrl);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[QC] ✓ Input filled:', input.value);

    // ── NOW SET UP RESULT DETECTION (before clicking search) ──
    const initialUrl = window.location.href;
    console.log('[QC] Initial URL:', initialUrl);
    console.log('[QC] Looking for item with name:', productName);
    
    let resultFound = false;
    let searchClickTime = 0;
    
    const newResultPromise = new Promise((resolve, reject) => {
      let checksPerformed = 0;
      
      const searchObs = new MutationObserver(() => {
        if (resultFound) return;
        
        checksPerformed++;
        const timeSinceSearch = Date.now() - searchClickTime;
        
        // Don't check too early - wait at least 100ms for search to process
        if (timeSinceSearch < 100) return;
        
        // Log check
        if (checksPerformed % 10 === 0) {
          console.log('[QC] Observer check #' + checksPerformed + ' at ' + timeSinceSearch + 'ms');
        }
        
        // Find ALL images with matching names
        const allCurrentImgs = document.querySelectorAll(IMG_SEL);
        
        const matchingImgs = [];
        const anyVisibleImgs = [];
        
        for (const img of allCurrentImgs) {
          // Additional validation: must be visible and have reasonable size
          const rect = img.getBoundingClientRect();
          if (rect.width < 50 || rect.height < 50 || rect.top < 0) {
            continue;
          }
          
          // Collect all visible images as fallback
          anyVisibleImgs.push({ img, top: rect.top, left: rect.left, timeSinceSearch });
          
          // Check if this image's item has the matching product name
          if (hasMatchingName(img)) {
            matchingImgs.push({ img, top: rect.top, left: rect.left, timeSinceSearch });
            console.log('[QC] ✓ FOUND MATCHING ITEM:', {
              src: img.src,
              top: rect.top,
              left: rect.left,
              timeSinceSearch: timeSinceSearch
            });
          }
        }
        
        // FALLBACK: After 1.5 seconds, if no name match but we have visible results, click the first one
        const useFallback = timeSinceSearch >= 1500 && matchingImgs.length === 0 && anyVisibleImgs.length > 0;
        
        if (matchingImgs.length > 0 || useFallback) {
          // We found items with matching names - click the first one!
          const candidates = matchingImgs.length > 0 ? matchingImgs : anyVisibleImgs;
          candidates.sort((a, b) => Math.abs(a.top - b.top) < 100 ? a.left - b.left : a.top - b.top);
          
          const topResult = candidates[0];
          
          if (useFallback) {
            console.log('[QC] ⚠ FALLBACK: No name match after 1.5s, clicking first visible result');
          } else {
            console.log('[QC] ✓✓✓ MATCHED BY NAME - CLICKING NOW ✓✓✓');
            console.log('[QC] Found', matchingImgs.length, 'items with matching name');
          }
          
          console.log('[QC] Time since search:', timeSinceSearch, 'ms');
          console.log('[QC] Checks performed:', checksPerformed);
          console.log('[QC] Position: top=' + topResult.top + ' left=' + topResult.left);
          console.log('[QC] Image src:', topResult.img.src);
          
          resultFound = true;
          searchObs.disconnect();
          clearInterval(pollInterval);
          resolve(topResult.img);
          return;
        }
      });

      searchObs.observe(document.body, { 
        childList: true, 
        subtree: true
      });

      // Aggressive polling - check every 50ms
      const pollInterval = setInterval(() => {
        if (resultFound) return;
        
        const timeSinceSearch = Date.now() - searchClickTime;
        if (timeSinceSearch < 100) return; // Don't check too early
        
        const allImgs = document.querySelectorAll(IMG_SEL);
        const matchingImgs = [];
        const anyVisibleImgs = [];
        
        // Log every second (20 checks at 50ms intervals)
        const checkNum = Math.floor(timeSinceSearch / 50);
        if (checkNum % 20 === 0) {
          console.log('[QC] [Poll] Checking', allImgs.length, 'images at', timeSinceSearch, 'ms');
        }
        
        for (const img of allImgs) {
          const rect = img.getBoundingClientRect();
          if (rect.width < 50 || rect.height < 50 || rect.top < 0) {
            continue;
          }
          
          // Collect all visible images as fallback
          anyVisibleImgs.push({ img, top: rect.top, left: rect.left });
          
          // Check if this image's item has the matching product name
          if (hasMatchingName(img)) {
            matchingImgs.push({ img, top: rect.top, left: rect.left });
          }
        }
        
        // FALLBACK: After 1.5 seconds, if no name match but we have visible results, click the first one
        const useFallback = timeSinceSearch >= 1500 && matchingImgs.length === 0 && anyVisibleImgs.length > 0;
        
        if (matchingImgs.length > 0 || useFallback) {
          const candidates = matchingImgs.length > 0 ? matchingImgs : anyVisibleImgs;
          candidates.sort((a, b) => Math.abs(a.top - b.top) < 100 ? a.left - b.left : a.top - b.top);
          
          if (useFallback) {
            console.log('[QC] ⚠ FALLBACK: No name match after 1.5s, clicking first visible result');
          } else {
            console.log('[QC] ✓ Poll: found', matchingImgs.length, 'items with matching name (', timeSinceSearch, 'ms)');
          }
          
          resultFound = true;
          searchObs.disconnect();
          clearInterval(pollInterval);
          resolve(candidates[0].img);
          return;
        }
      }, 50);

      setTimeout(() => {
        searchObs.disconnect();
        clearInterval(pollInterval);
        if (!resultFound) {
          reject(new Error('Timeout: no new search result after ' + settings.resultTimeout + 's'));
        }
      }, settings.resultTimeout * 1000);
    });

    // ── CLICK SEARCH BUTTON (observers are ready) ──
    btn.click();
    searchClickTime = Date.now();
    console.log('[QC] ✓ Search button clicked at', searchClickTime);

    // ── WAIT FOR NEW RESULT ──
    const img = await newResultPromise;
    
    // Configurable delay (default 0 for instant clicking)
    const delay = settings.resultClickDelay || 0;
    if (delay > 0) {
      console.log('[QC] User-configured delay:', delay, 'ms');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    console.log('[QC] ✓✓✓ CLICKING RESULT NOW ✓✓✓');
    const clickable = img.closest('a, div[class*="card"], div[class*="item"]') || img;
    clickable.click();
    if (clickable.tagName === 'A' && clickable.href) {
      window.location.href = clickable.href;
    }
  }

  // ── STEP 4: Click "More" button on detail page ──
  async function step4_clickMore() {
    console.log('[QC] Step 4: wait for detail page + More button');

    await new Promise((resolve, reject) => {
      const check = () => {
        if (window.location.href.includes('goodItemDetail') || window.location.href.includes('/qc/')) {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
      setTimeout(() => reject(new Error('Detail page timeout')), 15000);
    });

    const more = await waitFor(
      ['.titleExploreMore', '[class*="titleExploreMore"]'],
      el => el.getBoundingClientRect().width > 0,
      15000
    );
    more.click();
    const link = more.closest('a');
    if (link && link.href && link.href.includes('exploreMore')) {
      window.location.href = link.href;
    }
    console.log('[QC] Clicked More - DONE!');
  }

  // ── Run all steps ──
  (async () => {
    try {
      await step1_fillAndSearch();
      await step4_clickMore();
    } catch (err) {
      console.error('[QC] Automation error:', err);
      try {
        await navigator.clipboard.writeText(sourceUrl);
        alert('Automation issue. Link copied to clipboard:\n' + sourceUrl);
      } catch {
        alert('Please paste this link manually:\n' + sourceUrl);
      }
    }
  })();
}
