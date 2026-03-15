const UPDATE_REPO = 'Farlapata/LitbuyTools';
const UPDATE_REPO_URL = `https://github.com/${UPDATE_REPO}`;
const UPDATE_CACHE_KEY = 'updateCheckCache';
const LITBUY_TAB_PATTERNS = ['https://litbuy.com/*', 'https://www.litbuy.com/*'];

const TOOL_CATEGORIES = [
  {
    id: 'product',
    title: 'Product Page',
    description: 'Everything that improves product detail pages and product-level decisions.',
    tools: [
      {
        id: 'qc-check',
        name: 'QC Check',
        description: 'Launch UUFinds QC search straight from the product page.',
        icon: eyeIcon(),
        settingsKey: 'qcCheckEnabled',
        defaultEnabled: true,
        settings: [
          selectSetting('buttonPosition', 'Button Position', 'Where the QC button sits in the product action row.', 'left', [
            ['left', 'Left side'],
            ['right', 'Right side']
          ]),
          selectSetting('qcOpenMode', 'Open Result In', 'Choose whether the finished QC result opens in a window or tab.', 'window', [
            ['window', 'QC window'],
            ['tab', 'New tab']
          ]),
          selectSetting('qcCacheMode', 'Preload Strategy', 'Choose when the UUFinds destination is prepared.', 'click', [
            ['click', 'On click'],
            ['pageOpen', 'On page open']
          ]),
          sliderSetting('resultTimeout', 'Result Timeout', 'Maximum wait time for QC search results.', 10, 60, 5, 30, 's')
        ]
      },
      {
        id: 'product-link',
        name: 'Product Link',
        description: 'Show the custom source-link control beside the product tools.',
        icon: linkIcon(),
        settingsKey: 'productLinkEnabled',
        defaultEnabled: true,
        settings: []
      },
      {
        id: 'product-weight',
        name: 'Item Weight',
        description: 'Show the smart item-weight card on product pages.',
        icon: scaleIcon(),
        settingsKey: 'itemWeightProductEnabled',
        defaultEnabled: true,
        settings: [
          sliderSetting('weightSampleCount', 'Sample Count', 'How many QC weights should be sampled for the smart weight.', 1, 30, 1, 12, 'items')
        ]
      },
      {
        id: 'product-shipping',
        name: 'Shipping Estimate',
        description: 'Show the raw Netherlands single-item shipping estimate card.',
        icon: shippingIcon(),
        settingsKey: 'productShippingEnabled',
        defaultEnabled: true,
        settings: []
      },
      {
        id: 'product-price-summary',
        name: 'Price Summary',
        description: 'Replace the big native price line with the cleaner EUR-first summary.',
        icon: euroIcon(),
        settingsKey: 'productPriceSummaryEnabled',
        defaultEnabled: true,
        settings: []
      },
      {
        id: 'hover-preview',
        name: 'Hover Preview',
        description: 'Preview color and variant images on hover.',
        icon: imageIcon(),
        settingsKey: 'hoverPreviewEnabled',
        defaultEnabled: true,
        settings: [
          sliderSetting('hoverDelay', 'Hover Delay', 'Delay before the preview appears.', 0, 5000, 100, 1500, 'ms'),
          selectSetting('previewSize', 'Preview Size', 'Choose the preview panel size.', '400', [
            ['300', 'Small - 300px'],
            ['400', 'Medium - 400px'],
            ['500', 'Large - 500px']
          ]),
          toggleSetting('showCloseButton', 'Show Close Button', 'Display a close button on the preview panel.', true)
        ]
      },
      {
        id: 'image-lightbox',
        name: 'Image Lightbox',
        description: 'Click product and cart images to open the full-screen viewer.',
        icon: fullscreenIcon(),
        settingsKey: 'cartPreviewEnabled',
        defaultEnabled: true,
        settings: []
      }
    ]
  },
  {
    id: 'cart',
    title: 'Cart',
    description: 'Weight, pricing, cleanup, and safety tools for the Litbuy cart.',
    tools: [
      {
        id: 'cart-weights',
        name: 'Cart Weights',
        description: 'Show per-item weights in the cart table.',
        icon: scaleIcon(),
        settingsKey: 'itemWeightCartEnabled',
        defaultEnabled: true,
        settings: []
      },
      {
        id: 'cart-summary',
        name: 'Cart Summary',
        description: 'Show the footer receipt with items, weight, shipping, and total.',
        icon: receiptIcon(),
        settingsKey: 'cartSummaryEnabled',
        defaultEnabled: true,
        settings: []
      },
      {
        id: 'cart-cleanup',
        name: 'Cart Cleanup',
        description: 'Keep the cleaned cart layout, row spacing, and simplified action styling.',
        icon: broomIcon(),
        settingsKey: 'cartCleanupEnabled',
        defaultEnabled: true,
        settings: []
      },
      {
        id: 'delete-confirmations',
        name: 'Delete Confirmation',
        description: 'Ask before deleting a row or deleting selected items.',
        icon: shieldIcon(),
        settingsKey: 'deleteConfirmationsEnabled',
        defaultEnabled: true,
        settings: []
      }
    ]
  },
  {
    id: 'reddit',
    title: 'Reddit & Links',
    description: 'Link routing and thread scanning tools outside Litbuy itself.',
    tools: [
      {
        id: 'link-router',
        name: 'Link Router',
        description: 'Choose whether supported links open in Litbuy or the original marketplace.',
        icon: splitIcon(),
        settingsKey: 'linkRouterEnabled',
        defaultEnabled: true,
        settings: []
      },
      {
        id: 'thread-harvester',
        name: 'Thread Harvester',
        description: 'Scan Reddit threads, dedupe marketplace links, and queue Litbuy opens.',
        icon: stackIcon(),
        settingsKey: 'threadHarvesterEnabled',
        defaultEnabled: true,
        settings: [
          toggleSetting('threadHarvesterLitbuyImagesEnabled', 'Load Litbuy Thumbnails', 'Use Litbuy product thumbnails inside the harvester panel.', false)
        ]
      }
    ]
  },
  {
    id: 'cleanup',
    title: 'Cleanup & Safety',
    description: 'Popup removal, warning handling, and layout cleanup.',
    tools: [
      {
        id: 'purchase-warning',
        name: 'Purchase Warning Remover',
        description: 'Automatically remove the specific purchase notice warning flow.',
        icon: warningIcon(),
        settingsKey: 'removeWarningEnabled',
        defaultEnabled: false,
        settings: [
          sliderSetting('warningDelay', 'Dismiss Delay', 'How quickly the purchase warning should be removed.', 0, 1000, 50, 100, 'ms')
        ]
      },
      {
        id: 'clutter-cleaner',
        name: 'Clutter Cleaner',
        description: 'Hide banners, floating ads, promo popups, and page extras.',
        icon: cleanIcon(),
        settingsKey: 'removeClutterEnabled',
        defaultEnabled: false,
        settings: [
          toggleSetting('removeBanners', 'Top Banners', 'Hide large promotional banners and hero sections.', true),
          toggleSetting('removeSidebarAds', 'Sidebar Ads', 'Hide sidebar advertising blocks.', true),
          toggleSetting('removePopups', 'Promo Popups', 'Block promotional popup overlays.', true),
          toggleSetting('removeMemoryMenu', 'Floating Menu', 'Hide the floating side menu.', false),
          toggleSetting('removeCartFlow', 'Cart Guide Image', 'Hide the cart flow guide image.', true),
          toggleSetting('removeLitline', 'Litline Banner', 'Hide the Litline promo banner.', true),
          toggleSetting('removeFAQ', 'FAQ Section', 'Hide the shipping-estimate FAQ section.', true),
          toggleSetting('removeTipLine', 'Tip Messages', 'Hide tip and hint banners.', true),
          toggleSetting('removeTrending', 'Trending Sections', 'Hide trending and recommendation sections.', true)
        ]
      }
    ]
  }
];

