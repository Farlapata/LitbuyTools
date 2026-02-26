/**
 * LitbuyTools - Reddit Link Tools
 * 1) Link Choice Popup on click
 * 2) Thread Harvester side panel (important-first)
 */

(function() {
  'use strict';

  if (window !== window.top) return;

  const DEFAULT_SETTINGS = {
    linkRouterEnabled: true,
    threadHarvesterEnabled: true,
    threadHarvesterLitbuyImagesEnabled: false
  };

  const CHANNEL_LABELS = {
    '1688': '1688',
    'taobao': 'Taobao',
    'weidian': 'Weidian',
    'tmall': 'TMall'
  };

  const DEFAULT_VISIBLE_RESULTS = 10;
  const MAX_THUMBNAIL_CONCURRENCY = 4;
  const SHORT_LINK_HOSTS = new Set([
    'e.tb.cn',
    'm.tb.cn',
    'tb.cn',
    's.click.taobao.com',
    's.click.tmall.com'
  ]);
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

  const SUPPORTED_PATTERNS = [
    {
      channel: '1688',
      hostRegex: /^(?:detail|m)\.1688\.com$/i,
      extractId: (url) => {
        const match = url.pathname.match(/\/offer\/(\d+)\.html/i);
        return match ? match[1] : '';
      }
    },
    {
      channel: 'taobao',
      hostRegex: /^(?:item|h5\.m|m(?:\.intl)?)\.taobao\.com$/i,
      extractId: (url) =>
        url.searchParams.get('id') ||
        url.searchParams.get('item_id') ||
        url.searchParams.get('itemId') ||
        url.searchParams.get('itemid') ||
        (url.pathname.match(/(?:^|\/)i(\d+)\.htm/i)?.[1] || '')
    },
    {
      channel: 'weidian',
      hostRegex: /^(?:[a-z0-9-]+\.)*weidian\.com$/i,
      extractId: (url) =>
        url.searchParams.get('itemID') ||
        url.searchParams.get('itemId') ||
        url.searchParams.get('itemid') ||
        ''
    },
    {
      channel: 'tmall',
      hostRegex: /^(?:detail|item|m)\.tmall\.com$/i,
      extractId: (url) =>
        url.searchParams.get('id') ||
        url.searchParams.get('item_id') ||
        url.searchParams.get('itemId') ||
        url.searchParams.get('itemid') ||
        ''
    }
  ];

  let linkRouterEnabled = true;
  let threadHarvesterEnabled = true;
  let threadHarvesterLitbuyImagesEnabled = false;
  let redditSearchLinkCounterEnabled = false;

  let activeModal = null;
  let activeSelection = null;
  let escListener = null;

  let harvesterLauncher = null;
  let harvesterPanel = null;
  let harvesterResults = [];
  let queueKeys = new Set();
  let showAllResults = false;
  let scanDebounceTimer = null;
  let toastTimer = null;
  let domObserver = null;
  let lastUrl = window.location.href;
  let currentSubreddit = null;
  let dragMoveHandler = null;
  let dragUpHandler = null;
  const shortResolveCache = new Map();
  let resolvingShortLinks = false;
  let hydratingLitbuyThumbnails = false;
  const litbuyThumbnailCache = new Map();
  const sourceThumbnailCache = new Map();
  const searchCounterSummaryCache = new Map();
  const searchCounterInFlight = new Set();
  const SEARCH_URL_REGEX = /https?:\/\/[^\s<>"')\]]+/ig;
  const MARKETPLACE_TEXT_REGEXES = [
    /(?:https?:\/\/)?(?:detail|m)\.1688\.com\/offer\/\d+\.html[^\s<>"')\]]*/ig,
    /(?:https?:\/\/)?(?:item|h5\.m|m(?:\.intl)?)\.taobao\.com\/[^\s<>"')\]]*/ig,
    /(?:https?:\/\/)?(?:detail|item|m)\.tmall\.com\/[^\s<>"')\]]*/ig,
    /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*weidian\.com\/item\.html\?[^\s<>"')\]]*/ig,
    /(?:https?:\/\/)?(?:e|m)\.tb\.cn\/[^\s<>"')\]]*/ig,
    /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:mulebuy|pandabuy|allchinabuy|cssbuy|hoobuy|superbuy|cnfans|joyabuy)\.com\/[^\s<>"')\]]*/ig
  ];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCurrentSubreddit() {
    const match = window.location.pathname.match(/\/r\/([^\/?#]+)/i);
    return match ? match[1] : null;
  }

  function getPlatformIconText(channel) {
    if (channel === '1688') return '16';
    if (channel === 'taobao') return 'TB';
    if (channel === 'weidian') return 'WD';
    if (channel === 'tmall') return 'TM';
    return '??';
  }

  function buildLitbuyUrl(channel, id) {
    return `https://www.litbuy.com/products/details?id=${encodeURIComponent(id)}&channel=${encodeURIComponent(channel)}`;
  }

  function toLinkInfo(channel, id, originalUrl, domain, extra = {}) {
    return {
      key: `${channel}:${id}`,
      id,
      channel,
      platformLabel: CHANNEL_LABELS[channel] || channel,
      originalUrl,
      litbuyUrl: buildLitbuyUrl(channel, id),
      domain,
      ...extra
    };
  }

  function decodeCandidateText(value) {
    if (!value) return '';

    let decoded = String(value).trim();
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
      .replace(/\\u002f/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&')
      .trim();
  }

  function extractEmbeddedUrlCandidates(value) {
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (candidate) => {
      if (!candidate) return;

      let normalized = String(candidate).trim();
      if (!normalized) return;
      if (normalized.startsWith('//')) normalized = `https:${normalized}`;
      normalized = normalized.replace(/["'<>\\]+$/g, '');
      normalized = normalized.replace(/[),.;]+$/g, '');
      if (!/^https?:\/\//i.test(normalized)) return;

      if (seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    };

    const decoded = decodeCandidateText(value);
    [String(value || ''), decoded].forEach((text) => {
      if (!text) return;

      pushCandidate(text);

      const patterns = [
        /https?:\/\/(?:detail|m)\.1688\.com\/offer\/\d+\.html[^"'\\s<>)]*/ig,
        /https?:\/\/(?:item|h5\.m|m(?:\.intl)?)\.taobao\.com\/[^"'\\s<>)]*/ig,
        /https?:\/\/(?:detail|item|m)\.tmall\.com\/[^"'\\s<>)]*/ig,
        /https?:\/\/(?:[a-z0-9-]+\.)*weidian\.com\/item\.html\?[^"'\\s<>)]*/ig,
        /https?:\/\/(?:e|m)\.tb\.cn\/[^"'\\s<>)]*/ig
      ];

      for (const pattern of patterns) {
        const matches = text.match(pattern) || [];
        matches.forEach(pushCandidate);
      }
    });

    return candidates;
  }

  function parseShortTbLink(url) {
    const host = (url.hostname || '').toLowerCase();
    if (!SHORT_LINK_HOSTS.has(host)) return null;

    const tk = url.searchParams.get('tk') || '';
    const pathToken = (url.pathname || '').replace(/\//g, '');
    const token = (tk || pathToken || host).slice(0, 120);
    const hintedChannel = host.includes('tmall') ? 'tmall' : 'taobao';

    return {
      key: `short:${host}:${token}`,
      id: token,
      channel: hintedChannel,
      platformLabel: CHANNEL_LABELS[hintedChannel] || 'Short Link',
      originalUrl: url.toString(),
      litbuyUrl: '',
      domain: host,
      resolveNeeded: true
    };
  }

  function parseDirectMarketplaceUrl(url) {
    for (const pattern of SUPPORTED_PATTERNS) {
      if (!pattern.hostRegex.test(url.hostname)) continue;

      const id = pattern.extractId(url);
      if (!id || !/^\d+$/.test(id)) return null;

      return toLinkInfo(
        pattern.channel,
        id,
        url.toString(),
        url.hostname.replace(/^www\./i, '')
      );
    }

    return null;
  }

  function parseSupportedProductLink(rawHref, depth = 0) {
    if (!rawHref) return null;
    if (depth > 2) return null;

    let url;
    try {
      url = new URL(rawHref, window.location.href);
    } catch {
      return null;
    }

    if (!/^https?:$/i.test(url.protocol)) return null;

    const direct = parseDirectMarketplaceUrl(url);
    if (direct) return direct;

    const shortLink = parseShortTbLink(url);
    if (shortLink) return shortLink;

    const wrappedPlatform = parseWrappedPlatformLink(url);
    if (wrappedPlatform) return wrappedPlatform;

    for (const name of WRAPPED_URL_PARAM_NAMES) {
      const values = url.searchParams.getAll(name);
      for (const rawValue of values) {
        const nestedCandidates = extractEmbeddedUrlCandidates(rawValue);
        for (const candidate of nestedCandidates) {
          const nested = parseSupportedProductLink(candidate, depth + 1);
          if (nested) return nested;
        }
      }
    }

    const embeddedCandidates = extractEmbeddedUrlCandidates(url.toString());
    for (const candidate of embeddedCandidates) {
      if (candidate === url.toString()) continue;
      const nested = parseSupportedProductLink(candidate, depth + 1);
      if (nested) return nested;
    }

    return null;
  }

  function isRedditSearchPage() {
    const path = (window.location.pathname || '').toLowerCase();
    return /\/search(\/|$)/i.test(path);
  }

  function isRedditCommentsPage() {
    const path = (window.location.pathname || '').toLowerCase();
    return /^\/r\/[^\/?#]+\/comments\/[^\/?#]+/i.test(path);
  }

  function isHarvesterActiveOnPage() {
    return threadHarvesterEnabled && isRedditCommentsPage();
  }

  function isSearchCounterActiveOnPage() {
    return false;
  }

  function detectChannelFromPlatformHint(value) {
    const platform = (value || '').toLowerCase();
    if (!platform) return '';
    if (platform.includes('1688')) return '1688';
    if (platform.includes('weidian') || platform === 'wd') return 'weidian';
    if (platform.includes('tmall')) return 'tmall';
    if (platform.includes('taobao') || platform === 'tb') return 'taobao';
    return '';
  }

  function parseWrappedPlatformLink(url) {
    const host = (url.hostname || '').toLowerCase();
    if (host.includes('reddit.com')) return null;

    const id =
      url.searchParams.get('id') ||
      url.searchParams.get('item_id') ||
      url.searchParams.get('itemId') ||
      url.searchParams.get('itemid') ||
      url.searchParams.get('goods_id') ||
      url.searchParams.get('num_iid') ||
      '';
    if (!/^\d+$/.test(id)) return null;

    const platformHint =
      url.searchParams.get('platform') ||
      url.searchParams.get('shop_type') ||
      url.searchParams.get('source') ||
      url.searchParams.get('channel') ||
      '';
    const channel = detectChannelFromPlatformHint(platformHint);
    if (!channel) return null;

    return toLinkInfo(
      channel,
      id,
      url.toString(),
      url.hostname.replace(/^www\./i, '')
    );
  }

  function getSearchResultCards() {
    const cardSelector = 'shreddit-search-result, search-telemetry-tracker, article, div.search-result, div.thing, [data-testid="search-post-unit"], [data-testid="search-post-container"], [data-testid="post-container"], [data-click-id="body"]';
    let anchors = document.querySelectorAll('a[data-testid="post-title"][href*="/comments/"], a[data-testid="post-title"]');
    if (!anchors.length) {
      anchors = document.querySelectorAll('a[href*="/comments/"]');
    }
    const seen = new Set();
    const cards = [];

    const findCardFromAnchor = (anchor) => {
      const explicit = anchor.closest(cardSelector);
      if (explicit) return explicit;

      let node = anchor;
      let depth = 0;
      let best = null;
      while (node && node !== document.body && depth < 14) {
        if (node.nodeType === 1) {
          const text = (node.textContent || '').trim();
          const hasTitleLink = Boolean(node.querySelector('a[data-testid="post-title"], a[href*="/comments/"]'));
          const hasCommentMeta = /\bcomments?\b/i.test(text);
          const hasVoteMeta = /\bvotes?\b/i.test(text);
          if (hasTitleLink && (hasCommentMeta || hasVoteMeta || text.length > 140)) {
            best = node;
          }
        }
        node = node.parentElement;
        depth += 1;
      }

      return best || anchor.parentElement || anchor;
    };

    anchors.forEach((anchor) => {
      const card = findCardFromAnchor(anchor);
      if (!card || seen.has(card)) return;
      seen.add(card);
      cards.push(card);
    });

    return cards;
  }

  function createEmptyLinkSummary() {
    return {
      total: 0,
      counts: {
        '1688': 0,
        'taobao': 0,
        'weidian': 0,
        'tmall': 0
      }
    };
  }

  function countSupportedLinksFromCandidates(candidates) {
    const summary = createEmptyLinkSummary();
    const seen = new Set();

    const addLink = (parsed) => {
      if (!parsed || !parsed.channel) return;
      const signature = parsed.resolveNeeded
        ? `${parsed.channel}:${parsed.originalUrl}`
        : `${parsed.channel}:${parsed.id}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      summary.counts[parsed.channel] = (summary.counts[parsed.channel] || 0) + 1;
    };

    for (const candidate of candidates) {
      addLink(parseSupportedProductLink(candidate));
    }

    summary.total =
      summary.counts['1688'] +
      summary.counts['taobao'] +
      summary.counts['weidian'] +
      summary.counts['tmall'];

    return summary;
  }

  function collectUrlCandidatesFromText(text, maxMatches = 160) {
    const results = [];
    const seen = new Set();
    if (!text) return results;

    const pushCandidate = (raw) => {
      if (!raw) return;
      let normalized = String(raw).trim();
      if (!normalized) return;
      normalized = normalized.replace(/["'<>\\]+$/g, '');
      normalized = normalized.replace(/[),.;]+$/g, '');
      if (!normalized) return;
      if (normalized.startsWith('//')) normalized = `https:${normalized}`;
      if (!/^https?:\/\//i.test(normalized) && /(?:^|\.)(?:1688\.com|taobao\.com|tmall\.com|weidian\.com|tb\.cn|mulebuy\.com|pandabuy\.com|allchinabuy\.com|cssbuy\.com|hoobuy\.com|superbuy\.com|cnfans\.com|joyabuy\.com)/i.test(normalized)) {
        normalized = `https://${normalized}`;
      }
      if (!/^https?:\/\//i.test(normalized)) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      results.push(normalized);
    };

    const textChunks = [String(text), decodeCandidateText(String(text))];
    let match;
    let safety = 0;

    for (const chunk of textChunks) {
      if (!chunk) continue;

      SEARCH_URL_REGEX.lastIndex = 0;
      while ((match = SEARCH_URL_REGEX.exec(chunk)) && safety < maxMatches) {
        safety += 1;
        pushCandidate(match[0]);
      }

      let regexSafety = 0;
      for (const regex of MARKETPLACE_TEXT_REGEXES) {
        regex.lastIndex = 0;
        while ((match = regex.exec(chunk)) && regexSafety < maxMatches) {
          regexSafety += 1;
          pushCandidate(match[0]);
        }
        if (regexSafety >= maxMatches) break;
      }
    }

    return results;
  }

  function countSupportedLinksInNode(rootEl) {
    const candidates = [];

    rootEl.querySelectorAll('a[href]').forEach((anchor) => {
      candidates.push(anchor.href);
    });

    candidates.push(...collectUrlCandidatesFromText(rootEl.textContent || '', 120));
    return countSupportedLinksFromCandidates(candidates);
  }

  function getSearchPostUrlFromCard(card) {
    const titleAnchor = card.querySelector('a[data-testid="post-title"][href*="/comments/"], a[href*="/comments/"]');
    if (!titleAnchor) return '';

    try {
      const url = new URL(titleAnchor.href, window.location.href);
      const match = url.pathname.match(/^\/r\/[^\/?#]+\/comments\/[^\/?#]+(?:\/[^\/?#]+)?/i);
      if (!match) return '';
      return `${url.origin}${match[0]}`;
    } catch {
      return '';
    }
  }

  async function fetchSearchPostSummary(postUrl) {
    if (!postUrl) return createEmptyLinkSummary();

    const normalized = postUrl.replace(/\/+$/, '');
    const jsonUrl = `${normalized}.json?raw_json=1&limit=40&depth=8`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(jsonUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal
      });

      if (!response.ok) return createEmptyLinkSummary();
      const payload = await response.json();
      const postData = payload && payload[0] && payload[0].data && payload[0].data.children && payload[0].data.children[0] && payload[0].data.children[0].data;
      if (!postData) return createEmptyLinkSummary();

      const textSources = [
        postData.title || '',
        postData.selftext || '',
        postData.selftext_html || '',
        postData.url || '',
        postData.url_overridden_by_dest || '',
        postData.media && postData.media.oembed && postData.media.oembed.url ? postData.media.oembed.url : '',
        postData.secure_media && postData.secure_media.oembed && postData.secure_media.oembed.url ? postData.secure_media.oembed.url : '',
        postData.permalink ? `https://www.reddit.com${postData.permalink}` : '',
        JSON.stringify(postData.media_metadata || {}),
        JSON.stringify(postData.preview || {})
      ];

      const commentListing = payload && payload[1] && payload[1].data && Array.isArray(payload[1].data.children)
        ? payload[1].data.children
        : [];

      const queue = [...commentListing];
      let scannedComments = 0;
      while (queue.length > 0 && scannedComments < 140) {
        const node = queue.shift();
        if (!node || node.kind !== 't1' || !node.data) continue;
        scannedComments += 1;

        const data = node.data;
        textSources.push(data.body || '');
        textSources.push(data.body_html || '');
        textSources.push(data.permalink ? `https://www.reddit.com${data.permalink}` : '');
        if (data.link_url) textSources.push(data.link_url);
        if (data.url) textSources.push(data.url);

        if (data.replies && typeof data.replies === 'object' && data.replies.data && Array.isArray(data.replies.data.children)) {
          queue.push(...data.replies.data.children);
        }
      }

      const candidates = [];
      for (const text of textSources) {
        if (!text) continue;
        candidates.push(text);
        candidates.push(...collectUrlCandidatesFromText(text, 220));
      }

      return countSupportedLinksFromCandidates(candidates);
    } catch {
      return createEmptyLinkSummary();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function queueFetchSearchPostSummary(postUrl) {
    if (!postUrl) return;
    if (searchCounterSummaryCache.has(postUrl)) return;
    if (searchCounterInFlight.has(postUrl)) return;

    searchCounterInFlight.add(postUrl);

    fetchSearchPostSummary(postUrl)
      .then((summary) => {
        searchCounterSummaryCache.set(postUrl, summary || createEmptyLinkSummary());
      })
      .catch(() => {
        searchCounterSummaryCache.set(postUrl, createEmptyLinkSummary());
      })
      .finally(() => {
        searchCounterInFlight.delete(postUrl);
        scheduleScan(40);
      });
  }

  function getSearchCounterHost(card) {
    const titleAnchor = card.querySelector('a[data-testid="post-title"][href*="/comments/"], a[data-testid="post-title"]');
    if (titleAnchor) {
      const titleBlock = titleAnchor.closest('h1, h2, h3, faceplate-tracker, div');
      if (titleBlock && titleBlock.parentElement) {
        return { host: titleBlock.parentElement, afterEl: titleBlock };
      }
      if (titleAnchor.parentElement) {
        return { host: titleAnchor.parentElement, afterEl: null };
      }
    }

    const selectors = [
      '[data-testid="post-content"]',
      '.search-result-body',
      '.search-result-entry',
      '.search-result-information',
      '.search-result-content',
      '.md'
    ];

    for (const selector of selectors) {
      const el = card.querySelector(selector);
      if (el) return { host: el, afterEl: null };
    }
    return { host: card, afterEl: null };
  }

  function renderSearchCounterForCard(card, summary, options = {}) {
    const counterSelector = '.litbuy-search-link-counter[data-litbuy-search-counter="1"]';
    let badge = card.querySelector(counterSelector);

    if (!summary) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'litbuy-search-link-counter';
      badge.dataset.litbuySearchCounter = '1';
    }

    const placement = getSearchCounterHost(card);
    const host = placement.host;
    if (placement.afterEl && placement.afterEl.parentElement === host) {
      if (badge.parentNode !== host || badge.previousElementSibling !== placement.afterEl) {
        placement.afterEl.insertAdjacentElement('afterend', badge);
      }
    } else if (badge.parentNode !== host) {
      host.appendChild(badge);
    }

    const order = ['weidian', 'taobao', 'tmall', '1688'];
    const labelMap = {
      weidian: 'WD',
      taobao: 'TB',
      tmall: 'TM',
      '1688': '1688'
    };

    const chips = order
      .filter((channel) => summary.counts[channel] > 0)
      .map((channel) => {
        const channelClass = escapeHtml(channel);
        const label = escapeHtml(labelMap[channel]);
        const count = escapeHtml(summary.counts[channel]);
        return `<span class="litbuy-search-link-chip channel-${channelClass}">${label} ${count}</span>`;
      })
      .join('');

    const loading = Boolean(options.loading);
    const totalText = loading
      ? 'checking...'
      : (summary.total === 1 ? '1 link' : `${summary.total} links`);
    badge.classList.toggle('is-empty', summary.total <= 0);
    badge.classList.toggle('is-loading', loading);
    badge.innerHTML = `
      <span class="litbuy-search-link-total">${escapeHtml(totalText)}</span>
      ${chips}
    `;
  }

  function clearSearchResultCounters() {
    document
      .querySelectorAll('.litbuy-search-link-counter[data-litbuy-search-counter="1"]')
      .forEach((el) => el.remove());
  }

  function scanSearchResultLinkCounters() {
    if (!redditSearchLinkCounterEnabled || !isRedditSearchPage()) {
      clearSearchResultCounters();
      return;
    }

    const cards = getSearchResultCards();
    const liveCards = new Set(cards);

    cards.forEach((card) => {
      const localSummary = countSupportedLinksInNode(card);
      const postUrl = getSearchPostUrlFromCard(card);
      const cachedSummary = postUrl ? searchCounterSummaryCache.get(postUrl) : null;

      const summary = (cachedSummary && cachedSummary.total > 0)
        ? cachedSummary
        : localSummary;

      const needsFetch = Boolean(postUrl) && !cachedSummary && localSummary.total <= 0;
      if (needsFetch) {
        queueFetchSearchPostSummary(postUrl);
      }

      const loading = Boolean(postUrl) && searchCounterInFlight.has(postUrl) && summary.total <= 0;
      renderSearchCounterForCard(card, summary, { loading });
    });

    document
      .querySelectorAll('.litbuy-search-link-counter[data-litbuy-search-counter="1"]')
      .forEach((badge) => {
        const container = badge.closest('shreddit-search-result, search-telemetry-tracker, article, div.search-result, div.thing, [data-testid="search-post-unit"], [data-testid="post-container"]');
        if (!container || !liveCards.has(container)) {
          badge.remove();
        }
      });
  }

  function getAnchorHint(anchor) {
    const text = (anchor.textContent || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    return text.length > 70 ? `${text.slice(0, 67)}...` : text;
  }

  function getPreviewImage(anchor) {
    const findCandidate = (root) => {
      if (!root) return '';
      const images = root.querySelectorAll('img[src]');
      for (const img of images) {
        const src = img.currentSrc || img.src || '';
        if (!src || !/^https?:\/\//i.test(src)) continue;
        if (src.includes('emoji') || src.includes('award_images')) continue;
        if (/avatar|communityicon|styles\/image_widget|styles\/communityIcon|flair|icon|logo|snoo/i.test(src)) continue;

        const width = img.naturalWidth || img.width || img.clientWidth || 0;
        const height = img.naturalHeight || img.height || img.clientHeight || 0;
        if (width > 90 && height > 90) return src;
      }
      return '';
    };

    const direct = findCandidate(anchor);
    if (direct) return direct;

    const container = anchor.closest('shreddit-post, shreddit-comment, article, [data-testid="post-container"]');
    return findCandidate(container);
  }

  function openSelectedUrl(url, openInNewTab) {
    if (openInNewTab) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.assign(url);
  }

  function removeModal() {
    if (activeModal && activeModal.parentNode) {
      activeModal.remove();
    }
    activeModal = null;
    activeSelection = null;

    if (escListener) {
      document.removeEventListener('keydown', escListener, true);
      escListener = null;
    }
  }

  function showChoiceModal(selection) {
    removeModal();
    activeSelection = selection;

    const overlay = document.createElement('div');
    overlay.id = 'litbuy-link-router-overlay';

    const modal = document.createElement('div');
    modal.id = 'litbuy-link-router-modal';
    modal.innerHTML = `
      <div class="litbuy-link-router-title">Open Product Link</div>
      <div class="litbuy-link-router-subtitle">
        Where do you want to open this ${selection.platformLabel} link?
      </div>
      <div class="litbuy-link-router-actions">
        <button class="litbuy-link-router-btn litbuy-link-router-btn-original" data-router-action="original">
          ${selection.platformLabel}
        </button>
        <button class="litbuy-link-router-btn litbuy-link-router-btn-litbuy" data-router-action="litbuy">
          Litbuy
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);
    activeModal = overlay;

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        removeModal();
      }
    });

    modal.addEventListener('click', (event) => {
      const action = event.target.closest('[data-router-action]')?.dataset.routerAction;
      if (!action || !activeSelection) return;

      const destination = action === 'litbuy'
        ? activeSelection.litbuyUrl
        : activeSelection.originalUrl;

      removeModal();
      openSelectedUrl(destination, activeSelection.openInNewTab);
    });

    escListener = (event) => {
      if (event.key === 'Escape') {
        removeModal();
      }
    };
    document.addEventListener('keydown', escListener, true);
  }

  function shouldHandleClick(event) {
    if (!linkRouterEnabled) return false;
    if (event.defaultPrevented) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
    if (activeModal && activeModal.contains(event.target)) return false;

    const targetElement = event.target;
    if (targetElement.closest('#litbuy-harvester-panel') || targetElement.closest('#litbuy-harvester-launcher')) {
      return false;
    }

    return true;
  }

  async function onDocumentClick(event) {
    if (!shouldHandleClick(event)) return;

    const linkEl = event.target.closest('a[href]');
    if (!linkEl) return;

    const linkInfo = parseSupportedProductLink(linkEl.href);
    if (!linkInfo) return;

    event.preventDefault();
    event.stopPropagation();

    const target = (linkEl.getAttribute('target') || '').toLowerCase();
    let finalLinkInfo = linkInfo;
    if (linkInfo.resolveNeeded) {
      const resolved = await resolveLinkInfoIfNeeded(linkInfo);
      if (!resolved) {
        showHarvesterToast('Could not resolve short link. Opening original.');
        openSelectedUrl(linkInfo.originalUrl, target === '_blank');
        return;
      }
      finalLinkInfo = resolved;
    }

    showChoiceModal({
      ...finalLinkInfo,
      openInNewTab: target === '_blank'
    });
  }

  function showHarvesterToast(message) {
    let toast = document.getElementById('litbuy-harvester-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'litbuy-harvester-toast';
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 1900);
  }

  async function copyTextToClipboard(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = value;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function openLinksWithBackgroundTabs(urls) {
    return new Promise((resolve) => {
      if (!urls || urls.length === 0) {
        resolve({ success: true, opened: 0 });
        return;
      }

      chrome.runtime.sendMessage(
        {
          action: 'openBatchLinks',
          urls,
          intervalMs: 180
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { success: false, error: 'No response' });
        }
      );
    });
  }

  function fetchLitbuyThumbnailUrl(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'fetchLitbuyThumbnail', url },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { success: false, error: 'No response' });
        }
      );
    });
  }

  function fetchSourceThumbnailUrl(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'fetchSourceThumbnail', url },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { success: false, error: 'No response' });
        }
      );
    });
  }

  function resolveMarketplaceLink(rawUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'resolveMarketplaceUrl', url: rawUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { success: false, error: 'No response' });
        }
      );
    });
  }

  async function resolveLinkInfoIfNeeded(linkInfo) {
    if (!linkInfo || !linkInfo.resolveNeeded) return linkInfo;

    const cacheKey = linkInfo.originalUrl;
    if (shortResolveCache.has(cacheKey)) {
      return shortResolveCache.get(cacheKey);
    }

    const response = await resolveMarketplaceLink(linkInfo.originalUrl);
    if (!response || !response.success || !response.channel || !response.id) {
      shortResolveCache.set(cacheKey, null);
      return null;
    }

    let resolvedDomain = linkInfo.domain;
    if (response.resolvedUrl) {
      try {
        resolvedDomain = new URL(response.resolvedUrl).hostname.replace(/^www\./i, '');
      } catch {
        resolvedDomain = linkInfo.domain;
      }
    }

    const resolvedInfo = toLinkInfo(
      response.channel,
      response.id,
      linkInfo.originalUrl,
      resolvedDomain,
      {
        resolvedUrl: response.resolvedUrl || '',
        resolveNeeded: false
      }
    );

    shortResolveCache.set(cacheKey, resolvedInfo);
    return resolvedInfo;
  }

  async function ensureItemResolved(item) {
    if (!item || !item.resolveNeeded) return item;

    const oldKey = item.key;
    const resolved = await resolveLinkInfoIfNeeded(item);
    if (!resolved) return null;

    item.key = resolved.key;
    item.id = resolved.id;
    item.channel = resolved.channel;
    item.platformLabel = resolved.platformLabel;
    item.litbuyUrl = resolved.litbuyUrl;
    item.domain = resolved.domain;
    item.resolveNeeded = false;
    item.resolvedUrl = resolved.resolvedUrl || '';
    item.litbuyThumbnailLoaded = false;
    item.litbuyThumbnailUrl = '';
    item.sourceThumbnailLoaded = false;
    item.sourceThumbnailUrl = '';

    if (queueKeys.has(oldKey)) {
      queueKeys.delete(oldKey);
      queueKeys.add(item.key);
    }

    return item;
  }

  async function hydrateThumbnailForItem(item) {
    let changed = false;

    if (item.litbuyUrl && !item.litbuyThumbnailLoaded) {
      if (litbuyThumbnailCache.has(item.litbuyUrl)) {
        const cached = litbuyThumbnailCache.get(item.litbuyUrl) || '';
        if (cached && cached !== item.litbuyThumbnailUrl) changed = true;
        item.litbuyThumbnailUrl = cached;
        item.litbuyThumbnailLoaded = true;
      } else {
        const response = await fetchLitbuyThumbnailUrl(item.litbuyUrl);
        const thumbnailUrl = response && response.success && response.thumbnailUrl
          ? response.thumbnailUrl
          : '';

        if (thumbnailUrl) {
          litbuyThumbnailCache.set(item.litbuyUrl, thumbnailUrl);
        }
        if (thumbnailUrl && thumbnailUrl !== item.litbuyThumbnailUrl) changed = true;
        item.litbuyThumbnailUrl = thumbnailUrl;
        item.litbuyThumbnailLoaded = true;
      }
    }

    if (!item.sourceThumbnailLoaded) {
      if (sourceThumbnailCache.has(item.originalUrl)) {
        const cached = sourceThumbnailCache.get(item.originalUrl) || '';
        if (cached && cached !== item.sourceThumbnailUrl) changed = true;
        item.sourceThumbnailUrl = cached;
        item.sourceThumbnailLoaded = true;
      } else {
        const response = await fetchSourceThumbnailUrl(item.originalUrl);
        const thumbnailUrl = response && response.success && response.thumbnailUrl
          ? response.thumbnailUrl
          : '';

        if (thumbnailUrl) {
          sourceThumbnailCache.set(item.originalUrl, thumbnailUrl);
        }
        if (thumbnailUrl && thumbnailUrl !== item.sourceThumbnailUrl) changed = true;
        item.sourceThumbnailUrl = thumbnailUrl;
        item.sourceThumbnailLoaded = true;
      }
    }

    return changed;
  }

  async function hydrateVisibleLitbuyThumbnails() {
    if (!threadHarvesterLitbuyImagesEnabled) return;
    if (hydratingLitbuyThumbnails) return;

    const targets = getVisibleResults().filter((item) =>
      !item.resolveNeeded &&
      (
        (item.litbuyUrl && !item.litbuyThumbnailLoaded) ||
        (!item.sourceThumbnailLoaded)
      )
    );

    if (targets.length === 0) return;

    hydratingLitbuyThumbnails = true;
    let renderScheduled = false;
    let processedAny = false;

    try {
      const scheduleRender = () => {
        if (renderScheduled) return;
        renderScheduled = true;
        requestAnimationFrame(() => {
          renderScheduled = false;
          renderHarvesterList();
        });
      };

      let nextIndex = 0;
      const workerCount = Math.min(MAX_THUMBNAIL_CONCURRENCY, targets.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          if (currentIndex >= targets.length) break;

          processedAny = true;
          const changed = await hydrateThumbnailForItem(targets[currentIndex]);
          if (changed) scheduleRender();
        }
      });

      await Promise.all(workers);
    } finally {
      hydratingLitbuyThumbnails = false;
    }

    if (processedAny) {
      renderHarvesterList();
    }
  }

  async function resolveUnresolvedItemsInBackground() {
    if (resolvingShortLinks) return;
    const unresolvedItems = harvesterResults.filter((item) => item.resolveNeeded);
    if (unresolvedItems.length === 0) return;

    resolvingShortLinks = true;
    try {
      for (const item of unresolvedItems) {
        await ensureItemResolved(item);
      }
      renderHarvesterList();
    } finally {
      resolvingShortLinks = false;
    }
  }

  function buildSubredditSearchUrl(term) {
    if (currentSubreddit) {
      return `https://www.reddit.com/r/${encodeURIComponent(currentSubreddit)}/search/?q=${encodeURIComponent(term)}&restrict_sr=1&sort=relevance&t=all`;
    }
    return `https://www.reddit.com/search/?q=${encodeURIComponent(term)}`;
  }

  function getVisibleResults() {
    if (showAllResults) return harvesterResults;

    const important = [];
    const remaining = [];
    for (const item of harvesterResults) {
      if (item.occurrences > 1 || queueKeys.has(item.key)) {
        important.push(item);
      } else {
        remaining.push(item);
      }
    }

    const merged = important.concat(remaining);
    return merged.slice(0, DEFAULT_VISIBLE_RESULTS);
  }

  function teardownHarvesterDragListeners() {
    if (dragMoveHandler) {
      window.removeEventListener('mousemove', dragMoveHandler, true);
      dragMoveHandler = null;
    }
    if (dragUpHandler) {
      window.removeEventListener('mouseup', dragUpHandler, true);
      dragUpHandler = null;
    }
    if (harvesterPanel) {
      harvesterPanel.classList.remove('dragging');
    }
    document.documentElement.style.userSelect = '';
  }

  function setupHarvesterDrag() {
    if (!harvesterPanel) return;
    const header = harvesterPanel.querySelector('.litbuy-harvester-header');
    if (!header) return;

    header.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('button, a, input, select, textarea')) return;

      const rect = harvesterPanel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;

      harvesterPanel.style.width = `${Math.round(rect.width)}px`;
      harvesterPanel.style.left = `${Math.round(rect.left)}px`;
      harvesterPanel.style.top = `${Math.round(rect.top)}px`;
      harvesterPanel.style.right = 'auto';
      harvesterPanel.style.bottom = 'auto';
      harvesterPanel.classList.add('dragging');
      document.documentElement.style.userSelect = 'none';

      dragMoveHandler = (moveEvent) => {
        if (!harvesterPanel) return;
        const panelRect = harvesterPanel.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - panelRect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - panelRect.height - 8);
        const nextLeft = Math.min(maxLeft, Math.max(8, moveEvent.clientX - offsetX));
        const nextTop = Math.min(maxTop, Math.max(8, moveEvent.clientY - offsetY));

        harvesterPanel.style.left = `${Math.round(nextLeft)}px`;
        harvesterPanel.style.top = `${Math.round(nextTop)}px`;
      };

      dragUpHandler = () => {
        teardownHarvesterDragListeners();
      };

      window.addEventListener('mousemove', dragMoveHandler, true);
      window.addEventListener('mouseup', dragUpHandler, true);
    });
  }

  function createHarvesterUI() {
    if (harvesterLauncher || harvesterPanel) return;

    harvesterLauncher = document.createElement('button');
    harvesterLauncher.id = 'litbuy-harvester-launcher';
    harvesterLauncher.type = 'button';
    harvesterLauncher.innerHTML = `
      <span class="litbuy-harvester-launcher-label">Links</span>
      <span id="litbuy-harvester-count">0</span>
    `;
    document.documentElement.appendChild(harvesterLauncher);

    harvesterPanel = document.createElement('section');
    harvesterPanel.id = 'litbuy-harvester-panel';
    harvesterPanel.classList.add('hidden');
    harvesterPanel.innerHTML = `
      <div class="litbuy-harvester-header">
        <div>
          <div class="litbuy-harvester-title">Thread Harvester</div>
          <div class="litbuy-harvester-subtitle" id="litbuy-harvester-subtitle">Current subreddit link tools</div>
        </div>
        <button type="button" class="litbuy-harvester-close" data-harvester-action="close">x</button>
      </div>

      <div class="litbuy-harvester-toolbar">
        <button type="button" data-harvester-action="rescan">Rescan</button>
        <button type="button" data-harvester-action="open-all-litbuy">Open Litbuy</button>
        <button type="button" data-harvester-action="copy-all">Copy</button>
      </div>

      <div class="litbuy-harvester-queue-row">
        <span><strong id="litbuy-harvester-summary">0 links</strong> | Queue: <strong id="litbuy-harvester-queue-count">0</strong></span>
        <div class="litbuy-harvester-queue-actions">
          <button type="button" data-harvester-action="open-queue">Open Queue</button>
          <button type="button" data-harvester-action="clear-queue">Clear</button>
        </div>
      </div>

      <div id="litbuy-harvester-list" class="litbuy-harvester-list"></div>
      <button type="button" id="litbuy-harvester-toggle-more" class="litbuy-harvester-toggle-more hidden" data-harvester-action="toggle-more">Show More</button>
    `;
    document.documentElement.appendChild(harvesterPanel);
    setupHarvesterDrag();

    harvesterLauncher.addEventListener('click', () => {
      harvesterPanel.classList.toggle('hidden');
      if (!harvesterPanel.classList.contains('hidden')) {
        scheduleScan(30);
      }
    });

    harvesterPanel.addEventListener('click', async (event) => {
      const actionEl = event.target.closest('[data-harvester-action]');
      if (!actionEl) return;

      const action = actionEl.dataset.harvesterAction;
      if (!action) return;

      if (action === 'close') {
        harvesterPanel.classList.add('hidden');
        return;
      }

      if (action === 'toggle-more') {
        showAllResults = !showAllResults;
        renderHarvesterList();
        return;
      }

      if (action === 'rescan') {
        scanSupportedLinks();
        showHarvesterToast('Rescanned current page');
        return;
      }

      if (action === 'open-all-litbuy') {
        const visibleItems = getVisibleResults();
        for (const item of visibleItems) {
          await ensureItemResolved(item);
        }
        renderHarvesterList();

        const urls = visibleItems
          .filter((item) => item.litbuyUrl)
          .map((item) => item.litbuyUrl);
        if (urls.length === 0) {
          showHarvesterToast('No links found');
          return;
        }
        const result = await openLinksWithBackgroundTabs(urls);
        showHarvesterToast(result && result.success ? `Opened ${result.opened} tabs` : 'Could not open tabs');
        return;
      }

      if (action === 'copy-all') {
        const visible = getVisibleResults();
        for (const item of visible) {
          await ensureItemResolved(item);
        }
        renderHarvesterList();

        if (visible.length === 0) {
          showHarvesterToast('No links to copy');
          return;
        }
        const text = visible
          .map((item) => `${item.platformLabel} ${item.id}\nOriginal: ${item.originalUrl}\nLitbuy: ${item.litbuyUrl}`)
          .join('\n\n');
        const ok = await copyTextToClipboard(text);
        showHarvesterToast(ok ? 'Copied visible links' : 'Clipboard blocked');
        return;
      }

      if (action === 'open-queue') {
        const queuedItems = harvesterResults.filter((item) => queueKeys.has(item.key));
        for (const item of queuedItems) {
          await ensureItemResolved(item);
        }
        renderHarvesterList();

        const queued = queuedItems
          .filter((item) => item.litbuyUrl)
          .map((item) => item.litbuyUrl);

        if (queued.length === 0) {
          showHarvesterToast('Queue is empty');
          return;
        }

        const result = await openLinksWithBackgroundTabs(queued);
        showHarvesterToast(result && result.success ? `Opened ${result.opened} queued tabs` : 'Could not open queued tabs');
        return;
      }

      if (action === 'clear-queue') {
        queueKeys = new Set();
        renderHarvesterList();
        showHarvesterToast('Queue cleared');
      }
    });

    harvesterPanel.addEventListener('click', async (event) => {
      const itemActionEl = event.target.closest('[data-item-action]');
      if (!itemActionEl) return;

      const action = itemActionEl.dataset.itemAction;
      const key = itemActionEl.dataset.key;
      if (!action || !key) return;

      const item = harvesterResults.find((result) => result.key === key);
      if (!item) return;

      if (action === 'original') {
        const result = await openLinksWithBackgroundTabs([item.originalUrl]);
        if (result && result.success) showHarvesterToast('Opened original link');
        return;
      }

      if (action === 'litbuy') {
        const resolved = await ensureItemResolved(item);
        if (!resolved || !resolved.litbuyUrl) {
          showHarvesterToast('Could not resolve this link yet');
          return;
        }
        const result = await openLinksWithBackgroundTabs([item.litbuyUrl]);
        if (result && result.success) showHarvesterToast('Opened Litbuy link');
        renderHarvesterList();
        return;
      }

      if (action === 'queue') {
        if (queueKeys.has(key)) {
          queueKeys.delete(key);
        } else {
          queueKeys.add(key);
        }
        renderHarvesterList();
        return;
      }

      if (action === 'copy') {
        const resolved = await ensureItemResolved(item);
        const text = `${item.platformLabel} ${item.id}\nOriginal: ${item.originalUrl}\nLitbuy: ${resolved && resolved.litbuyUrl ? resolved.litbuyUrl : 'Unavailable'}`;
        const ok = await copyTextToClipboard(text);
        showHarvesterToast(ok ? `Copied ${item.id}` : 'Clipboard blocked');
        renderHarvesterList();
        return;
      }

      if (action === 'search') {
        const resolved = await ensureItemResolved(item);
        const searchTerm = resolved && /^\d+$/.test(resolved.id) ? resolved.id : item.id;
        const searchUrl = buildSubredditSearchUrl(searchTerm);
        const result = await openLinksWithBackgroundTabs([searchUrl]);
        if (result && result.success) showHarvesterToast(currentSubreddit ? `Opened r/${currentSubreddit} search` : 'Opened Reddit search');
        renderHarvesterList();
      }
    });
  }

  function removeHarvesterUI() {
    teardownHarvesterDragListeners();

    if (harvesterLauncher && harvesterLauncher.parentNode) {
      harvesterLauncher.remove();
    }
    if (harvesterPanel && harvesterPanel.parentNode) {
      harvesterPanel.remove();
    }

    const toast = document.getElementById('litbuy-harvester-toast');
    if (toast) toast.remove();

    harvesterLauncher = null;
    harvesterPanel = null;
    harvesterResults = [];
    queueKeys = new Set();
    showAllResults = false;

    if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
    scanDebounceTimer = null;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
  }

  function startObserver() {
    if (domObserver) return;
    if (!isHarvesterActiveOnPage()) return;
    if (!document.body) return;

    domObserver = new MutationObserver(() => {
      scheduleScan(450);
    });

    domObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
  }

  function scheduleScan(delayMs = 180) {
    if (!isHarvesterActiveOnPage()) return;
    if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
    scanDebounceTimer = setTimeout(() => {
      scanSupportedLinks();
    }, delayMs);
  }

  function scanSupportedLinks() {
    const harvesterActive = isHarvesterActiveOnPage();
    if (!harvesterActive) return;

    clearSearchResultCounters();

    const map = new Map();
    const anchors = document.querySelectorAll('a[href]');

    anchors.forEach((anchor) => {
      const parsed = parseSupportedProductLink(anchor.href);
      if (!parsed) return;

      let item = map.get(parsed.key);
      if (!item) {
        item = {
          ...parsed,
          occurrences: 0,
          hints: [],
          previewUrl: '',
          litbuyThumbnailUrl: '',
          litbuyThumbnailLoaded: false,
          sourceThumbnailUrl: '',
          sourceThumbnailLoaded: false
        };
        map.set(parsed.key, item);
      }

      item.occurrences += 1;
      const hint = getAnchorHint(anchor);
      if (hint && !item.hints.includes(hint) && item.hints.length < 1) {
        item.hints.push(hint);
      }

      if (!item.previewUrl) {
        item.previewUrl = getPreviewImage(anchor);
      }
    });

    harvesterResults = Array.from(map.values()).sort((a, b) => {
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return a.id.localeCompare(b.id);
    });

    queueKeys = new Set(harvesterResults.filter((item) => queueKeys.has(item.key)).map((item) => item.key));
    renderHarvesterList();
    resolveUnresolvedItemsInBackground();
  }

  function renderHarvesterList() {
    if (!harvesterLauncher || !harvesterPanel) return;

    currentSubreddit = getCurrentSubreddit();

    const subtitle = harvesterPanel.querySelector('#litbuy-harvester-subtitle');
    if (subtitle) {
      subtitle.textContent = currentSubreddit
        ? `r/${currentSubreddit} link tools`
        : 'All Reddit link tools';
    }

    const totalCount = harvesterResults.length;
    const countEl = harvesterLauncher.querySelector('#litbuy-harvester-count');
    if (countEl) countEl.textContent = String(totalCount);

    const summary = harvesterPanel.querySelector('#litbuy-harvester-summary');
    if (summary) summary.textContent = `${totalCount} links`;

    const queueCount = harvesterPanel.querySelector('#litbuy-harvester-queue-count');
    if (queueCount) queueCount.textContent = String(queueKeys.size);

    const listEl = harvesterPanel.querySelector('#litbuy-harvester-list');
    if (!listEl) return;

    const toggleBtn = harvesterPanel.querySelector('#litbuy-harvester-toggle-more');
    const visibleItems = getVisibleResults();

    if (harvesterResults.length === 0) {
      listEl.innerHTML = `
        <div class="litbuy-harvester-empty">
          No supported links found yet.<br>
          Open any Reddit post or comments with marketplace links.
        </div>
      `;
      if (toggleBtn) toggleBtn.classList.add('hidden');
      return;
    }

    if (toggleBtn) {
      if (harvesterResults.length > visibleItems.length) {
        toggleBtn.classList.remove('hidden');
        toggleBtn.textContent = showAllResults ? 'Show Less' : `Show More (${harvesterResults.length - visibleItems.length})`;
      } else {
        toggleBtn.classList.add('hidden');
      }
    }

    listEl.innerHTML = visibleItems.map((item) => {
      const queued = queueKeys.has(item.key);
      const hintText = item.resolveNeeded
        ? 'Resolving short link...'
        : (threadHarvesterLitbuyImagesEnabled
          ? ((!item.litbuyThumbnailLoaded || !item.sourceThumbnailLoaded)
            ? 'Loading preview...'
            : ((item.litbuyThumbnailUrl || item.sourceThumbnailUrl)
              ? (item.hints[0] || item.domain)
              : 'No preview found'))
          : (item.hints[0] || item.domain));
      const displayId = /^\d+$/.test(item.id)
        ? item.id
        : (item.id.length > 14 ? `${item.id.slice(0, 14)}...` : item.id);
      const mediaThumb = threadHarvesterLitbuyImagesEnabled
        ? (item.litbuyThumbnailUrl || item.sourceThumbnailUrl || '')
        : item.previewUrl;
      const thumb = mediaThumb
        ? `<img class="litbuy-harvester-thumb" src="${escapeHtml(mediaThumb)}" alt="Preview">`
        : `<span class="litbuy-harvester-platform-icon platform-${escapeHtml(item.channel)}">${escapeHtml(getPlatformIconText(item.channel))}</span>`;
      const occurs = item.occurrences > 1
        ? `<span class="litbuy-harvester-occurs">${item.occurrences}x</span>`
        : '';

      return `
        <article class="litbuy-harvester-item">
          <div class="litbuy-harvester-media">${thumb}</div>
          <div class="litbuy-harvester-body">
            <div class="litbuy-harvester-item-head">
              <span class="litbuy-harvester-badge">${escapeHtml(item.platformLabel)}</span>
              <code>${escapeHtml(displayId)}</code>
              ${occurs}
            </div>
            <div class="litbuy-harvester-hints">${escapeHtml(hintText)}</div>
            <div class="litbuy-harvester-item-actions">
              <button type="button" data-item-action="litbuy" data-key="${escapeHtml(item.key)}">Litbuy</button>
              <button type="button" data-item-action="original" data-key="${escapeHtml(item.key)}">Original</button>
              <button type="button" data-item-action="queue" data-key="${escapeHtml(item.key)}">${queued ? 'Queued' : 'Queue'}</button>
              <button type="button" data-item-action="search" data-key="${escapeHtml(item.key)}">Sub Search</button>
              <button type="button" data-item-action="copy" data-key="${escapeHtml(item.key)}">Copy</button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    if (threadHarvesterLitbuyImagesEnabled) {
      hydrateVisibleLitbuyThumbnails();
    }
  }

  function applySettings(settings) {
    linkRouterEnabled = Boolean(settings.linkRouterEnabled);
    threadHarvesterEnabled = Boolean(settings.threadHarvesterEnabled);
    threadHarvesterLitbuyImagesEnabled = Boolean(settings.threadHarvesterLitbuyImagesEnabled);
    redditSearchLinkCounterEnabled = false;

    if (!linkRouterEnabled) {
      removeModal();
    }

    if (isHarvesterActiveOnPage()) {
      createHarvesterUI();
      renderHarvesterList();
    } else {
      removeHarvesterUI();
    }

    if (isHarvesterActiveOnPage()) {
      startObserver();
      scheduleScan(50);
    } else {
      stopObserver();
      clearSearchResultCounters();
    }
  }

  function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      applySettings(settings);
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    const hasRouter = Object.prototype.hasOwnProperty.call(changes, 'linkRouterEnabled');
    const hasHarvester = Object.prototype.hasOwnProperty.call(changes, 'threadHarvesterEnabled');
    const hasHarvesterImages = Object.prototype.hasOwnProperty.call(changes, 'threadHarvesterLitbuyImagesEnabled');
    if (!hasRouter && !hasHarvester && !hasHarvesterImages) return;

    const nextSettings = {
      linkRouterEnabled: hasRouter ? changes.linkRouterEnabled.newValue : linkRouterEnabled,
      threadHarvesterEnabled: hasHarvester ? changes.threadHarvesterEnabled.newValue : threadHarvesterEnabled,
      threadHarvesterLitbuyImagesEnabled: hasHarvesterImages
        ? changes.threadHarvesterLitbuyImagesEnabled.newValue
        : threadHarvesterLitbuyImagesEnabled
    };

    applySettings(nextSettings);
  });

  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      currentSubreddit = getCurrentSubreddit();
      if (isHarvesterActiveOnPage()) {
        createHarvesterUI();
        showAllResults = false;
      } else {
        removeHarvesterUI();
      }

      if (isHarvesterActiveOnPage()) {
        startObserver();
        scheduleScan(120);
      } else {
        stopObserver();
        clearSearchResultCounters();
      }
    }
  }, 500);

  loadSettings();
  document.addEventListener('click', onDocumentClick, true);
})();
