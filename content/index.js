// content/index.js - Main entry point for content script
import { MarkdownUtils } from './utils/MarkdownUtils.js';
import { TextExtractor } from './utils/TextExtractor.js';
import { DomUtils } from './utils/DomUtils.js';
import { OverlayManager } from './ui/OverlayManager.js';
import { LoadingIndicator } from './ui/LoadingIndicator.js';
import { MessageHandler } from './messaging/MessageHandler.js';

// Debug flag - set to false for production
const DEBUG = false;

// Make DEBUG available globally for other modules
window.DEBUG = DEBUG;

// Debug logging helper
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

/**
 * Main content script class
 */
class FactCheckContent {
  /**
   * Initialize the content script
   */
  constructor() {
    // Check if already initialized to prevent duplicate execution
    if (window.__FACT_CHECK_INITIALIZED) {
      debugLog("Content script already initialized, skipping");
      return;
    }
    
    // Mark as initialized
    window.__FACT_CHECK_INITIALIZED = true;
    
    // Initialize services
    this.overlayManager = new OverlayManager();
    this.messageHandler = new MessageHandler();
    
    // Make services available globally for backward compatibility
    window.MarkdownUtils = MarkdownUtils;
    window.TextExtractorService = TextExtractor;
    window.OverlayManager = this.overlayManager;
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the content script
   */
  init() {
    debugLog("Initializing Fact Check content script");
    
    // Set up message handler
    this.messageHandler.setupListeners();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Add global styles
    this.addGlobalStyles();
    
    debugLog("Fact Check Extension setup completed");
  }
  
  /**
   * Add global styles for the extension
   */
  addGlobalStyles() {
    DomUtils.addStyles('fact-check-global-styles', `
      #factCheckOverlay * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      
      #factCheckOverlay a {
        transition: opacity 0.2s ease;
      }
      
      #factCheckOverlay a:hover {
        opacity: 0.8;
      }
      
      #factCheckOverlay button {
        cursor: pointer;
      }
      
      .fact-check-content p {
        margin-bottom: 12px;
      }
      
      .fact-check-content ul, .fact-check-content ol {
        margin-bottom: 12px;
        padding-left: 20px;
      }
      
      .fact-check-content li {
        margin-bottom: 4px;
      }
    `);
  }
  
  /**
   * Set up event listeners for the content script
   */
  setupEventListeners() {
    // Listen for messages from the extension
    window.addEventListener('FACT_CHECK_REQUEST', async (event) => {
      try {
        const { message, responseId } = event.detail;
        debugLog(`Received message:`, message);
        
        // Handle different message types
        const handlers = {
          // Extract content from the page
          'extractContent': () => {
            try {
              const result = TextExtractor.extractArticleText();
              return { success: true, ...result };
            } catch (error) {
              console.error("Error extracting content:", error);
              return { success: false, error: error.message };
            }
          },
          
          // Start fact checking
          'factCheck': () => {
            try {
              // Show loading overlay
              this.overlayManager.createLoadingOverlay();
              return { success: true };
            } catch (error) {
              console.error("Error starting fact check:", error);
              return { success: false, error: error.message };
            }
          },
          
          // Cancel fact checking
          'cancelFactCheck': () => {
            try {
              // Remove overlay
              this.overlayManager.removeOverlay();
              return { success: true };
            } catch (error) {
              console.error("Error canceling fact check:", error);
              return { success: false, error: error.message };
            }
          },
          
          // Show fact check results
          'showResult': () => {
            try {
              // Update overlay with results
              this.overlayManager.updateOverlayResult(message.result, message.metadata);
              return { success: true };
            } catch (error) {
              console.error("Error showing result:", error);
              
              // Last resort: try to show result as plain text
              try {
                const overlay = document.getElementById('factCheckOverlay');
                if (overlay) {
                  overlay.innerHTML = `
                    <div style="background-color: white; color: black; padding: 20px; border-radius: 8px; max-width: 800px; position: relative;">
                      <button style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 20px; cursor: pointer;" onclick="document.getElementById('factCheckOverlay').remove()">&times;</button>
                      <h2 style="margin-top: 0;">Fact Check Result</h2>
                      <div style="max-height:400px;overflow-y:auto;">${message.result || 'No result available'}</div>
                    </div>
                  `;
                }
                return { success: true, lastResort: true };
              } catch (innerError) {
                return { success: false, error: error.message };
              }
            }
          },
          
          // Update progress
          'updateProgress': () => {
            try {
              debugLog(`Updating progress: ${message.stepId}`);
              
              // Find the loading indicator
              if (window.loadingIndicatorInstance) {
                window.loadingIndicatorInstance.updateProgress(message.stepId);
                return { success: true };
              }
              
              // Try to find it in the DOM if global reference isn't available
              const overlay = document.getElementById('factCheckOverlay');
              if (overlay) {
                const loadingSteps = overlay.querySelector('.fact-check-steps');
                if (loadingSteps && loadingSteps.parentNode) {
                  // Try to trigger an update via a custom event
                  const progressEvent = new CustomEvent('fact-check-progress', {
                    detail: { stepId: message.stepId }
                  });
                  loadingSteps.parentNode.dispatchEvent(progressEvent);
                  return { success: true };
                }
              }
              
              return { success: false, error: "Loading indicator not found" };
            } catch (error) {
              console.error("Error updating progress:", error);
              return { success: false, error: error.message };
            }
          }
        };
        
        // Execute the appropriate handler
        const handler = handlers[message.action];
        if (handler) {
          const result = handler();
          debugLog(`Executed handler for ${message.action}:`, result);
          
          // Send response back with bubbling to ensure it propagates to content-loader
          window.dispatchEvent(new CustomEvent('FACT_CHECK_RESPONSE', {
            detail: { responseId, data: result },
            bubbles: true,
            composed: true
          }));
        } else {
          console.error(`No handler for action: ${message.action}`);
          window.dispatchEvent(new CustomEvent('FACT_CHECK_RESPONSE', {
            detail: { responseId, error: `Unsupported action: ${message.action}` },
            bubbles: true,
            composed: true
          }));
        }
      } catch (error) {
        console.error("Error handling message:", error);
        
        // Send error response
        if (event.detail && event.detail.responseId) {
          window.dispatchEvent(new CustomEvent('FACT_CHECK_RESPONSE', {
            detail: { responseId: event.detail.responseId, error: error.message },
            bubbles: true,
            composed: true
          }));
        }
      }
    }, false);
    
    // Listen for fact check cancel events
    document.addEventListener('fact-check-cancel', () => {
      debugLog("Fact check canceled by user");
      this.messageHandler.cancelFactCheck().catch(error => {
        console.error("Error canceling fact check:", error);
      });
    }, false);
  }
}

// Initialize the content script
new FactCheckContent();