let currentSettings = {};
let activeTab = 'tools';
let activeDetailToolId = null;
let toastTimer = null;

function toggleSetting(settingsKey, name, description, defaultValue) {
  return { type: 'toggle', settingsKey, name, description, defaultValue };
}

function selectSetting(settingsKey, name, description, defaultValue, options) {
  return {
    type: 'select',
    settingsKey,
    name,
    description,
    defaultValue,
    options: options.map(([value, label]) => ({ value, label }))
  };
}

function sliderSetting(settingsKey, name, description, min, max, step, defaultValue, unit = '') {
  return { type: 'slider', settingsKey, name, description, min, max, step, defaultValue, unit };
}

function getAllTools() {
  return TOOL_CATEGORIES.flatMap((category) =>
    category.tools.map((tool) => ({ ...tool, categoryId: category.id, categoryTitle: category.title }))
  );
}

function getToolById(toolId) {
  return getAllTools().find((tool) => tool.id === toolId) || null;
}

function getDefaultSettings() {
  const defaults = {
    debugMode: false
  };

  getAllTools().forEach((tool) => {
    defaults[tool.settingsKey] = tool.defaultEnabled;
    tool.settings.forEach((setting) => {
      defaults[setting.settingsKey] = setting.defaultValue;
    });
  });

  return defaults;
}

