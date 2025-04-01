// services/TelemetryService.js - Performance monitoring and telemetry
import { FEATURES } from '../utils/constants.js';

/**
 * Service for tracking performance metrics and anonymous usage telemetry
 */
export class TelemetryService {
  /**
   * Initialize the telemetry service
   */
  constructor() {
    this.metrics = {};
    this.sessionId = this._generateSessionId();
    this.operationTimers = new Map();
    this.enabled = FEATURES.ERROR_HANDLING.ERROR_TELEMETRY;
  }
  
  /**
   * Start timing an operation
   * 
   * @param {string} operationId - Unique identifier for the operation
   * @param {Object} metadata - Additional metadata about the operation
   */
  startOperation(operationId, metadata = {}) {
    if (!this.enabled) return;
    
    this.operationTimers.set(operationId, {
      startTime: Date.now(),
      metadata
    });
  }
  
  /**
   * End timing an operation and record metrics
   * 
   * @param {string} operationId - Unique identifier for the operation
   * @param {Object} result - Result metadata (success, error, etc.)
   * @returns {number} Duration in milliseconds
   */
  endOperation(operationId, result = { success: true }) {
    if (!this.enabled) return 0;
    
    const timer = this.operationTimers.get(operationId);
    if (!timer) return 0;
    
    const duration = Date.now() - timer.startTime;
    this.operationTimers.delete(operationId);
    
    // Record the metric
    this.trackMetric({
      category: 'performance',
      action: operationId,
      duration,
      ...timer.metadata,
      ...result
    });
    
    return duration;
  }
  
  /**
   * Track a specific event
   * 
   * @param {string} category - Event category
   * @param {string} action - Event action
   * @param {Object} metadata - Additional metadata
   */
  trackEvent(category, action, metadata = {}) {
    if (!this.enabled) return;
    
    this.trackMetric({
      category,
      action,
      timestamp: Date.now(),
      ...metadata
    });
  }
  
  /**
   * Track a metric or event
   * 
   * @param {Object} metric - Metric data
   * @private
   */
  trackMetric(metric) {
    if (!this.enabled) return;
    
    // Add session and timestamp information
    const enhancedMetric = {
      ...metric,
      sessionId: this.sessionId,
      timestamp: metric.timestamp || Date.now(),
    };
    
    // Try to add extension version if available
    try {
      if (chrome && chrome.runtime && chrome.runtime.getManifest) {
        enhancedMetric.extension_version = chrome.runtime.getManifest().version;
      }
    } catch (e) {
      // Silently fail if manifest isn't accessible
      enhancedMetric.extension_version = 'unknown';
    }
    
    // Store locally
    const category = metric.category || 'unknown';
    if (!this.metrics[category]) {
      this.metrics[category] = [];
    }
    this.metrics[category].push(enhancedMetric);
    
    // Limit stored metrics to prevent memory issues
    if (this.metrics[category].length > 100) {
      this.metrics[category] = this.metrics[category].slice(-100);
    }
    
    // Log metric for debugging
    console.log('Telemetry:', enhancedMetric);
    
    // In a production environment, you would send this to your telemetry service
    // This is just a placeholder for the actual implementation
    this._sendTelemetryAsync(enhancedMetric);
  }
  
  /**
   * Get performance metrics for a specific category
   * 
   * @param {string} category - Metric category
   * @returns {Array} Metrics for the category
   */
  getMetrics(category) {
    return this.metrics[category] || [];
  }
  
  /**
   * Clear all stored metrics
   */
  clearMetrics() {
    this.metrics = {};
  }
  
  /**
   * Generate a unique session ID
   * 
   * @returns {string} Session ID
   * @private
   */
  _generateSessionId() {
    return 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }
  
  /**
   * Send telemetry data to the server asynchronously
   * 
   * @param {Object} data - Telemetry data
   * @private
   */
  _sendTelemetryAsync(data) {
    // This is a placeholder for actual telemetry sending
    // In a real implementation, you would send this to your telemetry service
    // using a non-blocking approach
    
    // Safe implementation that works in service worker context
    if (this.enabled && data) {
      try {
        // Just log for now - actual implementation would send to a server
        console.log('Telemetry data (not sent):', this._sanitizeTelemetryData(data));
        
        // In a production environment, you would use a service worker compatible
        // approach to send telemetry data, such as using fetch() which is supported
        // in service workers
      } catch (e) {
        // Silently fail - telemetry should never break functionality
        console.error('Error processing telemetry:', e);
      }
    }
  }
  
  /**
   * Sanitize telemetry data to remove sensitive information
   * 
   * @param {Object} data - Raw telemetry data
   * @returns {Object} Sanitized data
   * @private
   */
  _sanitizeTelemetryData(data) {
    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Remove potentially sensitive fields
    const sensitiveFields = ['text', 'prompt', 'apiKey', 'token', 'email', 'user'];
    
    // Recursively sanitize objects
    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      Object.keys(obj).forEach(key => {
        // Check if this is a sensitive field
        if (sensitiveFields.includes(key.toLowerCase())) {
          // Replace with field type indicator
          obj[key] = `[REDACTED:${typeof obj[key]}]`;
        } else if (typeof obj[key] === 'object') {
          // Recursively sanitize nested objects
          sanitizeObject(obj[key]);
        }
      });
    };
    
    sanitizeObject(sanitized);
    return sanitized;
  }
}
