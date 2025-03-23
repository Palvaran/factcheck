// background.js - Main coordinator that delegates to service modules
import { StorageUtils } from './utils/storage.js';
import { DebugUtils } from './utils/debug-utils.js';
import { FactCheckerService } from './services/factChecker.js';
import { AnalyticsService } from './services/analytics.js';
import { OpenAIService } from './api/openai.js';
import { BraveSearchService } from './api/brave.js';
import { SupabaseClient } from './options/modules/supabase-client.js';
import { SUPABASE_CONFIG } from './utils/supabase-config.js';
import { API, REQUEST, CONTENT, CACHE, STYLES, DOMAINS } from './utils/constants.js';
import { AnthropicService } from './api/anthropic.js';

// Global debug flag - set to false for production
const DEBUG = false;

// Initialize the debug utility with our setting
DebugUtils.setDebugEnabled(DEBUG);

// Initialize Supabase client
let supabaseClient = null;

// Constants for batch processing
const BATCH_SIZE = 50;  // Maximum number of records per batch
const SYNC_INTERVAL = 15 * 60 * 1000;  // 15 minutes
const MIN_BATCH_THRESHOLD = 5;  // Minimum records to trigger a batch sync
const MAX_RETRY_ATTEMPTS = REQUEST.RETRY.MAX_ATTEMPTS;  // Use constant instead of hardcoded value

// Track sync status
let isSyncing = false;
let lastSyncTime = 0;
let syncErrorCount = 0;

// Setup context menus on install
chrome.runtime.onInstalled.addListener(() => {
  DebugUtils.log("Background", "Extension installed, setting up context menus");
  setupContextMenus();
  initializeDefaultSettings();
  initializeSupabase();
});

// Initialize Supabase client
async function initializeSupabase() {
  try {
    DebugUtils.log("Background", "Initializing Supabase client");
    // Create Supabase client
    supabaseClient = new SupabaseClient(
      SUPABASE_CONFIG.PROJECT_URL,
      SUPABASE_CONFIG.ANON_KEY
    );
    
    // Explicitly initialize the client to set initialized=true
    try {
      await supabaseClient.initialize();
      DebugUtils.log("Background", "Supabase client initialized successfully");
    } catch (initError) {
      DebugUtils.error("Background", "Error during initial Supabase initialization:", initError);
      // We'll continue setting up sync even if there's an error
      // The sync function will retry initialization later
    }
    
    // Set up sync interval
    setInterval(() => {
      try {
        syncPendingAnalytics();
      } catch (error) {
        DebugUtils.error("Background", 'Periodic sync error:', error);
      }
    }, SYNC_INTERVAL);
    
    // Do an initial sync after startup with a short delay
    setTimeout(() => {
      try {
        syncPendingAnalytics();
      } catch (error) {
        DebugUtils.error("Background", 'Initial sync error:', error);
      }
    }, 5000);
    
    DebugUtils.log("Background", "Supabase client and sync schedule initialized");
  } catch (error) {
    DebugUtils.error("Background", "Error initializing Supabase:", error);
  }
}

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
  DebugUtils.log("Background", "Context menus created");
}

// Initialize default settings
async function initializeDefaultSettings() {
  try {
    const settings = await StorageUtils.get([
      'aiProvider', // Add this
      'aiModel', 
      'useMultiModel', 
      'maxTokens', 
      'enableCaching', 
      'rateLimit',
      'openaiApiKey',
      'braveApiKey',
      'anthropicApiKey', // Add this
      'shareAnalytics'
    ]);
    
    DebugUtils.log("Background", "Current settings loaded:", {
      aiProvider: settings.aiProvider, // Add this
      aiModel: settings.aiModel,
      useMultiModel: settings.useMultiModel,
      maxTokens: settings.maxTokens,
      enableCaching: settings.enableCaching,
      rateLimit: settings.rateLimit,
      hasOpenAIKey: !!settings.openaiApiKey,
      hasBraveKey: !!settings.braveApiKey,
      hasAnthropicKey: !!settings.anthropicApiKey, // Add this
      shareAnalytics: settings.shareAnalytics !== false
    });
    
    // If settings don't exist, set defaults
    if (!settings.aiModel) {
      DebugUtils.log("Background", "Setting default settings");
      await StorageUtils.set({
        aiProvider: 'openai', // Add this
        aiModel: 'gpt-4o-mini',
        useMultiModel: false,
        maxTokens: CONTENT.MAX_TOKENS.DEFAULT,
        enableCaching: true,
        rateLimit: REQUEST.RATE_LIMITS.DEFAULT,
        shareAnalytics: true
      });
    }
  } catch (error) {
    DebugUtils.error("Background", "Error initializing settings:", error);
  }
}

