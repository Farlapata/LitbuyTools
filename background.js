/**
 * LitbuyTools - Background Script (Service Worker)
 * Opens UUFinds tab and automates QC lookup
 */

// Default settings
const DEFAULT_SETTINGS = {
  qcCheckEnabled: true,
  qcOpenMode: 'window',
  qcCacheMode: 'click',
  resultClickDelay: 0,
  resultTimeout: 30,
  weightSampleCount: 12,
  itemWeightEnabled: true,
  debugMode: false
};

function clampWeightSampleCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 12;
  return Math.max(1, Math.min(30, Math.round(numeric)));
}

const WEIGHT_CACHE_KEY = 'litbuyWeightCache';
const WEIGHT_CACHE_VERSION_KEY = 'litbuyWeightCacheVersion';
const WEIGHT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WEIGHT_CACHE_MAX_ENTRIES = 400;
const QC_CACHE_KEY = 'uufindsQcCache';
const QC_CACHE_VERSION_KEY = 'uufindsQcCacheVersion';
const QC_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const QC_CACHE_MAX_ENTRIES = 400;
const BACKGROUND_POPUP_BOUNDS = {
  left: 80,
  top: 80,
  width: 420,
  height: 720
};
const pendingWeightRequests = new Map();
const pendingQcWarmRequests = new Map();
const qcAutomationSessions = new Map();

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

      handleQCCheck(request.sourceUrl, request.productName, settings, {
        originTabId: sender?.tab?.id,
        originWindowId: sender?.tab?.windowId
      })
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error('[LitbuyTools BG] Error:', err);
          sendResponse({ success: false, error: err.message });
        });
    });
    return true; // keep channel open for async
  }

  if (request.action === 'warmQcCache') {
    loadSettings().then(settings => {
      prewarmQcCache(request.sourceUrl, request.productName, settings, {
        originTabId: sender?.tab?.id,
        originWindowId: sender?.tab?.windowId
      })
        .then((result) => sendResponse(result || { success: true }))
        .catch((err) => {
          console.error('[LitbuyTools BG] QC prewarm error:', err);
          sendResponse({ success: false, error: err.message });
        });
    });
    return true;
  }

  if (request.action === 'openBatchLinks') {
    const urls = Array.isArray(request.urls) ? request.urls.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url)) : [];
    const intervalMs = Number.isFinite(request.intervalMs) ? Math.max(0, request.intervalMs) : 180;

    openBatchLinks(urls, intervalMs)
      .then((opened) => {
        sendResponse({ success: true, opened });
      })
      .catch((err) => {
        console.error('[LitbuyTools BG] openBatchLinks error:', err);
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }

  if (request.action === 'resolveMarketplaceUrl') {
    const rawUrl = typeof request.url === 'string' ? request.url : '';
    resolveMarketplaceUrl(rawUrl)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'fetchLitbuyThumbnail') {
    const litbuyUrl = typeof request.url === 'string' ? request.url : '';
    fetchLitbuyThumbnail(litbuyUrl)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'fetchSourceThumbnail') {
    const sourceUrl = typeof request.url === 'string' ? request.url : '';
    fetchSourceThumbnail(sourceUrl)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'fetchProductWeight') {
    fetchProductWeight(request, {
      originTabId: sender?.tab?.id,
      originWindowId: sender?.tab?.windowId
    })
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message || 'Weight lookup failed' }));
    return true;
  }

  if (request.action === 'clearWeightCache') {
    clearWeightCache()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message || 'Cache clear failed' }));
    return true;
  }

  if (request.action === 'clearQcCache') {
    clearQcCache()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message || 'QC cache clear failed' }));
    return true;
  }

  if (request.action === 'getCacheStats') {
    getCacheStats()
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, error: err.message || 'Cache stats failed' }));
    return true;
  }

  if (request.action === 'qcAutomationStatus') {
    handleQCAutomationStatus(request)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message || 'QC status handling failed' }));
    return true;
  }
});

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      resolve(settings);
    });
  });
}

async function getLocalStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

async function setLocalStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

function estimateStorageBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch {
    return 0;
  }
}

async function getCacheVersions() {
  const stored = await getLocalStorage([WEIGHT_CACHE_VERSION_KEY, QC_CACHE_VERSION_KEY]);
  return {
    weight: Number(stored?.[WEIGHT_CACHE_VERSION_KEY] || 0),
    qc: Number(stored?.[QC_CACHE_VERSION_KEY] || 0)
  };
}

async function bumpCacheVersion(versionKey) {
  const stored = await getLocalStorage([versionKey]);
  const nextValue = Number(stored?.[versionKey] || 0) + 1;
  await setLocalStorage({
    [versionKey]: nextValue
  });
  return nextValue;
}

async function broadcastCacheInvalidation(type) {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => notifyOriginTab(tab.id, {
      action: 'cacheInvalidated',
      cacheType: type
    })));
  } catch {
    // ignore broadcast failures
  }
}

async function handleQCAutomationStatus(request) {
  const tabId = Number(request.tabId);
  const session = qcAutomationSessions.get(tabId);
  if (!session) {
    return { success: false, error: 'Unknown QC automation session' };
  }

  if (request.stage === 'error') {
    if (session.mode === 'weightLookup') {
      await notifyWeightStatus(session.originTabId, session.lookupKey, 'error', 'Weight lookup failed', session.requestId || '');
      await closeBackgroundTarget(session);
      qcAutomationSessions.delete(tabId);
      if (typeof session.rejectWeight === 'function') {
        session.rejectWeight(new Error('Hidden UUFinds weight lookup failed'));
      }
      return { success: true };
    }

    if (session.mode === 'prewarm') {
      await closeBackgroundTarget(session);
      qcAutomationSessions.delete(tabId);
      if (typeof session.rejectPrewarm === 'function') {
        session.rejectPrewarm(new Error('Hidden QC cache prewarm failed'));
      }
      return { success: true };
    }

    await notifyQcStatus(session.originTabId, 'error', 'QC failed');
    await revealQCSession(tabId);
    qcAutomationSessions.delete(tabId);
    return { success: true };
  }

  if (request.stage === 'final-ready') {
    if (session.sourceUrl && request.finalUrl) {
      await writeCachedQcResult(session.sourceUrl, {
        finalUrl: request.finalUrl,
        productName: session.productName || '',
        fetchedAt: Date.now()
      }, session.qcCacheVersion ?? null);
    }

    if (session.mode === 'weightLookup') {
      try {
        await notifyWeightStatus(session.originTabId, session.lookupKey, 'reading', 'Reading weights...', session.requestId || '');
        const currentTab = await chrome.tabs.get(tabId);
        const exploreMoreUrl = toUufindsExploreMoreUrl(request.finalUrl || currentTab?.url || '');
        if (!exploreMoreUrl) {
          throw new Error('Could not build UUFinds exploreMore weight page URL');
        }

        if (currentTab?.url !== exploreMoreUrl) {
          await chrome.tabs.update(tabId, { url: exploreMoreUrl });
          await waitForTabComplete(tabId, 15000);
          await new Promise((resolve) => setTimeout(resolve, 600));
        }

        const range = await scrapeUufindsWeightRangeFromTabV3(tabId, clampWeightSampleCount(session.weightSampleCount));
        if (typeof session.resolveWeight === 'function') {
          session.resolveWeight({
            success: true,
            finalUrl: exploreMoreUrl,
            typicalWeightGrams: range.typicalWeightGrams || '',
            minWeightGrams: range.minWeightGrams || '',
            maxWeightGrams: range.maxWeightGrams || '',
            noWeight: range.noWeight === true,
            debug: range.debug || null
          });
        }
        await notifyWeightStatus(session.originTabId, session.lookupKey, 'done', 'Weight ready', session.requestId || '');
      } finally {
        await closeBackgroundTarget(session);
        qcAutomationSessions.delete(tabId);
      }
      return { success: true };
    }

    if (session.mode === 'prewarm') {
      try {
        if (typeof session.resolvePrewarm === 'function') {
          session.resolvePrewarm({
            success: true,
            finalUrl: request.finalUrl || ''
          });
        }
      } finally {
        await closeBackgroundTarget(session);
        qcAutomationSessions.delete(tabId);
      }
      return { success: true };
    }

    await notifyQcStatus(session.originTabId, 'opening', 'Opening QC page...');
    await revealQCSession(tabId, request.finalUrl);
    await notifyQcStatus(session.originTabId, 'done', 'QC ready');
    qcAutomationSessions.delete(tabId);
    return { success: true };
  }

  return { success: true };
}

async function restoreOriginFocus(originContext = {}) {
  const originWindowId = Number(originContext.originWindowId);
  const originTabId = Number(originContext.originTabId);

  if (Number.isInteger(originWindowId) && originWindowId >= 0) {
    try {
      await chrome.windows.update(originWindowId, {
        focused: true
      });
    } catch {
      // ignore focus restore failures
    }
  }

  if (Number.isInteger(originTabId) && originTabId >= 0) {
    try {
      await chrome.tabs.update(originTabId, { active: true });
    } catch {
      // ignore activation failures
    }
  }
}

async function notifyOriginTab(tabId, payload) {
  const safeTabId = Number(tabId);
  if (!Number.isInteger(safeTabId) || safeTabId < 0 || !payload || typeof payload !== 'object') {
    return;
  }

  try {
    await chrome.tabs.sendMessage(safeTabId, payload);
  } catch {
    // ignore status update failures
  }
}

async function notifyQcStatus(tabId, state, label = '') {
  await notifyOriginTab(tabId, {
    action: 'qcStatusUpdate',
    state,
    label
  });
}

async function notifyWeightStatus(tabId, lookupKey, state, label = '', requestId = '') {
  await notifyOriginTab(tabId, {
    action: 'weightStatusUpdate',
    lookupKey,
    state,
    label,
    requestId
  });
}

async function resolveBackgroundHostWindow(originContext = {}) {
  const originWindowId = Number(originContext.originWindowId);
  if (Number.isInteger(originWindowId) && originWindowId >= 0) {
    return originWindowId;
  }

  try {
    const lastFocused = await chrome.windows.getLastFocused();
    if (Number.isInteger(lastFocused?.id) && lastFocused.id >= 0) {
      return lastFocused.id;
    }
  } catch {
    // ignore lookup failures
  }

  return null;
}

async function closeBackgroundTarget(target) {
  if (!target) return;

  if (target.targetMode === 'window' && Number.isInteger(target.windowId)) {
    try {
      await chrome.windows.remove(target.windowId);
    } catch {
      // ignore cleanup failures
    }
    return;
  }

  if (Number.isInteger(target.tabId)) {
    try {
      await chrome.tabs.remove(target.tabId);
    } catch {
      // ignore cleanup failures
    }
  }
}

async function setHelperTabTitle(tabId, title = 'Processing - Do Not Close') {
  const safeTabId = Number(tabId);
  if (!Number.isInteger(safeTabId) || safeTabId < 0) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: safeTabId },
      args: [title],
      func: (nextTitle) => {
        try {
          document.title = String(nextTitle || 'Processing - Do Not Close');
        } catch {
          // ignore title update failures
        }
      }
    });
  } catch {
    // ignore title update failures
  }
}

