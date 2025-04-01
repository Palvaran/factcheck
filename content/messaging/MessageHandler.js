// content/messaging/MessageHandler.js - Handles communication with background script

/**
 * Handles messaging between content script and background script
 */
export class MessageHandler {
  /**
   * Initialize the message handler
   */
  constructor() {
    this.responseHandlers = new Map();
    this.messageCounter = 0;
  }
  
  /**
   * Set up event listeners for messaging
   */
  setupListeners() {
    // Listen for responses from the background script
    window.addEventListener('FACT_CHECK_RESPONSE', (event) => {
      const { responseId, data, error } = event.detail;
      
      // Find and execute the corresponding handler
      if (this.responseHandlers.has(responseId)) {
        const handler = this.responseHandlers.get(responseId);
        if (error) {
          handler.reject(error);
        } else {
          handler.resolve(data);
        }
        
        // Remove the handler after execution
        this.responseHandlers.delete(responseId);
      }
    }, false);
  }
  
  /**
   * Send a message to the background script
   * @param {string} action - The action to perform
   * @param {Object} data - The data to send
   * @returns {Promise<any>} Response from the background script
   */
  sendMessage(action, data = {}) {
    return new Promise((resolve, reject) => {
      // Generate a unique ID for this message
      const messageId = `msg_${Date.now()}_${this.messageCounter++}`;
      
      // Store the handlers for this message
      this.responseHandlers.set(messageId, { resolve, reject });
      
      // Create the message object
      const message = {
        action,
        ...data,
        messageId
      };
      
      // Dispatch the message event
      window.dispatchEvent(new CustomEvent('FACT_CHECK_REQUEST', {
        detail: { message, responseId: messageId },
        bubbles: true,
        composed: true
      }));
      
      // Set a timeout to reject the promise if no response is received
      setTimeout(() => {
        if (this.responseHandlers.has(messageId)) {
          this.responseHandlers.delete(messageId);
          reject(new Error(`Timeout waiting for response to action: ${action}`));
        }
      }, 60000); // 60 second timeout
    });
  }
  
  /**
   * Request a fact check for the selected text
   * @param {string} text - The text to fact check
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Fact check result
   */
  requestFactCheck(text, options = {}) {
    return this.sendMessage('factCheck', { text, ...options });
  }
  
  /**
   * Cancel an ongoing fact check
   * @returns {Promise<boolean>} Success status
   */
  cancelFactCheck() {
    return this.sendMessage('cancelFactCheck');
  }
  
  /**
   * Extract text from the current page
   * @returns {Promise<Object>} Extracted text and metadata
   */
  extractPageContent() {
    return this.sendMessage('extractContent');
  }
  
  /**
   * Update the extension settings
   * @param {Object} settings - New settings
   * @returns {Promise<Object>} Updated settings
   */
  updateSettings(settings) {
    return this.sendMessage('updateSettings', { settings });
  }
  
  /**
   * Get the current extension settings
   * @returns {Promise<Object>} Current settings
   */
  getSettings() {
    return this.sendMessage('getSettings');
  }
}
