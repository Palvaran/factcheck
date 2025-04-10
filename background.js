// background.js - Main coordinator that delegates to service modules
import { StorageManager } from './utils/StorageManager.js';
import { DebugUtils } from './utils/debug-utils.js';
import { ApiManager } from './services/ApiManager.js';
import { ContextMenuManager } from './services/ContextMenuManager.js';
import { FactCheckManager } from './services/FactCheckManager.js';
import { AnalyticsManager } from './services/AnalyticsManager.js';
import { ContentScriptManager } from './services/ContentScriptManager.js';

// Global debug flag - set to false for production
const DEBUG = false;

// Initialize the debug utility with our setting
DebugUtils.setDebugEnabled(DEBUG);

// Initialize service managers
const apiManager = new ApiManager();
const analyticsManager = new AnalyticsManager();
const contentScriptManager = new ContentScriptManager();
const factCheckManager = new FactCheckManager(apiManager, analyticsManager, contentScriptManager);
const contextMenuManager = new ContextMenuManager(factCheckManager);

// Flag to track initialization status
let isInitialized = false;

// Setup on install
chrome.runtime.onInstalled.addListener(async () => {
  DebugUtils.log("Background", "Extension installed, initializing services");
  await initializeServices();
});

// Initialize all services
async function initializeServices() {
  try {
    // Initialize API manager first to load and synchronize keys
    await apiManager.initialize();
    
    // Initialize other managers
    await analyticsManager.initialize();
    contextMenuManager.initialize();
    
    // Initialize default settings
    await initializeDefaultSettings();
    
    // Mark as initialized
    isInitialized = true;
    
    DebugUtils.log("Background", "All services initialized successfully");
  } catch (error) {
    DebugUtils.error("Background", "Error initializing services:", error);
  }
}

// Initialize default settings
async function initializeDefaultSettings() {
  try {
    const settings = await StorageManager.get([
      'aiProvider',
      'aiModel', 
      'useMultiModel', 
      'maxTokens', 
      'enableCaching', 
      'rateLimit',
      'openaiApiKey',
      'braveApiKey',
      'anthropicApiKey',
      'shareAnalytics'
    ]);
    
    DebugUtils.log("Background", "Current settings loaded:", {
      aiProvider: settings.aiProvider,
      aiModel: settings.aiModel,
      useMultiModel: settings.useMultiModel,
      maxTokens: settings.maxTokens,
      enableCaching: settings.enableCaching,
      rateLimit: settings.rateLimit,
      hasOpenAIKey: !!settings.openaiApiKey,
      hasBraveKey: !!settings.braveApiKey,
      hasAnthropicKey: !!settings.anthropicApiKey,
      shareAnalytics: settings.shareAnalytics !== false
    });
    
    // If settings don't exist, set defaults
    if (!settings.aiModel) {
      DebugUtils.log("Background", "Setting default settings");
      await StorageManager.set({
        aiProvider: 'openai',
        aiModel: 'gpt-4o-mini',
        useMultiModel: false,
        maxTokens: 4000,
        enableCaching: true,
        rateLimit: 5,
        shareAnalytics: true
      });
    }
  } catch (error) {
    DebugUtils.error("Background", "Error initializing settings:", error);
  }
}

// Extension icon click handler
chrome.action.onClicked.addListener(async (tab) => {
  DebugUtils.log("Background", "Extension icon clicked");
  try {
    // Ensure services are initialized before proceeding
    if (!isInitialized) {
      DebugUtils.log("Background", "Services not initialized yet, initializing now");
      await initializeServices();
    }
    
    // Get all API keys and settings in one call
    const settings = await StorageManager.get([
      'openaiApiKey', 
      'braveApiKey', 
      'anthropicApiKey', 
      'aiProvider',
      'aiModel'
    ]);
    
    // Determine which API key to check based on provider
    let requiredKey = settings.openaiApiKey;
    let keyName = 'OpenAI API key';
    
    if (settings.aiProvider === 'anthropic') {
      requiredKey = settings.anthropicApiKey;
      keyName = 'Anthropic API key';
    }
    
    if (!requiredKey) {
      DebugUtils.error("Background", `Missing ${keyName}`);
      await contentScriptManager.executeScript(tab.id, (msg) => alert(msg), [`Please set your ${keyName} in the extension options.`]);
      return;
    }

    // Ensure content script is loaded first
    await contentScriptManager.ensureContentScriptLoaded(tab.id);

    // Try to get selected text
    const [{ result: selectedText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => window.getSelection().toString()
    });

    DebugUtils.log("Background", "Selected text:", selectedText ? "found" : "none");
    if (selectedText && selectedText.trim().length > 0) {
      await factCheckManager.handleSelectionCheck(selectedText, tab);
    } else {
      await factCheckManager.handlePageCheck(tab);
    }
  } catch (error) {
    DebugUtils.error("Background", "Error handling extension click:", error);
  }
});

// Listen for messages from content scripts and options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    DebugUtils.error("Background", "Received invalid message:", message);
    sendResponse({ error: "Invalid message format" });
    return true;
  }
  
  DebugUtils.log("Background", "Message received:", message.action || "no action specified");
  
  // Ensure services are initialized for actions that require them
  if (!isInitialized && message.action !== 'setDebugEnabled') {
    DebugUtils.log("Background", "Services not initialized yet, initializing now");
    // We need to handle this asynchronously
    (async () => {
      try {
        await initializeServices();
        // After initialization, process the message
        processMessage(message, sender, sendResponse);
      } catch (error) {
        DebugUtils.error("Background", "Error initializing services:", error);
        sendResponse({ success: false, error: "Service initialization failed" });
      }
    })();
    return true; // Keep the message channel open
  }
  
  // If already initialized, process the message directly
  return processMessage(message, sender, sendResponse);
});

// Process messages after ensuring initialization
function processMessage(message, sender, sendResponse) {
  // Handle different message types
  switch (message.action) {
    case 'setDebugEnabled':
      DebugUtils.setDebugEnabled(message.enabled);
      DebugUtils.log("Background", `Debug mode ${message.enabled ? 'enabled' : 'disabled'}`);
      sendResponse({ success: true });
      return true;
      
    case 'testAnthropicKey':
      (async () => {
        try {
          const isValid = await apiManager.testApiKey('anthropic', message.apiKey);
          sendResponse({ success: isValid });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Keep the message channel open
      
    case 'injectReadability':
      contentScriptManager.injectReadability(sender.tab.id)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case "recordFeedback":
      (async () => {
        try {
          const success = await analyticsManager.recordFeedback({
            rating: message.rating,
            domain: sender.tab?.url ? new URL(sender.tab.url).hostname : 'unknown'
          });
          sendResponse({ success });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    case 'trackFactCheck':
      (async () => {
        try {
          await analyticsManager.recordFactCheck(null, null, message.data);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    case 'syncAnalytics':
      analyticsManager.syncPendingAnalytics()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'forceSyncNow':
      analyticsManager.forceSyncNow()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'getSyncStatus':
      analyticsManager.getSyncStatus()
        .then(status => sendResponse(status))
        .catch(error => sendResponse({ 
          isSyncing: analyticsManager.isSyncing, 
          error: error.message 
        }));
      return true;
      
    case 'trackFeedback':
      (async () => {
        try {
          const success = await analyticsManager.recordFeedback(message.data);
          sendResponse({ success });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    default:
      DebugUtils.log('Background', 'Unknown message action:', message.action);
      sendResponse({ error: "Unhandled message type" });
      return true;
  }
}
