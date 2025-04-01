// services/ApiManager.js - API key management and service initialization

import { StorageManager } from '../utils/StorageManager.js';
import { DebugUtils } from '../utils/debug-utils.js';
import { OpenAIService } from '../api/openai.js';
import { BraveSearchService } from '../api/brave.js';
import { AnthropicService } from '../api/anthropic.js';

/**
 * Manages API keys and initializes API services
 */
export class ApiManager {
  constructor() {
    this.openaiService = null;
    this.braveSearchService = null;
    this.anthropicService = null;
    this.apiKeys = {
      openai: null,
      brave: null,
      anthropic: null
    };
    this.currentProvider = 'openai';
  }

  /**
   * Initialize API manager by loading keys from storage
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      DebugUtils.log("ApiManager", "Initializing API manager");
      await this.loadApiKeys();
      await this.synchronizeApiKeys();
    } catch (error) {
      DebugUtils.error("ApiManager", "Error initializing API manager:", error);
      throw error;
    }
  }

  /**
   * Load API keys from storage
   * @returns {Promise<void>}
   */
  async loadApiKeys() {
    try {
      const settings = await StorageManager.get([
        'openaiApiKey',
        'braveApiKey',
        'anthropicApiKey',
        'aiProvider'
      ]);

      this.apiKeys.openai = settings.openaiApiKey || null;
      this.apiKeys.brave = settings.braveApiKey || null;
      this.apiKeys.anthropic = settings.anthropicApiKey || null;
      this.currentProvider = settings.aiProvider || 'openai';

      DebugUtils.log("ApiManager", "API keys loaded", {
        hasOpenAI: !!this.apiKeys.openai,
        hasBrave: !!this.apiKeys.brave,
        hasAnthropic: !!this.apiKeys.anthropic,
        provider: this.currentProvider
      });
    } catch (error) {
      DebugUtils.error("ApiManager", "Error loading API keys:", error);
      throw error;
    }
  }

  /**
   * Synchronize API keys between sync and local storage
   * @returns {Promise<void>}
   */
  async synchronizeApiKeys() {
    try {
      DebugUtils.log("ApiManager", "Synchronizing API keys between storage types");
      
      // Synchronize Anthropic API key
      await StorageManager.synchronizeKey('anthropicApiKey');
      
      // Synchronize OpenAI API key
      await StorageManager.synchronizeKey('openaiApiKey');
      
      // Synchronize model selection with provider
      const syncData = await StorageManager.get(['aiModel', 'aiProvider'], 'sync');
      if (syncData.aiProvider === 'anthropic' && syncData.aiModel) {
        DebugUtils.log("ApiManager", "Syncing Claude model to local storage");
        await StorageManager.set({
          aiModel: syncData.aiModel
        }, 'local');
      }
    } catch (error) {
      DebugUtils.error("ApiManager", "Error synchronizing API keys:", error);
      // Non-fatal error, continue execution
    }
  }

  /**
   * Get the appropriate AI service based on current provider
   * @returns {Object} AI service instance
   */
  getAiService() {
    if (this.currentProvider === 'anthropic') {
      if (!this.apiKeys.anthropic) {
        throw new Error("Missing Anthropic API key");
      }
      
      if (!this.anthropicService) {
        this.anthropicService = new AnthropicService(this.apiKeys.anthropic);
      }
      
      return this.anthropicService;
    } else {
      if (!this.apiKeys.openai) {
        throw new Error("Missing OpenAI API key");
      }
      
      if (!this.openaiService) {
        this.openaiService = new OpenAIService(this.apiKeys.openai);
      }
      
      return this.openaiService;
    }
  }

  /**
   * Get the Brave search service
   * @returns {BraveSearchService|null} Brave search service or null if no API key
   */
  getBraveSearchService() {
    if (!this.apiKeys.brave) {
      return null;
    }
    
    if (!this.braveSearchService) {
      this.braveSearchService = new BraveSearchService(this.apiKeys.brave);
    }
    
    return this.braveSearchService;
  }

  /**
   * Test if an API key is valid
   * @param {string} provider - The provider to test ('openai', 'brave', 'anthropic')
   * @param {string} apiKey - The API key to test
   * @returns {Promise<boolean>} True if valid, false otherwise
   */
  async testApiKey(provider, apiKey) {
    try {
      if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        });
        
        return response.ok;
      }
      
      // Add tests for other providers as needed
      
      return false;
    } catch (error) {
      DebugUtils.error("ApiManager", `Error testing ${provider} API key:`, error);
      return false;
    }
  }

  /**
   * Update an API key in storage
   * @param {string} provider - The provider to update ('openai', 'brave', 'anthropic')
   * @param {string} apiKey - The new API key
   * @returns {Promise<void>}
   */
  async updateApiKey(provider, apiKey) {
    try {
      const keyMapping = {
        openai: 'openaiApiKey',
        brave: 'braveApiKey',
        anthropic: 'anthropicApiKey'
      };
      
      const storageKey = keyMapping[provider];
      if (!storageKey) {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      // Update in both sync and local storage
      const data = {};
      data[storageKey] = apiKey;
      
      await StorageManager.set(data, 'sync');
      await StorageManager.set(data, 'local');
      
      // Update in-memory key
      this.apiKeys[provider] = apiKey;
      
      // Reset service instances to force recreation with new key
      if (provider === 'openai') {
        this.openaiService = null;
      } else if (provider === 'brave') {
        this.braveSearchService = null;
      } else if (provider === 'anthropic') {
        this.anthropicService = null;
      }
      
      DebugUtils.log("ApiManager", `Updated ${provider} API key`);
    } catch (error) {
      DebugUtils.error("ApiManager", `Error updating ${provider} API key:`, error);
      throw error;
    }
  }

  /**
   * Set the current AI provider
   * @param {string} provider - The provider to use ('openai' or 'anthropic')
   * @returns {Promise<void>}
   */
  async setCurrentProvider(provider) {
    try {
      if (provider !== 'openai' && provider !== 'anthropic') {
        throw new Error(`Unsupported provider: ${provider}`);
      }
      
      await StorageManager.set({ aiProvider: provider }, 'sync');
      await StorageManager.set({ aiProvider: provider }, 'local');
      
      this.currentProvider = provider;
      
      DebugUtils.log("ApiManager", `Set current provider to ${provider}`);
    } catch (error) {
      DebugUtils.error("ApiManager", `Error setting current provider to ${provider}:`, error);
      throw error;
    }
  }
}
