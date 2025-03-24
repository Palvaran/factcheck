// api/anthropic.js
import { RequestQueueManager } from '../utils/requestQueue.js';
import { REQUEST, API, CACHE, CONTENT } from '../utils/constants.js';

export class AnthropicService {
  constructor(apiKey) {
    console.log(`AnthropicService initialized with API key: ${apiKey ? 'PRESENT' : 'MISSING'}`);
    
    // Validate the key
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      console.error("ERROR: Invalid or missing Anthropic API key");
      throw new Error("Invalid or missing Anthropic API key");
    }

    this.apiKey = apiKey;
    this.cache = {};
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.maxCacheSize = CACHE.MAX_SIZE;
    
    // Initialize request queue manager with rate limits
    const anthropicRequestSettings = {
      baseBackoff: REQUEST.BACKOFF.ANTHROPIC?.INITIAL || 1000,
      maxBackoff: REQUEST.BACKOFF.ANTHROPIC?.MAX || 15000,
      backoffFactor: REQUEST.BACKOFF.ANTHROPIC?.FACTOR || 2,
      rateLimitPerMinute: REQUEST.RATE_LIMITS.ANTHROPIC || REQUEST.RATE_LIMITS.DEFAULT,
      processRequestCallback: this._processRequest.bind(this)
    };
    
    this.requestQueue = new RequestQueueManager(anthropicRequestSettings);
  }

  setRateLimit(limit) {
    this.requestQueue.rateLimitPerMinute = Math.max(1, parseInt(limit) || REQUEST.RATE_LIMITS.DEFAULT);
  }

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
  
  // Manage cache size by removing least recently used items
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
  
  async _processRequest(requestData) {
    const { prompt, model, maxTokens } = requestData;
    
    // Convert maxTokens to integer
    const maxTokensInt = parseInt(maxTokens, 10);
    
    // Log for debugging
    console.log(`Making Anthropic API request with model: ${model}, max_tokens: ${maxTokensInt}`);
    
    // Map OpenAI-style model names to Anthropic models if needed
    const actualModel = this._getActualModel(model);
    
    const requestBody = {
      model: actualModel,
      max_tokens: maxTokensInt,
      temperature: 0.3,
      messages: [
        { role: "user", content: prompt }
      ]
    };
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(`Anthropic API error (${response.status}): ${errorData.error?.message || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    
    const data = await response.json();
    
    // Extract text content from Anthropic's response format
    if (data.content && data.content[0] && data.content[0].type === 'text') {
      return data.content[0].text.trim();
    } else {
      return 'No result.';
    }
  }

  // Map model names if needed (for compatibility with existing code)
  _getActualModel(model) {
    // If it's already a valid Claude model, return it as is
    if (model.includes('claude-') && 
        !model.includes('claude-3-5-haiku-20240307')) { // Skip the invalid model
      return model;
    }
    
    // Map models to correct Claude models
    const modelMap = {
      // Use the exact model names from the official list can use -latest
      'gpt-4o-mini': 'claude-3-haiku-20240307',      // Haiku without the "-5"
      'o3-mini': 'claude-3-sonnet-20240229',         // Correct Sonnet model
      'hybrid': 'claude-3-opus-20240229',            // Opus model
      'claude-3-5-haiku-20240307': 'claude-3-haiku-20240307' // Special case fix
    };
    
    // Try to find the model in our map, or fall back to a known valid model
    return modelMap[model] || 'claude-3-haiku-20240307';
  }

  async callWithCache(prompt, model = "claude-3-5-sonnet-20240229", maxTokens = CONTENT.MAX_TOKENS.DEFAULT, enableCaching = true) {
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

  async extractSearchQuery(text, model = 'claude-3-5-haiku-20240307') {
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
        
        // Always use a fast model for extraction to save costs
        const claimsResponse = await this.callWithCache(
          claimExtractionPrompt, 
          'claude-3-5-haiku-20240307',
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
  
  // Get cache statistics
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