async function createBackgroundWindow(url, originContext = {}, debugVisible = false) {
  if (!debugVisible) {
    const popupWindow = await chrome.windows.create({
      url,
      focused: false,
      type: 'popup',
      state: 'minimized'
    });

    await restoreOriginFocus(originContext);

    let tab = popupWindow?.tabs?.[0];
    if (!tab?.id && popupWindow?.id) {
      try {
        const populatedWindow = await chrome.windows.get(popupWindow.id, { populate: true });
        tab = populatedWindow?.tabs?.[0];
      } catch {
        // ignore and fail below
      }
    }

    if (!popupWindow?.id || !tab?.id) {
      throw new Error('Could not create hidden UUFinds window');
    }

    return {
      targetMode: 'window',
      windowId: popupWindow.id,
      tabId: tab.id
    };
  }

  const popupWindow = await chrome.windows.create({
    url,
    focused: true,
    type: 'popup',
    left: BACKGROUND_POPUP_BOUNDS.left,
    top: BACKGROUND_POPUP_BOUNDS.top,
    width: BACKGROUND_POPUP_BOUNDS.width,
    height: BACKGROUND_POPUP_BOUNDS.height
  });

  let tab = popupWindow?.tabs?.[0];
  if (!tab?.id && popupWindow?.id) {
    try {
      const populatedWindow = await chrome.windows.get(popupWindow.id, { populate: true });
      tab = populatedWindow?.tabs?.[0];
    } catch {
      // ignore and fail below
    }
  }

  if (!popupWindow?.id || !tab?.id) {
    throw new Error('Could not create hidden UUFinds window');
  }

  return {
    targetMode: 'window',
    windowId: popupWindow.id,
    tabId: tab.id
  };
}

async function detectUufindsWeightNodes(tabId, sampleLimit = 12) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [clampWeightSampleCount(sampleLimit)],
    func: (sampleLimit) => {
      const selectors = [
        '.good-item-box .qcListUl .li .imgBottom .weight',
        '.qcListUl .li .imgBottom .weight',
        '.li .imgBottom .weight'
      ];

      const nodes = Array.from(document.querySelectorAll(selectors.join(', ')));
      const texts = nodes
        .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((text) => /weight/i.test(text))
        .slice(0, sampleLimit);

      return {
        nodeCount: nodes.length,
        texts,
        pageUrl: window.location.href
      };
    }
  });

  return result || {
    nodeCount: 0,
    texts: [],
    pageUrl: ''
  };
}

async function revealQCSession(tabId, finalUrl = '') {
  const session = qcAutomationSessions.get(tabId);
  if (!session) return;

  const revealMode = session.revealMode === 'tab' ? 'tab' : 'window';
  const targetMode = session.targetMode === 'window' ? 'window' : 'tab';
  let currentTab = null;
  let targetUrl = String(finalUrl || '').trim();

  try {
    currentTab = await chrome.tabs.get(tabId);
  } catch {
    currentTab = null;
  }

  if (!targetUrl) {
    targetUrl = String(currentTab?.url || '').trim();
  }

  if (revealMode === 'tab') {
    try {
      if (targetMode === 'tab' && Number.isInteger(tabId) && tabId >= 0) {
        if (targetUrl && currentTab?.url !== targetUrl) {
          await chrome.tabs.update(tabId, { url: targetUrl });
        }
        await chrome.tabs.update(tabId, { active: true });
        if (Number.isInteger(currentTab?.windowId) && currentTab.windowId >= 0) {
          await chrome.windows.update(currentTab.windowId, { focused: true });
        }
      } else {
        await chrome.tabs.create({
          url: targetUrl,
          active: true,
          ...(Number.isInteger(session.originWindowId) && session.originWindowId >= 0
            ? { windowId: session.originWindowId }
            : {})
        });
        await closeBackgroundTarget(session);
      }
    } catch {
      if (Number.isInteger(tabId) && tabId >= 0) {
        try {
          await chrome.tabs.update(tabId, { active: true });
        } catch {
          // ignore fallback failures
        }
      }
    }
    return;
  }

  if (targetMode === 'tab') {
    try {
      await chrome.windows.create({
        url: targetUrl || 'https://www.uufinds.com/qcfinds',
        focused: true,
        type: 'popup',
        left: BACKGROUND_POPUP_BOUNDS.left,
        top: BACKGROUND_POPUP_BOUNDS.top,
        width: BACKGROUND_POPUP_BOUNDS.width,
        height: BACKGROUND_POPUP_BOUNDS.height
      });
    } finally {
      await closeBackgroundTarget(session);
    }
    return;
  }

  try {
    if (targetUrl && currentTab?.url !== targetUrl) {
      await chrome.tabs.update(tabId, { url: targetUrl });
    }
    await chrome.windows.update(session.windowId, {
      focused: true,
      state: 'normal'
    });
  } catch {
    // ignore and still try to activate tab
  }

  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    // ignore activation failures
  }
}

function getWeightCacheRequestKey({ id, channel }) {
  const safeChannel = String(channel || 'unknown').trim().toLowerCase() || 'unknown';
  const safeId = String(id || '').trim();
  return safeId ? `${safeChannel}:${safeId}` : '';
}

function normalizeWeightCache(rawCache) {
  if (!rawCache || typeof rawCache !== 'object') return {};

  const normalized = {};
  const now = Date.now();

  for (const [key, entry] of Object.entries(rawCache)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!entry.fetchedAt || now - entry.fetchedAt > WEIGHT_CACHE_TTL_MS) continue;
    const hasSingleWeight = entry.weightGrams != null && entry.weightGrams !== '';
    const hasRangeWeight =
      (entry.minWeightGrams != null && entry.minWeightGrams !== '') ||
      (entry.maxWeightGrams != null && entry.maxWeightGrams !== '');
    const hasNoData = entry.noWeight === true;
    if (!hasSingleWeight && !hasRangeWeight && !hasNoData) continue;
    normalized[key] = entry;
  }

  return normalized;
}

async function loadWeightCache() {
  const stored = await getLocalStorage([WEIGHT_CACHE_KEY]);
  return normalizeWeightCache(stored?.[WEIGHT_CACHE_KEY]);
}

async function saveWeightCache(cache) {
  const entries = Object.entries(normalizeWeightCache(cache))
    .sort((a, b) => (b[1]?.fetchedAt || 0) - (a[1]?.fetchedAt || 0))
    .slice(0, WEIGHT_CACHE_MAX_ENTRIES);

  await setLocalStorage({
    [WEIGHT_CACHE_KEY]: Object.fromEntries(entries)
  });
}

async function readCachedWeight(cacheKey) {
  if (!cacheKey) return null;
  const cache = await loadWeightCache();
  return cache[cacheKey] || null;
}

async function writeCachedWeight(cacheKey, entry, expectedVersion = null) {
  if (!cacheKey || !entry) return;
  if (expectedVersion != null) {
    const versions = await getCacheVersions();
    if (versions.weight !== expectedVersion) return;
  }
  const cache = await loadWeightCache();
  cache[cacheKey] = entry;
  await saveWeightCache(cache);
}

function getQcCacheKey(sourceUrl) {
  return String(sourceUrl || '').trim();
}

function normalizeQcCache(rawCache) {
  if (!rawCache || typeof rawCache !== 'object') return {};

  const normalized = {};
  const now = Date.now();

  for (const [key, entry] of Object.entries(rawCache)) {
    if (!key || !entry || typeof entry !== 'object') continue;
    if (!entry.finalUrl || !entry.fetchedAt) continue;
    if (now - entry.fetchedAt > QC_CACHE_TTL_MS) continue;
    normalized[key] = entry;
  }

  return normalized;
}

async function loadQcCache() {
  const stored = await getLocalStorage([QC_CACHE_KEY]);
  return normalizeQcCache(stored?.[QC_CACHE_KEY]);
}

async function saveQcCache(cache) {
  const entries = Object.entries(normalizeQcCache(cache))
    .sort((a, b) => (b[1]?.fetchedAt || 0) - (a[1]?.fetchedAt || 0))
    .slice(0, QC_CACHE_MAX_ENTRIES);

  await setLocalStorage({
    [QC_CACHE_KEY]: Object.fromEntries(entries)
  });
}

async function readCachedQcResult(sourceUrl) {
  const cacheKey = getQcCacheKey(sourceUrl);
  if (!cacheKey) return null;
  const cache = await loadQcCache();
  return cache[cacheKey] || null;
}

async function writeCachedQcResult(sourceUrl, entry, expectedVersion = null) {
  const cacheKey = getQcCacheKey(sourceUrl);
  if (!cacheKey || !entry?.finalUrl) return;
  if (expectedVersion != null) {
    const versions = await getCacheVersions();
    if (versions.qc !== expectedVersion) return;
  }
  const cache = await loadQcCache();
  cache[cacheKey] = {
    ...entry,
    sourceUrl,
    fetchedAt: entry.fetchedAt || Date.now()
  };
  await saveQcCache(cache);
}

function inferMarketplaceFromSourceUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const host = (url.hostname || '').toLowerCase();
    if (host.includes('1688.com')) return '1688';
    if (host.includes('taobao.com') || host.endsWith('tb.cn')) return 'taobao';
    if (host.includes('tmall.com')) return 'tmall';
    if (host.includes('weidian.com')) return 'weidian';
  } catch {
    return '';
  }

  return '';
}

function mapAcbuySourceCode(channel, sourceUrl) {
  const normalizedChannel = String(channel || '').trim().toLowerCase() || inferMarketplaceFromSourceUrl(sourceUrl);

  if (normalizedChannel === '1688' || normalizedChannel === 'taobao' || normalizedChannel === 'tmall') {
    return 'AL';
  }

  if (normalizedChannel === 'weidian') {
    return 'WD';
  }

  return '';
}

function buildAcbuyProductUrl({ id, channel, sourceUrl }) {
  const safeId = String(id || '').trim();
  const safeSourceUrl = String(sourceUrl || '').trim();
  const acbuySourceCode = mapAcbuySourceCode(channel, safeSourceUrl);

  if (!safeId || !safeSourceUrl || !acbuySourceCode) return '';

  const params = new URLSearchParams();
  // ACBuy expects the marketplace URL pre-encoded inside the query value.
  params.set('url', encodeURIComponent(safeSourceUrl));
  params.set('id', safeId);
  params.set('source', acbuySourceCode);

  return `https://www.acbuy.com/product?${params.toString()}`;
}

