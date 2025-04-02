// config.js - Configuration utilities for the Fact Check extension

// Debug configuration
export const Config = {
  // Debug flag - set to false for production
  DEBUG: false,
  
  // Debug logging helper
  debugLog(...args) {
    if (this.DEBUG) console.log('[FactCheck]', ...args);
  },
  
  // Check if the extension is already initialized
  isInitialized() {
    return !!window.__FACT_CHECK_INITIALIZED;
  },
  
  // Mark as initialized
  markInitialized() {
    window.__FACT_CHECK_INITIALIZED = true;
  }
};