function getSyncStorage(keys = null) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function setSyncStorage(items) {
  return new Promise((resolve) => chrome.storage.sync.set(items, resolve));
}

function clearSyncStorage() {
  return new Promise((resolve) => chrome.storage.sync.clear(resolve));
}

function getLocalStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setLocalStorage(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

async function loadSettings() {
  const stored = await getSyncStorage(null);
  currentSettings = { ...getDefaultSettings(), ...stored };
  return currentSettings;
}

async function saveSettings(newSettings) {
  currentSettings = { ...currentSettings, ...newSettings };
  await setSyncStorage(newSettings);
  await broadcastSettingsReload();
}

async function broadcastSettingsReload() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: LITBUY_TAB_PATTERNS });
  } catch {
    return;
  }

  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'reloadSettings' });
    } catch {}
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'reloadButton' });
    } catch {}
  }
}

function applyManifestVersion() {
  const versionTag = document.getElementById('version-tag');
  if (!versionTag) return;
  const manifest = chrome.runtime.getManifest();
  const displayVersion = manifest.version_name || manifest.version;
  versionTag.textContent = `v${displayVersion}`;
}

function parseVersionParts(versionText) {
  const match = String(versionText || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0)
  };
}

function isRemoteVersionNewer(remoteVersion, currentVersion) {
  const remote = parseVersionParts(remoteVersion);
  const current = parseVersionParts(currentVersion);
  if (!remote || !current) return false;
  if (remote.major !== current.major) return remote.major > current.major;
  if (remote.minor !== current.minor) return remote.minor > current.minor;
  return remote.patch > current.patch;
}

function showUpdateBanner(latestVersion, releaseUrl) {
  const banner = document.getElementById('update-banner');
  const text = document.getElementById('update-banner-text');
  const button = document.getElementById('update-banner-btn');
  if (!banner || !text || !button) return;
  text.textContent = `Update available: v${latestVersion}`;
  button.onclick = () => chrome.tabs.create({ url: releaseUrl || UPDATE_REPO_URL });
  banner.classList.remove('hidden');
}

function hideUpdateBanner() {
  document.getElementById('update-banner')?.classList.add('hidden');
}

async function fetchLatestRemoteVersion() {
  const releaseApi = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
  try {
    const response = await fetch(releaseApi, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) return null;
    const release = await response.json();
    return {
      version: release.tag_name || release.name || null,
      url: release.html_url || UPDATE_REPO_URL
    };
  } catch {
    return null;
  }
}

async function checkForUpdates() {
  const manifest = chrome.runtime.getManifest();
  const currentVersion = manifest.version;
  const now = Date.now();
  const cached = (await getLocalStorage([UPDATE_CACHE_KEY]))?.[UPDATE_CACHE_KEY];

  if (cached && cached.currentVersion === currentVersion && now - cached.timestamp < 6 * 60 * 60 * 1000) {
    if (cached.hasUpdate && cached.latestVersion) {
      showUpdateBanner(cached.latestVersion, cached.releaseUrl);
    } else {
      hideUpdateBanner();
    }
    return;
  }

  const latest = await fetchLatestRemoteVersion();
  const hasUpdate = Boolean(latest?.version && isRemoteVersionNewer(latest.version, currentVersion));
  if (hasUpdate) {
    showUpdateBanner(latest.version, latest.url);
  } else {
    hideUpdateBanner();
  }

  await setLocalStorage({
    [UPDATE_CACHE_KEY]: {
      timestamp: now,
      currentVersion,
      hasUpdate,
      latestVersion: latest?.version || null,
      releaseUrl: latest?.url || null
    }
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 1800);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSettingValue(setting, value) {
  if (setting.type === 'toggle') {
    return value ? 'Enabled' : 'Disabled';
  }
  if (setting.type === 'slider') {
    return `${value}${setting.unit ? ` ${setting.unit}` : ''}`.trim();
  }
  if (setting.type === 'select') {
    return setting.options.find((option) => option.value === value)?.label || String(value);
  }
  return String(value);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function getCacheStats() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'getCacheStats' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.success) {
        reject(new Error(response?.error || 'Failed to load cache stats'));
        return;
      }
      resolve(response);
    });
  });
}