function normalizeWeightValue(weightValue) {
  const parsed = Number(weightValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
}

function buildWeightRangeResponseBase({ id, channel, sourceUrl, cached, entry }) {
  return {
    success: true,
    cached: Boolean(cached),
    id,
    channel,
    sourceUrl: entry?.sourceUrl || sourceUrl,
    uufindsUrl: entry?.uufindsUrl || entry?.finalUrl || '',
    weightGrams: entry?.weightGrams || '',
    typicalWeightGrams: entry?.typicalWeightGrams || '',
    minWeightGrams: entry?.minWeightGrams || '',
    maxWeightGrams: entry?.maxWeightGrams || '',
    noWeight: entry?.noWeight === true,
    debug: entry?.debug || null
  };
}

function extractWeightRangeFromText(text) {
  const weights = [];
  const regex = /weight\s*[:：]?\s*(\d{2,5}(?:\.\d+)?)\s*(?:g|grams?)/gi;
  let match;

  while ((match = regex.exec(String(text || '')))) {
    const normalized = normalizeWeightValue(match[1]);
    const numeric = Number(normalized);
    if (!normalized || !Number.isFinite(numeric)) continue;
    if (numeric < 20 || numeric > 10000) continue;
    weights.push(normalized);
  }

  const uniqueWeights = Array.from(new Set(weights.map((value) => String(value)))).slice(0, 12);
  if (!uniqueWeights.length) {
    return {
      minWeightGrams: '',
      maxWeightGrams: '',
      noWeight: true
    };
  }

  uniqueWeights.sort((a, b) => Number(a) - Number(b));

  return {
    minWeightGrams: uniqueWeights[0],
    maxWeightGrams: uniqueWeights[uniqueWeights.length - 1],
    noWeight: false
  };
}

function extractUufindsItemId(url) {
  const value = String(url || '').trim();
  if (!value) return '';

  const match = value.match(/\/(?:goodItemDetail\/qc|exploreMore)\/(\d+)/i);
  return match?.[1] || '';
}

function toUufindsExploreMoreUrl(url) {
  const itemId = extractUufindsItemId(url);
  return itemId ? `https://www.uufinds.com/exploreMore/${itemId}` : '';
}

async function scrapeUufindsWeightRangeFromTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const normalizeWeight = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return '';
        return Number.isInteger(parsed) ? String(parsed) : String(parsed);
      };

      const buildRangeFromValues = (values) => {
        const normalizedValues = Array.from(
          new Set(
            values
              .map((value) => normalizeWeight(value))
              .filter((value) => {
                const numeric = Number(value);
                return value && Number.isFinite(numeric) && numeric >= 1 && numeric <= 10000;
              })
          )
        ).slice(0, 12);

        if (!normalizedValues.length) {
          return {
            minWeightGrams: '',
            maxWeightGrams: '',
            noWeight: true
          };
        }

        normalizedValues.sort((a, b) => Number(a) - Number(b));
        return {
          minWeightGrams: normalizedValues[0],
          maxWeightGrams: normalizedValues[normalizedValues.length - 1],
          noWeight: false
        };
      };

      const extractWeightsFromText = (text) => {
        const weights = [];
        const regex = /weight\s*[:：]?\s*(\d{1,5}(?:\.\d+)?)\s*(?:g|grams?)/gi;
        let match;

        while ((match = regex.exec(String(text || '')))) {
          weights.push(match[1]);
        }

        return buildRangeFromValues(weights);
      };

      const collectDirectWeightTexts = () => {
        const nodes = Array.from(
          document.querySelectorAll(
            '.good-item-box .qcListUl .li .imgBottom .weight, .qcListUl .li .imgBottom .weight, .li .imgBottom .weight'
          )
        );

        const texts = [];
        for (const node of nodes) {
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (!/weight/i.test(text)) continue;
          texts.push(text);
          if (texts.length >= 12) break;
        }

        return texts;
      };

      const extractWeightRangeFromTextLocal = (text) => {
        const weights = [];
        const regex = /weight\s*[:：]?\s*(\d{2,5}(?:\.\d+)?)\s*(?:g|grams?)/gi;
        let match;

        while ((match = regex.exec(String(text || '')))) {
          const normalized = normalizeWeight(match[1]);
          const numeric = Number(normalized);
          if (!normalized || !Number.isFinite(numeric)) continue;
          if (numeric < 20 || numeric > 10000) continue;
          weights.push(normalized);
        }

        const uniqueWeights = Array.from(new Set(weights.map((value) => String(value)))).slice(0, 12);
        if (!uniqueWeights.length) {
          return {
            minWeightGrams: '',
            maxWeightGrams: '',
            noWeight: true
          };
        }

        uniqueWeights.sort((a, b) => Number(a) - Number(b));

        return {
          minWeightGrams: uniqueWeights[0],
          maxWeightGrams: uniqueWeights[uniqueWeights.length - 1],
          noWeight: false
        };
      };

      const collectCardWeights = () => {
        const selectors = [
          '.li',
          '.goods-item',
          '[class*="goods-item"]',
          '[class*="product"]',
          '[class*="item"]',
          '[class*="card"]'
        ];

        const cards = [];
        for (const selector of selectors) {
          for (const el of document.querySelectorAll(selector)) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 120 || rect.height < 120) continue;
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!/weight\s*[:：]?\s*\d{2,5}(?:\.\d+)?\s*(?:g|grams?)/i.test(text)) continue;
            cards.push(text);
            if (cards.length >= 12) break;
          }
          if (cards.length >= 12) break;
        }

        return cards.slice(0, 12);
      };

      const directWeightTexts = collectDirectWeightTexts();
      if (directWeightTexts.length) {
        return extractWeightsFromText(directWeightTexts.join(' | '));
      }

      const cardTexts = collectCardWeights();
      if (cardTexts.length) {
        return extractWeightsFromText(cardTexts.join(' | '));
      }

      return extractWeightsFromText((document.body?.innerText || '').replace(/\s+/g, ' ').trim());
    }
  });

  return result || {
    minWeightGrams: '',
    maxWeightGrams: '',
    noWeight: true
  };
}

async function scrapeUufindsWeightRangeFromTabV2(tabId, sampleLimit = 12) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [clampWeightSampleCount(sampleLimit)],
    func: async (sampleLimit) => {
      sampleLimit = Math.max(1, Math.min(30, Number(sampleLimit) || 12));
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const normalizeWeight = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return '';
        return Number.isInteger(parsed) ? String(parsed) : String(parsed);
      };

      const computeTypicalWeight = (values) => {
        const numericValues = values
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
          .sort((a, b) => a - b);

        if (!numericValues.length) return '';
        if (numericValues.length === 1) return normalizeWeight(numericValues[0]);

        const median = numericValues[Math.floor(numericValues.length / 2)];
        const bandwidth = Math.max(35, Math.min(120, Math.round(median * 0.18)));

        let bestStart = 0;
        let bestEnd = 0;

        for (let start = 0; start < numericValues.length; start++) {
          let end = start;
          while (end + 1 < numericValues.length && numericValues[end + 1] - numericValues[start] <= bandwidth) {
            end += 1;
          }

          const bestCount = bestEnd - bestStart + 1;
          const currentCount = end - start + 1;
          const bestSpan = numericValues[bestEnd] - numericValues[bestStart];
          const currentSpan = numericValues[end] - numericValues[start];

          if (
            currentCount > bestCount ||
            (currentCount === bestCount && currentSpan < bestSpan)
          ) {
            bestStart = start;
            bestEnd = end;
          }
        }

        const cluster = numericValues.slice(bestStart, bestEnd + 1);
        const average = cluster.reduce((sum, value) => sum + value, 0) / cluster.length;
        return normalizeWeight(Math.round(average));
      };

      const buildResult = (values, debug) => {
        const normalizedValues = Array.from(
          new Set(
            values
              .map((value) => normalizeWeight(value))
              .filter((value) => {
                const numeric = Number(value);
                return value && Number.isFinite(numeric) && numeric >= 1 && numeric <= 10000;
              })
          )
        ).slice(0, sampleLimit);

        if (!normalizedValues.length) {
          return {
            typicalWeightGrams: '',
            minWeightGrams: '',
            maxWeightGrams: '',
            noWeight: true,
            debug
          };
        }

        normalizedValues.sort((a, b) => Number(a) - Number(b));
        return {
          typicalWeightGrams: computeTypicalWeight(normalizedValues),
          minWeightGrams: normalizedValues[0],
          maxWeightGrams: normalizedValues[normalizedValues.length - 1],
          noWeight: false,
          debug: {
            ...debug,
            parsedWeights: normalizedValues
          }
        };
      };

      const extractWeightsFromTexts = (texts, debug) => {
        const weights = [];
        const regex = /weight\s*[:：]?\s*(\d{1,5}(?:\.\d+)?)\s*(?:g|grams?)/gi;

        for (const text of texts) {
          let match;
          while ((match = regex.exec(String(text || '')))) {
            weights.push(match[1]);
          }
        }

        return buildResult(weights, debug);
      };

      const collectDirectWeightTexts = () => {
        const selectors = [
          '.good-item-box .qcListUl .li .imgBottom .weight',
          '.qcListUl .li .imgBottom .weight',
          '.li .imgBottom .weight'
        ];

        const nodes = Array.from(document.querySelectorAll(selectors.join(', ')));
        const texts = nodes
          .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((text) => /weight/i.test(text))
          .slice(0, sampleLimit);

        return {
          selectors,
          nodeCount: nodes.length,
          texts
        };
      };

      const collectCardTexts = () => {
        const cards = Array.from(document.querySelectorAll('.good-item-box .qcListUl .li, .qcListUl .li, .li'));
        const texts = cards
          .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((text) => /weight\s*[:：]?\s*\d{1,5}(?:\.\d+)?\s*(?:g|grams?)/i.test(text))
          .slice(0, sampleLimit);

        return {
          cardCount: cards.length,
          texts
        };
      };

      const readExpectedQcCount = () => {
        const titleNode = document.querySelector('.good-item-box .title');
        const text = (titleNode?.textContent || '').replace(/\s+/g, ' ').trim();
        const match = text.match(/QC Photos[（(](\d+)[）)]/i);
        const expected = Number(match?.[1] || 0);
        return Number.isFinite(expected) && expected > 0 ? expected : 0;
      };

      let lastSignature = '';
      let stableAttempts = 0;
      const expectedQcCount = readExpectedQcCount();

      for (let attempt = 1; attempt <= 20; attempt++) {
        const direct = collectDirectWeightTexts();
        const signature = direct.texts.join('||');
        if (signature && signature === lastSignature) {
          stableAttempts += 1;
        } else {
          stableAttempts = signature ? 1 : 0;
          lastSignature = signature;
        }

        if (direct.texts.length) {
          const directResult = extractWeightsFromTexts(direct.texts, {
            stage: 'direct-weight-nodes',
            attempt,
            sampleLimit,
            expectedQcCount,
            pageUrl: window.location.href,
            title: document.title,
            directNodeCount: direct.nodeCount,
            directWeightTexts: direct.texts,
            stableAttempts
          });

          const enoughForPage = expectedQcCount > 0 && direct.texts.length >= Math.min(sampleLimit, expectedQcCount);
          if (!directResult.noWeight && (enoughForPage || direct.texts.length >= sampleLimit || stableAttempts >= 2 || attempt >= 2)) {
            return directResult;
          }
        }

        const cards = collectCardTexts();
        if (cards.texts.length) {
          const cardResult = extractWeightsFromTexts(cards.texts, {
            stage: 'card-text',
            attempt,
            sampleLimit,
            expectedQcCount,
            pageUrl: window.location.href,
            title: document.title,
            directNodeCount: direct.nodeCount,
            cardCount: cards.cardCount,
            cardTextSamples: cards.texts.slice(0, 4)
          });

          if (!cardResult.noWeight) {
            return cardResult;
          }
        }

        if (attempt < 20) {
          await sleep(400);
        }
      }

      const direct = collectDirectWeightTexts();
      const cards = collectCardTexts();
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      const bodyResult = extractWeightsFromTexts([bodyText], {
        stage: 'body-text-fallback',
        attempt: 20,
        sampleLimit,
        pageUrl: window.location.href,
        title: document.title,
        expectedQcCount,
        directNodeCount: direct.nodeCount,
        directWeightTexts: direct.texts,
        cardCount: cards.cardCount,
        cardTextSamples: cards.texts.slice(0, 4),
        bodyTextSample: bodyText.slice(0, 300)
      });

      if (!bodyResult.noWeight) {
        return bodyResult;
      }

      return {
        minWeightGrams: '',
        maxWeightGrams: '',
        noWeight: true,
        debug: {
          stage: 'no-weight-found',
          attempts: 20,
          sampleLimit,
          expectedQcCount,
          pageUrl: window.location.href,
          title: document.title,
          directNodeCount: direct.nodeCount,
          directWeightTexts: direct.texts,
          cardCount: cards.cardCount,
          cardTextSamples: cards.texts.slice(0, 4),
          bodyTextSample: bodyText.slice(0, 300)
        }
      };
    }
  });

  return result || {
    typicalWeightGrams: '',
    minWeightGrams: '',
    maxWeightGrams: '',
    noWeight: true,
    debug: {
      stage: 'no-script-result'
    }
  };
}

