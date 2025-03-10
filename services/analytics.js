// services/analytics.js
import { CACHE, REQUEST, STYLES } from '../utils/constants.js';

// Constants for analytics
const MIN_BATCH_THRESHOLD = 5;  // Minimum records to trigger a batch sync

export class AnalyticsService {
  /**
   * Record a fact check event
   * Stores data locally and triggers direct tracking through the background script
   * 
   * @param {string} text The full text that was checked
   * @param {string} queryText The processed query sent to the AI
   * @param {Object} options Additional options (model, rating, etc.)
   */
  static recordFactCheck(text, queryText, options = {}) {
    console.log("recordFactCheck called with text length:", text?.length);
    
    // Create analytics data for local storage
    const analyticsData = {
      timestamp: Date.now(),
      textLength: text ? text.length : 0,
      queryLength: queryText ? queryText.length : 0,
      domain: options.domain || 'unknown',
      model: options.model || 'unknown',
      rating: options.rating || null,
      searchUsed: options.searchUsed || false,
      isCredibleSource: options.isCredibleSource || false,
      isFactCheckSource: options.isFactCheckSource || false
    };
    
    // CHANGED: Store locally first - this is guaranteed to work
    this.storeLocalAnalytics(analyticsData);
    this.queueForSync(analyticsData);
    
    // THEN try to notify the background script as a bonus (but don't worry if it fails)
    console.log("Attempting direct message to background (optional)");
    try {
      chrome.runtime.sendMessage({
        action: 'trackFactCheck',
        data: analyticsData
      }, response => {
        if (chrome.runtime.lastError) {
          console.log("Direct send failed (already queued for sync):", chrome.runtime.lastError.message);
          return;
        }
        
        if (response && response.success) {
          console.log("trackFactCheck message delivered successfully");
        }
      });
    } catch (error) {
      console.log("Direct send failed (already queued for sync)");
    }
  }
  
  /**
   * Store analytics data locally
   * @param {Object} analyticsData Data to store
   */
  static storeLocalAnalytics(analyticsData) {
    chrome.storage.local.get(['factCheckAnalytics'], (data) => {
      let analytics = data.factCheckAnalytics || [];
      analytics.push(analyticsData);
      
      // Keep only last N entries based on CACHE.MAX_SIZE
      if (analytics.length > CACHE.MAX_SIZE) {
        analytics = analytics.slice(-CACHE.MAX_SIZE);
      }
      
      chrome.storage.local.set({ factCheckAnalytics: analytics });
    });
  }
  
  /**
   * Queue analytics data for syncing to Supabase
   * @param {Object} analyticsData Data to queue
   */
  static queueForSync(analyticsData) {
    // Store data in pendingAnalytics for batch processing
    chrome.storage.local.get(['pendingAnalytics'], (data) => {
      let pendingAnalytics = data.pendingAnalytics || [];
      console.log("DEBUG: Current pendingAnalytics before adding:", pendingAnalytics);
      pendingAnalytics.push(analyticsData);
      console.log("DEBUG: pendingAnalytics after adding:", pendingAnalytics);
      
      // Store the updated pending analytics
      chrome.storage.local.set({ pendingAnalytics }, () => {
        console.log("DEBUG: Storage set complete for pendingAnalytics");
        
        // If enough records accumulated, ATTEMPT to notify background script to sync
        // but don't worry if it fails - the periodic sync will handle it eventually
        if (pendingAnalytics.length >= MIN_BATCH_THRESHOLD) {
          console.log(`Reached batch threshold (${pendingAnalytics.length} records), attempting to notify background`);
          
          try {
            // Attempt to wake up and notify the service worker - but don't rely on it
            chrome.runtime.sendMessage({ action: 'syncAnalytics' })
              .catch(err => {
                console.log("Background sync notification failed, will be handled by next periodic sync");
              });
          } catch (error) {
            console.log("Background service worker not ready, will sync on next periodic interval");
          }
        } else {
          console.log(`Currently ${pendingAnalytics.length} analytics entries pending (need ${MIN_BATCH_THRESHOLD} to trigger sync)`);
        }
      });
    });
  }
  