// Ensure content script is loaded with better retry mechanism
async function ensureContentScriptLoaded(tabId, maxRetries = 3) {
  DebugUtils.log("Background", `Ensuring content script is loaded in tab ${tabId} with ${maxRetries} retries`);
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Inject the content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      
      DebugUtils.log("Background", `Content script injection attempt ${attempt+1} completed`);
      
      // Add a longer delay for complex pages (500ms instead of 250ms)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify the content script is actually responding
      const isResponding = await isContentScriptResponding(tabId);
      if (isResponding) {
        DebugUtils.log("Background", "Content script is responding properly");
        return true;
      }
      
      DebugUtils.log("Background", `Content script not yet responding on attempt ${attempt+1}, waiting...`);
      
      // Exponential backoff before retry
      await new Promise(resolve => 
        setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 5000))
      );
    } catch (error) {
      // This might fail if script is already injected, which is okay
      DebugUtils.log("Background", `Script injection attempt ${attempt+1} error (might be already loaded): ${error.message}`);
      
      // Even if injection failed, check if content script is responding
      const isResponding = await isContentScriptResponding(tabId);
      if (isResponding) {
        DebugUtils.log("Background", "Content script is already loaded and responding");
        return true;
      }
      
      // Wait before retry with exponential backoff
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 5000))
        );
      }
    }
  }
  
  DebugUtils.log("Background", "Failed to ensure content script is loaded after multiple attempts");
  return false;
}

// Helper function to check if content script is responding
async function isContentScriptResponding(tabId) {
  try {
    // Send a simple ping message to the content script
    const response = await sendMessageToTab(tabId, { action: 'ping' });
    return response && response.pong === true;
  } catch (error) {
    DebugUtils.log("Background", `Content script ping failed: ${error.message}`);
    return false;
  }
}

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  DebugUtils.log("Background", "Context menu clicked:", info.menuItemId);
  try {
    // Get all API keys and provider setting
    const { openaiApiKey, braveApiKey, anthropicApiKey, aiProvider } = 
      await StorageUtils.get(['openaiApiKey', 'braveApiKey', 'anthropicApiKey', 'aiProvider']);
    
    DebugUtils.log("Background", "API keys present:", 
                  !!openaiApiKey, !!braveApiKey, !!anthropicApiKey);
    DebugUtils.log("Background", "AI provider:", aiProvider);
    
    // Determine which API key to check based on provider
    let requiredKey = openaiApiKey;
    let keyName = 'OpenAI API key';
    
    if (aiProvider === 'anthropic') {
      requiredKey = anthropicApiKey;
      keyName = 'Anthropic API key';
    }
    
    if (!requiredKey) {
      DebugUtils.error("Background", `Missing ${keyName}`);
      await executeScript(tab.id, () => alert(`Please set your ${keyName} in the extension options.`));
      return;
    }

    if (info.menuItemId === 'factCheckPage') {
      await handlePageCheck(tab, openaiApiKey, braveApiKey, anthropicApiKey, aiProvider);
    } else {
      await handleSelectionCheck(info.selectionText, tab, openaiApiKey, braveApiKey, anthropicApiKey, aiProvider);
    }
  } catch (error) {
    DebugUtils.error("Background", "Context menu handler error:", error);
    await handleError(tab.id, 'Error processing request.');
  }
});

// Handle checking an entire page
async function handlePageCheck(tab, openaiApiKey, braveApiKey, anthropicApiKey, aiProvider) {
  DebugUtils.log("Background", `Starting page check for tab ${tab.id}: ${tab.url}`);
  try {
    // Ensure content script is loaded (now includes delay)
    await ensureContentScriptLoaded(tab.id);
    
    DebugUtils.log("Background", "Requesting article text from content script");
    const response = await getArticleTextFromTab(tab.id);
    DebugUtils.log("Background", "Article text response received:", response ? "yes" : "no");
    
    if (response && response.articleText) {
      await processFactCheck(response.articleText, openaiApiKey, braveApiKey, anthropicApiKey, aiProvider, tab);
    } else {
      DebugUtils.error("Background", "No article text extracted");
      await executeScript(tab.id, () => alert('Could not extract article text.'));
    }
  } catch (error) {
    DebugUtils.error("Background", "Error getting article text:", error);
    await executeScript(tab.id, () => alert('Error extracting text from page.'));
  }
}

