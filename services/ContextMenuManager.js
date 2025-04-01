// services/ContextMenuManager.js - Context menu setup and handling

import { DebugUtils } from '../utils/debug-utils.js';
import { StorageManager } from '../utils/StorageManager.js';

/**
 * Manages context menu creation and click handling
 */
export class ContextMenuManager {
  constructor(factCheckManager) {
    this.factCheckManager = factCheckManager;
  }

  /**
   * Initialize context menus
   */
  initialize() {
    DebugUtils.log("ContextMenuManager", "Setting up context menus");
    this.setupContextMenus();
    this.setupClickHandler();
  }

  /**
   * Setup context menus
   */
  setupContextMenus() {
    // First remove any existing context menu items to prevent duplicate ID errors
    chrome.contextMenus.removeAll(() => {
      DebugUtils.log("ContextMenuManager", "Removed existing context menus");
      
      // Create the context menu items
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
      
      DebugUtils.log("ContextMenuManager", "Context menus created");
    });
  }

  /**
   * Setup context menu click handler
   */
  setupClickHandler() {
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      DebugUtils.log("ContextMenuManager", "Context menu clicked:", info.menuItemId);
      
      try {
        // Get all API keys and settings in one call
        const settings = await StorageManager.get([
          'openaiApiKey', 
          'braveApiKey', 
          'anthropicApiKey', 
          'aiProvider',
          'aiModel'
        ]);
        
        // Log all retrieved values for debugging
        DebugUtils.log("ContextMenuManager", "Retrieved settings from storage:", {
          hasOpenAI: !!settings.openaiApiKey,
          hasBrave: !!settings.braveApiKey,
          hasAnthropic: !!settings.anthropicApiKey,
          provider: settings.aiProvider,
          model: settings.aiModel
        });
        
        // Determine which key to use based on provider setting
        const aiProvider = settings.aiProvider || 'openai';
        
        let requiredKey, keyName;
        
        if (aiProvider === 'anthropic') {
          requiredKey = settings.anthropicApiKey;
          keyName = 'Anthropic API key';
          DebugUtils.log("ContextMenuManager", "Using Anthropic provider with key:", 
             requiredKey ? `Present (${requiredKey.length} chars)` : "Missing");
        } else {
          requiredKey = settings.openaiApiKey;
          keyName = 'OpenAI API key';
          DebugUtils.log("ContextMenuManager", "Using OpenAI provider with key:", 
             requiredKey ? `Present (${requiredKey.length} chars)` : "Missing");
        }
        
        // Check if we have the required key
        if (!requiredKey) {
          DebugUtils.error("ContextMenuManager", `Missing ${keyName}`);
          await this.executeScript(tab.id, (message) => alert(message), [`Please set your ${keyName} in the extension options.`]);
          return;
        }

        // Process based on menu item
        if (info.menuItemId === 'factCheckPage') {
          await this.factCheckManager.handlePageCheck(tab);
        } else {
          await this.factCheckManager.handleSelectionCheck(info.selectionText, tab);
        }
      } catch (error) {
        DebugUtils.error("ContextMenuManager", "Context menu handler error:", error);
        await this.handleError(tab.id, 'Error processing request.');
      }
    });
  }

  /**
   * Execute script in tab with error handling
   * @param {number} tabId - Tab ID
   * @param {Function} func - Function to execute
   * @param {Array} [args] - Arguments to pass to the function
   * @returns {Promise<any>} - Result of script execution
   */
  async executeScript(tabId, func, args = []) {
    DebugUtils.log("ContextMenuManager", `Executing script in tab ${tabId}`);
    return new Promise((resolve, reject) => {
      try {
        chrome.scripting.executeScript({
          target: { tabId },
          function: func,
          args: args
        }, (results) => {
          if (chrome.runtime.lastError) {
            DebugUtils.error("ContextMenuManager", "Error executing script:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            DebugUtils.log("ContextMenuManager", "Script executed successfully");
            resolve(results);
          }
        });
      } catch (error) {
        DebugUtils.error("ContextMenuManager", "Exception executing script:", error);
        reject(error);
      }
    });
  }

  /**
   * Handle errors by showing an alert in the tab
   * @param {number} tabId - Tab ID
   * @param {string} message - Error message
   */
  async handleError(tabId, message) {
    DebugUtils.error("ContextMenuManager", `Handling error in tab ${tabId}: ${message}`);
    try {
      await this.executeScript(tabId, (msg) => alert(msg), [message]);
    } catch (error) {
      DebugUtils.error("ContextMenuManager", "Error showing error message:", error);
    }
  }
}
