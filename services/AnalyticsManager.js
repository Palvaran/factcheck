// services/AnalyticsManager.js - Analytics and Supabase integration

import { DebugUtils } from '../utils/debug-utils.js';
import { StorageManager } from '../utils/StorageManager.js';
import { SupabaseClient } from '../options/modules/supabase-client.js';
import { SUPABASE_CONFIG } from '../utils/supabase-config.js';
import { REQUEST } from '../utils/constants.js';

/**
 * Manages analytics and Supabase integration
 */
export class AnalyticsManager {
  constructor() {
    // Constants for batch processing
    this.BATCH_SIZE = 50;  // Maximum number of records per batch
    this.SYNC_INTERVAL = 15 * 60 * 1000;  // 15 minutes
    this.MIN_BATCH_THRESHOLD = 5;  // Minimum records to trigger a batch sync
    this.MAX_RETRY_ATTEMPTS = REQUEST.RETRY.MAX_ATTEMPTS;

    // Track sync status
    this.isSyncing = false;
    this.lastSyncTime = 0;
    this.syncErrorCount = 0;
    this.supabaseClient = null;
  }

  /**
   * Initialize the analytics manager
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      DebugUtils.log("AnalyticsManager", "Initializing Supabase client");
      
      // Create Supabase client
      this.supabaseClient = new SupabaseClient(
        SUPABASE_CONFIG.PROJECT_URL,
        SUPABASE_CONFIG.ANON_KEY
      );
      
      // Explicitly initialize the client to set initialized=true
      try {
        await this.supabaseClient.initialize();
        DebugUtils.log("AnalyticsManager", "Supabase client initialized successfully");
      } catch (initError) {
        DebugUtils.error("AnalyticsManager", "Error during initial Supabase initialization:", initError);
        // We'll continue setting up sync even if there's an error
        // The sync function will retry initialization later
      }
      
      // Set up sync interval
      setInterval(() => {
        try {
          this.syncPendingAnalytics();
        } catch (error) {
          DebugUtils.error("AnalyticsManager", 'Periodic sync error:', error);
        }
      }, this.SYNC_INTERVAL);
      
      // Do an initial sync after startup with a short delay
      setTimeout(() => {
        try {
          this.syncPendingAnalytics();
        } catch (error) {
          DebugUtils.error("AnalyticsManager", 'Initial sync error:', error);
        }
      }, 5000);
      
      DebugUtils.log("AnalyticsManager", "Supabase client and sync schedule initialized");
    } catch (error) {
      DebugUtils.error("AnalyticsManager", "Error initializing Supabase:", error);
    }
  }

  /**
   * Record a fact check
   * @param {string} text - Original text
   * @param {string} queryText - Processed query text
   * @param {Object} analyticsData - Additional analytics data
   * @returns {Promise<void>}
   */
  async recordFactCheck(text, queryText, analyticsData) {
    try {
      DebugUtils.log("AnalyticsManager", 'Recording fact check with data:', {
        textLength: analyticsData.textLength,
        domain: analyticsData.domain,
        model: analyticsData.model
      });
      
      // Get current pending analytics to check if we already have some
      const storageBefore = await StorageManager.get(['pendingAnalytics']);
      DebugUtils.log("AnalyticsManager", `Current pendingAnalytics count: ${(storageBefore.pendingAnalytics || []).length}`);
      
      // Add to pending analytics for batch processing
      const pendingAnalytics = storageBefore.pendingAnalytics || [];
      const newAnalyticsItem = {
        timestamp: Date.now(),
        textLength: analyticsData.textLength || 0,
        queryLength: analyticsData.queryLength || 0,
        domain: analyticsData.domain || 'unknown',
        model: analyticsData.model || 'unknown', 
        rating: analyticsData.rating || null,
        searchUsed: analyticsData.searchUsed || false,
        isCredibleSource: analyticsData.isCredibleSource || false,
        isFactCheckSource: analyticsData.isFactCheckSource || false
      };
      
      pendingAnalytics.push(newAnalyticsItem);
      DebugUtils.log("AnalyticsManager", `Added new item to pendingAnalytics, new count: ${pendingAnalytics.length}`);
      
      // Store the updated list
      await StorageManager.set({ pendingAnalytics });
      DebugUtils.log("AnalyticsManager", 'pendingAnalytics saved to storage');
      
      // Verify that it was actually saved
      const storageAfter = await StorageManager.get(['pendingAnalytics']);
      DebugUtils.log("AnalyticsManager", `Verification - pendingAnalytics count after save: ${(storageAfter.pendingAnalytics || []).length}`);
      
      // If we have enough pending records, trigger a sync
      if (pendingAnalytics.length >= this.MIN_BATCH_THRESHOLD && !this.isSyncing) {
        DebugUtils.log("AnalyticsManager", `Reached batch threshold (${pendingAnalytics.length} records), triggering sync`);
        try {
          this.syncPendingAnalytics();
        } catch (error) {
          DebugUtils.error("AnalyticsManager", 'Error triggering sync:', error);
        }
      } else {
        DebugUtils.log("AnalyticsManager", `Not triggering sync yet - ${pendingAnalytics.length}/${this.MIN_BATCH_THRESHOLD} records needed and isSyncing=${this.isSyncing}`);
      }
    } catch (error) {
      DebugUtils.error("AnalyticsManager", 'Error recording fact check:', error);
    }
  }

