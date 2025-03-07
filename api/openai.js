// api/openai.js
import { RequestQueueManager } from '../utils/requestQueue.js';
import { REQUEST, API, CACHE, CONTENT } from '../utils/constants.js';

export class OpenAIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.cache = {};
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.maxCacheSize = CACHE.MAX_SIZE;
    
    // Initialize request queue manager
    this.requestQueue = new RequestQueueManager({
      baseBackoff: REQUEST.BACKOFF.OPENAI.INITIAL,
      maxBackoff: REQUEST.BACKOFF.OPENAI.MAX,
      backoffFactor: REQUEST.BACKOFF.OPENAI.FACTOR,
      rateLimitPerMinute: REQUEST.RATE_LIMITS.OPENAI,
      processRequestCallback: this._processRequest.bind(this)
    });
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
    
    const requestBody = {
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3
    };
    
    const response = await fetch(API.OPENAI.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(`OpenAI API error (${response.status}): ${errorData.error?.message || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    
    const data = await response.json();
    return data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content.trim()
      : 'No result.';
  }

  async callWithCache(prompt, model = "gpt-4o-mini", maxTokens = CONTENT.MAX_TOKENS.DEFAULT, enableCaching = true) {
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
    const result = await this.requestQueue.enqueueRequest({ prompt, model, maxTokens });
    
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

  async extractSearchQuery(text, model = 'gpt-4o-mini') {
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
        
        // Always use gpt4o-mini for extraction to save costs
        const claimsResponse = await this.callWithCache(
          claimExtractionPrompt, 
          'gpt-4o-mini',
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