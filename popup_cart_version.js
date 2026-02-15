// LitbuyTools - Popup with organized sections
// Section structure: Product Page | Cart | General

const ADDON_SECTIONS = {
  'product-page': {
    title: 'Product Page',
    icon: '📦',
    addons: [
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
          }
        ]
      }
    ]
  },
  'cart': {
    title: 'Cart',
    icon: '🛒',
    addons: [
      {
        id: 'cart-thumbnails',
        name: 'Enhanced Thumbnails',
        description: 'Larger product images in cart',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 17l3.5-4.5 2.5 3.01L14.5 11l4.5 6H5z"/>
        </svg>`,
        settingsKey: 'cartThumbnailsEnabled',
        defaultEnabled: true,
        settings: [
          {
            id: 'thumbnail-size',
            name: 'Thumbnail Size',
            description: 'Size of product images',
            type: 'slider',
            min: 100,
            max: 200,
            step: 10,
            defaultValue: 130,
            settingsKey: 'cartThumbnailSize',
            unit: 'px'
          }
        ]
      },
      {
        id: 'cart-delete-style',
        name: 'Delete Button Style',
        description: 'Customize delete button appearance',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>`,
        settingsKey: 'cartDeleteStyleEnabled',
        defaultEnabled: true,
        settings: [
          {
            id: 'delete-icon',
            name: 'Icon Style',
            description: 'Choose delete button appearance',
            type: 'select',
            options: [
              { value: 'x', label: '❌ X Icon' },
              { value: 'trash', label: '🗑️ Trash Bin' },
              { value: 'minus', label: '➖ Minus' },
              { value: 'circle-x', label: '🔴 Red Circle X' }
            ],
            defaultValue: 'x',
            settingsKey: 'cartDeleteIcon'
          }
        ]
      },
      {
        id: 'cart-quantity',
        name: 'Quick Quantity Controls',
        description: 'Redesigned +/- buttons for faster adjustments',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>`,
        settingsKey: 'cartQuantityEnabled',
        defaultEnabled: true,
        settings: [
          {
            id: 'quantity-style',
            name: 'Button Style',
            description: 'Style of quantity buttons',
            type: 'select',
            options: [
              { value: 'modern', label: 'Modern (Rounded)' },
              { value: 'minimal', label: 'Minimal (Flat)' },
              { value: 'bold', label: 'Bold (Chunky)' }
            ],
            defaultValue: 'modern',
            settingsKey: 'cartQuantityStyle'
          }
        ]
      },
      {
        id: 'cart-reorder',
        name: 'Drag to Reorder',
        description: 'Reorder cart items with drag handles',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/>
        </svg>`,
        settingsKey: 'cartReorderEnabled',
        defaultEnabled: false,
        settings: [
          {
            id: 'drag-handle-position',
            name: 'Handle Position',
            description: 'Where to show drag handle',
            type: 'select',
            options: [
              { value: 'left', label: 'Left side' },
              { value: 'right', label: 'Right side' }
            ],
            defaultValue: 'left',
            settingsKey: 'cartDragHandlePosition'
          },
          {
            id: 'reorder-animation',
            name: 'Smooth Animation',
            description: 'Animate reordering transitions',
            type: 'toggle',
            defaultValue: true,
            settingsKey: 'cartReorderAnimation'
          }
        ]
      },
      {
        id: 'cart-search',
        name: 'Smart Search',
        description: 'Live search to filter cart items',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>`,
        settingsKey: 'cartSearchEnabled',
        defaultEnabled: false,
        settings: [
          {
            id: 'search-position',
            name: 'Search Bar Position',
            description: 'Where to place the search bar',
            type: 'select',
            options: [
              { value: 'top', label: 'Top of cart' },
              { value: 'sticky', label: 'Sticky header' }
            ],
            defaultValue: 'sticky',
            settingsKey: 'cartSearchPosition'
          }
        ]
      },
      {
        id: 'cart-pin',
        name: 'Pin Items',
        description: 'Pin important items to top of cart',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
        </svg>`,
        settingsKey: 'cartPinEnabled',
        defaultEnabled: false,
        settings: [
          {
            id: 'pin-icon-style',
            name: 'Pin Icon Style',
            description: 'Style of pin button',
            type: 'select',
            options: [
              { value: 'pin', label: '📌 Pin' },
              { value: 'star', label: '⭐ Star' },
              { value: 'bookmark', label: '🔖 Bookmark' }
            ],
            defaultValue: 'pin',
            settingsKey: 'cartPinIconStyle'
          }
        ]
      },
      {
        id: 'cart-delete-confirm',
        name: 'Delete Confirmation',
        description: 'Animated confirmation before deleting',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>`,
        settingsKey: 'cartDeleteConfirmEnabled',
        defaultEnabled: true,
        settings: [
          {
            id: 'confirm-animation',
            name: 'Animation Style',
            description: 'Type of confirmation animation',
            type: 'select',
            options: [
              { value: 'fade', label: 'Fade & Scale' },
              { value: 'slide', label: 'Slide Up' },
              { value: 'bounce', label: 'Bounce' }
            ],
            defaultValue: 'fade',
            settingsKey: 'cartConfirmAnimation'
          },
          {
            id: 'confirm-sound',
            name: 'Sound Effect',
            description: 'Play sound on delete',
            type: 'toggle',
            defaultValue: false,
            settingsKey: 'cartConfirmSound'
          }
        ]
      }
    ]
  },
  'general': {
    title: 'General',
    icon: '⚙️',
    addons: [
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
            description: 'Hide promotional banners',
            type: 'toggle',
            defaultValue: true,
            settingsKey: 'removeBanners'
          }
        ]
      }
    ]
  }
};

// Settings storage
let currentSettings = {};
let settingsChanged = false;

// Get all addons from sections
function getAllAddons() {
  const allAddons = [];
  Object.values(ADDON_SECTIONS).forEach(section => {
    allAddons.push(...section.addons);
  });
  return allAddons;
}

// Load settings
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
  const defaults = { debugMode: false };
  getAllAddons().forEach(addon => {
    defaults[addon.settingsKey] = addon.defaultEnabled;
    addon.settings.forEach(setting => {
      defaults[setting.settingsKey] = setting.defaultValue;
    });
  });
  return defaults;
}

// Save settings
function saveSettings(newSettings) {
  currentSettings = { ...currentSettings, ...newSettings };
  chrome.storage.sync.set(newSettings);
  
  const requiresReload = Object.keys(newSettings).some(key => 
    key.includes('Enabled') || key.includes('Style') || key.includes('Icon')
  );
  
  if (requiresReload) {
    settingsChanged = true;
    showReloadNotice();
  }
}

// Show reload notice
function showReloadNotice() {
  const existing = document.querySelector('.reload-notice');
  if (existing) return;

  const notice = document.createElement('div');
  notice.className = 'reload-notice';
  notice.textContent = '⟳ Close popup to reload page and apply changes';
  document.body.appendChild(notice);
}

// Render addons with sections
function renderAddons(filter = '') {
  const container = document.getElementById('addons-container');
  container.innerHTML = '';
  
  const filterLower = filter.toLowerCase();
  
  Object.entries(ADDON_SECTIONS).forEach(([sectionId, section]) => {
    const filteredAddons = section.addons.filter(addon =>
      addon.name.toLowerCase().includes(filterLower) ||
      addon.description.toLowerCase().includes(filterLower)
    );
    
    if (filteredAddons.length === 0) return;
    
    // Create section header
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'section-header';
    sectionHeader.innerHTML = `
      <span class="section-icon">${section.icon}</span>
      <span class="section-title">${section.title}</span>
    `;
    container.appendChild(sectionHeader);
    
    // Create section content
    const sectionContent = document.createElement('div');
    sectionContent.className = 'section-content';
    
    filteredAddons.forEach(addon => {
      const isEnabled = currentSettings[addon.settingsKey];
      const addonEl = createAddonElement(addon, isEnabled);
      sectionContent.appendChild(addonEl);
    });
    
    container.appendChild(sectionContent);
    
    // Add section separator (except for last section)
    const sections = Object.keys(ADDON_SECTIONS);
    if (sectionId !== sections[sections.length - 1]) {
      const separator = document.createElement('div');
      separator.className = 'section-separator';
      container.appendChild(separator);
    }
  });
  
  attachAddonListeners();
}

// Create addon element
function createAddonElement(addon, isEnabled) {
  const wrapper = document.createElement('div');
  wrapper.className = 'addon-wrapper';
  wrapper.dataset.addonId = addon.id;
  
  const itemDiv = document.createElement('div');
  itemDiv.className = `addon-item${isEnabled && addon.settings.length > 0 ? ' has-settings' : ''}`;
  itemDiv.dataset.addonId = addon.id;
  
  itemDiv.innerHTML = `
    <div class="addon-icon">${addon.icon}</div>
    <div class="addon-info">
      <div class="addon-name">${addon.name}</div>
      <div class="addon-desc">${addon.description}</div>
    </div>
    <label class="toggle" onclick="event.stopPropagation()">
      <input type="checkbox" ${isEnabled ? 'checked' : ''} data-addon="${addon.id}">
      <span class="toggle-slider"></span>
    </label>
  `;
  
  wrapper.appendChild(itemDiv);
  
  if (isEnabled && addon.settings.length > 0) {
    const settingsDiv = document.createElement('div');
    settingsDiv.className = 'addon-settings';
    settingsDiv.dataset.addonId = addon.id;
    
    let settingsHTML = '';
    addon.settings.forEach(setting => {
      settingsHTML += createSettingHTML(setting);
    });
    
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
    const unit = setting.unit || (setting.settingsKey.includes('Delay') ? 'ms' : 'px');
    return `
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">${setting.name}</div>
          <div class="setting-desc">${setting.description}</div>
          <div class="setting-value" id="${setting.id}-value">${value}${unit}</div>
        </div>
      </div>
      <input type="range" class="slider" id="${setting.id}"
        min="${setting.min}" max="${setting.max}" step="${setting.step}"
        value="${value}" data-setting="${setting.settingsKey}">
    `;
  }
  
  return '';
}

// Attach event listeners
function attachAddonListeners() {
  document.querySelectorAll('.toggle input[data-addon]').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const addonId = e.target.dataset.addon;
      const addon = getAllAddons().find(a => a.id === addonId);
      saveSettings({ [addon.settingsKey]: e.target.checked });
      renderAddons(document.getElementById('search-input').value);
    });
  });
  
  document.querySelectorAll('[data-setting]').forEach(input => {
    const settingKey = input.dataset.setting;
    
    input.addEventListener('change', () => {
      let value;
      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'range') {
        value = parseInt(input.value);
        const valueDisplay = document.getElementById(input.id + '-value');
        if (valueDisplay) {
          const setting = getAllAddons()
            .flatMap(a => a.settings)
            .find(s => s.settingsKey === settingKey);
          const unit = setting?.unit || (settingKey.includes('Delay') ? 'ms' : 'px');
          valueDisplay.textContent = `${value}${unit}`;
        }
      } else {
        value = input.value;
      }
      saveSettings({ [settingKey]: value });
    });
    
    if (input.type === 'range') {
      input.addEventListener('input', () => {
        const value = parseInt(input.value);
        const valueDisplay = document.getElementById(input.id + '-value');
        if (valueDisplay) {
          const setting = getAllAddons()
            .flatMap(a => a.settings)
            .find(s => s.settingsKey === settingKey);
          const unit = setting?.unit || (settingKey.includes('Delay') ? 'ms' : 'px');
          valueDisplay.textContent = `${value}${unit}`;
        }
      });
    }
  });
  
  document.querySelectorAll('.addon-item.has-settings').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.toggle')) return;
      
      const wrapper = item.closest('.addon-wrapper');
      const settingsDiv = wrapper.querySelector('.addon-settings');
      
      if (settingsDiv) {
        settingsDiv.classList.toggle('expanded');
        item.classList.toggle('expanded');
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
  
  const debugToggle = document.getElementById('debug-mode');
  debugToggle.checked = currentSettings.debugMode;
  debugToggle.addEventListener('change', () => {
    saveSettings({ debugMode: debugToggle.checked });
  });
}

// Reload page when popup closes
window.addEventListener('unload', () => {
  if (settingsChanged) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.reload(tabs[0].id);
    });
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  renderAddons();
  setupSearch();
  setupSettingsPanel();
});