function clearWeightCache() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'clearWeightCache' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.success) {
        reject(new Error(response?.error || 'Failed to clear weight cache'));
        return;
      }
      resolve(response);
    });
  });
}

function clearQcCache() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'clearQcCache' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.success) {
        reject(new Error(response?.error || 'Failed to clear QC cache'));
        return;
      }
      resolve(response);
    });
  });
}

async function refreshCacheStats() {
  const entriesNode = document.getElementById('cache-stats-entries');
  const sizeNode = document.getElementById('cache-stats-size');
  if (!entriesNode || !sizeNode) return;

  try {
    const stats = await getCacheStats();
    entriesNode.textContent = `Stored: ${stats.totalEntries} entries (${stats.weightEntries} weight, ${stats.qcEntries} QC)`;
    sizeNode.textContent = `Approx. storage: ${formatBytes(stats.totalBytes)}`;
  } catch {
    entriesNode.textContent = 'Stored: unavailable';
    sizeNode.textContent = 'Approx. storage: unavailable';
  }
}

function getSearchQuery() {
  return document.getElementById('search-input')?.value || '';
}

function renderToolsView(filterText = '') {
  const view = document.getElementById('tools-view');
  if (!view) return;

  const query = String(filterText || '').trim().toLowerCase();
  const blocks = TOOL_CATEGORIES.map((category) => {
    const tools = category.tools.filter((tool) => {
      const haystack = `${tool.name} ${tool.description} ${category.title}`.toLowerCase();
      return !query || haystack.includes(query);
    });

    if (!tools.length) return '';

    return `
      <section class="category-block">
        <div class="category-head">
          <h2 class="category-label">${escapeHtml(category.title)}</h2>
          <p class="category-desc">${escapeHtml(category.description)}</p>
        </div>
        <div class="tool-list">
          ${tools.map((tool) => renderToolCard(tool)).join('')}
        </div>
      </section>
    `;
  }).join('');

  view.innerHTML = blocks || '<div class="empty-state">No tools match that search.</div>';
  bindToolCardEvents();
}

function renderToolCard(tool) {
  const enabled = Boolean(currentSettings[tool.settingsKey]);
  const hasSettings = tool.settings.length > 0;

  return `
    <article class="tool-card ${enabled ? 'is-on' : 'is-off'}" data-tool-id="${tool.id}">
      <div class="tool-card-top">
        <div class="tool-icon">${tool.icon}</div>
        <div class="tool-copy">
          <div class="tool-title-row">
            <h3 class="tool-title">${escapeHtml(tool.name)}</h3>
            <span class="tool-status ${enabled ? 'is-on' : 'is-off'}">${enabled ? 'On' : 'Off'}</span>
          </div>
          <p class="tool-description">${escapeHtml(tool.description)}</p>
        </div>
      </div>
      <div class="tool-actions">
        ${hasSettings ? `<button class="tool-config-btn" data-configure-tool="${tool.id}" type="button">Configure</button>` : '<div></div>'}
        <label class="toggle">
          <input type="checkbox" data-toggle-tool="${tool.id}" ${enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </article>
  `;
}

