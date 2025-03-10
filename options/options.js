// options.js - Main entry point for extension options
import { ApiKeyManager } from './modules/api-key-manager.js';
import { SettingsManager } from './modules/settings-manager.js';
import { AnalyticsManager } from './modules/analytics-manager.js';
import { UiManager } from './modules/ui-manager.js';
import { AccessibilityHelper } from './modules/accessibility.js';
import { DebugTools } from './modules/debug-tools.js';
import { SUPABASE_CONFIG } from '../utils/supabase-config.js';

// Global references for easier debugging
let analyticsManager = null;
let debugTools = null;

// Make analytics manager available globally for debugging
window.getAnalyticsManager = () => analyticsManager;

// Initialize all managers when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log("DOM content loaded, initializing options page");
    
    // Initialize UI first (for visual feedback)
    const uiManager = new UiManager();
    uiManager.setupTabs();
    uiManager.setupVersionInfo();

    // Initialize settings manager
    const settingsManager = new SettingsManager();
    await settingsManager.loadSettings();
    
    // Initialize API key manager
    const apiKeyManager = new ApiKeyManager();
    apiKeyManager.setupApiKeyFields();
    apiKeyManager.setupVisibilityToggles();
    
    // Initialize analytics visualizations
    analyticsManager = new AnalyticsManager();
    analyticsManager.loadAnalyticsData();
    analyticsManager.loadRecentFactChecks();
    analyticsManager.calculateUsageCosts();
    
    // Initialize accessibility features
    const accessibilityHelper = new AccessibilityHelper();
    accessibilityHelper.enhanceAccessibility();
    
    // Set up debug tools
    debugTools = new DebugTools();
    debugTools.setAnalyticsManager(analyticsManager); // Pass the analytics manager reference
    debugTools.setupDebugTools();

    // Load Supabase configuration and initialize if analytics sharing is enabled
    await initializeSupabase(analyticsManager);
    
    // Set up event listeners for main buttons
    setupEventListeners(settingsManager, apiKeyManager, analyticsManager, debugTools);
    
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

// Set up global event listeners
function setupEventListeners(settingsManager, apiKeyManager, analyticsManager, debugTools) {
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
  
  // Analytics management
  document.getElementById('clearData')?.addEventListener('click', () => analyticsManager.clearStoredData());
  document.getElementById('clearRecentChecks')?.addEventListener('click', () => analyticsManager.clearRecentFactChecks());
  
  // Debug tools 
  // Note: The Supabase test buttons are set up in the debugTools.setupSupabaseDebugButtons method
  document.getElementById('testAPIIntegration')?.addEventListener('click', () => debugTools.testAPIIntegration());
  document.getElementById('viewDebugInfo')?.addEventListener('click', () => debugTools.viewDebugInfo());
  
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