// options.js - Main entry point for extension options
import { ApiKeyManager } from './modules/api-key-manager.js';
import { SettingsManager } from './modules/settings-manager.js';
import { AnalyticsManager } from './modules/analytics-manager.js';
import { UiManager } from './modules/ui-manager.js';
import { AccessibilityHelper } from './modules/accessibility.js';
import { DebugTools } from './modules/debug-tools.js';
import { SUPABASE_CONFIG } from '../utils/supabase-config.js';
import { VersionManager } from './modules/version-manager.js';

// Global references for easier debugging
let analyticsManager = null;
let debugTools = null;
let uiManager = null;
let versionManager = null;

// Make globals available for debugging
window.getAnalyticsManager = () => analyticsManager;
window.getVersionManager = () => versionManager;

// Initialize all managers when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log("DOM content loaded, initializing options page");
    setupProviderChangeHandler();
    
    // 1. First, initialize the UI manager and set up tabs
    console.log("Setting up UI manager");
    uiManager = new UiManager();
    uiManager.setupTabs();
    
    // 2. Initialize version manager (for GitHub integration)
    console.log("Setting up version manager");
    versionManager = new VersionManager();
    await versionManager.initializeVersionInfo();
    
    // 3. Initialize settings manager
    console.log("Setting up settings manager");
    const settingsManager = new SettingsManager();
    await settingsManager.loadSettings();
    setupProviderChangeHandler();
    
    // 4. Initialize API key manager
    console.log("Setting up API key manager");
    const apiKeyManager = new ApiKeyManager();
    apiKeyManager.setupApiKeyFields();
    apiKeyManager.setupVisibilityToggles();
    
    // 5. Initialize analytics visualizations
    console.log("Setting up analytics manager");
    analyticsManager = new AnalyticsManager();
    analyticsManager.loadAnalyticsData();
    analyticsManager.loadRecentFactChecks();
    analyticsManager.calculateUsageCosts();
    
    // 6. Initialize accessibility features
    console.log("Setting up accessibility helper");
    const accessibilityHelper = new AccessibilityHelper();
    accessibilityHelper.enhanceAccessibility();
    
    // 7. Set up debug tools
    console.log("Setting up debug tools");
    debugTools = new DebugTools();
    debugTools.setAnalyticsManager(analyticsManager);
    debugTools.setupDebugTools();

    // 8. Load Supabase configuration and initialize if analytics sharing is enabled
    console.log("Initializing Supabase");
    await initializeSupabase(analyticsManager);
    
    // 9. Set up event listeners for main buttons
    console.log("Setting up event listeners");
    setupEventListeners(settingsManager, apiKeyManager, analyticsManager, debugTools, versionManager);
    
    // 10. Load release notes
    console.log("Loading release notes");
    await versionManager.loadReleaseNotes();
    
    console.log("Options page initialized successfully");
  } catch (error) {
    console.error("Error initializing options page:", error);
    // Show error to user
    const status = document.getElementById('status');
    if (status) {
      status.textContent = `Error initializing: ${error.message}`;
      status.style.display = 'block';
      status.style.color = 'red';
    }
  }
});

// Initialize Supabase client if analytics sharing is enabled
async function initializeSupabase(analyticsManager) {
  try {
    console.log("Initializing Supabase...");
    // Get analytics sharing preference
    const { shareAnalytics } = await new Promise(resolve => {
      chrome.storage.sync.get(['shareAnalytics'], resolve);
    });
    
    // Update Supabase configuration
    analyticsManager.supabaseUrl = SUPABASE_CONFIG.PROJECT_URL;
    analyticsManager.supabaseKey = SUPABASE_CONFIG.ANON_KEY;
    analyticsManager.supabaseClient.supabaseUrl = SUPABASE_CONFIG.PROJECT_URL;
    analyticsManager.supabaseClient.supabaseKey = SUPABASE_CONFIG.ANON_KEY;
    
    // Log config (for debugging, without showing the API key)
    console.log(`Supabase URL: ${SUPABASE_CONFIG.PROJECT_URL}`);
    console.log(`Supabase tables: ${SUPABASE_CONFIG.TABLES.ANALYTICS}, ${SUPABASE_CONFIG.TABLES.FEEDBACK}`);
    
    // Initialize Supabase if analytics sharing is enabled
    if (shareAnalytics !== false) {
      try {
        await analyticsManager.supabaseClient.initialize();
        console.log("Supabase initialized for analytics tracking");
      } catch (error) {
        console.warn("Could not initialize Supabase:", error.message);
        // Don't throw - we want the rest of the app to work even if Supabase fails
      }
    } else {
      console.log("Analytics sharing disabled, skipping Supabase initialization");
    }
  } catch (error) {
    console.error("Error in initializeSupabase:", error);
    // Don't throw - we want the rest of the app to work even if Supabase fails
  }
}

