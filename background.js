// background.js - Main coordinator that delegates to service modules
import { StorageUtils } from './utils/storage.js';
import { FactCheckerService } from './services/factChecker.js';
import { AnalyticsService } from './services/analytics.js';
import { OpenAIService } from './api/openai.js';
import { BraveSearchService } from './api/brave.js';

// Global debug flag - set to false for production
const DEBUG = false;

// Debug logging helper
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

// Setup context menus on install
chrome.runtime.onInstalled.addListener(() => {
  debugLog("Extension installed, setting up context menus");
  setupContextMenus();
  initializeDefaultSettings();
});

// Setup context menus
function setupContextMenus() {
  chrome.contextMenus.create({
    id: 'factCheckSelection',
    title: 'Fact-check selected text',
    contexts: ['selection']
  });
  
  chrome.contextMenus.create({
    id: 'factCheckPage',
    title: 'Fact-check entire page',
    contexts: ['page']
  });
  debugLog("Context menus created");
}

// Initialize default settings
async function initializeDefaultSettings() {
  try {
    const settings = await StorageUtils.get([
      'aiModel', 
      'useMultiModel', 
      'maxTokens', 
      'enableCaching', 
      'rateLimit',
      'openaiApiKey',
      'braveApiKey'
    ]);
    
    debugLog("Current settings loaded:", {
      aiModel: settings.aiModel,
      useMultiModel: settings.useMultiModel,
      maxTokens: settings.maxTokens,
      enableCaching: settings.enableCaching,
      rateLimit: settings.rateLimit,
      hasOpenAIKey: !!settings.openaiApiKey,
      hasBraveKey: !!settings.braveApiKey
    });
    
    // If settings don't exist, set defaults
    if (!settings.aiModel) {
      debugLog("Setting default settings");
      await StorageUtils.set({
        aiModel: 'gpt-4o-mini',
        useMultiModel: false,
        maxTokens: 500,
        enableCaching: true,
        rateLimit: 5
      });
    }
  } catch (error) {
    console.error("Error initializing settings:", error);
  }
}

// Ensure content script is loaded before communicating
async function ensureContentScriptLoaded(tabId) {
  try {
    debugLog(`Ensuring content script is loaded in tab ${tabId}`);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    debugLog("Content script injection successful");
    
    // Add a small delay to ensure scripts are properly initialized
    await new Promise(resolve => setTimeout(resolve, 250));
    
    return true;
  } catch (error) {
    // It's okay if this fails - it might already be loaded
    if (DEBUG) console.error("Error injecting content script:", error);
    
    // Still add a delay to ensure scripts are initialized if already loaded
    await new Promise(resolve => setTimeout(resolve, 250));
    
    return false;
  }
}

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  debugLog("Context menu clicked:", info.menuItemId);
  try {
    const { openaiApiKey, braveApiKey } = await StorageUtils.get(['openaiApiKey', 'braveApiKey']);
    debugLog("API keys present:", !!openaiApiKey, !!braveApiKey);
    
    if (!openaiApiKey) {
      console.error("Missing OpenAI API key");
      await executeScript(tab.id, () => alert('Please set your OpenAI API key in the extension options.'));
      return;
    }

    if (info.menuItemId === 'factCheckPage') {
      await handlePageCheck(tab, openaiApiKey, braveApiKey);
    } else {
      await handleSelectionCheck(info.selectionText, tab, openaiApiKey, braveApiKey);
    }
  } catch (error) {
    console.error("Context menu handler error:", error);
    await handleError(tab.id, 'Error processing request.');
  }
});

// Handle checking an entire page
async function handlePageCheck(tab, openaiApiKey, braveApiKey) {
  debugLog(`Starting page check for tab ${tab.id}: ${tab.url}`);
  try {
    // Ensure content script is loaded (now includes delay)
    await ensureContentScriptLoaded(tab.id);
    
    debugLog("Requesting article text from content script");
    const response = await getArticleTextFromTab(tab.id);
    debugLog("Article text response received:", response ? "yes" : "no");
    
    if (response && response.articleText) {
      await processFactCheck(response.articleText, openaiApiKey, braveApiKey, tab);
    } else {
      console.error("No article text extracted");
      await executeScript(tab.id, () => alert('Could not extract article text.'));
    }
  } catch (error) {
    console.error("Error getting article text:", error);
    await executeScript(tab.id, () => alert('Error extracting text from page.'));
  }
}

// Handle checking selected text
async function handleSelectionCheck(text, tab, openaiApiKey, braveApiKey) {
  debugLog(`Starting selection check with ${text.length} characters of text`);
  await processFactCheck(text, openaiApiKey, braveApiKey, tab);
}

// Extension icon click handler
chrome.action.onClicked.addListener(async (tab) => {
  debugLog("Extension icon clicked");
  try {
    const { openaiApiKey, braveApiKey } = await StorageUtils.get(['openaiApiKey', 'braveApiKey']);
    debugLog("API keys present:", !!openaiApiKey, !!braveApiKey);
    
    if (!openaiApiKey) {
      console.error("Missing OpenAI API key");
      await executeScript(tab.id, () => alert('Please set your OpenAI API key in the extension options.'));
      return;
    }

    // Ensure content script is loaded first (now includes delay)
    await ensureContentScriptLoaded(tab.id);

    // Try to get selected text
    const [{ result: selectedText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => window.getSelection().toString()
    });

    debugLog("Selected text:", selectedText ? "found" : "none");
    if (selectedText && selectedText.trim().length > 0) {
      await processFactCheck(selectedText, openaiApiKey, braveApiKey, tab);
    } else {
      await handlePageCheck(tab, openaiApiKey, braveApiKey);
    }
  } catch (error) {
    console.error("Error handling extension click:", error);
  }
});