async function scrapeUufindsWeightRangeFromTabV3(tabId, sampleLimit = 12) {
  sampleLimit = clampWeightSampleCount(sampleLimit);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const computeTypicalWeight = (values) => {
    const numericValues = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);

    if (!numericValues.length) return '';
    if (numericValues.length === 1) return normalizeWeightValue(numericValues[0]);

    const median = numericValues[Math.floor(numericValues.length / 2)];
    const bandwidth = Math.max(35, Math.min(120, Math.round(median * 0.18)));

    let bestStart = 0;
    let bestEnd = 0;

    for (let start = 0; start < numericValues.length; start++) {
      let end = start;
      while (end + 1 < numericValues.length && numericValues[end + 1] - numericValues[start] <= bandwidth) {
        end += 1;
      }

      const bestCount = bestEnd - bestStart + 1;
      const currentCount = end - start + 1;
      const bestSpan = numericValues[bestEnd] - numericValues[bestStart];
      const currentSpan = numericValues[end] - numericValues[start];

      if (currentCount > bestCount || (currentCount === bestCount && currentSpan < bestSpan)) {
        bestStart = start;
        bestEnd = end;
      }
    }

    const cluster = numericValues.slice(bestStart, bestEnd + 1);
    const average = cluster.reduce((sum, value) => sum + value, 0) / cluster.length;
    return normalizeWeightValue(Math.round(average));
  };

  const buildResult = (values, debug) => {
    const normalizedValues = Array.from(
      new Set(
        values
          .map((value) => normalizeWeightValue(value))
          .filter((value) => {
            const numeric = Number(value);
            return value && Number.isFinite(numeric) && numeric >= 1 && numeric <= 10000;
          })
      )
    ).slice(0, sampleLimit);

    if (!normalizedValues.length) {
      return {
        typicalWeightGrams: '',
        minWeightGrams: '',
        maxWeightGrams: '',
        noWeight: true,
        debug
      };
    }

    normalizedValues.sort((a, b) => Number(a) - Number(b));
    return {
      typicalWeightGrams: computeTypicalWeight(normalizedValues),
      minWeightGrams: normalizedValues[0],
      maxWeightGrams: normalizedValues[normalizedValues.length - 1],
      noWeight: false,
      debug: {
        ...debug,
        parsedWeights: normalizedValues
      }
    };
  };

  const extractWeightsFromTexts = (texts, debug) => {
    const weights = [];
    const regex = /weight\s*[:：]?\s*(\d{1,5}(?:\.\d+)?)\s*(?:g|grams?)/gi;

    for (const text of texts) {
      let match;
      while ((match = regex.exec(String(text || '')))) {
        weights.push(match[1]);
      }
    }

    return buildResult(weights, debug);
  };

  const readSnapshot = async () => {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [sampleLimit],
      func: (sampleLimit) => {
        const directSelectors = [
          '.good-item-box .qcListUl .li .imgBottom .weight',
          '.qcListUl .li .imgBottom .weight',
          '.li .imgBottom .weight'
        ];

        const directNodes = Array.from(document.querySelectorAll(directSelectors.join(', ')));
        const directWeightTexts = directNodes
          .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((text) => /weight/i.test(text))
          .slice(0, sampleLimit);

        const cards = Array.from(document.querySelectorAll('.good-item-box .qcListUl .li, .qcListUl .li, .li'));
        const cardTextSamples = cards
          .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((text) => /weight\s*[:：]?\s*\d{1,5}(?:\.\d+)?\s*(?:g|grams?)/i.test(text))
          .slice(0, sampleLimit);

        const titleNode = document.querySelector('.good-item-box .title');
        const titleText = (titleNode?.textContent || '').replace(/\s+/g, ' ').trim();
        const qcMatch = titleText.match(/QC Photos[（(](\d+)[）)]/i);
        const expectedQcCount = Number(qcMatch?.[1] || 0);

        return {
          pageUrl: window.location.href,
          title: document.title,
          expectedQcCount: Number.isFinite(expectedQcCount) && expectedQcCount > 0 ? expectedQcCount : 0,
          directNodeCount: directNodes.length,
          directWeightTexts,
          cardCount: cards.length,
          cardTextSamples,
          bodyTextSample: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300)
        };
      }
    });

    return result || {
      pageUrl: '',
      title: '',
      expectedQcCount: 0,
      directNodeCount: 0,
      directWeightTexts: [],
      cardCount: 0,
      cardTextSamples: [],
      bodyTextSample: ''
    };
  };

  let lastSignature = '';
  let stableAttempts = 0;
  let lastSnapshot = null;

  for (let attempt = 1; attempt <= 20; attempt++) {
    const snapshot = await readSnapshot();
    lastSnapshot = snapshot;

    const signature = snapshot.directWeightTexts.join('||');
    if (signature && signature === lastSignature) {
      stableAttempts += 1;
    } else {
      stableAttempts = signature ? 1 : 0;
      lastSignature = signature;
    }

    if (snapshot.directWeightTexts.length) {
      const directResult = extractWeightsFromTexts(snapshot.directWeightTexts, {
        stage: 'direct-weight-nodes',
        attempt,
        sampleLimit,
        expectedQcCount: snapshot.expectedQcCount,
        pageUrl: snapshot.pageUrl,
        title: snapshot.title,
        directNodeCount: snapshot.directNodeCount,
        directWeightTexts: snapshot.directWeightTexts,
        stableAttempts
      });

      const enoughForPage = snapshot.expectedQcCount > 0 && snapshot.directWeightTexts.length >= Math.min(sampleLimit, snapshot.expectedQcCount);
      if (!directResult.noWeight && (enoughForPage || snapshot.directWeightTexts.length >= sampleLimit || stableAttempts >= 2 || attempt >= 2)) {
        return directResult;
      }
    }

    if (snapshot.cardTextSamples.length) {
      const cardResult = extractWeightsFromTexts(snapshot.cardTextSamples, {
        stage: 'card-text',
        attempt,
        sampleLimit,
        expectedQcCount: snapshot.expectedQcCount,
        pageUrl: snapshot.pageUrl,
        title: snapshot.title,
        directNodeCount: snapshot.directNodeCount,
        cardCount: snapshot.cardCount,
        cardTextSamples: snapshot.cardTextSamples
      });

      if (!cardResult.noWeight) {
        return cardResult;
      }
    }

    if (attempt < 20) {
      await sleep(400);
    }
  }

  const bodyResult = extractWeightsFromTexts([lastSnapshot?.bodyTextSample || ''], {
    stage: 'body-text-fallback',
    attempt: 20,
    sampleLimit,
    expectedQcCount: lastSnapshot?.expectedQcCount || 0,
    pageUrl: lastSnapshot?.pageUrl || '',
    title: lastSnapshot?.title || '',
    directNodeCount: lastSnapshot?.directNodeCount || 0,
    directWeightTexts: lastSnapshot?.directWeightTexts || [],
    cardCount: lastSnapshot?.cardCount || 0,
    cardTextSamples: lastSnapshot?.cardTextSamples || [],
    bodyTextSample: lastSnapshot?.bodyTextSample || ''
  });

  if (!bodyResult.noWeight) {
    return bodyResult;
  }

  return {
    typicalWeightGrams: '',
    minWeightGrams: '',
    maxWeightGrams: '',
    noWeight: true,
    debug: {
      stage: 'no-weight-found',
      attempts: 20,
      sampleLimit,
      expectedQcCount: lastSnapshot?.expectedQcCount || 0,
      pageUrl: lastSnapshot?.pageUrl || '',
      title: lastSnapshot?.title || '',
      directNodeCount: lastSnapshot?.directNodeCount || 0,
      directWeightTexts: lastSnapshot?.directWeightTexts || [],
      cardCount: lastSnapshot?.cardCount || 0,
      cardTextSamples: lastSnapshot?.cardTextSamples || [],
      bodyTextSample: lastSnapshot?.bodyTextSample || ''
    }
  };
}

async function fetchUufindsWeightRangeFromFinalUrl(finalUrl, originContext = {}, sampleLimit = 12, settings = {}) {
  let hiddenTarget = null;
  const exploreMoreUrl = toUufindsExploreMoreUrl(finalUrl) || finalUrl;

  try {
    hiddenTarget = await createBackgroundWindow(exploreMoreUrl, originContext, Boolean(settings?.debugMode));
    await waitForTabComplete(hiddenTarget.tabId, 15000);
    await setHelperTabTitle(hiddenTarget.tabId);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const tab = await chrome.tabs.get(hiddenTarget.tabId);
    if (!tab?.url || !/uufinds\.com/i.test(tab.url)) {
      throw new Error('Hidden UUFinds weight page did not open correctly');
    }

    const range = await scrapeUufindsWeightRangeFromTabV3(hiddenTarget.tabId, clampWeightSampleCount(sampleLimit));
    return {
      ...range,
      finalUrl: toUufindsExploreMoreUrl(tab.url) || tab.url || exploreMoreUrl
    };
  } finally {
    await closeBackgroundTarget(hiddenTarget);
  }
}

