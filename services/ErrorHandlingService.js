// services/ErrorHandlingService.js - Comprehensive error handling and recovery
import { FEATURES, MODELS } from '../utils/constants.js';
import { RetryUtils } from '../utils/RetryUtils.js';

/**
 * Service for handling errors and implementing recovery strategies
 */
export class ErrorHandlingService {
  /**
   * Categorize an error to determine the appropriate response
   * 
   * @param {Error} error - The error to categorize
   * @returns {string} Error category
   */
  static categorizeError(error) {
    if (!error) return 'UNKNOWN';
    
    // Check for rate limiting
    if (RetryUtils.isRateLimitError(error)) {
      return 'RATE_LIMIT';
    }
    
    // Check for authentication errors
    if (RetryUtils.isAuthError(error)) {
      return 'AUTH_ERROR';
    }
    
    // Check for timeout/network errors
    if (RetryUtils.isTemporaryError(error)) {
      return 'TEMPORARY';
    }
    
    // Check for content policy violations
    if (error.message && (
      error.message.toLowerCase().includes('content policy') ||
      error.message.toLowerCase().includes('content filter') ||
      error.message.toLowerCase().includes('violates') ||
      error.message.toLowerCase().includes('inappropriate')
    )) {
      return 'CONTENT_POLICY';
    }
    
    // Check for context length errors
    if (error.message && (
      error.message.toLowerCase().includes('context length') ||
      error.message.toLowerCase().includes('token limit') ||
      error.message.toLowerCase().includes('too long')
    )) {
      return 'CONTEXT_LENGTH';
    }
    
    // Default to unknown error
    return 'UNKNOWN';
  }
  
  /**
   * Get a recovery strategy for a specific error type
   * 
   * @param {string} errorType - The type of error
   * @param {Object} context - Additional context about the operation
   * @returns {Object} Recovery strategy
   */
  static getRecoveryStrategy(errorType, context = {}) {
    // Skip if error handling features are disabled
    if (!FEATURES.ERROR_HANDLING.RETRY_MECHANISM && !FEATURES.ERROR_HANDLING.FALLBACK_MODELS) {
      return { retry: false, wait: 0 };
    }
    
    const { provider = 'openai', model = null } = context;
    
    // Define recovery strategies for different error types
    const strategies = {
      'RATE_LIMIT': { 
        wait: 5000, 
        retry: true, 
        maxRetries: 3,
        fallbackModel: false,
        reducePromptSize: false,
        userMessage: 'Rate limit exceeded. Retrying after a short delay...'
      },
      'TEMPORARY': { 
        wait: 2000, 
        retry: true, 
        maxRetries: 3,
        fallbackModel: false,
        reducePromptSize: false,
        userMessage: 'Temporary error occurred. Retrying...'
      },
      'AUTH_ERROR': { 
        wait: 0, 
        retry: false, 
        fallbackModel: false,
        reducePromptSize: false,
        userMessage: 'Authentication error. Please check your API keys.'
      },
      'CONTENT_POLICY': { 
        wait: 0, 
        retry: false, 
        fallbackModel: true,
        reducePromptSize: true,
        userMessage: 'Content policy violation. Trying a different approach...'
      },
      'CONTEXT_LENGTH': { 
        wait: 0, 
        retry: true, 
        maxRetries: 1,
        fallbackModel: true,
        reducePromptSize: true,
        userMessage: 'Content too long. Reducing size and retrying...'
      },
      'UNKNOWN': { 
        wait: 1000, 
        retry: true, 
        maxRetries: 2,
        fallbackModel: true,
        reducePromptSize: false,
        userMessage: 'An error occurred. Trying again...'
      }
    };
    
    // Get the base strategy
    const strategy = strategies[errorType] || strategies.UNKNOWN;
    
    // If fallback model is needed, select appropriate fallback
    if (strategy.fallbackModel && FEATURES.ERROR_HANDLING.FALLBACK_MODELS) {
      strategy.fallbackModel = this.selectFallbackModel(model, provider);
    }
    
    return strategy;
  }
  
  /**
   * Select a fallback model when the primary model fails
   * 
   * @param {string} currentModel - The model that failed
   * @param {string} provider - The AI provider ('openai' or 'anthropic')
   * @returns {string} Fallback model name
   */
  static selectFallbackModel(currentModel, provider) {
    // Get the appropriate model set
    const models = provider === 'anthropic' ? MODELS.ANTHROPIC : MODELS.OPENAI;
    
    // If current model is already the fastest, no fallback needed
    if (currentModel === models.FAST) {
      return currentModel;
    }
    
    // If using advanced model, fall back to standard
    if (currentModel === models.ADVANCED) {
      return models.STANDARD;
    }
    
    // Otherwise fall back to the fastest model
    return models.FAST;
  }
  
  /**
   * Create a user-friendly error message
   * 
   * @param {Error} error - The original error
   * @param {Object} context - Additional context
   * @returns {string} User-friendly error message
   */
  static createUserFriendlyMessage(error, context = {}) {
    const errorType = this.categorizeError(error);
    const strategy = this.getRecoveryStrategy(errorType, context);
    
    // If we have a specific user message for this error type, use it
    if (strategy.userMessage) {
      return strategy.userMessage;
    }
    
    // Generic error messages based on error type
    switch (errorType) {
      case 'RATE_LIMIT':
        return 'The AI service is currently busy. Please try again in a moment.';
      case 'AUTH_ERROR':
        return 'There was an authentication problem. Please check your API keys in the extension settings.';
      case 'TEMPORARY':
        return 'A temporary error occurred. Please try again.';
      case 'CONTENT_POLICY':
        return 'The content may violate the AI service policies. Please try different text.';
      case 'CONTEXT_LENGTH':
        return 'The text is too long for the AI to process. Please try with shorter text.';
      default:
        return 'An error occurred while processing your request. Please try again.';
    }
  }
  
  /**
   * Log error details for debugging and telemetry
   * 
   * @param {Error} error - The error to log
   * @param {Object} context - Additional context
   */
  static logError(error, context = {}) {
    const errorType = this.categorizeError(error);
    const { operation = 'unknown', model = 'unknown', provider = 'unknown' } = context;
    
    console.error(`[${errorType}] Error in ${operation} using ${provider}/${model}:`, error.message);
    
    // Send telemetry if enabled
    if (FEATURES.ERROR_HANDLING.ERROR_TELEMETRY) {
      try {
        // Prepare telemetry data (no personal information)
        const telemetryData = {
          errorType,
          operation,
          provider,
          modelType: model ? (model.includes('gpt-4') ? 'gpt4' : model.includes('claude-3') ? 'claude3' : 'other') : 'unknown',
          message: error.message.substring(0, 100), // Truncate message
          timestamp: new Date().toISOString(),
          statusCode: error.status || error.statusCode || 0
        };
        
        // In a real implementation, you would send this to your telemetry service
        // This is just a placeholder
        console.log('Error telemetry:', telemetryData);
      } catch (telemetryError) {
        console.error('Error sending telemetry:', telemetryError);
      }
    }
  }
}
