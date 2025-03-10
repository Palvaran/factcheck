// background.js - Main coordinator that delegates to service modules
import { StorageUtils } from './utils/storage.js';
import { FactCheckerService } from './services/factChecker.js';
import { AnalyticsService } from './services/analytics.js';
import { OpenAIService } from './api/openai.js';
import { BraveSearchService } from './api/brave.js';
import { SupabaseClient } from './options/modules/supabase-client.js';
import { SUPABASE_CONFIG } from './utils/supabase-config.js';
import { API, REQUEST, CONTENT, CACHE, STYLES, DOMAINS } from './utils/constants.js';

// Global debug flag - set to false for production
const DEBUG = true;

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

// Debug logging helper
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

// Setup context menus on install
chrome.runtime.onInstalled.addListener(() => {
  debugLog("Extension installed, setting up context menus");
  setupContextMenus();
  initializeDefaultSettings();
  initializeSupabase();
});

// Initialize Supabase client
async function initializeSupabase() {
  try {
    debugLog("Initializing Supabase client");
    // Create Supabase client
    supabaseClient = new SupabaseClient(
      SUPABASE_CONFIG.PROJECT_URL,
      SUPABASE_CONFIG.ANON_KEY
    );
    
    // Explicitly initialize the client to set initialized=true
    try {
      await supabaseClient.initialize();
      debugLog("Supabase client initialized successfully");
    } catch (initError) {
      console.error("Error during initial Supabase initialization:", initError);
      // We'll continue setting up sync even if there's an error
      // The sync function will retry initialization later
    }
    
    // Set up sync interval
    setInterval(() => {
      try {
        syncPendingAnalytics();
      } catch (error) {
        console.error('Periodic sync error:', error);
      }
    }, SYNC_INTERVAL);
    
    // Do an initial sync after startup with a short delay
    setTimeout(() => {
      try {
        syncPendingAnalytics();
      } catch (error) {
        console.error('Initial sync error:', error);
      }
    }, 5000);
    
    debugLog("Supabase client and sync schedule initialized");
  } catch (error) {
    console.error("Error initializing Supabase:", error);
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
      'braveApiKey',
      'shareAnalytics'
    ]);
    
    debugLog("Current settings loaded:", {
      aiModel: settings.aiModel,
      useMultiModel: settings.useMultiModel,
      maxTokens: settings.maxTokens,
      enableCaching: settings.enableCaching,
      rateLimit: settings.rateLimit,
      hasOpenAIKey: !!settings.openaiApiKey,
      hasBraveKey: !!settings.braveApiKey,
      shareAnalytics: settings.shareAnalytics !== false
    });
    
    // If settings don't exist, set defaults
    if (!settings.aiModel) {
      debugLog("Setting default settings");
      await StorageUtils.set({
        aiModel: 'gpt-4o-mini',
        useMultiModel: false,
        maxTokens: CONTENT.MAX_TOKENS.DEFAULT,
        enableCaching: true,
        rateLimit: REQUEST.RATE_LIMITS.DEFAULT,
        shareAnalytics: true
      });
    }
  } catch (error) {
    console.error("Error initializing settings:", error);
  }
}