async function runUufindsWeightLookup(sourceUrl, productName, settings, originContext = {}) {
  const sessionTarget = await createBackgroundWindow('https://www.uufinds.com/qcfinds', originContext, Boolean(settings?.debugMode));

  return new Promise(async (resolve, reject) => {
    let settled = false;
    let fallbackInterval = null;
    let fallbackTimeout = null;

    const cleanupSession = async () => {
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
        fallbackTimeout = null;
      }
    };

    const resolveOnce = async (value) => {
      if (settled) return;
      settled = true;
      await cleanupSession();
      resolve(value);
    };

    const rejectOnce = async (error) => {
      if (settled) return;
      settled = true;
      await cleanupSession();
      reject(error);
    };

    qcAutomationSessions.set(sessionTarget.tabId, {
      targetMode: sessionTarget.targetMode,
      windowId: sessionTarget.windowId,
      startedAt: Date.now(),
      sourceUrl,
      productName,
      mode: 'weightLookup',
      originTabId: originContext.originTabId,
      lookupKey: originContext.lookupKey || '',
      requestId: originContext.requestId || '',
      weightSampleCount: clampWeightSampleCount(settings?.weightSampleCount),
      resolveWeight: resolveOnce,
      rejectWeight: rejectOnce
    });

    try {
      await notifyWeightStatus(originContext.originTabId, originContext.lookupKey, 'opening', 'Opening UUFinds...', originContext.requestId || '');
      await waitForTabComplete(sessionTarget.tabId, 15000);
      const readyTab = await chrome.tabs.get(sessionTarget.tabId);

      if (!readyTab?.url || !/^https:\/\/www\.uufinds\.com\/qcfinds/i.test(readyTab.url)) {
        throw new Error('Hidden UUFinds page did not open correctly for weight lookup');
      }

      await chrome.scripting.executeScript({
        target: { tabId: sessionTarget.tabId },
        func: automateUUFinds,
        args: [sourceUrl, productName, settings, { tabId: sessionTarget.tabId }]
      });

      await notifyWeightStatus(originContext.originTabId, originContext.lookupKey, 'searching', 'Searching QC...', originContext.requestId || '');

      fallbackInterval = setInterval(async () => {
        if (settled) return;

        try {
          const liveSession = qcAutomationSessions.get(sessionTarget.tabId);
          if (!liveSession) return;

          const currentTab = await chrome.tabs.get(sessionTarget.tabId);
          const currentUrl = String(currentTab?.url || '');
          const detectedNodes = await detectUufindsWeightNodes(
            sessionTarget.tabId,
            clampWeightSampleCount(settings?.weightSampleCount)
          );

          if (detectedNodes.nodeCount > 0 && detectedNodes.texts.length > 0) {
            await notifyWeightStatus(originContext.originTabId, originContext.lookupKey, 'reading', 'Reading weights...', originContext.requestId || '');
            const directRange = await scrapeUufindsWeightRangeFromTabV3(
              sessionTarget.tabId,
              clampWeightSampleCount(settings?.weightSampleCount)
            );

            if (!directRange.noWeight) {
              qcAutomationSessions.delete(sessionTarget.tabId);
              await closeBackgroundTarget(sessionTarget);

              await notifyWeightStatus(originContext.originTabId, originContext.lookupKey, 'done', 'Weight ready', originContext.requestId || '');
              await resolveOnce({
                success: true,
                finalUrl: toUufindsExploreMoreUrl(currentUrl) || detectedNodes.pageUrl || currentUrl,
                typicalWeightGrams: directRange.typicalWeightGrams || '',
                minWeightGrams: directRange.minWeightGrams || '',
                maxWeightGrams: directRange.maxWeightGrams || '',
                noWeight: false,
                debug: {
                  ...(directRange.debug || {}),
                  fallbackRecovered: true,
                  recoveredFromVisibleNodes: true
                }
              });
              return;
            }
          }

          if (!/exploreMore|goodItemDetail|\/qc\//i.test(currentUrl)) {
            return;
          }

          const exploreMoreUrl = toUufindsExploreMoreUrl(currentUrl);
          if (!exploreMoreUrl) {
            return;
          }

          await notifyWeightStatus(originContext.originTabId, originContext.lookupKey, 'reading', 'Reading weights...', originContext.requestId || '');

          if (currentUrl !== exploreMoreUrl) {
            await chrome.tabs.update(sessionTarget.tabId, { url: exploreMoreUrl });
            await waitForTabComplete(sessionTarget.tabId, 15000);
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));
          }

          const range = await scrapeUufindsWeightRangeFromTabV3(
            sessionTarget.tabId,
            clampWeightSampleCount(settings?.weightSampleCount)
          );

          qcAutomationSessions.delete(sessionTarget.tabId);
          await closeBackgroundTarget(sessionTarget);

          await notifyWeightStatus(originContext.originTabId, originContext.lookupKey, 'done', 'Weight ready', originContext.requestId || '');
          await resolveOnce({
            success: true,
            finalUrl: exploreMoreUrl,
            typicalWeightGrams: range.typicalWeightGrams || '',
            minWeightGrams: range.minWeightGrams || '',
            maxWeightGrams: range.maxWeightGrams || '',
            noWeight: range.noWeight === true,
            debug: {
              ...(range.debug || {}),
              fallbackRecovered: true
            }
          });
        } catch {
          // keep polling until timeout
        }
      }, 1000);

      fallbackTimeout = setTimeout(async () => {
        if (settled) return;
        qcAutomationSessions.delete(sessionTarget.tabId);
        await closeBackgroundTarget(sessionTarget);
        await notifyWeightStatus(originContext.originTabId, originContext.lookupKey, 'error', 'Weight lookup timed out', originContext.requestId || '');
        await rejectOnce(new Error('Hidden UUFinds weight lookup timed out'));
      }, 25000);
    } catch (err) {
      qcAutomationSessions.delete(sessionTarget.tabId);
      await closeBackgroundTarget(sessionTarget);
      await notifyWeightStatus(originContext.originTabId, originContext.lookupKey, 'error', 'Weight lookup failed', originContext.requestId || '');
      await rejectOnce(err);
    }
  });
}

function isExplicitNoWeightValue(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized === '--' || normalized === '-' || /^n\/a$/i.test(normalized);
}

function extractExplicitNoWeightFromHtml(html) {
  const content = String(html || '');
  if (!content) return false;

  const explicitNoWeightPattern = /<div[^>]+class=["'][^"']*weight-box[^"']*["'][^>]*>\s*<div[^>]+class=["'][^"']*item(?:\s|["'])[^"']*["'][^>]*>\s*Weight\s*\(g\)\s*<\/div>\s*<div[^>]+class=["'][^"']*item1[^"']*["'][^>]*>\s*(--|-|N\/A)\s*<\/div>\s*<\/div>/i;
  return explicitNoWeightPattern.test(content);
}

async function clearWeightCache() {
  pendingWeightRequests.clear();
  await setLocalStorage({
    [WEIGHT_CACHE_KEY]: {}
  });
  await bumpCacheVersion(WEIGHT_CACHE_VERSION_KEY);
  await broadcastCacheInvalidation('weight');
}

async function clearQcCache() {
  pendingQcWarmRequests.clear();
  await setLocalStorage({
    [QC_CACHE_KEY]: {}
  });
  await bumpCacheVersion(QC_CACHE_VERSION_KEY);
  await broadcastCacheInvalidation('qc');
}

async function getCacheStats() {
  const stored = await getLocalStorage([WEIGHT_CACHE_KEY, QC_CACHE_KEY]);
  const weightCache = normalizeWeightCache(stored?.[WEIGHT_CACHE_KEY]);
  const qcCache = normalizeQcCache(stored?.[QC_CACHE_KEY]);

  const weightEntries = Object.keys(weightCache).length;
  const qcEntries = Object.keys(qcCache).length;
  const totalBytes = estimateStorageBytes(weightCache) + estimateStorageBytes(qcCache);

  return {
    weightEntries,
    qcEntries,
    totalEntries: weightEntries + qcEntries,
    totalBytes
  };
}

function extractAcbuyWeightFromHtml(html) {
  const content = String(html || '');
  if (!content) return '';

  const exactWeightBoxPattern = /<div[^>]+class=["'][^"']*weight-box[^"']*["'][^>]*>\s*<div[^>]+class=["'][^"']*item(?:\s|["'])[^"']*["'][^>]*>\s*Weight\s*\(g\)\s*<\/div>\s*<div[^>]+class=["'][^"']*item1[^"']*["'][^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/div>\s*<\/div>/i;
  const match = content.match(exactWeightBoxPattern);
  const normalizedWeight = normalizeWeightValue(match?.[1] || '');
  if (normalizedWeight) {
    return normalizedWeight;
  }

  const tableScopedPattern = /class=["'][^"']*table[^"']*["'][\s\S]{0,2000}?Weight\s*\(g\)[\s\S]{0,200}?class=["'][^"']*item1[^"']*["'][^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*</i;
  const tableMatch = content.match(tableScopedPattern);
  const fallbackWeight = normalizeWeightValue(tableMatch?.[1] || '');
  if (fallbackWeight) {
    return fallbackWeight;
  }

  return '';
}

async function waitForTabComplete(tabId, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(error);
    };

    chrome.tabs.get(tabId, (existingTab) => {
      if (!chrome.runtime.lastError && existingTab?.status === 'complete') {
        finishResolve();
      }
    });

    function listener(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== 'complete') return;
      finishResolve();
    }

    const timeoutId = setTimeout(() => {
      finishReject(new Error('Timed out waiting for hidden tab'));
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function createBackgroundAcbuyTab(acbuyUrl, originContext = {}) {
  const popupWindow = await chrome.windows.create({
    url: acbuyUrl,
    focused: false,
    type: 'popup',
    left: BACKGROUND_POPUP_BOUNDS.left,
    top: BACKGROUND_POPUP_BOUNDS.top,
    width: BACKGROUND_POPUP_BOUNDS.width,
    height: BACKGROUND_POPUP_BOUNDS.height
  });

  if (popupWindow?.id) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 75));
      await chrome.windows.update(popupWindow.id, {
        focused: false,
        state: 'minimized'
      });
    } catch {
      // ignore minimize failures and continue
    }
  }

  await restoreOriginFocus(originContext);

  let tab = popupWindow?.tabs?.[0];
  if (!tab?.id && popupWindow?.id) {
    try {
      const populatedWindow = await chrome.windows.get(popupWindow.id, { populate: true });
      tab = populatedWindow?.tabs?.[0];
    } catch {
      // ignore and fail below
    }
  }

  if (!popupWindow?.id || !tab?.id) {
    throw new Error('Could not create hidden ACBuy window');
  }

  return {
    tabId: tab.id,
    cleanup: async () => {
      try {
        await chrome.windows.remove(popupWindow.id);
      } catch {
        // ignore cleanup failures
      }
    }
  };
}

async function scrapeAcbuyWeightFromHiddenTab(acbuyUrl, originContext = {}) {
  let hiddenTarget = null;

  try {
    hiddenTarget = await createBackgroundAcbuyTab(acbuyUrl, originContext);

    await waitForTabComplete(hiddenTarget.tabId);
    await new Promise((resolve) => setTimeout(resolve, 350));

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: hiddenTarget.tabId },
      func: async () => {
        const isExplicitNoWeightValue = (value) => {
          const normalized = String(value || '').replace(/\s+/g, ' ').trim();
          return normalized === '--' || normalized === '-' || /^n\/a$/i.test(normalized);
        };

        const normalizeWeight = (value) => {
          if (isExplicitNoWeightValue(value)) return '__NO_WEIGHT__';
          const match = String(value || '').match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*$/);
          return match ? match[1] : '';
        };

        const readWeightFromTable = () => {
          const table = document.querySelector('.table');
          if (!table) return '';

          const boxes = Array.from(table.querySelectorAll('.weight-box'));
          for (const box of boxes) {
            const labelText = (box.querySelector('.item:not(.item1)')?.textContent || '')
              .replace(/\s+/g, ' ')
              .trim();
            if (!/^weight\s*\(g\)$/i.test(labelText)) continue;

            const valueText = (box.querySelector('.item1')?.textContent || '')
              .replace(/\s+/g, ' ')
              .trim();
            if (isExplicitNoWeightValue(valueText)) return '__NO_WEIGHT__';
            const normalized = normalizeWeight(valueText);
            if (normalized) return normalized;
          }

          return '';
        };

        const readWeight = () => {
          const tableWeight = readWeightFromTable();
          if (tableWeight) return tableWeight;

          const tableRows = Array.from(document.querySelectorAll('tr'));
          for (const row of tableRows) {
            const cells = row.querySelectorAll('td, th');
            if (cells.length < 2) continue;

            const labelText = (cells[0].textContent || '').replace(/\s+/g, ' ').trim();
            const valueText = (cells[1].textContent || '').replace(/\s+/g, ' ').trim();
            if (!/^weight\s*\(g\)$/i.test(labelText)) continue;

            if (isExplicitNoWeightValue(valueText)) {
              return '__NO_WEIGHT__';
            }
            const normalized = normalizeWeight(valueText);
            if (normalized) {
              return normalized;
            }
          }

          return '';
        };

        const startedAt = Date.now();
        while (Date.now() - startedAt < 5000) {
          const weight = readWeight();
          if (weight) return weight;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        return '';
      }
    });

    if (result === '__NO_WEIGHT__') {
      return result;
    }

    return normalizeWeightValue(result || '');
  } finally {
    if (hiddenTarget?.cleanup) {
      await hiddenTarget.cleanup();
    }
  }
}

