// utils/debug-utils.js - Centralized debugging utilities

// Global debug state - controls all logging throughout the extension
let isDebugEnabled = false;

/**
 * Utility for consistent debug logging across the extension
 */
export const DebugUtils = {
  /**
   * Enable or disable debug logging
   * @param {boolean} enabled - Whether to enable debug logging
   */
  setDebugEnabled(enabled) {
    isDebugEnabled = enabled;
    if (enabled) {
      console.log('Debug logging enabled');
    }
  },
  
  /**
   * Check if debug is enabled
   * @returns {boolean} Whether debugging is enabled
   */
  isEnabled() {
    return isDebugEnabled;
  },
  
  /**
   * Log debug message if debugging is enabled
   * @param {string} component - Component name for the log
   * @param {string} message - Message to log
   * @param {any} data - Optional data to log
   */
  log(component, message, data) {
    if (!isDebugEnabled) return;
    
    if (data !== undefined) {
      console.log(`[${component}] ${message}`, data);
    } else {
      console.log(`[${component}] ${message}`);
    }
  },
  
  /**
   * Log error message (always shown regardless of debug setting)
   * @param {string} component - Component name for the log
   * @param {string} message - Message to log
   * @param {Error|any} error - Error object or data
   */
  error(component, message, error) {
    console.error(`[${component}] ${message}`, error);
  },
  
  /**
   * Log warning message (always shown regardless of debug setting)
   * @param {string} component - Component name for the log
   * @param {any} data - Optional data to log
   */
  warn(component, message, data) {
    if (data !== undefined) {
      console.warn(`[${component}] ${message}`, data);
    } else {
      console.warn(`[${component}] ${message}`);
    }
  }
};