  /**
   * Record user feedback
   * @param {string} rating The feedback rating ('positive' or 'negative')
   * @param {Object} tab The current browser tab
   * @param {string} analyticsId Associated analytics ID if available
   */
  static recordFeedback(rating, tab, analyticsId = null) {
    // Get domain if available
    let domain = 'unknown';
    if (tab && tab.url) {
      try {
        domain = new URL(tab.url).hostname;
      } catch (e) {
        console.error("Error extracting domain:", e);
      }
    }
    
    // Store feedback data locally
    const feedbackData = {
      timestamp: Date.now(),
      rating: rating,
      domain: domain,
      analyticsId: analyticsId
    };
    
    // Store locally
    this.storeLocalFeedback(feedbackData);
    
    // Queue for Supabase sync
    this.queueFeedbackForSync(feedbackData);
  }
  
  /**
   * Store feedback data locally
   * @param {Object} feedbackData Data to store
   */
  static storeLocalFeedback(feedbackData) {
    chrome.storage.local.get(['factCheckFeedback'], (data) => {
      let feedback = data.factCheckFeedback || [];
      feedback.push(feedbackData);
      
      // Keep only the last N feedback entries based on CACHE.MAX_SIZE
      if (feedback.length > CACHE.MAX_SIZE) {
        feedback = feedback.slice(-CACHE.MAX_SIZE);
      }
      
      chrome.storage.local.set({ factCheckFeedback: feedback });
    });
  }
  
  /**
   * Queue feedback data for syncing to Supabase
   * @param {Object} feedbackData Data to queue
   */
  static queueFeedbackForSync(feedbackData) {
    // Add to pending feedback for batch processing
    chrome.storage.local.get(['pendingFeedback'], (data) => {
      let pendingFeedback = data.pendingFeedback || [];
      pendingFeedback.push(feedbackData);
      
      // Store the updated pending feedback
      chrome.storage.local.set({ pendingFeedback }, () => {
        // Try sending to background script for processing
        try {
          chrome.runtime.sendMessage({
            action: 'trackFeedback',
            data: feedbackData
          }, response => {
            // Handle potential errors
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.log('Feedback will be synced later. Error:', lastError.message);
              return;
            }
            
            if (response && response.success) {
              console.log('Feedback queued for syncing');
            }
          });
        } catch (error) {
          console.log('Feedback stored locally, will sync later');
        }
      });
    });
  }
  
  /**
   * Manually trigger a sync of pending analytics data
   * Useful for critical data that shouldn't wait for the next batch
   * @returns {Promise<Object>} Result of the sync operation
   */
  static forceSyncNow() {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          action: 'syncAnalytics'
        }, response => {
          // Handle potential errors
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.log('Error during forced sync:', lastError.message);
            reject(new Error(lastError.message));
            return;
          }
          
          if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Unknown error'));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Get current sync status
   * @returns {Promise<Object>} Current sync status
   */
  static getSyncStatus() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          action: 'getSyncStatus'
        }, response => {
          // Handle potential errors
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.log('Error getting sync status:', lastError.message);
            resolve({ isSyncing: false, error: lastError.message });
            return;
          }
          
          resolve(response || { isSyncing: false, error: 'No response from background script' });
        });
      } catch (error) {
        resolve({ isSyncing: false, error: error.message });
      }
    });
  }
  
  /**
   * Format a feedback status with appropriate color
   * @param {string} rating - The feedback rating 
   * @returns {Object} Formatted status with color and text
   */
  static formatFeedbackStatus(rating) {
    // Don't try to use window.matchMedia in service worker - use a safer approach
    const colorScheme = STYLES.COLORS.LIGHT; // Default to light mode
    
    if (rating === 'positive') {
      return {
        color: colorScheme.SUCCESS,
        text: 'Positive Feedback'
      };
    } else if (rating === 'negative') {
      return {
        color: colorScheme.ERROR,
        text: 'Negative Feedback'
      };
    } else {
      return {
        color: colorScheme.WARNING,
        text: 'Mixed Feedback'
      };
    }
  }
}