async function fetchProductWeight(request, originContext = {}) {
  const settings = await loadSettings();
  const cacheVersions = await getCacheVersions();
  if (!settings.itemWeightEnabled) {
    return { success: false, error: 'Item Weight is disabled' };
  }

  const id = String(request.id || '').trim();
  const channel = String(request.channel || '').trim().toLowerCase();
  const sourceUrl = String(request.sourceUrl || '').trim();
  const productName = String(request.productName || '').trim();
  const requestId = String(request.requestId || '').trim();
  const forceRefresh = Boolean(request.forceRefresh);
  const weightSampleCount = clampWeightSampleCount(settings.weightSampleCount);
  const cacheKey = getWeightCacheRequestKey({ id, channel });

  if (!id || !sourceUrl || !cacheKey) {
    return { success: false, error: 'Missing product weight lookup details' };
  }

  if (!forceRefresh) {
    const cachedEntry = await readCachedWeight(cacheKey);
    if (cachedEntry && !cachedEntry.noWeight) {
      return buildWeightRangeResponseBase({
        id,
        channel,
        sourceUrl,
        cached: true,
        entry: cachedEntry
      });
    }
  }

  const existingPending = pendingWeightRequests.get(cacheKey);
  if (existingPending) {
    if (Date.now() - existingPending.startedAt < 25000) {
      return existingPending.promise;
    }
    pendingWeightRequests.delete(cacheKey);
  }

  const corePromise = (async () => {
    const cachedQcResult = await readCachedQcResult(sourceUrl);
    let lookupResult = null;

    try {
      if (cachedQcResult?.finalUrl) {
        await notifyWeightStatus(originContext.originTabId, cacheKey, 'reading', 'Reading cached QC...', requestId);
        try {
          lookupResult = await fetchUufindsWeightRangeFromFinalUrl(cachedQcResult.finalUrl, { ...originContext, requestId }, weightSampleCount, settings);
        } catch (cachedLookupError) {
          if (!productName) {
            throw cachedLookupError;
          }
          await notifyWeightStatus(originContext.originTabId, cacheKey, 'searching', 'Retrying live QC...', requestId);
          lookupResult = await runUufindsWeightLookup(sourceUrl, productName, settings, {
            ...originContext,
            lookupKey: cacheKey,
            requestId
          });
        }
      } else {
        if (!productName) {
          return { success: false, error: 'Missing product name for UUFinds weight lookup' };
        }
        lookupResult = await runUufindsWeightLookup(sourceUrl, productName, settings, {
          ...originContext,
          lookupKey: cacheKey,
          requestId
        });
      }

      if (!lookupResult) {
        throw new Error('UUFinds weight lookup failed');
      }

      if (lookupResult.finalUrl) {
        await writeCachedQcResult(sourceUrl, {
          finalUrl: lookupResult.finalUrl,
          productName,
          fetchedAt: Date.now()
        }, cacheVersions.qc);
      }

      if (!lookupResult.minWeightGrams && !lookupResult.maxWeightGrams && !lookupResult.noWeight) {
        throw new Error('Could not find item weights on the UUFinds page');
      }

      const cacheEntry = {
        weightGrams: '',
        typicalWeightGrams: lookupResult.typicalWeightGrams || '',
        minWeightGrams: lookupResult.minWeightGrams || '',
        maxWeightGrams: lookupResult.maxWeightGrams || '',
        noWeight: lookupResult.noWeight === true,
        debug: lookupResult.debug || null,
        fetchedAt: Date.now(),
        sourceUrl,
        uufindsUrl: lookupResult.finalUrl || cachedQcResult?.finalUrl || ''
      };

      await writeCachedWeight(cacheKey, cacheEntry, cacheVersions.weight);

      await notifyWeightStatus(originContext.originTabId, cacheKey, 'done', 'Weight ready', requestId);
      return buildWeightRangeResponseBase({
        id,
        channel,
        sourceUrl,
        cached: false,
        entry: cacheEntry
      });
    } catch (error) {
      await notifyWeightStatus(originContext.originTabId, cacheKey, 'error', 'Weight unavailable', requestId);
      throw error;
    }
  })();

  const requestPromise = Promise.race([
    corePromise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Weight lookup timed out in background'));
      }, 25000);
    })
  ]);

  pendingWeightRequests.set(cacheKey, {
    promise: requestPromise,
    startedAt: Date.now()
  });

  try {
    return await requestPromise;
  } finally {
    const currentPending = pendingWeightRequests.get(cacheKey);
    if (currentPending?.promise === requestPromise) {
      pendingWeightRequests.delete(cacheKey);
    }
  }
}

async function prewarmQcCache(sourceUrl, productName, settings, originContext = {}) {
  const safeSourceUrl = String(sourceUrl || '').trim();
  const safeProductName = String(productName || '').trim();
  const cacheKey = getQcCacheKey(safeSourceUrl);
  const cacheVersions = await getCacheVersions();

  if (!safeSourceUrl || !safeProductName || !cacheKey) {
    return { success: false, error: 'Missing QC prewarm details' };
  }

  const cachedQcResult = await readCachedQcResult(safeSourceUrl);
  if (cachedQcResult?.finalUrl) {
    return {
      success: true,
      cached: true,
      finalUrl: cachedQcResult.finalUrl
    };
  }

  const existingPending = pendingQcWarmRequests.get(cacheKey);
  if (existingPending) {
    return existingPending;
  }

  const warmPromise = (async () => {
    const sessionTarget = await createBackgroundWindow('https://www.uufinds.com/qcfinds', originContext, Boolean(settings?.debugMode));

    return new Promise(async (resolve, reject) => {
      let timeoutId = null;

      const resolveOnce = async (value) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve(value);
      };

      const rejectOnce = async (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        reject(error);
      };

      qcAutomationSessions.set(sessionTarget.tabId, {
        targetMode: sessionTarget.targetMode,
        windowId: sessionTarget.windowId,
        startedAt: Date.now(),
        sourceUrl: safeSourceUrl,
        productName: safeProductName,
        mode: 'prewarm',
        qcCacheVersion: cacheVersions.qc,
        resolvePrewarm: resolveOnce,
        rejectPrewarm: rejectOnce
      });

      try {
        await waitForTabComplete(sessionTarget.tabId, 15000);
        await setHelperTabTitle(sessionTarget.tabId);
        const readyTab = await chrome.tabs.get(sessionTarget.tabId);
        if (!readyTab?.url || !/^https:\/\/www\.uufinds\.com\/qcfinds/i.test(readyTab.url)) {
          throw new Error('Hidden UUFinds page did not open correctly for prewarm');
        }

        await chrome.scripting.executeScript({
          target: { tabId: sessionTarget.tabId },
          func: automateUUFinds,
          args: [safeSourceUrl, safeProductName, settings, { tabId: sessionTarget.tabId }]
        });

        timeoutId = setTimeout(async () => {
          qcAutomationSessions.delete(sessionTarget.tabId);
          await closeBackgroundTarget(sessionTarget);
          await rejectOnce(new Error('QC cache prewarm timed out'));
        }, 25000);
      } catch (error) {
        qcAutomationSessions.delete(sessionTarget.tabId);
        await closeBackgroundTarget(sessionTarget);
        await rejectOnce(error);
      }
    });
  })();

  pendingQcWarmRequests.set(cacheKey, warmPromise);

  try {
    return await warmPromise;
  } finally {
    if (pendingQcWarmRequests.get(cacheKey) === warmPromise) {
      pendingQcWarmRequests.delete(cacheKey);
    }
  }
}

