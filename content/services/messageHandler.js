// messageHandler.js - Communication with background script
import { Config } from '../utils/config.js';

export const MessageHandler = {
  // Store response handlers with unique IDs
  responseHandlers: {},
  
  // Add a special flag to prevent event loops
  factCheckContentProcessed: Symbol('factCheckContentProcessed'),
  
  // Listen for messages from the content-loader
  setupEventListeners() {
    Config.debugLog("Setting up event listeners in messageHandler.js");
    
    window.addEventListener('FACT_CHECK_MESSAGE', (event) => {
      // Skip events that originated from this script to prevent loops
      if (event[this.factCheckContentProcessed]) {
        Config.debugLog("Skipping already processed event");
        return;
      }
      
      Config.debugLog("FACT_CHECK_MESSAGE event received in message handler");
      
      // Try to get event detail, with fallback to global variable
      let messageData = null;
      
      if (event.detail && event.detail.message) {
        messageData = event.detail;
        Config.debugLog("Using event.detail");
      } else if (window.__FACT_CHECK_LAST_MESSAGE) {
        messageData = window.__FACT_CHECK_LAST_MESSAGE;
        Config.debugLog("Using fallback __FACT_CHECK_LAST_MESSAGE");
      } else {
        console.error("No valid message data found");
        return;
      }
      
      // Process the message and generate a response
      this.processMessage(messageData);
    });
  },
  
  // Process incoming messages and generate responses
  processMessage(messageData) {
    const { message, responseId } = messageData;
    
    if (!message || !message.action) {
      console.error("Invalid message format - missing action:", message);
      this.sendResponse(responseId, null, "Invalid message format - missing action");
      return;
    }
    
    Config.debugLog("Processing message:", message.action);
    
    // Dispatch to the appropriate handler
    try {
      const result = this.dispatchAction(message);
      
      // If the result is a promise, handle it accordingly
      if (result instanceof Promise) {
        result.then(data => {
          this.sendResponse(responseId, data);
        }).catch(error => {
          console.error(`Error in action ${message.action}:`, error);
          this.sendResponse(responseId, null, error.message || 'Unknown error');
        });
      } else {
        // Send immediate response
        this.sendResponse(responseId, result);
      }
    } catch (error) {
      console.error(`Error processing message ${message.action}:`, error);
      this.sendResponse(responseId, null, error.message || 'Unknown error');
    }
  },
  
  // Dispatch actions to the appropriate handlers
  dispatchAction(message) {
    // Define the action handlers
    return ActionHandler.handleAction(message.action, message);
  },
  
  // Send a response back to the content-loader
  sendResponse(responseId, data, error) {
    if (!responseId) {
      Config.debugLog("No responseId provided, cannot send response");
      return;
    }
    
    Config.debugLog("Sending response for", responseId);
    
    // Create response detail
    const responseDetail = {
      responseId: responseId,
      data: data,
      error: error
    };
    
    // Mark the event to prevent loops
    const event = new CustomEvent('FACT_CHECK_RESPONSE', {
      detail: responseDetail,
      bubbles: true,
      composed: true
    });
    
    // Add our special flag to prevent loops
    event[this.factCheckContentProcessed] = true;
    
    // Try to dispatch the event
    try {
      window.dispatchEvent(event);
      Config.debugLog("Response event dispatched successfully");
    } catch (error) {
      console.error("Error dispatching response event:", error);
      
      // Last resort fallback - set a global variable
      window.__FACT_CHECK_LAST_RESPONSE = responseDetail;
    }
  }
};

// Separate action handler to process different types of actions
export const ActionHandler = {
  // Handle different action types
  handleAction(action, message) {
    const handlers = {
      // Ping handler to verify the content script is loaded and responsive
      'ping': () => {
        Config.debugLog("Ping received, responding with pong");
        return { pong: true };
      },
      
      // Get article text from the page
      'getArticleText': () => {
        Config.debugLog("Getting article text");
        if (!window.TextExtractorService) {
          throw new Error("TextExtractorService not available");
        }
        return window.TextExtractorService.extractArticleText();
      },
      
      // Create the overlay for displaying fact check results
      'createOverlay': () => {
        Config.debugLog("Creating overlay");
        if (!window.overlayManager) {
          throw new Error("OverlayManager not available");
        }
        return { success: true, overlay: !!window.overlayManager.createLoadingOverlay() };
      },
      
      // Hide the overlay
      'hideOverlay': () => {
        Config.debugLog("Hiding overlay");
        if (!window.overlayManager) {
          throw new Error("OverlayManager not available");
        }
        
        // Check if there's an overlay element to hide
        const overlayElement = document.getElementById(window.overlayManager.overlayId);
        if (!overlayElement) {
          return { success: false, error: "No overlay found to hide" };
        }
        
        // Use the OverlayManager's native method to properly hide the overlay
        try {
          if (typeof window.overlayManager.hideOverlay === 'function') {
            window.overlayManager.hideOverlay();
            return { success: true };
          } else {
            // Fallback to manual removal if the method doesn't exist
            overlayElement.remove();
            return { success: true, method: 'manual' };
          }
        } catch (error) {
          console.error("Error hiding overlay:", error);
          return { success: false, error: error.message };
        }
      },
      
      // Update the loading progress
      'updateProgress': () => {
        Config.debugLog("Updating progress");
        if (!window.loadingIndicatorInstance) {
          throw new Error("LoadingIndicator not available");
        }
        
        const stepId = message.stepId || 'extraction';
        window.loadingIndicatorInstance.updateProgress(stepId);
        return { success: true, stepId };
      },
      
      // Update the overlay with fact check results
      'updateOverlayResult': () => {
        Config.debugLog("Updating overlay result");
        if (!window.overlayManager) {
          throw new Error("OverlayManager not available");
        }
        
        if (!message.result) {
          throw new Error("No result provided");
        }
        
        // Call the OverlayManager to update with the result
        try {
          window.overlayManager.updateOverlayResult(message.result, message.metadata);
          return { success: true };
        } catch (error) {
          console.error("Error updating overlay result:", error);
          return { success: false, error: error.message };
        }
      },
      
      // Add compatibility for updateOverlay action (alias for updateOverlayResult)
      'updateOverlay': () => {
        Config.debugLog("Using updateOverlay (alias for updateOverlayResult)");
        if (!window.overlayManager) {
          throw new Error("OverlayManager not available");
        }
        
        if (!message.result) {
          throw new Error("No result provided");
        }
        
        // Call the OverlayManager to update with the result
        try {
          window.overlayManager.updateOverlayResult(message.result, message.metadata);
          return { success: true };
        } catch (error) {
          console.error("Error updating overlay result:", error);
          return { success: false, error: error.message };
        }
      }
    };
    
    // Check if the action exists
    if (!handlers[action]) {
      throw new Error(`Unknown action: ${action}`);
    }
    
    // Call the handler
    return handlers[action]();
  }
};
