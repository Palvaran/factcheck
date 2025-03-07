// utils/storage.js
export class StorageUtils {
    static get(keys) {
      return new Promise((resolve) => {
        chrome.storage.sync.get(keys, (result) => {
          resolve(result);
        });
      });
    }
    
    static set(data) {
      return new Promise((resolve) => {
        chrome.storage.sync.set(data, () => {
          resolve();
        });
      });
    }
    
    static getLocal(keys) {
      return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => {
          resolve(result);
        });
      });
    }
    
    static setLocal(data) {
      return new Promise((resolve) => {
        chrome.storage.local.set(data, () => {
          resolve();
        });
      });
    }
    
    static clearLocal() {
      return new Promise((resolve) => {
        chrome.storage.local.clear(() => {
          resolve();
        });
      });
    }
  }
  