function setupProviderChangeHandler() {
  const providerSelect = document.getElementById('aiProvider');
  const modelSelect = document.getElementById('aiModel');
  
  if (!providerSelect || !modelSelect) return;
  
  function updateModelOptions() {
    const selectedProvider = providerSelect.value;
    let firstOptionFound = false;
    
    // Show/hide options based on provider
    Array.from(modelSelect.options).forEach(option => {
      const optionProvider = option.getAttribute('data-provider');
      const shouldShow = optionProvider === selectedProvider;
      
      option.style.display = shouldShow ? '' : 'none';
      
      // Select the first available option if current selection is hidden
      if (shouldShow && !firstOptionFound) {
        firstOptionFound = true;
        if (modelSelect.selectedOptions[0].style.display === 'none') {
          modelSelect.value = option.value;
        }
      }
    });
  }
  
  // Handle provider change
  providerSelect.addEventListener('change', updateModelOptions);
  
  // Initial setup
  updateModelOptions();
}

// Set up global event listeners
function setupEventListeners(settingsManager, apiKeyManager, analyticsManager, debugTools, versionManager) {
  console.log("Setting up event listeners");
  
  // Main settings buttons
  document.getElementById('save')?.addEventListener('click', () => settingsManager.saveSettings());
  document.getElementById('reset')?.addEventListener('click', () => settingsManager.resetToDefaults());
  document.getElementById('exportSettings')?.addEventListener('click', () => settingsManager.exportSettings());
  
  // Import settings button and file handler
  document.getElementById('importSettings')?.addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile')?.addEventListener('change', (event) => {
    settingsManager.importSettings(event);
  });
  
  // API key testing
  document.getElementById('testOpenAI')?.addEventListener('click', () => apiKeyManager.testOpenAIKey());
  document.getElementById('testBrave')?.addEventListener('click', () => apiKeyManager.testBraveKey());
  document.getElementById('testAnthropic')?.addEventListener('click', () => {
    console.log("Anthropic test button clicked");
    apiKeyManager.testAnthropicKey();
  });
  
  // Analytics management
  document.getElementById('clearData')?.addEventListener('click', () => analyticsManager.clearStoredData());
  document.getElementById('clearRecentChecks')?.addEventListener('click', () => analyticsManager.clearRecentFactChecks());
  
  // Debug tools 
  document.getElementById('testAPIIntegration')?.addEventListener('click', () => debugTools.testAPIIntegration());
  document.getElementById('viewDebugInfo')?.addEventListener('click', () => debugTools.viewDebugInfo());
  
  // Version management
  document.getElementById('commitLink')?.addEventListener('click', (e) => {
    if (!e.target.href) {
      e.preventDefault();
      versionManager.refreshVersionInfo();
    }
  });

  // Add test button event handler for Anthropic
  function setupAnthropicTestButton() {
    const testButton = document.getElementById('testAnthropic');
    if (testButton) {
      testButton.addEventListener('click', () => apiKeyManager.testAnthropicKey());
    }
  }

  // Accessibility help
  document.getElementById('showAccessibilityHelp')?.addEventListener('click', () => AccessibilityHelper.showAccessibilityHelp());
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+S to save settings
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      settingsManager.saveSettings();
    }
    
    // Ctrl+R to reset settings
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      settingsManager.resetToDefaults();
    }
    
    // Alt+/ to show accessibility help
    if (e.altKey && e.key === '/') {
      e.preventDefault();
      AccessibilityHelper.showAccessibilityHelp();
    }
  });
}