function renderSystemView() {
  const view = document.getElementById('system-view');
  if (!view) return;

  view.innerHTML = `
    <div class="system-stack">
      <section class="system-card">
        <h2 class="system-title">Cache</h2>
        <p class="system-desc">Clear stored QC and item-weight data when you want a fresh rebuild.</p>
        <div class="system-actions">
          <button class="system-btn" id="clear-weight-cache" type="button">Clear Weight Cache</button>
          <button class="system-btn" id="clear-qc-cache" type="button">Clear QC Cache</button>
        </div>
        <div class="cache-stats">
          <div class="cache-stats-line" id="cache-stats-entries">Stored: --</div>
          <div class="cache-stats-line" id="cache-stats-size">Approx. storage: --</div>
        </div>
      </section>

      <section class="system-card">
        <h2 class="system-title">Extension</h2>
        <p class="system-desc">Version, update status, and debugging controls.</p>
        <div class="system-inline-toggle">
          <div>
            <div class="setting-name">Debug Mode</div>
            <div class="setting-desc">Show extra logs for debugging and QA.</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="debug-mode-toggle" ${currentSettings.debugMode ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="system-actions" style="margin-top: 14px;">
          <button class="ghost-btn" id="open-repo-btn" type="button">Project Page</button>
        </div>
      </section>

      <section class="system-card">
        <h2 class="system-title">Danger Zone</h2>
        <p class="system-desc">Reset everything if you want to start over clean.</p>
        <div class="system-actions">
          <button class="danger-btn" id="reset-all-btn" type="button">Reset All Settings</button>
        </div>
      </section>
    </div>
  `;

  bindSystemViewEvents();
}

function renderSettingCard(setting) {
  const value = currentSettings[setting.settingsKey];
  const controlId = `setting-${setting.settingsKey}`;

  if (setting.type === 'toggle') {
    return `
      <article class="setting-card" data-setting-key="${setting.settingsKey}">
        <div class="setting-card-head">
          <div>
            <h3 class="setting-name">${escapeHtml(setting.name)}</h3>
            <p class="setting-desc">${escapeHtml(setting.description)}</p>
          </div>
          <label class="toggle">
            <input type="checkbox" data-setting-input="${setting.settingsKey}" ${value ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </article>
    `;
  }

  if (setting.type === 'select') {
    return `
      <article class="setting-card" data-setting-key="${setting.settingsKey}">
        <div class="setting-card-head">
          <div>
            <h3 class="setting-name">${escapeHtml(setting.name)}</h3>
            <p class="setting-desc">${escapeHtml(setting.description)}</p>
          </div>
        </div>
        <div class="setting-value">${escapeHtml(formatSettingValue(setting, value))}</div>
        <select class="setting-select" id="${controlId}" data-setting-input="${setting.settingsKey}">
          ${setting.options.map((option) => `
            <option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
          `).join('')}
        </select>
      </article>
    `;
  }

  if (setting.type === 'slider') {
    return `
      <article class="setting-card" data-setting-key="${setting.settingsKey}">
        <div class="setting-card-head">
          <div>
            <h3 class="setting-name">${escapeHtml(setting.name)}</h3>
            <p class="setting-desc">${escapeHtml(setting.description)}</p>
          </div>
        </div>
        <div class="setting-value" id="${controlId}-value">${escapeHtml(formatSettingValue(setting, value))}</div>
        <input
          class="setting-range"
          id="${controlId}"
          type="range"
          min="${setting.min}"
          max="${setting.max}"
          step="${setting.step}"
          value="${escapeHtml(value)}"
          data-setting-input="${setting.settingsKey}">
      </article>
    `;
  }

  return '';
}

function openDetailView(toolId) {
  const tool = getToolById(toolId);
  if (!tool || !tool.settings.length) return;

  activeDetailToolId = tool.id;

  const appShell = document.querySelector('.app-shell');
  const detailView = document.getElementById('detail-view');
  const breadcrumbNode = document.getElementById('detail-breadcrumb');
  const categoryNode = document.getElementById('detail-category');
  const titleNode = document.getElementById('detail-title');
  const descriptionNode = document.getElementById('detail-description');
  const contentNode = document.getElementById('detail-content');

  if (!detailView || !breadcrumbNode || !categoryNode || !titleNode || !descriptionNode || !contentNode) return;

  breadcrumbNode.textContent = `Tools / ${tool.categoryTitle} / ${tool.name}`;
  categoryNode.textContent = tool.categoryTitle;
  titleNode.textContent = tool.name;
  descriptionNode.textContent = tool.description;
  contentNode.innerHTML = tool.settings.map((setting) => renderSettingCard(setting)).join('');
  appShell?.classList.add('detail-open');
  detailView.classList.remove('hidden');
  detailView.scrollTop = 0;
  const detailScroll = detailView.querySelector('.detail-scroll');
  if (detailScroll) {
    detailScroll.scrollTop = 0;
  }
  bindDetailEvents();
}