// Handle checking selected text
async function handleSelectionCheck(text, tab, openaiApiKey, braveApiKey, anthropicApiKey, aiProvider) {
  DebugUtils.log("Background", `Starting selection check with ${text.length} characters of text`);
  await processFactCheck(text, openaiApiKey, braveApiKey, anthropicApiKey, aiProvider, tab);
}

// Extension icon click handler
chrome.action.onClicked.addListener(async (tab) => {
  DebugUtils.log("Background", "Extension icon clicked");
  try {
    const { openaiApiKey, braveApiKey, anthropicApiKey, aiProvider } = 
      await StorageUtils.get(['openaiApiKey', 'braveApiKey', 'anthropicApiKey', 'aiProvider']);
    
    // Determine which API key to check based on provider
    let requiredKey = openaiApiKey;
    let keyName = 'OpenAI API key';
    
    if (aiProvider === 'anthropic') {
      requiredKey = anthropicApiKey;
      keyName = 'Anthropic API key';
    }
    
    DebugUtils.log("Background", "API keys present:", 
                  !!openaiApiKey, !!braveApiKey, !!anthropicApiKey);
    DebugUtils.log("Background", "AI provider:", aiProvider);
    
    if (!requiredKey) {
      DebugUtils.error("Background", `Missing ${keyName}`);
      await executeScript(tab.id, () => alert(`Please set your ${keyName} in the extension options.`));
      return;
    }

    // Ensure content script is loaded first (now includes delay)
    await ensureContentScriptLoaded(tab.id);

    // Try to get selected text
    const [{ result: selectedText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => window.getSelection().toString()
    });

    DebugUtils.log("Background", "Selected text:", selectedText ? "found" : "none");
    if (selectedText && selectedText.trim().length > 0) {
      await processFactCheck(selectedText, openaiApiKey, braveApiKey, anthropicApiKey, aiProvider, tab);
    } else {
      await handlePageCheck(tab, openaiApiKey, braveApiKey, anthropicApiKey, aiProvider);
    }
  } catch (error) {
    DebugUtils.error("Background", "Error handling extension click:", error);
  }
});

// Main fact-check processing function
async function processFactCheck(text, openaiApiKey, braveApiKey, anthropicApiKey, aiProvider, tab) {
  DebugUtils.log("Background", "Starting fact check process with text length:", text.length);
  DebugUtils.log("Background", "Using AI provider:", aiProvider);
  
  // Ensure content script is loaded before showing overlay (now includes delay)
  const contentInjected = await ensureContentScriptLoaded(tab.id);
  DebugUtils.log("Background", "Content script loaded status:", contentInjected);
  
  // Show loading overlay
  const overlayShown = await showOverlayWithRetry(tab.id);
  DebugUtils.log("Background", "Overlay shown:", overlayShown);
  
  try {
    // Get settings
    const settings = await StorageUtils.get([
      'aiProvider',
      'aiModel', 
      'useMultiModel', 
      'maxTokens', 
      'enableCaching', 
      'rateLimit'
    ]);
    
    DebugUtils.log("Background", "Settings retrieved");
    
    // Create the appropriate AI service based on the provider setting
    let aiService;
    if (settings.aiProvider === 'anthropic' && anthropicApiKey) {
      DebugUtils.log("Background", "Creating Anthropic service");
      aiService = new AnthropicService(anthropicApiKey);
    } else {
      DebugUtils.log("Background", "Creating OpenAI service");
      aiService = new OpenAIService(openaiApiKey);
    }
    
    // Create fact checker service with AI service and settings
    DebugUtils.log("Background", "Creating fact checker with AI service and Brave API available:", 
                  !!aiService, !!braveApiKey);
    
    const factChecker = new FactCheckerService(aiService, braveApiKey, settings);
    
    // Get article metadata if available
    let sourceMetadata = {};
    try {
      DebugUtils.log("Background", "Attempting to get article metadata");
      const response = await getArticleTextFromTab(tab.id);
      if (response && response.metadata) {
        sourceMetadata = response.metadata;
        DebugUtils.log("Background", "Article metadata received");
      }
    } catch (error) {
      DebugUtils.error("Background", "Error getting article metadata:", error);
    }
    
    // Perform fact check
    DebugUtils.log("Background", "Starting fact check analysis");
    const factCheckResponse = await factChecker.check(text);

    // Destructure all values, making sure to extract the rating
    const { result, queryText, rating } = factCheckResponse;

    DebugUtils.log("Background", "Fact check completed", {
      queryTextLength: queryText.length,
      resultLength: result.length,
      rating: rating
    });
    
    // Update overlay with results
    DebugUtils.log("Background", "Updating overlay with results");
    await updateOverlayWithRetry(tab.id, result, sourceMetadata);
    
    // Create analytics data with additional details for Supabase
    const analyticsData = {
      textLength: text.length,
      queryLength: queryText.length,
      domain: tab.url ? new URL(tab.url).hostname : 'unknown',
      model: settings.aiModel || 'unknown',
      searchUsed: !!braveApiKey,
      rating: rating // This should now be correctly included
    };
    
    // Check if domain is in trusted sources
    if (tab.url) {
      const hostname = new URL(tab.url).hostname;
      const isCredible = DOMAINS.CREDIBLE.some(domain => hostname.includes(domain));
      const isFactChecker = DOMAINS.FACT_CHECK.some(domain => hostname.includes(domain));
      
      // Add source credibility info to analytics
      analyticsData.isCredibleSource = isCredible;
      analyticsData.isFactCheckSource = isFactChecker;
    }
    
    // Record analytics (enhanced with more details)
    AnalyticsService.recordFactCheck(text, queryText, analyticsData);
    DebugUtils.log("Background", "Analytics recorded with rating:", rating);
  } catch (error) {
    DebugUtils.error("Background", "Error in processFactCheck:", error);
    await updateOverlayWithRetry(tab.id, 'Error: An unexpected error occurred during fact-checking. Please try again.', {});
  }
}

