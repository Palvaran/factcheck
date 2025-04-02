// modules/settings-manager.js
import { REQUEST, CONTENT } from '../../utils/constants.js';
import { ApiKeyManager } from './api-key-manager.js';

/**
 * Manages all settings functionality for the options page
 * Handles loading, saving, exporting, and importing settings
 */
export class SettingsManager {
  constructor() {
    this.apiKeyManager = new ApiKeyManager();
    this.modifiedFields = new Set();
    
    // Default settings with constants
    this.defaultSettings = {
      aiProvider: 'openai',
      aiModel: 'openai-standard',
      useMultiModel: false,
      autoCheckHeadlines: false,
      enhancedUI: true,
      resultPosition: 'right',
      colorTheme: 'auto',
      shareAnalytics: true,
      enableCaching: true,
      rateLimit: REQUEST.RATE_LIMITS.DEFAULT.toString(),
      maxTokens: CONTENT.MAX_TOKENS.DEFAULT.toString(),
      showReferences: true,
      siteList: '',
      ignoredSites: ''
    };

    // Setup change listeners for settings
    this.setupChangeListeners();
  }

  /**
   * Load all settings from storage
   */
  async loadSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get([
        // API Keys
        'openaiApiKey', 
        'braveApiKey',
        'anthropicApiKey',
        // AI Provider
        'aiProvider',
        // Preferences
        'aiModel',
        'useMultiModel',
        'autoCheckHeadlines',
        'enhancedUI',
        'resultPosition',
        'colorTheme',
        // Analytics
        'shareAnalytics',
        // Additional settings
        'enableCaching',
        'showReferences',
        'maxTokens',
        'rateLimit',
        // Site management
        'siteList',
        'ignoredSites'
      ], (data) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        this.applySettingsToForm(data);
        resolve(data);
      });
    });
  }

  /**
   * Apply loaded settings to the form
   * @param {Object} data - Settings data from storage
   */
  applySettingsToForm(data) {
    // API Keys - Apply masking unless user is editing
    const openaiField = document.getElementById('openaiApiKey');
    const braveField = document.getElementById('braveApiKey');
    const anthropicField = document.getElementById('anthropicApiKey');
    
    if (openaiField) {
      // Apply masking to OpenAI key
      if (data.openaiApiKey && !this.modifiedFields.has('openaiApiKey')) {
        openaiField.dataset.fullKey = data.openaiApiKey; // Store full key in data attribute
        openaiField.value = this.apiKeyManager.maskApiKey(data.openaiApiKey);
        openaiField.setAttribute('aria-label', 'OpenAI API Key (masked for security)');
      } else if (!data.openaiApiKey) {
        openaiField.value = '';
      }
    }

    if (anthropicField) {
      // Apply masking to Anthropic key
      if (data.anthropicApiKey && !this.modifiedFields.has('anthropicApiKey')) {
        anthropicField.dataset.fullKey = data.anthropicApiKey; // Store full key in data attribute
        anthropicField.value = this.apiKeyManager.maskApiKey(data.anthropicApiKey);
        anthropicField.setAttribute('aria-label', 'Anthropic API Key (masked for security)');
      } else if (!data.anthropicApiKey) {
        anthropicField.value = '';
      }
    }
    
    if (braveField) {
      // Apply masking to Brave key
      if (data.braveApiKey && !this.modifiedFields.has('braveApiKey')) {
        braveField.dataset.fullKey = data.braveApiKey; // Store full key in data attribute
        braveField.value = this.apiKeyManager.maskApiKey(data.braveApiKey);
        braveField.setAttribute('aria-label', 'Brave API Key (masked for security)');
      } else if (!data.braveApiKey) {
        braveField.value = '';
      }
    }
    
    // Set the AI provider first (this will affect which model options are visible)
    this.setSelectValue('aiProvider', data.aiProvider, this.defaultSettings.aiProvider);
    
    // Ensure we're using the correct model format for the selected provider
    let modelValue = data.aiModel || this.defaultSettings.aiModel;
    const provider = data.aiProvider || this.defaultSettings.aiProvider;
    
    // Convert legacy model values to new format
    if (modelValue === 'standard' || modelValue === 'premium') {
      modelValue = `${provider}-${modelValue}`;
    } 
    // If the model value doesn't match the current provider, use the default for the current provider
    else if (!modelValue.startsWith(`${provider}-`)) {
      modelValue = `${provider}-standard`;
    }
    
    // Now set the model value
    this.setSelectValue('aiModel', modelValue, this.defaultSettings.aiModel);
    
    // Preferences - Apply each setting if element exists
    this.setCheckboxValue('useMultiModel', data.useMultiModel, this.defaultSettings.useMultiModel);
    this.setCheckboxValue('autoCheckHeadlines', data.autoCheckHeadlines, this.defaultSettings.autoCheckHeadlines);
    this.setCheckboxValue('enhancedUI', data.enhancedUI, this.defaultSettings.enhancedUI);
    this.setSelectValue('resultPosition', data.resultPosition, this.defaultSettings.resultPosition);
    this.setSelectValue('colorTheme', data.colorTheme, this.defaultSettings.colorTheme);
    
    // Analytics
    this.setCheckboxValue('shareAnalytics', data.shareAnalytics, this.defaultSettings.shareAnalytics);
    
    // Additional settings
    this.setCheckboxValue('enableCaching', data.enableCaching, this.defaultSettings.enableCaching);
    this.setCheckboxValue('showReferences', data.showReferences, this.defaultSettings.showReferences);
    this.setSelectValue('maxTokens', data.maxTokens, this.defaultSettings.maxTokens);
    this.setSelectValue('rateLimit', data.rateLimit, this.defaultSettings.rateLimit);
    
    // Site management settings
    this.setTextValue('siteList', data.siteList, this.defaultSettings.siteList);
    this.setTextValue('ignoredSites', data.ignoredSites, this.defaultSettings.ignoredSites);
    
    // Trigger the provider change handler to ensure model options are correctly displayed
    const providerSelect = document.getElementById('aiProvider');
    if (providerSelect) {
      const event = new Event('change');
      providerSelect.dispatchEvent(event);
    }
  }

  /**
   * Get current settings from form
   * @returns {Object} Current settings values
   */
  getCurrentSettings() {
    return {
      // API Keys - Using the ApiKeyManager to handle masked fields
      openaiApiKey: this.apiKeyManager.getFieldValue('openaiApiKey'),
      braveApiKey: this.apiKeyManager.getFieldValue('braveApiKey'),
      anthropicApiKey: this.apiKeyManager.getFieldValue('anthropicApiKey'),
      aiProvider: this.getElementValue('aiProvider'),
      
      // Preferences
      aiModel: this.getElementValue('aiModel'),
      useMultiModel: this.getCheckboxValue('useMultiModel'),
      autoCheckHeadlines: this.getCheckboxValue('autoCheckHeadlines'),
      enhancedUI: this.getCheckboxValue('enhancedUI'),
      resultPosition: this.getElementValue('resultPosition'),
      colorTheme: this.getElementValue('colorTheme'),
      
      // Analytics
      shareAnalytics: this.getCheckboxValue('shareAnalytics'),
      
      // Additional settings that might be available
      enableCaching: this.getCheckboxValue('enableCaching') ?? true,
      showReferences: this.getCheckboxValue('showReferences') ?? true,
      maxTokens: this.getElementValue('maxTokens') ?? CONTENT.MAX_TOKENS.DEFAULT.toString(),
      rateLimit: this.getElementValue('rateLimit') ?? REQUEST.RATE_LIMITS.DEFAULT.toString(),
      
      // Site management
      siteList: this.getElementValue('siteList') ?? '',
      ignoredSites: this.getElementValue('ignoredSites') ?? ''
    };
  }

  /**
   * Save all settings to storage
   */
  saveSettings() {
    // Get current settings
    const settings = this.getCurrentSettings();

    // Always save aiProvider to both storages to ensure consistency
    const aiProvider = settings.aiProvider;
    
    // Sanitize API keys
    settings.openaiApiKey = this.apiKeyManager.sanitizeApiKey(settings.openaiApiKey);
    settings.braveApiKey = this.apiKeyManager.sanitizeApiKey(settings.braveApiKey);
    
    // Save to sync storage first
    chrome.storage.sync.set(settings, () => {
      // Then explicitly save critical settings to local storage too
      chrome.storage.local.set({ aiProvider: aiProvider }, () => {
        console.log("aiProvider explicitly saved to local storage:", aiProvider);
      });

      // Reset modified fields after saving
      this.modifiedFields.clear();
      
      // Update the full key data attributes
      const openaiField = document.getElementById('openaiApiKey');
      const braveField = document.getElementById('braveApiKey');
      
      if (openaiField) {
        openaiField.dataset.fullKey = settings.openaiApiKey;
        openaiField.value = this.apiKeyManager.maskApiKey(settings.openaiApiKey);
      }
      
      if (braveField) {
        braveField.dataset.fullKey = settings.braveApiKey;
        braveField.value = this.apiKeyManager.maskApiKey(settings.braveApiKey);
      }
      
      // Show saved message
      this.showStatusMessage('Settings saved successfully!');
    });
  }

  /**
   * Reset settings to defaults
   */
  resetToDefaults() {
    if (confirm('Reset all settings to their default values? This will not affect your API keys or stored data.')) {
      // Apply defaults to UI
      this.setSelectValue('aiModel', this.defaultSettings.aiModel);
      this.setCheckboxValue('useMultiModel', this.defaultSettings.useMultiModel);
      this.setCheckboxValue('autoCheckHeadlines', this.defaultSettings.autoCheckHeadlines);
      this.setCheckboxValue('enhancedUI', this.defaultSettings.enhancedUI);
      this.setSelectValue('resultPosition', this.defaultSettings.resultPosition);
      this.setSelectValue('colorTheme', this.defaultSettings.colorTheme);
      this.setCheckboxValue('shareAnalytics', this.defaultSettings.shareAnalytics);
      this.setCheckboxValue('enableCaching', this.defaultSettings.enableCaching);
      this.setSelectValue('rateLimit', this.defaultSettings.rateLimit);
      this.setSelectValue('maxTokens', this.defaultSettings.maxTokens);
      this.setCheckboxValue('showReferences', this.defaultSettings.showReferences);
      this.setTextValue('siteList', this.defaultSettings.siteList);
      this.setTextValue('ignoredSites', this.defaultSettings.ignoredSites);
      
      // Show status message
      this.showStatusMessage('Settings reset to defaults. Click Save to apply changes.');
    }
  }

  /**
   * Export settings to JSON file
   */
  exportSettings() {
    const settings = this.getCurrentSettings();
    
    // Remove sensitive API keys before exporting
    const exportData = { ...settings };
    delete exportData.openaiApiKey;
    delete exportData.braveApiKey;
    
    // Add export timestamp
    exportData._exportDate = new Date().toISOString();
    exportData._exportVersion = document.getElementById('version')?.textContent.replace('Version: ', '') || '1.0.0';
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `factcheck-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Import settings from JSON file
   * @param {Event} event - The file input change event
   */
  importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedSettings = JSON.parse(e.target.result);
        
        // Apply imported settings to form
        this.setSelectValue('aiModel', importedSettings.aiModel);
        
        if (typeof importedSettings.useMultiModel === 'boolean') {
          this.setCheckboxValue('useMultiModel', importedSettings.useMultiModel);
        }
        
        if (typeof importedSettings.autoCheckHeadlines === 'boolean') {
          this.setCheckboxValue('autoCheckHeadlines', importedSettings.autoCheckHeadlines);
        }
        
        if (typeof importedSettings.enhancedUI === 'boolean') {
          this.setCheckboxValue('enhancedUI', importedSettings.enhancedUI);
        }
        
        this.setSelectValue('resultPosition', importedSettings.resultPosition);
        this.setSelectValue('colorTheme', importedSettings.colorTheme);
        
        if (typeof importedSettings.shareAnalytics === 'boolean') {
          this.setCheckboxValue('shareAnalytics', importedSettings.shareAnalytics);
        }
        
        if (typeof importedSettings.enableCaching === 'boolean') {
          this.setCheckboxValue('enableCaching', importedSettings.enableCaching);
        }
        
        if (typeof importedSettings.showReferences === 'boolean') {
          this.setCheckboxValue('showReferences', importedSettings.showReferences);
        }
        
        this.setSelectValue('maxTokens', importedSettings.maxTokens);
        this.setSelectValue('rateLimit', importedSettings.rateLimit);
        this.setTextValue('siteList', importedSettings.siteList);
        this.setTextValue('ignoredSites', importedSettings.ignoredSites);
        
        // Show success message
        this.showStatusMessage('Settings imported successfully! Click Save to apply changes.');
      } catch (error) {
        console.error('Error importing settings:', error);
        
        // Show error message
        this.showStatusMessage('Error importing settings. Invalid file format.', 'error');
      }
      
      // Reset the file input
      event.target.value = '';
    };
    
    reader.readAsText(file);
  }

  /**
   * Set up change listeners for form elements to update modified indicators
   */
  setupChangeListeners() {
    // Will be called after DOM content is loaded
    document.addEventListener('DOMContentLoaded', () => {
      // Add special handling for provider changes
      const providerSelect = document.getElementById('aiProvider');
      if (providerSelect) {
        providerSelect.addEventListener('change', async () => {
          // Immediately save provider setting when changed
          await StorageUtils.set({ aiProvider: providerSelect.value });
          console.log("AI Provider changed to:", providerSelect.value);
        });
      }
      // Select elements
      document.querySelectorAll('select').forEach(select => {
        select.addEventListener('change', () => {
          const id = select.id;
          const defaultValue = this.defaultSettings[id];
          
          if (select.value !== defaultValue) {
            this.markAsModified(id);
          } else {
            this.removeModifiedIndicator(id);
          }
        });
      });
      
      // Checkbox elements
      document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          const id = checkbox.id;
          const defaultValue = this.defaultSettings[id];
          
          if (checkbox.checked !== defaultValue) {
            this.markAsModified(id);
          } else {
            this.removeModifiedIndicator(id);
          }
        });
      });
      
      // Textarea elements
      document.querySelectorAll('textarea').forEach(textarea => {
        textarea.addEventListener('input', () => {
          const id = textarea.id;
          const defaultValue = this.defaultSettings[id] || '';
          
          if (textarea.value !== defaultValue) {
            this.markAsModified(id);
          } else {
            this.removeModifiedIndicator(id);
          }
        });
      });
    });
  }

  // Helper methods

  /**
   * Show a status message
   * @param {string} message - The message to show
   * @param {string} type - Type of message ('success' or 'error')
   */
  showStatusMessage(message, type = 'success') {
    const status = document.getElementById('status');
    if (!status) return;
    
    status.textContent = message;
    status.style.display = 'block';
    
    if (type === 'error') {
      status.style.color = '#d32f2f';
      status.style.backgroundColor = '#ffebee';
    } else {
      status.style.color = 'green';
      status.style.backgroundColor = '#E8F5E9';
    }
    
    setTimeout(() => {
      status.style.display = 'none';
      // Reset to success style after hiding
      if (type === 'error') {
        status.style.color = 'green';
        status.style.backgroundColor = '#E8F5E9';
      }
    }, 3000);
  }

  /**
   * Mark a setting as modified from default
   * @param {string} settingId - ID of the setting
   */
  markAsModified(settingId) {
    const element = document.getElementById(settingId);
    if (!element) return;
    
    // Find the parent option-label if it exists
    let labelElement;
    
    if (element.closest('.option-row')) {
      labelElement = element.closest('.option-row').querySelector('.option-label');
    } else if (element.parentElement.previousElementSibling && element.parentElement.previousElementSibling.tagName === 'LABEL') {
      labelElement = element.parentElement.previousElementSibling;
    } else {
      return; // Can't find label element
    }
    
    // Check if indicator already exists
    if (!labelElement.querySelector('.modified-indicator')) {
      const indicator = document.createElement('span');
      indicator.className = 'modified-indicator';
      indicator.title = 'Modified from default';
      labelElement.appendChild(indicator);
    }
  }

  /**
   * Remove modified indicator
   * @param {string} settingId - ID of the setting
   */
  removeModifiedIndicator(settingId) {
    const element = document.getElementById(settingId);
    if (!element) return;
    
    // Find the parent option-label if it exists
    let labelElement;
    
    if (element.closest('.option-row')) {
      labelElement = element.closest('.option-row').querySelector('.option-label');
    } else if (element.parentElement.previousElementSibling && element.parentElement.previousElementSibling.tagName === 'LABEL') {
      labelElement = element.parentElement.previousElementSibling;
    } else {
      return; // Can't find label element
    }
    
    // Check if indicator exists and remove it
    const indicator = labelElement.querySelector('.modified-indicator');
    if (indicator) {
      labelElement.removeChild(indicator);
    }
  }

  /**
   * Set a checkbox value and mark as modified if different from default
   * @param {string} id - Element ID
   * @param {boolean} value - Value to set
   * @param {boolean} defaultValue - Default value for comparison
   */
  setCheckboxValue(id, value, defaultValue) {
    const element = document.getElementById(id);
    if (!element) return;
    
    const useValue = value !== undefined ? value : defaultValue;
    element.checked = useValue !== false; // Default to true if undefined
    
    if (useValue !== defaultValue) {
      this.markAsModified(id);
    } else {
      this.removeModifiedIndicator(id);
    }
  }

  /**
   * Set a select value and mark as modified if different from default
   * @param {string} id - Element ID
   * @param {string} value - Value to set
   * @param {string} defaultValue - Default value for comparison
   */
  setSelectValue(id, value, defaultValue) {
    const element = document.getElementById(id);
    if (!element) return;
    
    if (value) {
      element.value = value;
      if (value !== defaultValue) {
        this.markAsModified(id);
      } else {
        this.removeModifiedIndicator(id);
      }
    }
  }

  /**
   * Set a text value and mark as modified if different from default
   * @param {string} id - Element ID
   * @param {string} value - Value to set
   * @param {string} defaultValue - Default value for comparison
   */
  setTextValue(id, value, defaultValue = '') {
    const element = document.getElementById(id);
    if (!element) return;
    
    element.value = value || '';
    if (value && value !== defaultValue) {
      this.markAsModified(id);
    } else {
      this.removeModifiedIndicator(id);
    }
  }

  /**
   * Get a checkbox value
   * @param {string} id - Element ID
   * @returns {boolean|null} Checkbox value or null if element not found
   */
  getCheckboxValue(id) {
    const element = document.getElementById(id);
    return element ? element.checked : null;
  }

  /**
   * Get an element value
   * @param {string} id - Element ID
   * @returns {string} Element value or empty string if not found
   */
  getElementValue(id) {
    const element = document.getElementById(id);
    return element ? element.value.trim() : '';
  }
}