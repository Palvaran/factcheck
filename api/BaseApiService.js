// api/BaseApiService.js
import { RequestQueueManager } from '../utils/requestQueue.js';
import { CACHE, CONTENT } from '../utils/constants.js';

/**
 * Base class for AI API services with common functionality for caching,
 * rate limiting, and request handling.
 */
export class BaseApiService {
  /**
   * Creates a new BaseApiService instance
   * @param {string} apiKey - The API key for the service
   * @param {Object} requestSettings - Settings for the request queue manager
   */
  constructor(apiKey, requestSettings) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      console.error("ERROR: Invalid or missing API key");
      throw new Error("Invalid or missing API key");
    }

    this.apiKey = apiKey;
    this.cache = {};
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.maxCacheSize = CACHE.MAX_SIZE;
    
    // Initialize request queue manager
    this.requestQueue = new RequestQueueManager({
      ...requestSettings,
      processRequestCallback: this._processRequest.bind(this)
    });
  }

  /**
   * Set rate limit for API requests
   * @param {number} limit - Requests per minute
   */
  setRateLimit(limit) {
    this.requestQueue.rateLimitPerMinute = Math.max(1, parseInt(limit) || 5);
  }

  /**
   * Generate a cache key for a given text and model
   * @param {string} text - The text to hash
   * @returns {Promise<string>} A hash to use as a cache key
   */
  async getCacheKey(text) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex.substring(0, 50);
    } catch (error) {
      console.error("Error generating cache key:", error);
      // Fallback to a simpler method if SHA-256 fails
      return String(text).split('').reduce(
        (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0
      ).toString(36);
    }
  }
  
  /**
   * Trim cache to maximum size by removing oldest entries
   */
  trimCache() {
    if (Object.keys(this.cache).length <= this.maxCacheSize) return;
    
    // Convert cache to array with timestamps
    const cacheEntries = Object.entries(this.cache)
      .map(([key, value]) => ({
        key,
        value,
        timestamp: value.timestamp || 0
      }))
      .sort((a, b) => a.timestamp - b.timestamp); // Sort by timestamp (oldest first)
    
    // Remove oldest entries until we're under the limit
    const entriesToRemove = cacheEntries.slice(0, cacheEntries.length - this.maxCacheSize);
    for (const entry of entriesToRemove) {
      delete this.cache[entry.key];
    }
  }
  
  /**
   * Process a request - to be implemented by subclasses
   * @param {Object} requestData - Request data including prompt, model, and maxTokens
   * @returns {Promise<string>} Response from the API
   * @abstract
   */
  async _processRequest(requestData) {
    throw new Error("_processRequest must be implemented by subclass");
  }

  /**
   * Call the API with caching
   * @param {string} prompt - The prompt to send to the API
   * @param {string} model - The model to use
   * @param {number} maxTokens - Maximum tokens in the response
   * @param {boolean} enableCaching - Whether to use cache
   * @returns {Promise<string>} Response from the API
   */
  async callWithCache(prompt, model, maxTokens = CONTENT.MAX_TOKENS.DEFAULT, enableCaching = true) {
    if (enableCaching) {
      // Check cache first
      const key = await this.getCacheKey(prompt + model);
      
      if (this.cache[key] && this.cache[key].query === prompt && this.cache[key].model === model) {
        this.cacheHits++;
        return this.cache[key].response;
      }
      
      this.cacheMisses++;
    }
    
    // Process the request
    const result = await this.requestQueue.enqueueRequest({ 
      prompt, 
      model, 
      maxTokens: parseInt(maxTokens, 10)
    });
    
    // Store in cache with timestamp if caching is enabled
    if (enableCaching) {
      const key = await this.getCacheKey(prompt + model);
      this.cache[key] = { 
        query: prompt, 
        model: model, 
        response: result,
        timestamp: Date.now()
      };
      this.trimCache();
    }
    
    return result;
  }

  /**
   * Extract search query from text
   * @param {string} text - The full text to extract claims from
   * @param {string} model - The model to use for extraction
   * @returns {Promise<string>} The extracted query text
   */
  async extractSearchQuery(text, model) {
    let queryText = text;
    
    // Only process if text is long
    if (queryText.length > 300) {
      try {
        const claimExtractionPrompt = `
          Extract the 2-3 most important factual claims from this text. 
          Focus on specific, verifiable statements rather than opinions.
          Return ONLY the claims, separated by semicolons, with no additional text:
          
          "${text.substring(0, 2000)}"
        `;
        
        // Use a fast model for extraction to save costs
        const extractionModel = this.getExtractionModel(model);
        
        const claimsResponse = await this.callWithCache(
          claimExtractionPrompt, 
          extractionModel,
          CONTENT.MAX_TOKENS.CLAIM_EXTRACTION,
          true  // Always enable caching for extraction
        );
        
        // Use the extracted claims as our query text
        if (claimsResponse && claimsResponse.length > 10) {
          queryText = claimsResponse;
        } else {
          // Default to first few sentences if claim extraction fails
          const sentences = text.split(/[.!?]+/);
          if (sentences[0] && sentences[0].trim().length > 0) {
            queryText = sentences.slice(0, 3).join(". ").trim();
            if (queryText.length > 300) {
              queryText = queryText.substring(0, 300);
            }
          }
        }
      } catch (error) {
        console.error("Error extracting claims:", error);
        // Fallback to simple approach
        const sentences = text.split(/[.!?]+/);
        if (sentences[0] && sentences[0].trim().length > 0) {
          queryText = sentences.slice(0, 2).join(". ").trim();
          if (queryText.length > 300) {
            queryText = queryText.substring(0, 300);
          }
        }
      }
    }
    
    return queryText;
  }
  
  /**
   * Get the model to use for claim extraction
   * @param {string} model - The base model
   * @returns {string} The model to use for extraction
   * @abstract
   */
  getExtractionModel(model) {
    throw new Error("getExtractionModel must be implemented by subclass");
  }
  
  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: Object.keys(this.cache).length,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: this.cacheHits + this.cacheMisses > 0 
        ? (this.cacheHits / (this.cacheHits + this.cacheMisses) * 100).toFixed(1) + '%' 
        : '0%'
    };
  }
}