// Helper function to show overlay with retry
async function showOverlayWithRetry(tabId, maxRetries = REQUEST.RETRY.MAX_ATTEMPTS) {
  DebugUtils.log("Background", `Attempting to show overlay in tab ${tabId}`);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sendMessageToTab(tabId, { action: 'createOverlay' });
      DebugUtils.log("Background", "Overlay creation message sent successfully");
      return true;
    } catch (error) {
      DebugUtils.log("Background", `Attempt ${attempt+1} to show overlay failed`);
      if (attempt < maxRetries - 1) {
        // Wait before retry with exponential backoff
        const backoffTime = Math.min(
          REQUEST.BACKOFF.BRAVE.INITIAL * Math.pow(REQUEST.BACKOFF.BRAVE.FACTOR, attempt),
          REQUEST.BACKOFF.BRAVE.MAX
        );
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }
  DebugUtils.error("Background", "Could not create overlay after multiple attempts");
  return false;
}

// Helper function to update overlay with retry
async function updateOverlayWithRetry(tabId, result, metadata, maxRetries = REQUEST.RETRY.MAX_ATTEMPTS) {
  DebugUtils.log("Background", `Attempting to update overlay in tab ${tabId}`);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sendMessageToTab(tabId, { 
        action: 'updateOverlay', 
        result: result,
        metadata: metadata
      });
      DebugUtils.log("Background", "Overlay update message sent successfully");
      return true;
    } catch (error) {
      DebugUtils.log("Background", `Attempt ${attempt+1} to update overlay failed`);
      if (attempt < maxRetries - 1) {
        // Exponential backoff using constants
        const backoffTime = Math.min(
          REQUEST.BACKOFF.BRAVE.INITIAL * Math.pow(REQUEST.BACKOFF.BRAVE.FACTOR, attempt),
          REQUEST.BACKOFF.BRAVE.MAX
        );
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }
  DebugUtils.error("Background", `Failed to update overlay after ${maxRetries} attempts`);
  return false;
}

// Promise-based wrapper for sending messages to tabs
function sendMessageToTab(tabId, message) {
  DebugUtils.log("Background", `Sending message to tab ${tabId}:`, message.action);
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          DebugUtils.error("Background", "Error sending message:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          DebugUtils.log("Background", `Message ${message.action} sent successfully`);
          resolve(response);
        }
      });
    } catch (error) {
      DebugUtils.error("Background", "Exception sending message:", error);
      reject(error);
    }
  });
}

