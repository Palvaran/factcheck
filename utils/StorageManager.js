// utils/StorageManager.js - Enhanced storage operations

/**
 * Enhanced storage manager for handling Chrome storage operations
 */
export class StorageManager {
  /**
   * Get items from storage
   * @param {string|Array<string>} keys - Key or array of keys to retrieve
   * @param {string} [storageType='local'] - Storage type ('local' or 'sync')
   * @returns {Promise<object>} - Object containing the requested keys and values
   */
  static async get(keys, storageType = 'local') {
    return new Promise((resolve, reject) => {
      try {
        const storage = storageType === 'sync' ? chrome.storage.sync : chrome.storage.local;
        storage.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Set items in storage
   * @param {object} items - Object containing keys and values to set
   * @param {string} [storageType='local'] - Storage type ('local' or 'sync')
   * @returns {Promise<void>}
   */
  static async set(items, storageType = 'local') {
    return new Promise((resolve, reject) => {
      try {
        const storage = storageType === 'sync' ? chrome.storage.sync : chrome.storage.local;
        storage.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Remove items from storage
   * @param {string|Array<string>} keys - Key or array of keys to remove
   * @param {string} [storageType='local'] - Storage type ('local' or 'sync')
   * @returns {Promise<void>}
   */
  static async remove(keys, storageType = 'local') {
    return new Promise((resolve, reject) => {
      try {
        const storage = storageType === 'sync' ? chrome.storage.sync : chrome.storage.local;
        storage.remove(keys, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Clear all storage
   * @param {string} [storageType='local'] - Storage type ('local' or 'sync')
   * @returns {Promise<void>}
   */
  static async clear(storageType = 'local') {
    return new Promise((resolve, reject) => {
      try {
        const storage = storageType === 'sync' ? chrome.storage.sync : chrome.storage.local;
        storage.clear(() => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Synchronize a key between sync and local storage
   * @param {string} key - Key to synchronize
   * @param {string} [fromType='sync'] - Source storage type
   * @param {string} [toType='local'] - Destination storage type
   * @returns {Promise<boolean>} - True if synchronized, false if source key not found
   */
  static async synchronizeKey(key, fromType = 'sync', toType = 'local') {
    try {
      const sourceData = await this.get(key, fromType);
      
      if (sourceData[key]) {
        const dataToSet = {};
        dataToSet[key] = sourceData[key];
        await this.set(dataToSet, toType);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error synchronizing key ${key}:`, error);
      return false;
    }
  }
}