  /**
   * Record feedback
   * @param {Object} data - Feedback data
   * @returns {Promise<boolean>} - Success status
   */
  async recordFeedback(data) {
    try {
      // Add to pending feedback for batch processing
      const { pendingFeedback = [] } = await StorageManager.get(['pendingFeedback']);
      pendingFeedback.push({
        timestamp: Date.now(),
        analyticsId: data.analyticsId,
        rating: data.rating,
        domain: data.domain || 'unknown'
      });
      
      await StorageManager.set({ pendingFeedback });
      return true;
    } catch (error) {
      DebugUtils.error("AnalyticsManager", 'Error handling track feedback:', error);
      return false;
    }
  }

  /**
   * Sync pending analytics to Supabase
   * @returns {Promise<void>}
   */
  async syncPendingAnalytics() {
    // Prevent concurrent syncs
    if (this.isSyncing) {
      DebugUtils.log("AnalyticsManager", 'Analytics sync already in progress, skipping');
      return;
    }
    
    try {
      this.isSyncing = true;
      DebugUtils.log("AnalyticsManager", 'Starting Supabase analytics sync');
      
      // Check if analytics sharing is enabled
      const { shareAnalytics } = await StorageManager.get(['shareAnalytics']);
      
      if (shareAnalytics === false) {
        DebugUtils.log("AnalyticsManager", 'Analytics sharing disabled, skipping sync');
        return;
      }
      
      // Get pending analytics
      const result = await StorageManager.get(['pendingAnalytics']);
      const pendingAnalytics = result.pendingAnalytics || [];
      
      // Now we can log it safely
      DebugUtils.log("AnalyticsManager", `Found ${pendingAnalytics.length} pending analytics to sync`);
      
      if (!pendingAnalytics || pendingAnalytics.length === 0) {
        DebugUtils.log("AnalyticsManager", 'No pending analytics to sync');
        return;
      }
      
      // If too few records and not enough time has passed, wait for more
      const now = Date.now();
      if (pendingAnalytics.length < this.MIN_BATCH_THRESHOLD && 
          (now - this.lastSyncTime < this.SYNC_INTERVAL * 2) && 
          this.lastSyncTime !== 0) {
        DebugUtils.log("AnalyticsManager", `Only ${pendingAnalytics.length} records pending, waiting for more before syncing`);
        return;
      }
      
      // Initialize Supabase client if needed - With better error handling
      if (!this.supabaseClient) {
        DebugUtils.error("AnalyticsManager", "Supabase client is null! Creating a new instance...");
        this.supabaseClient = new SupabaseClient(
          SUPABASE_CONFIG.PROJECT_URL,
          SUPABASE_CONFIG.ANON_KEY
        );
      }
      
      if (!this.supabaseClient.initialized) {
        DebugUtils.log("AnalyticsManager", "Supabase client not initialized, initializing now");
        try {
          await this.supabaseClient.initialize();
          DebugUtils.log("AnalyticsManager", "Supabase client initialized successfully during sync");
        } catch (initError) {
          DebugUtils.error("AnalyticsManager", "Failed to initialize Supabase client during sync:", initError);
          // We'll attempt to proceed anyway - the supabaseClient methods have their own error handling
        }
      }
      
      // Additional check for client and session ID
      if (!this.supabaseClient.clientId || !this.supabaseClient.sessionId) {
        DebugUtils.warn("AnalyticsManager", "Missing clientId or sessionId in Supabase client");
        try {
          // Try to generate these if missing
          if (!this.supabaseClient.clientId) {
            await this.supabaseClient.getOrCreateClientId();
          }
          if (!this.supabaseClient.sessionId) {
            this.supabaseClient.sessionId = this.supabaseClient.generateSessionId();
          }
        } catch (idError) {
          DebugUtils.error("AnalyticsManager", "Error generating client/session IDs:", idError);
        }
      }
      
      // Create batches of records
      const batches = [];
      for (let i = 0; i < pendingAnalytics.length; i += this.BATCH_SIZE) {
        batches.push(pendingAnalytics.slice(i, i + this.BATCH_SIZE));
      }
      
      DebugUtils.log("AnalyticsManager", `Created ${batches.length} batches for syncing`);
      
      // Process each batch
      let successCount = 0;
      const failedRecords = [];
      
      for (const [batchIndex, batch] of batches.entries()) {
        try {
          DebugUtils.log("AnalyticsManager", `Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} records)`);
          
          // Format data for Supabase
          const formattedBatch = batch.map(item => ({
            domain: item.domain || 'unknown',
            text_length: item.textLength || 0,
            model_used: item.model || 'unknown',
            rating: item.rating || null,
            search_used: item.searchUsed || false,
            is_credible_source: item.isCredibleSource || false,
            is_fact_check_source: item.isFactCheckSource || false,
            client_id: this.supabaseClient.clientId || 'unknown-client',
            session_id: this.supabaseClient.sessionId || 'unknown-session',
            timestamp: new Date(item.timestamp).toISOString()
          }));
          
          DebugUtils.log("AnalyticsManager", `Sending batch ${batchIndex + 1} to Supabase with ${formattedBatch.length} records`);
          
          // Send the batch to Supabase
          const result = await this.supabaseClient.trackFactCheckBatch(formattedBatch);
          
          if (result && result.success) {
            successCount += batch.length;
            DebugUtils.log("AnalyticsManager", `Successfully synced batch ${batchIndex + 1}, total success: ${successCount}`);
          } else {
            DebugUtils.error("AnalyticsManager", `Failed to sync batch ${batchIndex + 1}:`, result?.error || 'Unknown error');
            // Mark these records for retry
            failedRecords.push(...batch);
          }
        } catch (error) {
          DebugUtils.error("AnalyticsManager", `Error processing batch ${batchIndex + 1}:`, error);
          // Mark these records for retry
          failedRecords.push(...batch);
        }
      }
      
      // Update storage to remove successfully synced records
      if (successCount > 0 || failedRecords.length > 0) {
        // If we have records to retry, keep them in pending
        const updatedPending = failedRecords.length > 0 ? failedRecords : [];
        
        await StorageManager.set({ 
          pendingAnalytics: updatedPending,
          lastSyncTime: Date.now(),
          lastSyncResult: {
            success: successCount > 0,
            processed: pendingAnalytics.length,
            successful: successCount,
            failed: failedRecords.length,
            timestamp: Date.now()
          }
        });
        
        // Reset error count on success
        if (successCount > 0 && failedRecords.length === 0) {
          this.syncErrorCount = 0;
        } else if (failedRecords.length > 0) {
          this.syncErrorCount++;
        }
        
        DebugUtils.log("AnalyticsManager", `Sync completed. ${successCount} records synced successfully, ${failedRecords.length} failed.`);
        console.log(`Supabase sync completed: ${successCount} records synced, ${failedRecords.length} failed`);
      }
      
      // Update last sync time
      this.lastSyncTime = Date.now();
    } catch (error) {
      DebugUtils.error("AnalyticsManager", 'Error syncing analytics:', error);
      this.syncErrorCount++;
    } finally {
      this.isSyncing = false;
      
      // If we've had too many errors, slow down sync attempts
      if (this.syncErrorCount > this.MAX_RETRY_ATTEMPTS) {
        DebugUtils.warn("AnalyticsManager", `Too many sync errors (${this.syncErrorCount}), extending sync interval`);
        // We'll rely on the regular interval, but could implement backoff here
      }
    }
  }