// Promise-based wrapper for chrome.tabs.sendMessage with retry logic
function getArticleTextFromTab(tabId, maxRetries = 3) {
  DebugUtils.log("Background", `Requesting article text from tab ${tabId} with ${maxRetries} retries`);
  
  return new Promise(async (resolve, reject) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // First, ensure content script is definitely loaded
        const contentScriptLoaded = await ensureContentScriptLoaded(tabId);
        if (!contentScriptLoaded) {
          DebugUtils.log("Background", `Could not ensure content script is loaded on attempt ${attempt+1}`);
          // Continue to try sending message anyway - sometimes this works
        }
        
        // Send the message with a timeout
        const response = await sendMessageWithTimeout(
          tabId, 
          { action: 'getArticleText' },
          5000 // 5 second timeout
        );
        
        if (response) {
          DebugUtils.log("Background", "Article text received", {
            hasText: !!response.articleText,
            textLength: response.articleText?.length,
            hasMetadata: !!response.metadata
          });
          
          // If we got a response but no text, try a fallback
          if (!response.articleText || response.articleText.length < 50) {
            DebugUtils.log("Background", "Got response but insufficient text, trying fallback extraction");
            const fallbackText = await extractTextWithFallback(tabId);
            if (fallbackText && fallbackText.length > 100) {
              DebugUtils.log("Background", "Fallback extraction successful");
              return resolve({ 
                articleText: fallbackText,
                metadata: response.metadata || {}
              });
            }
          }
          
          return resolve(response);
        }
        
        // If we reach here, no response was received
        DebugUtils.log("Background", `No response on attempt ${attempt+1}, retrying...`);
        
        // Wait before retry
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => 
            setTimeout(resolve, Math.min(1000 * Math.pow(1.5, attempt), 5000))
          );
        }
      } catch (error) {
        DebugUtils.log("Background", `Error on attempt ${attempt+1}: ${error.message}`);
        
        if (attempt === maxRetries - 1) {
          // Last attempt failed
          DebugUtils.error("Background", "All attempts to get article text failed");
          
          // Try fallback method as last resort
          try {
            DebugUtils.log("Background", "Trying fallback text extraction as last resort");
            const fallbackText = await extractTextWithFallback(tabId);
            if (fallbackText && fallbackText.length > 100) {
              DebugUtils.log("Background", "Fallback extraction successful");
              return resolve({ 
                articleText: fallbackText,
                metadata: { title: "Extracted content", source: "Fallback extraction" } 
              });
            }
          } catch (fallbackError) {
            DebugUtils.log("Background", "Fallback extraction also failed");
          }
          
          reject(error);
        }
        
        // Wait before retry
        await new Promise(resolve => 
          setTimeout(resolve, Math.min(1000 * Math.pow(1.5, attempt), 5000))
        );
      }
    }
    
    reject(new Error("Failed to get article text after multiple attempts"));
  });
}

// Helper function to send a message with timeout
function sendMessageWithTimeout(tabId, message, timeout) {
  return new Promise((resolve, reject) => {
    let timeoutId;
    
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
      
      timeoutId = setTimeout(() => {
        reject(new Error(`Message ${message.action} timed out after ${timeout}ms`));
      }, timeout);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

// Fallback extraction method using executeScript directly
async function extractTextWithFallback(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Get all paragraph and heading text
        const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, article');
        let text = '';
        
        // First prioritize article elements
        const articles = document.querySelectorAll('article');
        if (articles.length > 0) {
          articles.forEach(article => {
            text += article.innerText + '\n\n';
          });
          
          // If we got substantial text from articles, return it
          if (text.length > 500) {
            return text;
          }
        }
        
        // Otherwise gather text from all paragraphs and headings
        elements.forEach(element => {
          // Skip tiny or empty paragraphs
          if (element.innerText.trim().length > 20) {
            text += element.innerText + '\n\n';
          }
        });
        
        // If still no good content, just use body text
        if (text.length < 200) {
          text = document.body.innerText;
        }
        
        return text;
      }
    });
    
    return result?.result || '';
  } catch (error) {
    DebugUtils.error("Background", "Fallback extraction failed:", error);
    return '';
  }
}

