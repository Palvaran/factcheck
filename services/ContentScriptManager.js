// services/ContentScriptManager.js - Content script interaction

import { DebugUtils } from '../utils/debug-utils.js';
import { REQUEST } from '../utils/constants.js';

/**
 * Manages interactions with content scripts
 */
export class ContentScriptManager {
  constructor() {
    // Maximum number of retries for various operations
    this.MAX_RETRIES = REQUEST.RETRY.MAX_ATTEMPTS;
  }

  /**
   * Ensure content script is loaded with retry mechanism
   * @param {number} tabId - Tab ID
   * @param {number} [maxRetries=3] - Maximum number of retries
   * @returns {Promise<boolean>} - True if content script is loaded
   */
  async ensureContentScriptLoaded(tabId, maxRetries = 3) {
    DebugUtils.log("ContentScriptManager", `Ensuring content script is loaded in tab ${tabId} with ${maxRetries} retries`);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Inject the content script
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        
        DebugUtils.log("ContentScriptManager", `Content script injection attempt ${attempt+1} completed`);
        
        // Add a longer delay for complex pages (500ms instead of 250ms)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify the content script is actually responding
        const isResponding = await this.isContentScriptResponding(tabId);
        if (isResponding) {
          DebugUtils.log("ContentScriptManager", "Content script is responding properly");
          return true;
        }
        
        DebugUtils.log("ContentScriptManager", `Content script not yet responding on attempt ${attempt+1}, waiting...`);
        
        // Exponential backoff before retry
        await new Promise(resolve => 
          setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 5000))
        );
      } catch (error) {
        // This might fail if script is already injected, which is okay
        DebugUtils.log("ContentScriptManager", `Script injection attempt ${attempt+1} error (might be already loaded): ${error.message}`);
        
        // Even if injection failed, check if content script is responding
        const isResponding = await this.isContentScriptResponding(tabId);
        if (isResponding) {
          DebugUtils.log("ContentScriptManager", "Content script is already loaded and responding");
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
    
    DebugUtils.log("ContentScriptManager", "Failed to ensure content script is loaded after multiple attempts");
    return false;
  }

  /**
   * Check if content script is responding
   * @param {number} tabId - Tab ID
   * @returns {Promise<boolean>} - True if content script is responding
   */
  async isContentScriptResponding(tabId) {
    try {
      // Send a simple ping message to the content script
      const response = await this.sendMessageToTab(tabId, { action: 'ping' });
      return response && response.pong === true;
    } catch (error) {
      DebugUtils.log("ContentScriptManager", `Content script ping failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Send message to tab with promise-based wrapper
   * @param {number} tabId - Tab ID
   * @param {Object} message - Message to send
   * @returns {Promise<any>} - Response from content script
   */
  sendMessageToTab(tabId, message) {
    DebugUtils.log("ContentScriptManager", `Sending message to tab ${tabId}:`, message.action);
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            DebugUtils.error("ContentScriptManager", "Error sending message:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            DebugUtils.log("ContentScriptManager", `Message ${message.action} sent successfully`);
            resolve(response);
          }
        });
      } catch (error) {
        DebugUtils.error("ContentScriptManager", "Exception sending message:", error);
        reject(error);
      }
    });
  }

  /**
   * Send message with timeout
   * @param {number} tabId - Tab ID
   * @param {Object} message - Message to send
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>} - Response from content script
   */
  sendMessageWithTimeout(tabId, message, timeout) {
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

  /**
   * Get article text from tab
   * @param {number} tabId - Tab ID
   * @param {number} [maxRetries=3] - Maximum number of retries
   * @returns {Promise<Object>} - Article text and metadata
   */
  getArticleTextFromTab(tabId, maxRetries = 3) {
    DebugUtils.log("ContentScriptManager", `Requesting article text from tab ${tabId} with ${maxRetries} retries`);
    
    return new Promise(async (resolve, reject) => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // First, ensure content script is definitely loaded
          const contentScriptLoaded = await this.ensureContentScriptLoaded(tabId);
          if (!contentScriptLoaded) {
            DebugUtils.log("ContentScriptManager", `Could not ensure content script is loaded on attempt ${attempt+1}`);
            // Continue to try sending message anyway - sometimes this works
          }
          
          // Send the message with a timeout
          const response = await this.sendMessageWithTimeout(
            tabId, 
            { action: 'getArticleText' },
            5000 // 5 second timeout
          );
          
          if (response) {
            DebugUtils.log("ContentScriptManager", "Article text received", {
              hasText: !!response.articleText,
              textLength: response.articleText?.length,
              hasMetadata: !!response.metadata
            });
            
            // If we got a response but no text, try a fallback
            if (!response.articleText || response.articleText.length < 50) {
              DebugUtils.log("ContentScriptManager", "Got response but insufficient text, trying fallback extraction");
              const fallbackText = await this.extractTextWithFallback(tabId);
              if (fallbackText && fallbackText.length > 100) {
                DebugUtils.log("ContentScriptManager", "Fallback extraction successful");
                return resolve({ 
                  articleText: fallbackText,
                  metadata: response.metadata || {}
                });
              }
            }
            
            return resolve(response);
          }
          
          // If we reach here, no response was received
          DebugUtils.log("ContentScriptManager", `No response on attempt ${attempt+1}, retrying...`);
          
          // Wait before retry
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => 
              setTimeout(resolve, Math.min(1000 * Math.pow(1.5, attempt), 5000))
            );
          }
        } catch (error) {
          DebugUtils.log("ContentScriptManager", `Error on attempt ${attempt+1}: ${error.message}`);
          
          if (attempt === maxRetries - 1) {
            // Last attempt failed
            DebugUtils.error("ContentScriptManager", "All attempts to get article text failed");
            
            // Try fallback method as last resort
            try {
              DebugUtils.log("ContentScriptManager", "Trying fallback text extraction as last resort");
              const fallbackText = await this.extractTextWithFallback(tabId);
              if (fallbackText && fallbackText.length > 100) {
                DebugUtils.log("ContentScriptManager", "Fallback extraction successful");
                return resolve({ 
                  articleText: fallbackText,
                  metadata: { title: "Extracted content", source: "Fallback extraction" } 
                });
              }
            } catch (fallbackError) {
              DebugUtils.log("ContentScriptManager", "Fallback extraction also failed");
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

  /**
   * Extract text with fallback method
   * @param {number} tabId - Tab ID
   * @returns {Promise<string>} - Extracted text
   */
  async extractTextWithFallback(tabId) {
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
      DebugUtils.error("ContentScriptManager", "Fallback extraction failed:", error);
      return '';
    }
  }

  /**
   * Execute script in tab
   * @param {number} tabId - Tab ID
   * @param {Function} func - Function to execute
   * @param {Array} [args=[]] - Arguments to pass to the function
   * @returns {Promise<any>} - Result of script execution
   */
  executeScript(tabId, func, args = []) {
    DebugUtils.log("ContentScriptManager", `Executing script in tab ${tabId}`);
    return new Promise((resolve, reject) => {
      try {
        chrome.scripting.executeScript({
          target: { tabId },
          function: func,
          args: args
        }, (results) => {
          if (chrome.runtime.lastError) {
            DebugUtils.error("ContentScriptManager", "Error executing script:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            DebugUtils.log("ContentScriptManager", "Script executed successfully");
            resolve(results);
          }
        });
      } catch (error) {
        DebugUtils.error("ContentScriptManager", "Exception executing script:", error);
        reject(error);
      }
    });
  }

  /**
   * Show overlay with retry
   * @param {number} tabId - Tab ID
   * @param {number} [maxRetries=3] - Maximum number of retries
   * @returns {Promise<boolean>} - True if overlay was shown
   */
  async showOverlayWithRetry(tabId, maxRetries = REQUEST.RETRY.MAX_ATTEMPTS) {
    DebugUtils.log("ContentScriptManager", `Attempting to show overlay in tab ${tabId}`);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.sendMessageToTab(tabId, { action: 'createOverlay' });
        DebugUtils.log("ContentScriptManager", "Overlay creation message sent successfully");
        return true;
      } catch (error) {
        DebugUtils.log("ContentScriptManager", `Attempt ${attempt+1} to show overlay failed`);
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
    DebugUtils.error("ContentScriptManager", "Could not create overlay after multiple attempts");
    return false;
  }

  /**
   * Update overlay with retry
   * @param {number} tabId - Tab ID
   * @param {string} result - Result to display in overlay
   * @param {Object} metadata - Metadata to include in overlay
   * @param {number} [maxRetries=3] - Maximum number of retries
   * @returns {Promise<boolean>} - True if overlay was updated
   */
  async updateOverlayWithRetry(tabId, result, metadata, maxRetries = REQUEST.RETRY.MAX_ATTEMPTS) {
    DebugUtils.log("ContentScriptManager", `Attempting to update overlay in tab ${tabId}`);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.sendMessageToTab(tabId, { 
          action: 'updateOverlay', 
          result: result,
          metadata: metadata
        });
        DebugUtils.log("ContentScriptManager", "Overlay update message sent successfully");
        return true;
      } catch (error) {
        DebugUtils.log("ContentScriptManager", `Attempt ${attempt+1} to update overlay failed`);
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
    DebugUtils.error("ContentScriptManager", `Failed to update overlay after ${maxRetries} attempts`);
    return false;
  }

  /**
   * Inject Readability library into tab
   * @param {number} tabId - Tab ID
   * @returns {Promise<boolean>} - True if injection was successful
   */
  async injectReadability(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['libs/readability.js']
      });
      DebugUtils.log("ContentScriptManager", "Readability library injected successfully");
      return true;
    } catch (error) {
      DebugUtils.error("ContentScriptManager", "Error injecting Readability:", error);
      return false;
    }
  }
}