async function handleQCCheck(sourceUrl, productName, settings, originContext = {}) {
  const cacheVersions = await getCacheVersions();
  const cachedQcResult = await readCachedQcResult(sourceUrl);
  const revealMode = settings.qcOpenMode === 'tab' ? 'tab' : 'window';
  const targetUrl = cachedQcResult?.finalUrl || 'https://www.uufinds.com/qcfinds';

  await notifyQcStatus(originContext.originTabId, 'launching', 'Starting QC...');

  if (cachedQcResult?.finalUrl && revealMode === 'tab') {
    await notifyQcStatus(originContext.originTabId, 'opening', 'Opening cached QC...');
    await chrome.tabs.create({
      url: cachedQcResult.finalUrl,
      active: true,
      ...(Number.isInteger(originContext.originWindowId) && originContext.originWindowId >= 0
        ? { windowId: originContext.originWindowId }
        : {})
    });
    await notifyQcStatus(originContext.originTabId, 'done', 'QC ready');
    return;
  }

  const sessionTarget = await createBackgroundWindow(targetUrl, originContext, Boolean(settings?.debugMode));
  qcAutomationSessions.set(sessionTarget.tabId, {
    targetMode: sessionTarget.targetMode,
    windowId: sessionTarget.windowId,
    startedAt: Date.now(),
    sourceUrl,
    productName,
    revealMode,
    originWindowId: originContext.originWindowId,
    originTabId: originContext.originTabId,
    qcCacheVersion: cacheVersions.qc
  });

  try {
      await notifyQcStatus(originContext.originTabId, 'opening', 'Opening UUFinds...');
      await waitForTabComplete(sessionTarget.tabId, 15000);
      await setHelperTabTitle(sessionTarget.tabId);
      const readyTab = await chrome.tabs.get(sessionTarget.tabId);

      if (cachedQcResult?.finalUrl) {
        await notifyQcStatus(originContext.originTabId, 'opening', 'Opening cached QC...');
        await revealQCSession(sessionTarget.tabId, cachedQcResult.finalUrl).catch(() => {});
        qcAutomationSessions.delete(sessionTarget.tabId);
        await notifyQcStatus(originContext.originTabId, 'done', 'QC ready');
        return;
      }

    if (!readyTab?.url || !/^https:\/\/www\.uufinds\.com\/qcfinds/i.test(readyTab.url)) {
      throw new Error('Hidden UUFinds page did not open correctly');
    }

    await chrome.scripting.executeScript({
      target: { tabId: sessionTarget.tabId },
      func: automateUUFinds,
      args: [sourceUrl, productName, settings, { tabId: sessionTarget.tabId }]
    });
    await notifyQcStatus(originContext.originTabId, 'searching', 'Searching QC...');
  } catch (err) {
    console.error('[LitbuyTools BG] QC startup failed:', err);
    await notifyQcStatus(originContext.originTabId, 'error', 'QC failed');
    await revealQCSession(sessionTarget.tabId).catch(() => {});
    qcAutomationSessions.delete(sessionTarget.tabId);
    throw err;
  }
}