// Execute script in tab with error handling
function executeScript(tabId, func) {
  DebugUtils.log("Background", `Executing script in tab ${tabId}`);
  return new Promise((resolve, reject) => {
    try {
      chrome.scripting.executeScript({
        target: { tabId },
        function: func
      }, (results) => {
        if (chrome.runtime.lastError) {
          DebugUtils.error("Background", "Error executing script:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          DebugUtils.log("Background", "Script executed successfully");
          resolve(results);
        }
      });
    } catch (error) {
      DebugUtils.error("Background", "Exception executing script:", error);
      reject(error);
    }
  });
}

// Handle errors by showing an alert in the tab
async function handleError(tabId, message) {
  DebugUtils.error("Background", `Handling error in tab ${tabId}: ${message}`);
  try {
    await executeScript(tabId, (msg) => alert(msg), [message]);
  } catch (error) {
    DebugUtils.error("Background", "Error showing error message:", error);
  }
}

/**
 * Sync pending analytics to Supabase
 * Processes batches to optimize performance and reduce API calls
 */
async function syncPendingAnalytics() {
  // Prevent concurrent syncs
  if (isSyncing) {
    DebugUtils.log("Background", 'Analytics sync already in progress, skipping');
    return;
  }
  
  try {
    isSyncing = true;
    DebugUtils.log("Background", 'Starting Supabase analytics sync');
    
    // Check if analytics sharing is enabled
    const { shareAnalytics } = await StorageUtils.get(['shareAnalytics']);
    
    if (shareAnalytics === false) {
      DebugUtils.log("Background", 'Analytics sharing disabled, skipping sync');
      return;
    }
    
    // Get pending analytics - Fix: Don't reference it before declaration
    const result = await StorageUtils.get(['pendingAnalytics']);
    const pendingAnalytics = result.pendingAnalytics || [];
    
    // Now we can log it safely
    DebugUtils.log("Background", `Found ${pendingAnalytics.length} pending analytics to sync`);
    
    if (!pendingAnalytics || pendingAnalytics.length === 0) {
      DebugUtils.log("Background", 'No pending analytics to sync');
      return;
    }
    
    // If too few records and not enough time has passed, wait for more
    const now = Date.now();
    if (pendingAnalytics.length < MIN_BATCH_THRESHOLD && 
        (now - lastSyncTime < SYNC_INTERVAL * 2) && 
        lastSyncTime !== 0) {
      DebugUtils.log("Background", `Only ${pendingAnalytics.length} records pending, waiting for more before syncing`);
      return;
    }
    
    // Initialize Supabase client if needed - With better error handling
    if (!supabaseClient) {
      DebugUtils.error("Background", "Supabase client is null! Creating a new instance...");
      supabaseClient = new SupabaseClient(
        SUPABASE_CONFIG.PROJECT_URL,
        SUPABASE_CONFIG.ANON_KEY
      );
    }
    
    if (!supabaseClient.initialized) {
      DebugUtils.log("Background", "Supabase client not initialized, initializing now");
      try {
        await supabaseClient.initialize();
        DebugUtils.log("Background", "Supabase client initialized successfully during sync");
      } catch (initError) {
        DebugUtils.error("Background", "Failed to initialize Supabase client during sync:", initError);
        // We'll attempt to proceed anyway - the supabaseClient methods have their own error handling
      }
    }
    
    // Additional check for client and session ID
    if (!supabaseClient.clientId || !supabaseClient.sessionId) {
      DebugUtils.warn("Background", "Missing clientId or sessionId in Supabase client");
      try {
        // Try to generate these if missing
        if (!supabaseClient.clientId) {
          await supabaseClient.getOrCreateClientId();
        }
        if (!supabaseClient.sessionId) {
          supabaseClient.sessionId = supabaseClient.generateSessionId();
        }
      } catch (idError) {
        DebugUtils.error("Background", "Error generating client/session IDs:", idError);
      }
    }
    
    // Create batches of records
    const batches = [];
    for (let i = 0; i < pendingAnalytics.length; i += BATCH_SIZE) {
      batches.push(pendingAnalytics.slice(i, i + BATCH_SIZE));
    }
    
    DebugUtils.log("Background", `Created ${batches.length} batches for syncing`);
    
    // Process each batch
    let successCount = 0;
    const failedRecords = [];
    
    for (const [batchIndex, batch] of batches.entries()) {
      try {
        DebugUtils.log("Background", `Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} records)`);
        
        // Format data for Supabase
        const formattedBatch = batch.map(item => ({
          domain: item.domain || 'unknown',
          text_length: item.textLength || 0,
          model_used: item.model || 'unknown',
          rating: item.rating || null,
          search_used: item.searchUsed || false,
          is_credible_source: item.isCredibleSource || false,
          is_fact_check_source: item.isFactCheckSource || false,
          client_id: supabaseClient.clientId || 'unknown-client',
          session_id: supabaseClient.sessionId || 'unknown-session',
          timestamp: new Date(item.timestamp).toISOString()
        }));
        
        DebugUtils.log("Background", `Sending batch ${batchIndex + 1} to Supabase with ${formattedBatch.length} records`);
        
        // Send the batch to Supabase
        const result = await supabaseClient.trackFactCheckBatch(formattedBatch);
        
        if (result && result.success) {
          successCount += batch.length;
          DebugUtils.log("Background", `Successfully synced batch ${batchIndex + 1}, total success: ${successCount}`);
        } else {
          DebugUtils.error("Background", `Failed to sync batch ${batchIndex + 1}:`, result?.error || 'Unknown error');
          // Mark these records for retry
          failedRecords.push(...batch);
        }
      } catch (error) {
        DebugUtils.error("Background", `Error processing batch ${batchIndex + 1}:`, error);
        // Mark these records for retry
        failedRecords.push(...batch);
      }
    }
    
    // Update storage to remove successfully synced records
    if (successCount > 0 || failedRecords.length > 0) {
      // If we have records to retry, keep them in pending
      const updatedPending = failedRecords.length > 0 ? failedRecords : [];
      
      await StorageUtils.set({ 
        pendingAnalytics: updatedPending,
        lastSyncTime: Date.now(),
        lastSyncResult: {
          success: successCount > 0,
          processed: pendingAnalytics.length,
          successful: successCount,
          failed: failedRecords.length,
          timestamp: Date.now()
        }
      });
      
      // Reset error count on success
      if (successCount > 0 && failedRecords.length === 0) {
        syncErrorCount = 0;
      } else if (failedRecords.length > 0) {
        syncErrorCount++;
      }
      
      DebugUtils.log("Background", `Sync completed. ${successCount} records synced successfully, ${failedRecords.length} failed.`);
      console.log(`Supabase sync completed: ${successCount} records synced, ${failedRecords.length} failed`);
    }
    
    // Update last sync time
    lastSyncTime = Date.now();
  } catch (error) {
    DebugUtils.error("Background", 'Error syncing analytics:', error);
    syncErrorCount++;
  } finally {
    isSyncing = false;
    
    // If we've had too many errors, slow down sync attempts
    if (syncErrorCount > MAX_RETRY_ATTEMPTS) {
      DebugUtils.warn("Background", `Too many sync errors (${syncErrorCount}), extending sync interval`);
      // We'll rely on the regular interval, but could implement backoff here
    }
  }
}

/**
 * Force immediate sync of pending analytics regardless of threshold
 * @returns {Promise<object>} Result of sync operation
 */
async function forceSyncNow() {
  DebugUtils.log("Background", "Force sync requested via extension UI");
  
  // Ensure we're not already syncing
  if (isSyncing) {
    DebugUtils.log("Background", "Already syncing, waiting for completion");
    // Wait for current sync to complete (up to 10 seconds)
    for (let i = 0; i < 10; i++) {
      if (!isSyncing) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    if (isSyncing) {
      return { success: false, error: "Sync already in progress and didn't complete in time" };
    }
  }
  
  try {
    // Skip all thresholds and force an immediate sync
    const { pendingAnalytics = [] } = await StorageUtils.get(['pendingAnalytics']);
    
    if (pendingAnalytics.length === 0) {
      DebugUtils.log("Background", "No pending analytics to sync");
      return { success: true, message: "No pending analytics to sync" };
    }
    
    DebugUtils.log("Background", `Force syncing ${pendingAnalytics.length} pending analytics`);
    
    // Call the sync function directly
    await syncPendingAnalytics();
    
    return { success: true, message: `Forced sync completed for ${pendingAnalytics.length} records` };
  } catch (error) {
    DebugUtils.error("Background", "Force sync error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle tracking a fact check
 * @param {Object} data The fact check data
 * @param {Function} sendResponse Callback function
 */
async function handleTrackFactCheck(data, sendResponse) {
  try {
    DebugUtils.log("Background", 'handleTrackFactCheck called with data:', {
      textLength: data.textLength,
      domain: data.domain,
      model: data.model
    });
    
    // Get current pending analytics to check if we already have some
    const storageBefore = await StorageUtils.get(['pendingAnalytics']);
    DebugUtils.log("Background", `Current pendingAnalytics count: ${(storageBefore.pendingAnalytics || []).length}`);
    
    // Add to pending analytics for batch processing
    const pendingAnalytics = storageBefore.pendingAnalytics || [];
    const newAnalyticsItem = {
      timestamp: Date.now(),
      textLength: data.textLength || 0,
      queryLength: data.queryLength || 0,
      domain: data.domain || 'unknown',
      model: data.model || 'unknown', 
      rating: data.rating || null,
      searchUsed: data.searchUsed || false,
      isCredibleSource: data.isCredibleSource || false,
      isFactCheckSource: data.isFactCheckSource || false
    };
    
    pendingAnalytics.push(newAnalyticsItem);
    DebugUtils.log("Background", `Added new item to pendingAnalytics, new count: ${pendingAnalytics.length}`);
    
    // Store the updated list
    await StorageUtils.set({ pendingAnalytics });
    DebugUtils.log("Background", 'pendingAnalytics saved to storage');
    
    // Verify that it was actually saved
    const storageAfter = await StorageUtils.get(['pendingAnalytics']);
    DebugUtils.log("Background", `Verification - pendingAnalytics count after save: ${(storageAfter.pendingAnalytics || []).length}`);
    
    // If we have enough pending records, trigger a sync
    if (pendingAnalytics.length >= MIN_BATCH_THRESHOLD && !isSyncing) {
      DebugUtils.log("Background", `Reached batch threshold (${pendingAnalytics.length} records), triggering sync`);
      try {
        syncPendingAnalytics();
      } catch (error) {
        DebugUtils.error("Background", 'Error triggering sync:', error);
      }
    } else {
      DebugUtils.log("Background", `Not triggering sync yet - ${pendingAnalytics.length}/${MIN_BATCH_THRESHOLD} records needed and isSyncing=${isSyncing}`);
    }
    
    sendResponse({ success: true });
  } catch (error) {
    DebugUtils.error("Background", 'Error handling track fact check:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle tracking feedback
 * @param {Object} data The feedback data
 * @param {Function} sendResponse Callback function
 */
async function handleTrackFeedback(data, sendResponse) {
  try {
    // Add to pending feedback for batch processing
    const { pendingFeedback = [] } = await StorageUtils.get(['pendingFeedback']);
    pendingFeedback.push({
      timestamp: Date.now(),
      analyticsId: data.analyticsId,
      rating: data.rating,
      domain: data.domain || 'unknown'
    });
    
    await StorageUtils.set({ pendingFeedback });
    sendResponse({ success: true });
  } catch (error) {
    DebugUtils.error("Background", 'Error handling track feedback:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Make the sync function available globally for direct testing
// Don't use window in service worker context - use self instead
self.syncPendingAnalytics = syncPendingAnalytics;

// Listen for messages from content scripts and options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    DebugUtils.error("Background", "Received invalid message:", message);
    sendResponse({ error: "Invalid message format" });
    return true;
  }
  
  DebugUtils.log("Background", "Message received:", message.action || "no action specified");
  
  // Add new handler for debug settings
  if (message.action === 'setDebugEnabled') {
    DebugUtils.setDebugEnabled(message.enabled);
    DebugUtils.log("Background", `Debug mode ${message.enabled ? 'enabled' : 'disabled'}`);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'testAnthropicKey') {
    (async () => {
      try {
        const response = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': message.apiKey,
            'anthropic-version': '2023-06-01'
          }
        });
        
        if (response.ok) {
          sendResponse({ success: true });
        } else {
          const data = await response.json();
          sendResponse({ 
            success: false, 
            error: data.error?.message || `API error: ${response.status}`
          });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open
  }

  // Add new handler for injecting Readability
  if (message.action === 'injectReadability') {
    // Do the injection using executeScript
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['libs/readability.js']
    }).then(() => {
      DebugUtils.log("Background", "Readability library injected successfully");
      sendResponse({ success: true });
    }).catch(error => {
      DebugUtils.error("Background", "Error injecting Readability:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep the message channel open for async response
  }

  // Handle different message types
  switch (message.action) {
    case "recordFeedback":
      try {
        AnalyticsService.recordFeedback(message.rating, sender.tab);
        DebugUtils.log("Background", "Feedback recorded:", message.rating);
        sendResponse({ success: true });
      } catch (error) {
        DebugUtils.error("Background", "Error recording feedback:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true;

    case 'trackFactCheck':
      handleTrackFactCheck(message.data, sendResponse);
      return true; // Keep the messaging channel open for async response
    
    case 'syncAnalytics':
      // Trigger a manual sync
      try {
        syncPendingAnalytics()
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
      } catch (error) {
        DebugUtils.error("Background", "Error triggering manual sync:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Keep the messaging channel open for async response

    case 'forceSyncNow':
      forceSyncNow()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep the messaging channel open for async response
    
    case 'getSyncStatus':
      // Return current sync status
      try {
        StorageUtils.get(['pendingAnalytics'])
          .then(data => {
            sendResponse({
              isSyncing: isSyncing,
              lastSyncTime: lastSyncTime,
              pendingCount: (data.pendingAnalytics || []).length,
              errorCount: syncErrorCount
            });
          })
          .catch(error => {
            sendResponse({ 
              isSyncing: isSyncing, 
              lastSyncTime: lastSyncTime,
              pendingCount: 0,
              errorCount: syncErrorCount,
              error: error.message
            });
          });
      } catch (error) {
        sendResponse({ 
          isSyncing: isSyncing, 
          error: error.message 
        });
      }
      return true;
  
    case 'trackFeedback':
      handleTrackFeedback(message.data, sendResponse);
      return true; // Keep the messaging channel open for async response
    
    default:
      DebugUtils.log('Background', 'Unknown message action:', message.action);
      sendResponse({ error: "Unhandled message type" });
      return true;
  }
});