function closeDetailView() {
  activeDetailToolId = null;
  document.querySelector('.app-shell')?.classList.remove('detail-open');
  document.getElementById('detail-view')?.classList.add('hidden');
}

function rerenderActiveViews() {
  renderToolsView(getSearchQuery());
  renderSystemView();
  if (activeDetailToolId) {
    openDetailView(activeDetailToolId);
  }
}

function bindToolCardEvents() {
  document.querySelectorAll('[data-toggle-tool]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const tool = getToolById(event.currentTarget.dataset.toggleTool);
      if (!tool) return;
      await saveSettings({ [tool.settingsKey]: event.currentTarget.checked });
      rerenderActiveViews();
      showToast(`${tool.name} ${event.currentTarget.checked ? 'enabled' : 'disabled'}`);
    });
  });

  document.querySelectorAll('[data-configure-tool]').forEach((button) => {
    button.addEventListener('click', () => openDetailView(button.dataset.configureTool));
  });
}

function bindDetailEvents() {
  const tool = getToolById(activeDetailToolId);
  if (!tool) return;

  document.querySelectorAll('[data-setting-input]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const settingKey = event.currentTarget.dataset.settingInput;
      const setting = tool.settings.find((item) => item.settingsKey === settingKey);
      if (!setting) return;

      let nextValue = event.currentTarget.value;
      if (setting.type === 'toggle') {
        nextValue = event.currentTarget.checked;
      }
      if (setting.type === 'slider') {
        nextValue = Number(event.currentTarget.value);
      }

      await saveSettings({ [setting.settingsKey]: nextValue });
      if (setting.type === 'slider') {
        const valueNode = document.getElementById(`setting-${setting.settingsKey}-value`);
        if (valueNode) {
          valueNode.textContent = formatSettingValue(setting, nextValue);
        }
      } else {
        rerenderActiveViews();
      }
    });

    if (input.type === 'range') {
      input.addEventListener('input', (event) => {
        const settingKey = event.currentTarget.dataset.settingInput;
        const setting = tool.settings.find((item) => item.settingsKey === settingKey);
        if (!setting) return;
        const valueNode = document.getElementById(`setting-${setting.settingsKey}-value`);
        if (valueNode) {
          valueNode.textContent = formatSettingValue(setting, Number(event.currentTarget.value));
        }
      });
    }
  });
}

function bindSystemViewEvents() {
  document.getElementById('clear-weight-cache')?.addEventListener('click', async () => {
    try {
      await clearWeightCache();
      await refreshCacheStats();
      showToast('Weight cache cleared');
    } catch {
      showToast('Failed to clear weight cache');
    }
  });

  document.getElementById('clear-qc-cache')?.addEventListener('click', async () => {
    try {
      await clearQcCache();
      await refreshCacheStats();
      showToast('QC cache cleared');
    } catch {
      showToast('Failed to clear QC cache');
    }
  });

  document.getElementById('debug-mode-toggle')?.addEventListener('change', async (event) => {
    await saveSettings({ debugMode: event.currentTarget.checked });
    showToast(`Debug mode ${event.currentTarget.checked ? 'enabled' : 'disabled'}`);
  });

  document.getElementById('open-repo-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: UPDATE_REPO_URL });
  });

  document.getElementById('reset-all-btn')?.addEventListener('click', async () => {
    if (!window.confirm('Reset all extension settings?')) return;
    const defaults = getDefaultSettings();
    currentSettings = { ...defaults };
    await clearSyncStorage();
    await setSyncStorage(defaults);
    await broadcastSettingsReload();
    closeDetailView();
    rerenderActiveViews();
    setActiveTab('tools');
    showToast('All settings reset');
  });

  refreshCacheStats();
}

function setActiveTab(nextTab) {
  activeTab = nextTab === 'system' ? 'system' : 'tools';

  const toolsButton = document.getElementById('tools-tab-btn');
  const systemButton = document.getElementById('system-tab-btn');
  const toolsView = document.getElementById('tools-view');
  const systemView = document.getElementById('system-view');
  const searchWrap = document.getElementById('search-wrap');

  toolsButton?.classList.toggle('is-active', activeTab === 'tools');
  systemButton?.classList.toggle('is-active', activeTab === 'system');
  toolsView?.classList.toggle('is-active', activeTab === 'tools');
  systemView?.classList.toggle('is-active', activeTab === 'system');

  if (searchWrap) {
    searchWrap.style.display = activeTab === 'tools' ? '' : 'none';
  }

  closeDetailView();
}

