// utils/storage.js - Update to check both storage types
import { DebugUtils } from './debug-utils.js';

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
        DebugUtils.log("Storage", "StorageUtils.get called with keys:", keys);
        
        // FIRST try sync storage for critical settings
        chrome.storage.sync.get(keys, (syncResult) => {
          if (chrome.runtime.lastError) {
            DebugUtils.error("Storage", "Error in StorageUtils.get sync:", chrome.runtime.lastError);
            // Fall back to local storage
            this.getFromLocal(keys, resolve, reject);
            return;
          }
          
          // THEN try local storage and merge results, prioritizing sync for provider settings
          chrome.storage.local.get(keys, (localResult) => {
            if (chrome.runtime.lastError) {
              DebugUtils.error("Storage", "Error in StorageUtils.get local:", chrome.runtime.lastError);
              resolve(syncResult); // Just use sync results
              return;
            }
            
            // Merge results - LOCAL OVERRIDES SYNC EXCEPT FOR aiProvider
            const mergedResult = { ...localResult };
            
            // For aiProvider specifically, prefer sync storage if available
            if (keys.includes('aiProvider') && syncResult.aiProvider) {
              mergedResult.aiProvider = syncResult.aiProvider;
            }
            
            DebugUtils.log("Storage", "StorageUtils.get merged result:", mergedResult);
            resolve(mergedResult);
          });
        });
      } catch (error) {
        DebugUtils.error("Storage", "Exception in StorageUtils.get:", error);
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
        DebugUtils.error("Storage", "Error in StorageUtils.get sync:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      
      DebugUtils.log("Storage", "StorageUtils.get result from sync:", syncResult);
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
        DebugUtils.log("Storage", "StorageUtils.set called with data:", data);
        
        // ALWAYS set in both storages for critical keys
        const criticalKeys = ['openaiApiKey', 'braveApiKey', 'anthropicApiKey', 'aiProvider'];
        const hasCriticalKeys = Object.keys(data).some(key => criticalKeys.includes(key));
        
        // Always set in local storage first
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            DebugUtils.error("Storage", "Error in StorageUtils.set local:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          // Log success
          DebugUtils.log("Storage", "Successfully saved to local storage");
          
          // Always also save to sync storage for consistency
          chrome.storage.sync.set(data, () => {
            if (chrome.runtime.lastError) {
              DebugUtils.warn("Storage", "Warning: Failed to save to sync storage:", chrome.runtime.lastError);
              // Still resolve since we succeeded in local
            } else {
              DebugUtils.log("Storage", "Also saved to sync storage");
            }
            resolve();
          });
        });
      } catch (error) {
        DebugUtils.error("Storage", "Exception in StorageUtils.set:", error);
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
        DebugUtils.log("Storage", "Removing keys:", keys);
        // Remove from both storages
        chrome.storage.local.remove(keys, () => {
          chrome.storage.sync.remove(keys, () => {
            if (chrome.runtime.lastError) {
              DebugUtils.error("Storage", "Error removing keys:", chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              DebugUtils.log("Storage", "Keys removed successfully");
              resolve();
            }
          });
        });
      } catch (error) {
        DebugUtils.error("Storage", "Exception in remove:", error);
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
        DebugUtils.log("Storage", "Clearing all storage");
        // Clear both storages
        chrome.storage.local.clear(() => {
          chrome.storage.sync.clear(() => {
            if (chrome.runtime.lastError) {
              DebugUtils.error("Storage", "Error clearing storage:", chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              DebugUtils.log("Storage", "Storage cleared successfully");
              resolve();
            }
          });
        });
      } catch (error) {
        DebugUtils.error("Storage", "Exception in clear:", error);
        reject(error);
      }
    });
  }
};