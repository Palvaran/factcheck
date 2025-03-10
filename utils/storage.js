// utils/storage.js - Update to check both storage types

/**
 * Utility for consistent storage access
 * Ensures all components use the same storage area
 */
export const StorageUtils = {
  /**
   * Get data from storage
   * @param {string|Array<string>} keys Keys to get
   * @returns {Promise<Object>} Object with requested keys and values
   */
  get: function(keys) {
    return new Promise((resolve, reject) => {
      try {
        console.log("StorageUtils.get called with keys:", keys);
        
        // First try local storage
        chrome.storage.local.get(keys, (localResult) => {
          if (chrome.runtime.lastError) {
            console.error("Error in StorageUtils.get local:", chrome.runtime.lastError);
            // Try sync storage if local fails
            this.getFromSync(keys, resolve, reject);
            return;
          }
          
          // Check if we got any results
          const hasValues = Object.keys(localResult).length > 0 && 
                           Object.values(localResult).some(v => v !== undefined && v !== null);
          
          if (hasValues) {
            console.log("StorageUtils.get result from local:", localResult);
            resolve(localResult);
          } else {
            // Try sync storage if local has no values
            this.getFromSync(keys, resolve, reject);
          }
        });
      } catch (error) {
        console.error("Exception in StorageUtils.get:", error);
        reject(error);
      }
    });
  },

  /**
   * Helper to get from sync storage
   */
  getFromSync: function(keys, resolve, reject) {
    chrome.storage.sync.get(keys, (syncResult) => {
      if (chrome.runtime.lastError) {
        console.error("Error in StorageUtils.get sync:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      
      console.log("StorageUtils.get result from sync:", syncResult);
      resolve(syncResult);
    });
  },

  /**
   * Set data in storage (sets in both local and sync for critical data)
   * @param {Object} data Object with keys and values to set
   * @returns {Promise<void>} Promise that resolves when data is set
   */
  set: function(data) {
    return new Promise((resolve, reject) => {
      try {
        console.log("StorageUtils.set called with data:", data);
        
        // For API keys, set in both storages to be safe
        const isAPIKeyData = data.openaiApiKey || data.braveApiKey;
        
        // Always set in local
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            console.error("Error in StorageUtils.set local:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          console.log("StorageUtils.set completed successfully in local");
          
          // Also set in sync for API keys and some settings
          if (isAPIKeyData) {
            chrome.storage.sync.set(data, () => {
              if (chrome.runtime.lastError) {
                console.warn("Warning: Failed to also set in sync storage:", chrome.runtime.lastError);
                // Still resolve since we succeeded in local
                resolve();
              } else {
                console.log("API keys also saved to sync storage");
                resolve();
              }
            });
          } else {
            resolve();
          }
        });
      } catch (error) {
        console.error("Exception in StorageUtils.set:", error);
        reject(error);
      }
    });
  },

  /**
   * Remove data from storage
   * @param {string|Array<string>} keys Keys to remove
   * @returns {Promise<void>} Promise that resolves when data is removed
   */
  remove: function(keys) {
    return new Promise((resolve, reject) => {
      try {
        // Remove from both storages
        chrome.storage.local.remove(keys, () => {
          chrome.storage.sync.remove(keys, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * Clear all data from storage
   * @returns {Promise<void>} Promise that resolves when all data is cleared
   */
  clear: function() {
    return new Promise((resolve, reject) => {
      try {
        // Clear both storages
        chrome.storage.local.clear(() => {
          chrome.storage.sync.clear(() => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }
};