// Main fact-check processing function
async function processFactCheck(text, openaiApiKey, braveApiKey, tab) {
  debugLog("Starting fact check process with text length:", text.length);
  
  // Ensure content script is loaded before showing overlay (now includes delay)
  const contentInjected = await ensureContentScriptLoaded(tab.id);
  debugLog("Content script loaded status:", contentInjected);
  
  // Show loading overlay
  const overlayShown = await showOverlayWithRetry(tab.id);
  debugLog("Overlay shown:", overlayShown);
  
  try {
    // Get settings
    const settings = await StorageUtils.get([
      'aiModel', 
      'useMultiModel', 
      'maxTokens', 
      'enableCaching', 
      'rateLimit'
    ]);
    
    debugLog("Settings retrieved");
    
    // Create fact checker service
    debugLog("Creating fact checker with API keys available:", !!openaiApiKey, !!braveApiKey);
    const factChecker = new FactCheckerService(openaiApiKey, braveApiKey, settings);
    
    // Get article metadata if available
    let sourceMetadata = {};
    try {
      debugLog("Attempting to get article metadata");
      const response = await getArticleTextFromTab(tab.id);
      if (response && response.metadata) {
        sourceMetadata = response.metadata;
        debugLog("Article metadata received");
      }
    } catch (error) {
      console.error("Error getting article metadata:", error);
    }
    
    // Perform fact check
    debugLog("Starting fact check analysis");
    const { result, queryText } = await factChecker.check(text);
    debugLog("Fact check completed", {
      queryTextLength: queryText.length,
      resultLength: result.length
    });
    
    // Update overlay with results
    debugLog("Updating overlay with results");
    await updateOverlayWithRetry(tab.id, result, sourceMetadata);
    
    // Record analytics
    AnalyticsService.recordFactCheck(text, queryText);
    debugLog("Analytics recorded");
  } catch (error) {
    console.error("Error in processFactCheck:", error);
    await updateOverlayWithRetry(tab.id, 'Error: An unexpected error occurred during fact-checking. Please try again.', {});
  }
}

// Helper function to show overlay with retry
async function showOverlayWithRetry(tabId, maxRetries = 3) {
  debugLog(`Attempting to show overlay in tab ${tabId}`);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sendMessageToTab(tabId, { action: 'createOverlay' });
      debugLog("Overlay creation message sent successfully");
      return true;
    } catch (error) {
      debugLog(`Attempt ${attempt+1} to show overlay failed`);
      if (attempt < maxRetries - 1) {
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 300 * Math.pow(2, attempt)));
      }
    }
  }
  console.error("Could not create overlay after multiple attempts");
  return false;
}

// Helper function to update overlay with retry
async function updateOverlayWithRetry(tabId, result, metadata, maxRetries = 3) {
  debugLog(`Attempting to update overlay in tab ${tabId}`);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sendMessageToTab(tabId, { 
        action: 'updateOverlay', 
        result: result,
        metadata: metadata
      });
      debugLog("Overlay update message sent successfully");
      return true;
    } catch (error) {
      debugLog(`Attempt ${attempt+1} to update overlay failed`);
      if (attempt < maxRetries - 1) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 400 * Math.pow(2, attempt)));
      }
    }
  }
  console.error(`Failed to update overlay after ${maxRetries} attempts`);
  return false;
}

// Promise-based wrapper for sending messages to tabs
function sendMessageToTab(tabId, message) {
  debugLog(`Sending message to tab ${tabId}:`, message.action);
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          if (DEBUG) console.error("Error sending message:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          debugLog(`Message ${message.action} sent successfully`);
          resolve(response);
        }
      });
    } catch (error) {
      console.error("Exception sending message:", error);
      reject(error);
    }
  });
}

// Promise-based wrapper for chrome.tabs.sendMessage
function getArticleTextFromTab(tabId) {
  debugLog(`Requesting article text from tab ${tabId}`);
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, { action: 'getArticleText' }, (response) => {
        if (chrome.runtime.lastError) {
          if (DEBUG) console.error("Error getting article text:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          debugLog("Article text received", {
            hasText: !!response?.articleText,
            textLength: response?.articleText?.length,
            hasMetadata: !!response?.metadata
          });
          resolve(response);
        }
      });
    } catch (error) {
      console.error("Exception getting article text:", error);
      reject(error);
    }
  });
}

// Execute script in tab with error handling
function executeScript(tabId, func) {
  debugLog(`Executing script in tab ${tabId}`);
  return new Promise((resolve, reject) => {
    try {
      chrome.scripting.executeScript({
        target: { tabId },
        function: func
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error("Error executing script:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          debugLog("Script executed successfully");
          resolve(results);
        }
      });
    } catch (error) {
      console.error("Exception executing script:", error);
      reject(error);
    }
  });
}

// Handle errors by showing an alert in the tab
async function handleError(tabId, message) {
  console.error(`Handling error in tab ${tabId}: ${message}`);
  try {
    await executeScript(tabId, (msg) => alert(msg), [message]);
  } catch (error) {
    console.error("Error showing error message:", error);
  }
}

// Listen for feedback from users
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    console.error("Received invalid message:", message);
    sendResponse({ error: "Invalid message format" });
    return true;
  }
  
  debugLog("Message received in background:", message.action || "no action specified");
  
  if (message.action === "recordFeedback") {
    AnalyticsService.recordFeedback(message.rating, sender.tab);
    debugLog("Feedback recorded:", message.rating);
    sendResponse({ success: true });
    return true; // Keep message channel open for async response
  }
  
  // If we reach here, we didn't handle the message
  sendResponse({ error: "Unhandled message type" });
  return true;
});