// Addon definitions
const ADDONS = [
  {
    id: 'qc-check',
    name: 'QC Check Button',
    description: 'Automatically check QC photos on UUFinds',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5C7 5 2.73 8.11 1 12.5 2.73 16.89 7 20 12 20s9.27-3.11 11-7.5C21.27 8.11 17 5 12 5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
    </svg>`,
    settingsKey: 'qcCheckEnabled',
    defaultEnabled: true,
    settings: [
      {
        id: 'button-position',
        name: 'Button Position',
        description: 'Where to place the Check QC button',
        type: 'select',
        options: [
          { value: 'left', label: 'Leftmost' },
          { value: 'right', label: 'Rightmost' }
        ],
        defaultValue: 'left',
        settingsKey: 'buttonPosition'
      },
      {
        id: 'notifications-enabled',
        name: 'Notifications',
        description: 'Show notifications on completion',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'notificationsEnabled'
      },
      {
        id: 'result-click-delay',
        name: 'Result Click Delay',
        description: 'Delay after result appears before clicking (ms)',
        type: 'slider',
        min: 0,
        max: 2000,
        step: 100,
        defaultValue: 0,
        settingsKey: 'resultClickDelay',
        advanced: true
      },
      {
        id: 'result-timeout',
        name: 'Result Timeout',
        description: 'Max wait time for search results (seconds)',
        type: 'slider',
        min: 10,
        max: 60,
        step: 5,
        defaultValue: 30,
        settingsKey: 'resultTimeout',
        advanced: true
      },
      {
        id: 'auto-open-qc',
        name: 'Auto-open QC Tab',
        description: '🧪 Automatically open QC tab in background',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'autoOpenQC',
        experimental: true
      },
      {
        id: 'smart-retry',
        name: 'Smart Retry',
        description: '🧪 Retry failed QC searches automatically',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'smartRetry',
        experimental: true
      },
      {
        id: 'aggressive-search',
        name: 'Aggressive Search',
        description: '🧪 Use faster detection (may be less accurate)',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'aggressiveSearch',
        experimental: true
      }
    ]
  },
  {
    id: 'link-router',
    name: 'Link Choice Popup',
    description: 'Choose to open supported links in original site or Litbuy',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.59 13.41a2 2 0 0 0 2.82 0l3.59-3.59a2 2 0 0 0-2.82-2.82l-1.29 1.3a1 1 0 1 1-1.42-1.42l1.3-1.3a4 4 0 1 1 5.65 5.66l-3.59 3.59a4 4 0 0 1-5.66 0 1 1 0 0 1 1.42-1.42zm2.82-2.82a2 2 0 0 0-2.82 0L7 14.18A2 2 0 0 0 9.82 17l1.3-1.3a1 1 0 0 1 1.41 1.42l-1.29 1.29a4 4 0 1 1-5.66-5.65l3.59-3.59a4 4 0 0 1 5.66 0 1 1 0 0 1-1.42 1.42z"/>
    </svg>`,
    settingsKey: 'linkRouterEnabled',
    defaultEnabled: true,
    settings: []
  },
  {
    id: 'thread-harvester',
    name: 'Thread Harvester',
    description: 'Scan Reddit threads, dedupe links, and queue Litbuy opens',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H8a2 2 0 0 0-2 2v4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM8 4h12v10h-2v-4a2 2 0 0 0-2-2H8V4zm8 16H4V10h12v10zm-9-7h6v2H7v-2zm0 3h4v2H7v-2z"/>
    </svg>`,
    settingsKey: 'threadHarvesterEnabled',
    defaultEnabled: true,
    settings: [
      {
        id: 'thread-harvester-litbuy-images',
        name: 'Litbuy Product Images',
        description: 'Load product thumbnails from Litbuy pages (slower)',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'threadHarvesterLitbuyImagesEnabled'
      }
    ]
  },
  {
    id: 'remove-warning',
    name: 'Auto-Remove Purchase Warning',
    description: 'Automatically dismiss purchase notice popups',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>`,
    settingsKey: 'removeWarningEnabled',
    defaultEnabled: false,
    settings: [
      {
        id: 'warning-delay',
        name: 'Auto-dismiss delay',
        description: 'How quickly to remove warnings (ms)',
        type: 'slider',
        min: 0,
        max: 1000,
        step: 50,
        defaultValue: 100,
        settingsKey: 'warningDelay'
      },
      {
        id: 'remove-overlay-enabled',
        name: 'Remove overlay',
        description: 'Also remove dark background overlay',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'removeOverlayEnabled'
      },
      {
        id: 'aggressive-removal',
        name: 'Aggressive Removal',
        description: '🧪 Remove all modals immediately (may affect cart)',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'aggressiveRemoval',
        experimental: true
      },
      {
        id: 'auto-accept-warnings',
        name: 'Auto-accept Warnings',
        description: '🧪 Automatically click "I Agree" on warnings',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'autoAcceptWarnings',
        experimental: true
      }
    ]
  },
  {
    id: 'remove-clutter',
    name: 'Remove Ads & Clutter',
    description: 'Hide ads, banners, and promotional content',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>`,
    settingsKey: 'removeClutterEnabled',
    defaultEnabled: false,
    settings: [
      {
        id: 'remove-banners',
        name: 'Remove Banners',
        description: 'Hide promotional banners and headers',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'removeBanners'
      },
      {
        id: 'remove-popups',
        name: 'Block Popups',
        description: 'Prevent promotional popups from appearing',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'removePopups'
      },
      {
        id: 'remove-sidebar-ads',
        name: 'Remove Sidebar Ads',
        description: 'Hide advertising in sidebars',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'removeSidebarAds'
      },
      {
        id: 'remove-cart-flow',
        name: 'Cart Flow Image',
        description: 'Hide cart flow guide image on cart page',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'removeCartFlow'
      },
      {
        id: 'remove-litline',
        name: 'Litline Banner',
        description: 'Hide Litline promotional banner',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'removeLitline'
      },
      {
        id: 'remove-faq',
        name: 'FAQ Section',
        description: 'Hide FAQ section on shipping estimate page',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'removeFAQ'
      },
      {
        id: 'remove-tip-line',
        name: 'Tip Messages',
        description: 'Hide tip/hint messages',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'removeTipLine'
      },
      {
        id: 'remove-trending',
        name: 'Trending Items',
        description: 'Hide trending items section on homepage',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'removeTrending'
      },
      {
        id: 'remove-memory-menu',
        name: 'Sidebar Menu',
        description: 'Hide floating sidebar menu on all pages',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'removeMemoryMenu'
      },
      {
        id: 'hide-recommendations',
        name: 'Hide Recommendations',
        description: '🧪 Remove "You may also like" sections',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'hideRecommendations',
        experimental: true
      },
      {
        id: 'compact-mode',
        name: 'Compact Mode',
        description: '🧪 Reduce spacing for more content on screen',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'compactMode',
        experimental: true
      }
    ]
  },
  {
    id: 'hover-preview',
    name: 'Hover Image Preview',
    description: 'Hover over color swatches to see enlarged preview',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
    </svg>`,
    settingsKey: 'hoverPreviewEnabled',
    defaultEnabled: true,
    settings: [
      {
        id: 'hover-delay',
        name: 'Hover Delay',
        description: 'Delay before showing preview (milliseconds)',
        type: 'slider',
        min: 0,
        max: 5000,
        step: 100,
        defaultValue: 1500,
        settingsKey: 'hoverDelay'
      },
      {
        id: 'preview-size',
        name: 'Preview Size',
        description: 'Size of the enlarged preview',
        type: 'select',
        options: [
          { value: '300', label: 'Small (300px)' },
          { value: '400', label: 'Medium (400px)' },
          { value: '500', label: 'Large (500px)' }
        ],
        defaultValue: '400',
        settingsKey: 'previewSize'
      },
      {
        id: 'show-close-button',
        name: 'Show Close Button',
        description: 'Display X button to close preview',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'showCloseButton'
      },
      {
        id: 'preview-on-click',
        name: 'Preview on Click',
        description: '🧪 Show preview on click instead of hover',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'previewOnClick',
        experimental: true
      },
      {
        id: 'preview-zoom',
        name: 'Preview Zoom',
        description: '🧪 Enable zoom on preview images',
        type: 'toggle',
        defaultValue: false,
        settingsKey: 'previewZoom',
        experimental: true
      },
      {
        id: 'preview-animations',
        name: 'Smooth Animations',
        description: '🧪 Enable fade/slide animations for preview',
        type: 'toggle',
        defaultValue: true,
        settingsKey: 'previewAnimations',
        experimental: true
      }
    ]
  },
  {
    id: 'cart-preview',
    name: 'Cart Image Preview',
    description: 'Click cart/product images to see full-screen preview',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-10-7.5l2.5 3 3.5-4.5 4 6H5z"/>
    </svg>`,
    settingsKey: 'cartPreviewEnabled',
    defaultEnabled: true,
    settings: []
  }
];

// Settings storage
let currentSettings = {};
let settingsChanged = false;

// Load settings from storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (settings) => {
      currentSettings = { ...getDefaultSettings(), ...settings };
      resolve(currentSettings);
    });
  });
}

// Get default settings
function getDefaultSettings() {
  const defaults = {
    debugMode: false
  };
  
  ADDONS.forEach(addon => {
    defaults[addon.settingsKey] = addon.defaultEnabled;
    addon.settings.forEach(setting => {
      defaults[setting.settingsKey] = setting.defaultValue;
    });
  });
  
  return defaults;
}

// Save settings to storage
function saveSettings(newSettings) {
  currentSettings = { ...currentSettings, ...newSettings };
  chrome.storage.sync.set(newSettings);
  
  // Mark that settings changed (will reload all Litbuy tabs when popup closes)
  settingsChanged = true;
  showReloadNotice();
}

// Show reload notice
function showReloadNotice() {
  // Remove existing notice if any
  const existing = document.querySelector('.reload-notice');
  if (existing) return;

  const notice = document.createElement('div');
  notice.className = 'reload-notice';
  notice.textContent = '⟳ Reload the page to apply changes';
  document.body.appendChild(notice);
}

// Render addons
function renderAddons(filter = '') {
  const container = document.getElementById('addons-container');
  container.innerHTML = '';
  
  const filterLower = filter.toLowerCase();
  const filteredAddons = ADDONS.filter(addon => 
    addon.name.toLowerCase().includes(filterLower) ||
    addon.description.toLowerCase().includes(filterLower)
  );
  
  filteredAddons.forEach(addon => {
    const isEnabled = currentSettings[addon.settingsKey];
    const addonEl = createAddonElement(addon, isEnabled);
    container.appendChild(addonEl);
  });
  
  // Reattach event listeners
  attachAddonListeners();
}

// Create addon element
function createAddonElement(addon, isEnabled) {
  const wrapper = document.createElement('div');
  wrapper.className = 'addon-wrapper';
  wrapper.dataset.addonId = addon.id;
  
  const itemDiv = document.createElement('div');
  itemDiv.className = `addon-item${addon.comingSoon ? ' disabled' : ''}${isEnabled && addon.settings.length > 0 ? ' has-settings' : ''}`;
  itemDiv.dataset.addonId = addon.id;
  
  itemDiv.innerHTML = `
    <div class="addon-icon">${addon.icon}</div>
    <div class="addon-info">
      <div class="addon-name">
        <span>${addon.name}</span>
        ${addon.comingSoon ? '<span class="coming-soon-badge">Coming Soon</span>' : ''}
      </div>
      <div class="addon-desc">${addon.description}</div>
    </div>
    <label class="toggle" onclick="event.stopPropagation()">
      <input type="checkbox" ${isEnabled ? 'checked' : ''} ${addon.comingSoon ? 'disabled' : ''} data-addon="${addon.id}">
      <span class="toggle-slider"></span>
    </label>
  `;
  
  wrapper.appendChild(itemDiv);
  
  // Add settings section if addon is enabled and has settings
  if (isEnabled && addon.settings.length > 0 && !addon.comingSoon) {
    const settingsDiv = document.createElement('div');
    settingsDiv.className = 'addon-settings';
    settingsDiv.dataset.addonId = addon.id;
    
    // Group settings by advanced/normal/experimental
    const normalSettings = addon.settings.filter(s => !s.advanced && !s.experimental);
    const advancedSettings = addon.settings.filter(s => s.advanced);
    const experimentalSettings = addon.settings.filter(s => s.experimental);
    
    let settingsHTML = '';
    
    if (normalSettings.length > 0) {
      settingsHTML += '<div class="settings-section"><h3>Settings</h3>';
      normalSettings.forEach(setting => {
        settingsHTML += createSettingHTML(setting);
      });
      settingsHTML += '</div>';
    }
    
    if (experimentalSettings.length > 0) {
      settingsHTML += `
        <div class="settings-section">
          <div class="experimental-warning">
            <div class="experimental-warning-title">🧪 Experimental Features</div>
            <div class="experimental-warning-text">These features are in testing and may not work perfectly. Use at your own risk.</div>
          </div>
          <h3>Experimental</h3>
      `;
      experimentalSettings.forEach(setting => {
        settingsHTML += createSettingHTML(setting);
      });
      settingsHTML += '</div>';
    }
    
    if (advancedSettings.length > 0) {
      settingsHTML += `
        <div class="settings-section">
          <div class="advanced-warning">
            <div class="advanced-warning-title">⚠️ Advanced Settings</div>
            <div class="advanced-warning-text">Only modify these if you know what you're doing. Incorrect values may cause the extension to malfunction.</div>
          </div>
          <h3>Advanced</h3>
      `;
      advancedSettings.forEach(setting => {
        settingsHTML += createSettingHTML(setting);
      });
      settingsHTML += '</div>';
    }
    
    // Add reset button
    settingsHTML += `<button class="reset-btn" data-addon-reset="${addon.id}">Reset ${addon.name} Settings</button>`;
    
    settingsDiv.innerHTML = settingsHTML;
    wrapper.appendChild(settingsDiv);
  }
  
  return wrapper;
}

// Create setting HTML
function createSettingHTML(setting) {
  const value = currentSettings[setting.settingsKey];
  
  if (setting.type === 'toggle') {
    return `
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">${setting.name}</div>
          <div class="setting-desc">${setting.description}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" ${value ? 'checked' : ''} data-setting="${setting.settingsKey}">
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  } else if (setting.type === 'select') {
    const options = setting.options.map(opt => 
      `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
    ).join('');
    return `
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">${setting.name}</div>
          <div class="setting-desc">${setting.description}</div>
        </div>
        <select class="select-input" data-setting="${setting.settingsKey}">${options}</select>
      </div>
    `;
  } else if (setting.type === 'slider') {
    const displayValue = setting.settingsKey.includes('Delay') || setting.settingsKey.includes('delay')
      ? `${value}ms`
      : `${value}s`;
    return `
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">${setting.name}</div>
          <div class="setting-desc">${setting.description}</div>
          <div class="setting-value" id="${setting.id}-value">${displayValue}</div>
        </div>
      </div>
      <input type="range" class="slider" id="${setting.id}" 
        min="${setting.min}" max="${setting.max}" step="${setting.step}" 
        value="${value}" data-setting="${setting.settingsKey}">
    `;
  }
  
  return '';
}

// Attach event listeners to addons
function attachAddonListeners() {
  // Toggle switches
  document.querySelectorAll('.toggle input[data-addon]').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const addonId = e.target.dataset.addon;
      const addon = ADDONS.find(a => a.id === addonId);
      const isEnabled = e.target.checked;
      
      saveSettings({ [addon.settingsKey]: isEnabled });
      
      // Re-render to show/hide settings
      renderAddons(document.getElementById('search-input').value);
    });
  });
  
  // Setting changes
  document.querySelectorAll('[data-setting]').forEach(input => {
    const settingKey = input.dataset.setting;
    
    input.addEventListener('change', () => {
      let value;
      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'range') {
        value = parseInt(input.value);
        // Update display value
        const valueDisplay = document.getElementById(input.id + '-value');
        if (valueDisplay) {
          const displayValue = settingKey.includes('Delay') || settingKey.includes('delay')
            ? `${value}ms`
            : `${value}s`;
          valueDisplay.textContent = displayValue;
        }
      } else {
        value = input.value;
      }
      
      saveSettings({ [settingKey]: value });
    });
    
    // Add input event for sliders for live updates
    if (input.type === 'range') {
      input.addEventListener('input', () => {
        const value = parseInt(input.value);
        const valueDisplay = document.getElementById(input.id + '-value');
        if (valueDisplay) {
          const displayValue = settingKey.includes('Delay') || settingKey.includes('delay')
            ? `${value}ms`
            : `${value}s`;
          valueDisplay.textContent = displayValue;
        }
      });
    }
  });
  
  // Addon click to expand settings
  document.querySelectorAll('.addon-item.has-settings').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't expand if clicking on toggle
      if (e.target.closest('.toggle')) return;
      
      const addonId = item.dataset.addonId;
      const wrapper = item.closest('.addon-wrapper');
      const settingsDiv = wrapper.querySelector(`.addon-settings[data-addon-id="${addonId}"]`);
      
      if (settingsDiv) {
        const isExpanded = settingsDiv.classList.contains('expanded');
        
        // Toggle this one
        if (isExpanded) {
          settingsDiv.classList.remove('expanded');
          item.classList.remove('expanded');
        } else {
          settingsDiv.classList.add('expanded');
          item.classList.add('expanded');
        }
      }
    });
  });
  
  // Reset buttons
  document.querySelectorAll('[data-addon-reset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const addonId = btn.dataset.addonReset;
      const addon = ADDONS.find(a => a.id === addonId);
      
      if (confirm(`Reset all settings for "${addon.name}" to defaults?`)) {
        const resetSettings = {};
        addon.settings.forEach(setting => {
          resetSettings[setting.settingsKey] = setting.defaultValue;
        });
        
        saveSettings(resetSettings);
        renderAddons(document.getElementById('search-input').value);
      }
    });
  });
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById('search-input');
  
  searchInput.addEventListener('input', (e) => {
    renderAddons(e.target.value);
  });
}

// Settings panel
function setupSettingsPanel() {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const backBtn = document.getElementById('back-btn');
  
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
  });
  
  backBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });
  
  // Debug mode toggle
  const debugToggle = document.getElementById('debug-mode');
  debugToggle.checked = currentSettings.debugMode;
  debugToggle.addEventListener('change', () => {
    saveSettings({ debugMode: debugToggle.checked });
  });
  
  // Reset all settings
  const resetAllBtn = document.getElementById('reset-all');
  resetAllBtn.addEventListener('click', () => {
    if (confirm('Reset ALL settings to defaults? This cannot be undone.')) {
      const defaults = getDefaultSettings();
      chrome.storage.sync.clear(() => {
        loadSettings().then(() => {
          settingsPanel.classList.add('hidden');
          renderAddons();
        });
      });
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  renderAddons();
  setupSearch();
  setupSettingsPanel();
});