function bindShellEvents() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  document.getElementById('search-input')?.addEventListener('input', (event) => {
    renderToolsView(event.currentTarget.value);
  });

  document.getElementById('detail-back-btn')?.addEventListener('click', () => closeDetailView());
  document.getElementById('repo-link-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: UPDATE_REPO_URL });
  });
}

function setupChromeListeners() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    const nextSettings = { ...currentSettings };
    let changed = false;

    Object.entries(changes).forEach(([key, value]) => {
      nextSettings[key] = value.newValue;
      changed = true;
    });

    if (!changed) return;
    currentSettings = nextSettings;
    rerenderActiveViews();
  });
}

function iconWrapper(path) {
  return `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      ${path}
    </svg>
  `;
}

function eyeIcon() {
  return iconWrapper(`
    <path d="M2 12c1.7-4.2 5.8-7 10-7s8.3 2.8 10 7c-1.7 4.2-5.8 7-10 7S3.7 16.2 2 12Z" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="12" cy="12" r="3.3" stroke="currentColor" stroke-width="1.8"/>
  `);
}

function linkIcon() {
  return iconWrapper(`
    <path d="M10 14l-1.7 1.7a3 3 0 1 1-4.2-4.2L7 8.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M14 10l1.7-1.7a3 3 0 1 1 4.2 4.2L17 15.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M9 15l6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `);
}

function scaleIcon() {
  return iconWrapper(`
    <path d="M12 4v16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M6 8h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M4.5 8 2.5 13h4L4.5 8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M19.5 8 17.5 13h4l-2-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M8 20h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `);
}

function shippingIcon() {
  return iconWrapper(`
    <path d="M3 7h11v8H3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M14 10h3l3 3v2h-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="8" cy="17" r="1.8" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="18" cy="17" r="1.8" stroke="currentColor" stroke-width="1.8"/>
  `);
}

function euroIcon() {
  return iconWrapper(`
    <path d="M16.5 6.5a6 6 0 1 0 0 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M6 10h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M6 14h8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `);
}

function imageIcon() {
  return iconWrapper(`
    <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
    <path d="M5.5 17 11 12l3.5 3 2.5-2 1.5 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}

function fullscreenIcon() {
  return iconWrapper(`
    <path d="M8 4H4v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M16 4h4v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M20 16v4h-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M4 16v4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `);
}

function receiptIcon() {
  return iconWrapper(`
    <path d="M7 3h10v18l-2-1.2L13 21l-2-1.2L9 21l-2-1.2L5 21V5a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M9 8h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M9 12h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M9 16h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `);
}

function broomIcon() {
  return iconWrapper(`
    <path d="M14 4 6 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M15.5 5.5 18.5 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M5 13.5 10.5 19c1 1 2.5 1 3.5 0l1-1-8-8-2 2.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  `);
}

function shieldIcon() {
  return iconWrapper(`
    <path d="M12 3 5 6v5c0 4.3 2.7 7.7 7 10 4.3-2.3 7-5.7 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="m9.5 12 1.7 1.7L14.8 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}

function splitIcon() {
  return iconWrapper(`
    <path d="M6 5v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M18 5v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="m8 8 4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m16 8-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}

function stackIcon() {
  return iconWrapper(`
    <path d="m12 4 8 4-8 4-8-4 8-4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="m4 12 8 4 8-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m4 16 8 4 8-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}

function warningIcon() {
  return iconWrapper(`
    <path d="M12 4 3 20h18L12 4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M12 9v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="1.1" fill="currentColor"/>
  `);
}

function cleanIcon() {
  return iconWrapper(`
    <path d="M4 7h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V7" stroke="currentColor" stroke-width="1.8"/>
    <path d="M6 7l1 12h10l1-12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M10 11v5M14 11v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  `);
}

document.addEventListener('DOMContentLoaded', async () => {
  applyManifestVersion();
  bindShellEvents();
  setupChromeListeners();
  await loadSettings();
  renderToolsView();
  renderSystemView();
  setActiveTab('tools');
  checkForUpdates();
});