// Ensure content script is loaded with better retry mechanism
async function ensureContentScriptLoaded(tabId, maxRetries = 3) {
  debugLog(`Ensuring content script is loaded in tab ${tabId} with ${maxRetries} retries`);
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Inject the content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      
      debugLog(`Content script injection attempt ${attempt+1} completed`);
      
      // Add a longer delay for complex pages (500ms instead of 250ms)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify the content script is actually responding
      const isResponding = await isContentScriptResponding(tabId);
      if (isResponding) {
        debugLog("Content script is responding properly");
        return true;
      }
      
      debugLog(`Content script not yet responding on attempt ${attempt+1}, waiting...`);
      
      // Exponential backoff before retry
      await new Promise(resolve => 
        setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 5000))
      );
    } catch (error) {
      // This might fail if script is already injected, which is okay
      debugLog(`Script injection attempt ${attempt+1} error (might be already loaded): ${error.message}`);
      
      // Even if injection failed, check if content script is responding
      const isResponding = await isContentScriptResponding(tabId);
      if (isResponding) {
        debugLog("Content script is already loaded and responding");
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
  
  debugLog("Failed to ensure content script is loaded after multiple attempts");
  return false;
}

// Helper function to check if content script is responding
async function isContentScriptResponding(tabId) {
  try {
    // Send a simple ping message to the content script
    const response = await sendMessageToTab(tabId, { action: 'ping' });
    return response && response.pong === true;
  } catch (error) {
    debugLog(`Content script ping failed: ${error.message}`);
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
    const factCheckResponse = await factChecker.check(text);

    // Destructure all values, making sure to extract the rating
    const { result, queryText, rating } = factCheckResponse;

    debugLog("Fact check completed", {
      queryTextLength: queryText.length,
      resultLength: result.length,
      rating: rating
    });
    
    // Update overlay with results
    debugLog("Updating overlay with results");
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
    debugLog("Analytics recorded with rating:", rating);
  } catch (error) {
    console.error("Error in processFactCheck:", error);
    await updateOverlayWithRetry(tab.id, 'Error: An unexpected error occurred during fact-checking. Please try again.', {});
  }
}

// Helper function to show overlay with retry
async function showOverlayWithRetry(tabId, maxRetries = REQUEST.RETRY.MAX_ATTEMPTS) {
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
        const backoffTime = Math.min(
          REQUEST.BACKOFF.BRAVE.INITIAL * Math.pow(REQUEST.BACKOFF.BRAVE.FACTOR, attempt),
          REQUEST.BACKOFF.BRAVE.MAX
        );
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }
  console.error("Could not create overlay after multiple attempts");
  return false;
}

