// services/CacheService.js - Enhanced caching for API responses
import { FEATURES, CACHE } from '../utils/constants.js';

/**
 * Service for caching API responses to reduce costs and improve performance
 */
export class CacheService {
  /**
   * Initialize the cache service
   */
  constructor() {
    this.memoryCache = new Map();
    this.initialized = false;
    this.initPromise = null;
  }
  
  /**
   * Initialize the cache from storage
   * @returns {Promise<void>}
   */
  async initialize() {
    // Skip if already initialized or initialization is in progress
    if (this.initialized || this.initPromise) {
      return this.initPromise || Promise.resolve();
    }
    
    // Skip if caching is disabled
    if (!FEATURES.CACHING.ENABLED) {
      this.initialized = true;
      return Promise.resolve();
    }
    
    // Create initialization promise
    this.initPromise = new Promise((resolve) => {
      try {
        // Load cache from storage if persistence is enabled
        if (FEATURES.CACHING.PERSIST_TO_STORAGE && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['apiCache'], (result) => {
            if (result.apiCache) {
              try {
                const storedCache = JSON.parse(result.apiCache);
                
                // Process stored cache entries
                Object.entries(storedCache).forEach(([key, entry]) => {
                  // Skip expired entries
                  if (this._isExpired(entry.timestamp)) {
                    return;
                  }
                  
                  // Add valid entries to memory cache
                  this.memoryCache.set(key, entry);
                });
                
                console.log(`Loaded ${this.memoryCache.size} cache entries from storage`);
              } catch (error) {
                console.error('Error parsing cache from storage:', error);
              }
            }
            
            this.initialized = true;
            resolve();
          });
        } else {
          // No persistence, just mark as initialized
          this.initialized = true;
          resolve();
        }
      } catch (error) {
        console.error('Error initializing cache:', error);
        this.initialized = true;
        resolve();
      }
    });
    
    return this.initPromise;
  }
  
  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null if not found
   */
  async get(key) {
    // Skip if caching is disabled
    if (!FEATURES.CACHING.ENABLED) {
      return null;
    }
    
    // Ensure cache is initialized
    await this.initialize();
    
    // Check if key exists in memory cache
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key);
      
      // Check if entry is expired
      if (this._isExpired(entry.timestamp)) {
        this.memoryCache.delete(key);
        return null;
      }
      
      console.log(`Cache hit for key: ${key.substring(0, 20)}...`);
      return entry.value;
    }
    
    return null;
  }
  
  /**
   * Store a value in the cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @returns {Promise<void>}
   */
  async set(key, value) {
    // Skip if caching is disabled
    if (!FEATURES.CACHING.ENABLED) {
      return;
    }
    
    // Ensure cache is initialized
    await this.initialize();
    
    // Create cache entry
    const entry = {
      value,
      timestamp: Date.now()
    };
    
    // Store in memory cache
    this.memoryCache.set(key, entry);
    
    // Enforce cache size limit
    this._enforceCacheLimit();
    
    // Persist to storage if enabled
    this._persistToStorage();
    
    console.log(`Cached value for key: ${key.substring(0, 20)}...`);
  }
  
  /**
   * Clear the entire cache
   * @returns {Promise<void>}
   */
  async clear() {
    this.memoryCache.clear();
    
    // Clear from storage if persistence is enabled
    if (FEATURES.CACHING.PERSIST_TO_STORAGE && chrome.storage && chrome.storage.local) {
      await new Promise((resolve) => {
        chrome.storage.local.remove(['apiCache'], resolve);
      });
    }
    
    console.log('Cache cleared');
  }
  
  /**
   * Generate a cache key from request parameters
   * @param {string} prompt - The prompt text
   * @param {string} model - The model name
   * @param {number} maxTokens - Maximum tokens
   * @returns {string} Cache key
   */
  generateKey(prompt, model, maxTokens) {
    // Create a deterministic key from the parameters
    return `${model}:${maxTokens}:${this._hashString(prompt)}`;
  }
  
  /**
   * Check if a timestamp is expired
   * @param {number} timestamp - Timestamp to check
   * @returns {boolean} True if expired
   * @private
   */
  _isExpired(timestamp) {
    const ttlMs = FEATURES.CACHING.TTL_HOURS * 60 * 60 * 1000;
    return Date.now() - timestamp > ttlMs;
  }
  
  /**
   * Enforce the cache size limit
   * @private
   */
  _enforceCacheLimit() {
    if (this.memoryCache.size <= CACHE.MAX_SIZE) {
      return;
    }
    
    // Convert to array for sorting
    const entries = Array.from(this.memoryCache.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest entries until we're under the limit
    const entriesToRemove = entries.slice(0, entries.length - CACHE.MAX_SIZE);
    for (const [key] of entriesToRemove) {
      this.memoryCache.delete(key);
    }
    
    console.log(`Removed ${entriesToRemove.length} oldest cache entries`);
  }
  
  /**
   * Persist cache to storage
   * @private
   */
  _persistToStorage() {
    // Skip if persistence is disabled
    if (!FEATURES.CACHING.PERSIST_TO_STORAGE || !chrome.storage || !chrome.storage.local) {
      return;
    }
    
    // Throttle persistence to avoid excessive writes
    if (this._persistTimeout) {
      clearTimeout(this._persistTimeout);
    }
    
    this._persistTimeout = setTimeout(() => {
      try {
        // Convert Map to object for storage
        const cacheObject = {};
        this.memoryCache.forEach((value, key) => {
          cacheObject[key] = value;
        });
        
        // Store in chrome.storage.local
        chrome.storage.local.set({ apiCache: JSON.stringify(cacheObject) }, () => {
          console.log(`Persisted ${this.memoryCache.size} cache entries to storage`);
        });
      } catch (error) {
        console.error('Error persisting cache to storage:', error);
      }
    }, 5000); // Wait 5 seconds to batch multiple changes
  }
  
  /**
   * Create a simple hash of a string
   * @param {string} str - String to hash
   * @returns {string} Hash value
   * @private
   */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36); // Convert to base36 for shorter strings
  }
}