async function openBatchLinks(urls, intervalMs) {
  let opened = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    await chrome.tabs.create({
      url,
      active: i === 0
    });
    opened += 1;

    if (i < urls.length - 1 && intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return opened;
}

function decodeEscapedUrl(value) {
  if (!value) return '';
  let decoded = String(value);
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&');
}

const WRAPPED_URL_PARAM_NAMES = [
  'url',
  'target',
  'targeturl',
  'redirect',
  'redirecturl',
  'redirect_url',
  'dest',
  'destination',
  'to',
  'u',
  'link',
  'itemlink',
  'goodslink',
  'productlink'
];

function extractEmbeddedMarketplaceUrlCandidates(value) {
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (candidate) => {
    if (!candidate) return;
    let normalized = decodeEscapedUrl(candidate).trim();
    if (!normalized) return;
    if (normalized.startsWith('//')) normalized = `https:${normalized}`;
    normalized = normalized.replace(/["'<>\\]+$/g, '');
    normalized = normalized.replace(/[),.;]+$/g, '');
    if (!/^https?:\/\//i.test(normalized)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const text = String(value || '');
  [text, decodeEscapedUrl(text)].forEach((chunk) => {
    if (!chunk) return;
    pushCandidate(chunk);

    const patterns = [
      /https?:\/\/(?:detail|m)\.1688\.com\/offer\/\d+\.html[^"'\\s<>)]*/ig,
      /https?:\/\/(?:item|h5\.m|m(?:\.intl)?)\.taobao\.com\/[^"'\\s<>)]*/ig,
      /https?:\/\/(?:detail|item|m)\.tmall\.com\/[^"'\\s<>)]*/ig,
      /https?:\/\/(?:[a-z0-9-]+\.)*weidian\.com\/item\.html\?[^"'\\s<>)]*/ig,
      /https?:\/\/(?:e|m)\.tb\.cn\/[^"'\\s<>)]*/ig
    ];

    for (const pattern of patterns) {
      const matches = chunk.match(pattern) || [];
      matches.forEach(pushCandidate);
    }
  });

  return candidates;
}

function parseMarketplaceDetailsFromUrl(rawUrl, depth = 0) {
  if (depth > 2) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = (url.hostname || '').toLowerCase();
  const path = url.pathname || '';
  const normalizedUrl = url.toString();

  if (/^(?:detail|m)\.1688\.com$/i.test(host)) {
    const match = path.match(/\/offer\/(\d+)\.html/i);
    if (match) {
      return { channel: '1688', id: match[1], resolvedUrl: normalizedUrl };
    }
  }

  if (/^(?:item|h5\.m|m(?:\.intl)?)\.taobao\.com$/i.test(host)) {
    const id =
      url.searchParams.get('id') ||
      url.searchParams.get('item_id') ||
      url.searchParams.get('itemId') ||
      url.searchParams.get('itemid') ||
      (path.match(/(?:^|\/)i(\d+)\.htm/i)?.[1] || '');
    if (id && /^\d+$/.test(id)) {
      return { channel: 'taobao', id, resolvedUrl: normalizedUrl };
    }
  }

  if (/^(?:detail|item|m)\.tmall\.com$/i.test(host)) {
    const id =
      url.searchParams.get('id') ||
      url.searchParams.get('item_id') ||
      url.searchParams.get('itemId') ||
      url.searchParams.get('itemid');
    if (id && /^\d+$/.test(id)) {
      return { channel: 'tmall', id, resolvedUrl: normalizedUrl };
    }
  }

  if (/^(?:[a-z0-9-]+\.)*weidian\.com$/i.test(host)) {
    const id =
      url.searchParams.get('itemID') ||
      url.searchParams.get('itemId') ||
      url.searchParams.get('itemid');
    if (id && /^\d+$/.test(id)) {
      return { channel: 'weidian', id, resolvedUrl: normalizedUrl };
    }
  }

  for (const paramName of WRAPPED_URL_PARAM_NAMES) {
    const values = url.searchParams.getAll(paramName);
    for (const value of values) {
      const candidates = extractEmbeddedMarketplaceUrlCandidates(value);
      for (const candidate of candidates) {
        const nested = parseMarketplaceDetailsFromUrl(candidate, depth + 1);
        if (nested) return nested;
      }
    }
  }

  const embeddedInUrl = extractEmbeddedMarketplaceUrlCandidates(normalizedUrl);
  for (const candidate of embeddedInUrl) {
    if (candidate === normalizedUrl) continue;
    const nested = parseMarketplaceDetailsFromUrl(candidate, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function extractMarketplaceUrlFromHtml(html) {
  if (!html) return null;

  const candidates = extractEmbeddedMarketplaceUrlCandidates(html);
  for (const candidate of candidates) {
    const parsed = parseMarketplaceDetailsFromUrl(candidate);
    if (parsed) return parsed;
  }

  return null;
}

async function resolveMarketplaceUrl(rawUrl) {
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return { success: false, error: 'Invalid URL' };
  }

  const direct = parseMarketplaceDetailsFromUrl(rawUrl);
  if (direct) {
    return { success: true, ...direct };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal
    });

    const resolvedFromUrl = parseMarketplaceDetailsFromUrl(response.url);
    if (resolvedFromUrl) {
      return { success: true, ...resolvedFromUrl };
    }

    const html = await response.text();
    const resolvedFromHtml = extractMarketplaceUrlFromHtml(html);
    if (resolvedFromHtml) {
      return { success: true, ...resolvedFromHtml };
    }

    return { success: false, error: 'Could not resolve to supported marketplace URL' };
  } catch (err) {
    return { success: false, error: err.message || 'Resolve failed' };
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeImageCandidate(value) {
  if (!value) return '';

  let normalized = decodeEscapedUrl(value).trim();
  if (!normalized) return '';
  if (normalized.startsWith('//')) normalized = `https:${normalized}`;
  normalized = normalized.replace(/["'<>\\]+$/g, '');
  normalized = normalized.replace(/[),.;]+$/g, '');
  if (!/^https?:\/\//i.test(normalized)) return '';
  return normalized;
}

function collectRegexImageCandidates(html, patterns) {
  const collected = [];
  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    for (const match of html.matchAll(regex)) {
      if (match && match[1]) {
        collected.push(match[1]);
      } else if (match && match[0]) {
        collected.push(match[0]);
      }
    }
  }
  return collected;
}

function pickBestImageCandidate(candidates) {
  const scored = [];
  for (const candidate of candidates) {
    const normalized = normalizeImageCandidate(candidate);
    if (!normalized) continue;
    if (/logo|favicon|avatar|sprite|blank|loading|spinner|skeleton|icon/i.test(normalized)) continue;

    let score = 0;
    if (/alicdn|geilicdn|taobao|tmall|weidian|1688/i.test(normalized)) score += 40;
    if (/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(normalized)) score += 20;
    if (/bao\/uploaded|\/uploaded\//i.test(normalized)) score += 15;
    if (/thumb|small|64x64|80x80|100x100/i.test(normalized)) score -= 20;
    scored.push({ url: normalized, score });
  }

  if (scored.length === 0) return '';
  scored.sort((a, b) => b.score - a.score);
  return scored[0].url;
}

function extractLitbuyThumbnailFromHtml(html) {
  if (!html) return '';

  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/ig,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/ig,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/ig,
    /"mainImage"\s*:\s*"([^"]+)"/ig,
    /"image"\s*:\s*"([^"]+)"/ig,
    /"img(?:Url)?"\s*:\s*"([^"]+)"/ig,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/ig,
    /https?:\/\/(?:si\.geilicdn\.com|img\.alicdn\.com|gd\d+\.alicdn\.com|gw\.alicdn\.com|cbu01\.alicdn\.com)\/[^"'\\s<>]+/ig
  ];

  const candidates = collectRegexImageCandidates(html, patterns);
  return pickBestImageCandidate(candidates);
}

function extractSourceThumbnailFromHtml(html) {
  if (!html) return '';

  const patterns = [
    /<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]+href=["']([^"']+)["']/ig,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']preload["'][^>]+as=["']image["']/ig,
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/ig,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/ig,
    /"image"\s*:\s*"([^"]+)"/ig,
    /"img(?:Url)?"\s*:\s*"([^"]+)"/ig,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/ig,
    /https?:\/\/(?:si\.geilicdn\.com|img\.alicdn\.com|gd\d+\.alicdn\.com|gw\.alicdn\.com|cbu01\.alicdn\.com)\/[^"'\\s<>]+/ig
  ];

  const candidates = collectRegexImageCandidates(html, patterns);
  return pickBestImageCandidate(candidates);
}

async function fetchLitbuyThumbnail(rawUrl) {
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return { success: false, error: 'Invalid URL' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal
    });

    const finalUrl = response.url || rawUrl;
    if (!/^https?:\/\/(?:www\.)?litbuy\.com\//i.test(finalUrl)) {
      return { success: false, error: 'Not a Litbuy URL' };
    }

    const html = await response.text();
    const thumbnailUrl = extractLitbuyThumbnailFromHtml(html);
    if (!thumbnailUrl) {
      return { success: false, error: 'No thumbnail found' };
    }

    return { success: true, thumbnailUrl };
  } catch (err) {
    return { success: false, error: err.message || 'Thumbnail fetch failed' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSourceThumbnail(rawUrl) {
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return { success: false, error: 'Invalid URL' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal
    });

    const html = await response.text();
    const thumbnailUrl = extractSourceThumbnailFromHtml(html);
    if (!thumbnailUrl) {
      return { success: false, error: 'No source thumbnail found' };
    }

    return { success: true, thumbnailUrl };
  } catch (err) {
    return { success: false, error: err.message || 'Source thumbnail fetch failed' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Injected into UUFinds - fully event-driven automation
 */
function automateUUFinds(sourceUrl, productName, settings, context = {}) {
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
    
    function normalizeComparisonText(value) {
      return String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
      const normalizedItemName = normalizeComparisonText(itemName);
      const normalizedTargetName = normalizeComparisonText(productName);
      const matches =
        itemName === productName ||
        (normalizedItemName && normalizedTargetName && (
          normalizedItemName === normalizedTargetName ||
          normalizedItemName.includes(normalizedTargetName) ||
          normalizedTargetName.includes(normalizedItemName)
        ));
      
      if (matches) {
        console.log('[QC] ✓✓ MATCH FOUND ✓✓');
        console.log('[QC]   Item name:', itemName);
        console.log('[QC]   Target name:', productName);
      }
      
      return matches;
    }

    function getResultCard(img) {
      return img.closest('.goods-item, .li, [class*="goods-item"], [class*="product"], [class*="item"], [class*="card"]')
        || img.parentElement?.parentElement
        || null;
    }

    function collectFreshResultCards() {
      const seenCards = new Set();
      const freshCards = [];

      for (const img of document.querySelectorAll(IMG_SEL)) {
        const rect = img.getBoundingClientRect();
        if (rect.width < 50 || rect.height < 50 || rect.top < 0) {
          continue;
        }

        const keys = getKeys(img);
        const isFreshResult = keys.some((key) => !initialImgKeys.has(key)) || window.location.href !== initialUrl;
        if (!isFreshResult) {
          continue;
        }

        const card = getResultCard(img);
        if (!card || seenCards.has(card)) {
          continue;
        }

        seenCards.add(card);
        const cardRect = card.getBoundingClientRect();
        freshCards.push({
          card,
          img,
          top: cardRect.top || rect.top,
          left: cardRect.left || rect.left
        });
      }

      freshCards.sort((a, b) => Math.abs(a.top - b.top) < 100 ? a.left - b.left : a.top - b.top);
      return freshCards;
    }

    function removeHomeContentForSearch() {}
    function restoreHomeContentAfterSearch() {}

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
    removeHomeContentForSearch();
    const initialUrl = window.location.href;
    const initialImgs = Array.from(document.querySelectorAll(IMG_SEL));
    const initialImgKeys = new Set(initialImgs.flatMap((img) => getKeys(img)));
    console.log('[QC] Initial URL:', initialUrl);
    console.log('[QC] Looking for item with name:', productName);
    
    let resultFound = false;
    let searchClickTime = 0;
    let searchProgressDetected = false;
    let searchButtonRetried = false;

    function hasSearchProgress() {
      if (window.location.href !== initialUrl) {
        return true;
      }

      const currentImgs = Array.from(document.querySelectorAll(IMG_SEL));
      if (currentImgs.length !== initialImgs.length) {
        return true;
      }

      for (const img of currentImgs) {
        const keys = getKeys(img);
        if (keys.some((key) => !initialImgKeys.has(key))) {
          return true;
        }
      }

      if (document.querySelector('[class*="loading"], [class*="skeleton"], [class*="spin"], .nut-overlay, .nut-toast')) {
        return true;
      }

      return false;
    }
    
    const newResultPromise = new Promise((resolve, reject) => {
      let checksPerformed = 0;
      
      const searchObs = new MutationObserver(() => {
        if (resultFound) return;
        
        checksPerformed++;
        const timeSinceSearch = Date.now() - searchClickTime;
        
        // Don't check too early - wait at least 100ms for search to process
        if (timeSinceSearch < 100) return;

        if (!searchProgressDetected && hasSearchProgress()) {
          searchProgressDetected = true;
          console.log('[QC] Search progress confirmed via URL/result change');
        }

        if (!searchProgressDetected) return;
        
        // Log check
        if (checksPerformed % 10 === 0) {
          console.log('[QC] Observer check #' + checksPerformed + ' at ' + timeSinceSearch + 'ms');
        }
        
        // Find fresh post-search results only
        const freshCards = collectFreshResultCards();
        
        const matchingImgs = [];
        
        for (const { img, top, left } of freshCards) {
          // Check if this image's item has the matching product name
          if (hasMatchingName(img)) {
            matchingImgs.push({ img, top, left, timeSinceSearch });
            console.log('[QC] ✓ FOUND MATCHING ITEM:', {
              src: img.src,
              top,
              left,
              timeSinceSearch: timeSinceSearch
            });
          }
        }
        
        if (freshCards.length === 1) {
          const topResult = freshCards[0];
          console.log('[QC] Single fresh result card detected - clicking it directly');
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

        if (matchingImgs.length > 0) {
          matchingImgs.sort((a, b) => Math.abs(a.top - b.top) < 100 ? a.left - b.left : a.top - b.top);
          
          const topResult = matchingImgs[0];
          if (matchingImgs.length > 0) {
            console.log('[QC] ✓✓✓ MATCHED BY NAME - CLICKING NOW ✓✓✓');
            console.log('[QC] Found', matchingImgs.length, 'items with matching name');
          } else {
            console.log('[QC] ✓ Fresh search result detected - clicking first fresh result');
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

        if (!searchProgressDetected && hasSearchProgress()) {
          searchProgressDetected = true;
          console.log('[QC] [Poll] Search progress confirmed');
        }

        if (!searchProgressDetected && !searchButtonRetried && timeSinceSearch >= 1200) {
          searchButtonRetried = true;
          console.log('[QC] Search progress not detected, retrying search click once');
          btn.click();
          return;
        }

        if (!searchProgressDetected) return;
        
        const freshCards = collectFreshResultCards();
        const matchingImgs = [];
        
        // Log every second (20 checks at 50ms intervals)
        const checkNum = Math.floor(timeSinceSearch / 50);
        if (checkNum % 20 === 0) {
          console.log('[QC] [Poll] Checking', freshCards.length, 'fresh cards at', timeSinceSearch, 'ms');
        }
        
        for (const { img, top, left } of freshCards) {
          // Check if this image's item has the matching product name
          if (hasMatchingName(img)) {
            matchingImgs.push({ img, top, left });
          }
        }

        if (freshCards.length === 1) {
          console.log('[QC] [Poll] Single fresh result card detected (', timeSinceSearch, 'ms)');
          
          resultFound = true;
          searchObs.disconnect();
          clearInterval(pollInterval);
          resolve(freshCards[0].img);
          return;
        }

        if (matchingImgs.length > 0) {
          matchingImgs.sort((a, b) => Math.abs(a.top - b.top) < 100 ? a.left - b.left : a.top - b.top);
          if (matchingImgs.length > 0) {
            console.log('[QC] ✓ Poll: found', matchingImgs.length, 'items with matching name (', timeSinceSearch, 'ms)');
          } else {
            console.log('[QC] ✓ Poll: fresh search result detected (', timeSinceSearch, 'ms)');
          }
          
          resultFound = true;
          searchObs.disconnect();
          clearInterval(pollInterval);
          resolve(matchingImgs[0].img);
          return;
        }
      }, 50);

      setTimeout(() => {
        searchObs.disconnect();
        clearInterval(pollInterval);
        restoreHomeContentAfterSearch();
        if (!resultFound) {
          reject(new Error('Timeout: no matching search result after ' + settings.resultTimeout + 's'));
        }
      }, settings.resultTimeout * 1000);
    });

    // ── CLICK SEARCH BUTTON (observers are ready) ──
    btn.click();
    searchClickTime = Date.now();
    console.log('[QC] ✓ Search button clicked at', searchClickTime);

    // ── WAIT FOR NEW RESULT ──
    try {
      const img = await newResultPromise;
    
    // Configurable delay (default 0 for instant clicking)
    const delay = settings.resultClickDelay || 0;
    if (delay > 0) {
      console.log('[QC] User-configured delay:', delay, 'ms');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    console.log('[QC] ✓✓✓ CLICKING RESULT NOW ✓✓✓');
    const clickable = img.closest('a, div[class*="card"], div[class*="item"]') || img;
    const preClickUrl = window.location.href;
    clickable.click();
    if (clickable.tagName === 'A' && clickable.href) {
      window.location.href = clickable.href;
    }

      await new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const checkNavigation = () => {
        if (window.location.href !== preClickUrl) {
          resolve();
          return;
        }

        if (Date.now() - startedAt > 5000) {
          reject(new Error('Result click did not trigger navigation'));
          return;
        }

        setTimeout(checkNavigation, 100);
      };
        checkNavigation();
      });
    } finally {
      restoreHomeContentAfterSearch();
    }
  }

  // ── STEP 4: Click "More" button on detail page ──
  async function step4_clickMore() {
    console.log('[QC] Step 4: wait for detail page + More button');

    await new Promise((resolve, reject) => {
      const check = () => {
        if (/exploreMore/i.test(window.location.href)) {
          resolve('exploreMore');
          return;
        }

        if (window.location.href.includes('goodItemDetail') || window.location.href.includes('/qc/')) {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
      setTimeout(() => reject(new Error('Detail page timeout')), 15000);
    });

    if (/exploreMore/i.test(window.location.href)) {
      console.log('[QC] Already on exploreMore page - skipping More click');
      try {
        chrome.runtime.sendMessage({
          action: 'qcAutomationStatus',
          stage: 'final-ready',
          tabId: context.tabId,
          finalUrl: window.location.href
        });
      } catch {
        // ignore reveal notification failures
      }
      return;
    }

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

    await new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        if ((/exploreMore|goodItemDetail|\/qc\//i.test(window.location.href)) && document.readyState === 'complete') {
          resolve();
          return;
        }

        if (Date.now() - startedAt > 15000) {
          reject(new Error('Final QC page timeout'));
          return;
        }

        setTimeout(check, 200);
      };
      check();
    });

    console.log('[QC] Clicked More - DONE!');

    try {
      chrome.runtime.sendMessage({
        action: 'qcAutomationStatus',
        stage: 'final-ready',
        tabId: context.tabId,
        finalUrl: window.location.href
      });
    } catch {
      // ignore reveal notification failures
    }
  }

  // ── Run all steps ──
  (async () => {
    try {
      await step1_fillAndSearch();
      await step4_clickMore();
    } catch (err) {
      console.error('[QC] Automation error:', err);
      try {
        chrome.runtime.sendMessage({
          action: 'qcAutomationStatus',
          stage: 'error',
          tabId: context.tabId
        });
      } catch {
        // ignore reveal notification failures
      }
      try {
        await navigator.clipboard.writeText(sourceUrl);
        alert('Automation issue. Link copied to clipboard:\n' + sourceUrl);
      } catch {
        alert('Please paste this link manually:\n' + sourceUrl);
      }
    }
  })();
}
