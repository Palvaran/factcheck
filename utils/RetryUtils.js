// utils/RetryUtils.js - Retry mechanisms with exponential backoff
import { FEATURES } from './constants.js';

/**
 * Utility class for handling retries with exponential backoff
 */
export class RetryUtils {
  /**
   * Execute an operation with retry logic and exponential backoff
   * 
   * @param {Function} operation - Async function to execute
   * @param {Object} options - Retry options
   * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
   * @param {number} options.initialDelay - Initial delay in ms before first retry (default: 1000)
   * @param {number} options.maxDelay - Maximum delay in ms between retries (default: 30000)
   * @param {Function} options.shouldRetry - Function to determine if error is retryable (default: all errors)
   * @param {Function} options.onRetry - Callback function executed before each retry
   * @returns {Promise<any>} Result of the operation
   */
  static async retryWithBackoff(operation, options = {}) {
    // Skip retry mechanism if disabled in feature flags
    if (!FEATURES.ERROR_HANDLING.RETRY_MECHANISM) {
      return operation();
    }
    
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      shouldRetry = () => true,
      onRetry = () => {}
    } = options;
    
    let retries = 0;
    let delay = initialDelay;
    
    while (true) {
      try {
        return await operation();
      } catch (error) {
        retries++;
        
        // If we've reached max retries or the error isn't retryable, throw
        if (retries >= maxRetries || !shouldRetry(error)) {
          throw error;
        }
        
        // Calculate next delay with jitter to prevent thundering herd
        const jitter = Math.random() * 0.3 + 0.85; // Random between 0.85-1.15
        delay = Math.min(delay * 2 * jitter, maxDelay);
        
        console.log(`Retry ${retries}/${maxRetries} after ${Math.round(delay)}ms: ${error.message}`);
        
        // Execute onRetry callback with error and retry information
        onRetry(error, { retryCount: retries, delay, maxRetries });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  /**
   * Determine if an error is related to rate limiting
   * 
   * @param {Error} error - The error to check
   * @returns {boolean} True if it's a rate limit error
   */
  static isRateLimitError(error) {
    if (!error) return false;
    
    // Check error message
    if (error.message && (
      error.message.toLowerCase().includes('rate limit') ||
      error.message.toLowerCase().includes('too many requests') ||
      error.message.toLowerCase().includes('quota exceeded')
    )) {
      return true;
    }
    
    // Check status code
    if (error.status === 429 || error.statusCode === 429) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Determine if an error is related to authentication
   * 
   * @param {Error} error - The error to check
   * @returns {boolean} True if it's an auth error
   */
  static isAuthError(error) {
    if (!error) return false;
    
    // Check error message
    if (error.message && (
      error.message.toLowerCase().includes('unauthorized') ||
      error.message.toLowerCase().includes('authentication') ||
      error.message.toLowerCase().includes('invalid key') ||
      error.message.toLowerCase().includes('invalid api key')
    )) {
      return true;
    }
    
    // Check status code
    if (error.status === 401 || error.statusCode === 401 ||
        error.status === 403 || error.statusCode === 403) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Determine if an error is temporary/transient
   * 
   * @param {Error} error - The error to check
   * @returns {boolean} True if it's a temporary error
   */
  static isTemporaryError(error) {
    if (!error) return false;
    
    // Check error message
    if (error.message && (
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('connection') ||
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('temporarily') ||
      error.message.toLowerCase().includes('unavailable') ||
      error.message.toLowerCase().includes('overloaded')
    )) {
      return true;
    }
    
    // Check status code for server errors
    if (error.status >= 500 || error.statusCode >= 500) {
      return true;
    }
    
    return false;
  }
}