  /**
   * Force immediate sync of pending analytics regardless of threshold
   * @returns {Promise<object>} Result of sync operation
   */
  async forceSyncNow() {
    DebugUtils.log("AnalyticsManager", "Force sync requested via extension UI");
    
    // Ensure we're not already syncing
    if (this.isSyncing) {
      DebugUtils.log("AnalyticsManager", "Already syncing, waiting for completion");
      // Wait for current sync to complete (up to 10 seconds)
      for (let i = 0; i < 10; i++) {
        if (!this.isSyncing) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      if (this.isSyncing) {
        return { success: false, error: "Sync already in progress and didn't complete in time" };
      }
    }
    
    try {
      // Skip all thresholds and force an immediate sync
      const { pendingAnalytics = [] } = await StorageManager.get(['pendingAnalytics']);
      
      if (pendingAnalytics.length === 0) {
        DebugUtils.log("AnalyticsManager", "No pending analytics to sync");
        return { success: true, message: "No pending analytics to sync" };
      }
      
      DebugUtils.log("AnalyticsManager", `Force syncing ${pendingAnalytics.length} pending analytics`);
      
      // Call the sync function directly
      await this.syncPendingAnalytics();
      
      return { success: true, message: `Forced sync completed for ${pendingAnalytics.length} records` };
    } catch (error) {
      DebugUtils.error("AnalyticsManager", "Force sync error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current sync status
   * @returns {Promise<Object>} Sync status object
   */
  async getSyncStatus() {
    try {
      const data = await StorageManager.get(['pendingAnalytics']);
      return {
        isSyncing: this.isSyncing,
        lastSyncTime: this.lastSyncTime,
        pendingCount: (data.pendingAnalytics || []).length,
        errorCount: this.syncErrorCount
      };
    } catch (error) {
      return { 
        isSyncing: this.isSyncing, 
        lastSyncTime: this.lastSyncTime,
        pendingCount: 0,
        errorCount: this.syncErrorCount,
        error: error.message
      };
    }
  }
}