// Helper function to update overlay with retry
async function updateOverlayWithRetry(tabId, result, metadata, maxRetries = REQUEST.RETRY.MAX_ATTEMPTS) {
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
        // Exponential backoff using constants
        const backoffTime = Math.min(
          REQUEST.BACKOFF.BRAVE.INITIAL * Math.pow(REQUEST.BACKOFF.BRAVE.FACTOR, attempt),
          REQUEST.BACKOFF.BRAVE.MAX
        );
        await new Promise(resolve => setTimeout(resolve, backoffTime));
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

// Promise-based wrapper for chrome.tabs.sendMessage with retry logic
function getArticleTextFromTab(tabId, maxRetries = 3) {
  debugLog(`Requesting article text from tab ${tabId} with ${maxRetries} retries`);
  
  return new Promise(async (resolve, reject) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // First, ensure content script is definitely loaded
        const contentScriptLoaded = await ensureContentScriptLoaded(tabId);
        if (!contentScriptLoaded) {
          debugLog(`Could not ensure content script is loaded on attempt ${attempt+1}`);
          // Continue to try sending message anyway - sometimes this works
        }
        
        // Send the message with a timeout
        const response = await sendMessageWithTimeout(
          tabId, 
          { action: 'getArticleText' },
          5000 // 5 second timeout
        );
        
        if (response) {
          debugLog("Article text received", {
            hasText: !!response.articleText,
            textLength: response.articleText?.length,
            hasMetadata: !!response.metadata
          });
          
          // If we got a response but no text, try a fallback
          if (!response.articleText || response.articleText.length < 50) {
            debugLog("Got response but insufficient text, trying fallback extraction");
            const fallbackText = await extractTextWithFallback(tabId);
            if (fallbackText && fallbackText.length > 100) {
              debugLog("Fallback extraction successful");
              return resolve({ 
                articleText: fallbackText,
                metadata: response.metadata || {}
              });
            }
          }
          
          return resolve(response);
        }
        
        // If we reach here, no response was received
        debugLog(`No response on attempt ${attempt+1}, retrying...`);
        
        // Wait before retry
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => 
            setTimeout(resolve, Math.min(1000 * Math.pow(1.5, attempt), 5000))
          );
        }
      } catch (error) {
        debugLog(`Error on attempt ${attempt+1}: ${error.message}`);
        
        if (attempt === maxRetries - 1) {
          // Last attempt failed
          console.error("All attempts to get article text failed");
          
          // Try fallback method as last resort
          try {
            debugLog("Trying fallback text extraction as last resort");
            const fallbackText = await extractTextWithFallback(tabId);
            if (fallbackText && fallbackText.length > 100) {
              debugLog("Fallback extraction successful");
              return resolve({ 
                articleText: fallbackText,
                metadata: { title: "Extracted content", source: "Fallback extraction" } 
              });
            }
          } catch (fallbackError) {
            debugLog("Fallback extraction also failed");
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
    console.error("Fallback extraction failed:", error);
    return '';
  }
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

/**
 * Sync pending analytics to Supabase
 * Processes batches to optimize performance and reduce API calls
 */
async function syncPendingAnalytics() {
  // Prevent concurrent syncs
  if (isSyncing) {
    debugLog('Analytics sync already in progress, skipping');
    return;
  }
  
  try {
    isSyncing = true;
    debugLog('Starting Supabase analytics sync');
    
    // Check if analytics sharing is enabled
    const { shareAnalytics } = await StorageUtils.get(['shareAnalytics']);
    
    if (shareAnalytics === false) {
      debugLog('Analytics sharing disabled, skipping sync');
      return;
    }
    
    // Get pending analytics - Fix: Don't reference it before declaration
    const result = await StorageUtils.get(['pendingAnalytics']);
    const pendingAnalytics = result.pendingAnalytics || [];
    
    // Now we can log it safely
    debugLog(`Found ${pendingAnalytics.length} pending analytics to sync`);
    
    if (!pendingAnalytics || pendingAnalytics.length === 0) {
      debugLog('No pending analytics to sync');
      return;
    }
    
    // If too few records and not enough time has passed, wait for more
    const now = Date.now();
    if (pendingAnalytics.length < MIN_BATCH_THRESHOLD && 
        (now - lastSyncTime < SYNC_INTERVAL * 2) && 
        lastSyncTime !== 0) {
      debugLog(`Only ${pendingAnalytics.length} records pending, waiting for more before syncing`);
      return;
    }
    
    // Initialize Supabase client if needed - With better error handling
    if (!supabaseClient) {
      console.error("Supabase client is null! Creating a new instance...");
      supabaseClient = new SupabaseClient(
        SUPABASE_CONFIG.PROJECT_URL,
        SUPABASE_CONFIG.ANON_KEY
      );
    }
    
    if (!supabaseClient.initialized) {
      debugLog("Supabase client not initialized, initializing now");
      try {
        await supabaseClient.initialize();
        debugLog("Supabase client initialized successfully during sync");
      } catch (initError) {
        console.error("Failed to initialize Supabase client during sync:", initError);
        // We'll attempt to proceed anyway - the supabaseClient methods have their own error handling
      }
    }
    
    // Additional check for client and session ID
    if (!supabaseClient.clientId || !supabaseClient.sessionId) {
      console.warn("Missing clientId or sessionId in Supabase client");
      try {
        // Try to generate these if missing
        if (!supabaseClient.clientId) {
          await supabaseClient.getOrCreateClientId();
        }
        if (!supabaseClient.sessionId) {
          supabaseClient.sessionId = supabaseClient.generateSessionId();
        }
      } catch (idError) {
        console.error("Error generating client/session IDs:", idError);
      }
    }
    
    // Create batches of records
    const batches = [];
    for (let i = 0; i < pendingAnalytics.length; i += BATCH_SIZE) {
      batches.push(pendingAnalytics.slice(i, i + BATCH_SIZE));
    }
    
    debugLog(`Created ${batches.length} batches for syncing`);
    
    // Process each batch
    let successCount = 0;
    const failedRecords = [];
    
    for (const [batchIndex, batch] of batches.entries()) {
      try {
        debugLog(`Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} records)`);
        
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
        
        debugLog(`Sending batch ${batchIndex + 1} to Supabase with ${formattedBatch.length} records`);
        
        // Send the batch to Supabase
        const result = await supabaseClient.trackFactCheckBatch(formattedBatch);
        
        if (result && result.success) {
          successCount += batch.length;
          debugLog(`Successfully synced batch ${batchIndex + 1}, total success: ${successCount}`);
        } else {
          console.error(`Failed to sync batch ${batchIndex + 1}:`, result?.error || 'Unknown error');
          // Mark these records for retry
          failedRecords.push(...batch);
        }
      } catch (error) {
        console.error(`Error processing batch ${batchIndex + 1}:`, error);
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
      
      debugLog(`Sync completed. ${successCount} records synced successfully, ${failedRecords.length} failed.`);
      console.log(`Supabase sync completed: ${successCount} records synced, ${failedRecords.length} failed`);
    }
    
    // Update last sync time
    lastSyncTime = Date.now();
  } catch (error) {
    console.error('Error syncing analytics:', error);
    syncErrorCount++;
  } finally {
    isSyncing = false;
    
    // If we've had too many errors, slow down sync attempts
    if (syncErrorCount > MAX_RETRY_ATTEMPTS) {
      console.warn(`Too many sync errors (${syncErrorCount}), extending sync interval`);
      // We'll rely on the regular interval, but could implement backoff here
    }
  }
}

/**
 * Force immediate sync of pending analytics regardless of threshold
 * @returns {Promise<object>} Result of sync operation
 */
async function forceSyncNow() {
  debugLog("Force sync requested via extension UI");
  
  // Ensure we're not already syncing
  if (isSyncing) {
    debugLog("Already syncing, waiting for completion");
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
      debugLog("No pending analytics to sync");
      return { success: true, message: "No pending analytics to sync" };
    }
    
    debugLog(`Force syncing ${pendingAnalytics.length} pending analytics`);
    
    // Call the sync function directly
    await syncPendingAnalytics();
    
    return { success: true, message: `Forced sync completed for ${pendingAnalytics.length} records` };
  } catch (error) {
    console.error("Force sync error:", error);
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
    debugLog('handleTrackFactCheck called with data:', {
      textLength: data.textLength,
      domain: data.domain,
      model: data.model
    });
    
    // Get current pending analytics to check if we already have some
    const storageBefore = await StorageUtils.get(['pendingAnalytics']);
    debugLog(`Current pendingAnalytics count: ${(storageBefore.pendingAnalytics || []).length}`);
    
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
    debugLog(`Added new item to pendingAnalytics, new count: ${pendingAnalytics.length}`);
    
    // Store the updated list
    await StorageUtils.set({ pendingAnalytics });
    debugLog('pendingAnalytics saved to storage');
    
    // Verify that it was actually saved
    const storageAfter = await StorageUtils.get(['pendingAnalytics']);
    debugLog(`Verification - pendingAnalytics count after save: ${(storageAfter.pendingAnalytics || []).length}`);
    
    // If we have enough pending records, trigger a sync
    if (pendingAnalytics.length >= MIN_BATCH_THRESHOLD && !isSyncing) {
      debugLog(`Reached batch threshold (${pendingAnalytics.length} records), triggering sync`);
      try {
        syncPendingAnalytics();
      } catch (error) {
        console.error('Error triggering sync:', error);
      }
    } else {
      debugLog(`Not triggering sync yet - ${pendingAnalytics.length}/${MIN_BATCH_THRESHOLD} records needed and isSyncing=${isSyncing}`);
    }
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error handling track fact check:', error);
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
    console.error('Error handling track feedback:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Make the sync function available globally for direct testing
// Don't use window in service worker context - use self instead
self.syncPendingAnalytics = syncPendingAnalytics;

// Listen for messages from content scripts and options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    console.error("Received invalid message:", message);
    sendResponse({ error: "Invalid message format" });
    return true;
  }
  
  debugLog("Message received in background:", message.action || "no action specified");
  
  // Add new handler for injecting Readability
  if (message.action === 'injectReadability') {
    // Do the injection using executeScript
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['libs/readability.js']
    }).then(() => {
      console.log("Readability library injected successfully");
      sendResponse({ success: true });
    }).catch(error => {
      console.error("Error injecting Readability:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep the message channel open for async response
  }

  // Handle different message types
  switch (message.action) {
    case "recordFeedback":
      try {
        AnalyticsService.recordFeedback(message.rating, sender.tab);
        debugLog("Feedback recorded:", message.rating);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error recording feedback:", error);
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
        console.error("Error triggering manual sync:", error);
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
      debugLog('Unknown message action:', message.action);
      sendResponse({ error: "Unhandled message type" });
      return true;
  }
});