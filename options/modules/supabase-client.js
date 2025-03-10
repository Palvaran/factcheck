// modules/supabase-client.js
/**
 * Supabase client for analytics data tracking
 * Handles sending analytics data to Supabase when user has opted in
 */
export class SupabaseClient {
  constructor(supabaseUrl, supabaseKey) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.clientId = null;
    this.sessionId = null;
    this.initialized = false;
    this.lastError = null;
  }

  /**
   * Initialize the Supabase client with proper identifiers
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Validate configuration
      if (!this.supabaseUrl || !this.supabaseKey) {
        throw new Error("Missing Supabase URL or API key");
      }
      
      // Make sure URL is formatted properly
      if (!this.supabaseUrl.startsWith("https://")) {
        throw new Error("Supabase URL must start with https://");
      }
      
      // Validate API key format (basic check)
      if (this.supabaseKey.length < 10) {
        throw new Error("Supabase API key appears to be invalid");
      }
      
      // Get or create anonymous client ID (persists across sessions)
      await this.getOrCreateClientId();
      
      // Create a new session ID for this browser session
      this.sessionId = this.generateSessionId();
      
      // Test connection to Supabase
      await this.testConnection();
      
      this.initialized = true;
      console.log("Supabase client initialized");
    } catch (error) {
      this.lastError = error.message;
      console.error("Failed to initialize Supabase client:", error);
      throw error;
    }
  }
  
  /**
   * Test connection to Supabase
   */
  async testConnection() {
    try {
      // Attempt a simple ping to Supabase
      const response = await fetch(`${this.supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase connection error: ${response.status} ${response.statusText}. Details: ${errorText}`);
      }
      
      return true;
    } catch (error) {
      console.error("Supabase connection test failed:", error);
      throw new Error(`Supabase connection failed: ${error.message}`);
    }
  }

  /**
   * Get or create a persistent anonymous client ID
   */
  async getOrCreateClientId() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['anonymousClientId'], (result) => {
        if (result.anonymousClientId) {
          this.clientId = result.anonymousClientId;
          resolve(this.clientId);
        } else {
          // Create a new anonymous ID
          this.clientId = this.generateClientId();
          chrome.storage.local.set({ anonymousClientId: this.clientId }, () => {
            resolve(this.clientId);
          });
        }
      });
    });
  }

  /**
   * Generate a new anonymous client ID
   * This should be sufficiently random but not contain PII
   */
  generateClientId() {
    // Create a random ID - we're avoiding UUIDs that might be fingerprintable
    // but still want something collision-resistant
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate a session ID for grouping related checks in a browser session
   */
  generateSessionId() {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Track a fact check event in Supabase
   * @param {Object} factCheckData Data about the fact check
   * @returns {Promise<Object>} The response from Supabase or null if tracking disabled
   */
  async trackFactCheck(factCheckData) {
    try {
      // Check if analytics sharing is enabled
      const { shareAnalytics } = await new Promise(resolve => {
        chrome.storage.sync.get(['shareAnalytics'], resolve);
      });
      
      // Exit if user has opted out
      if (shareAnalytics === false) {
        console.log("Analytics sharing disabled, not sending data to Supabase");
        return null;
      }
      
      // Make sure client is initialized
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Prepare anonymized data - strip out any content that might be sensitive
      const analyticsData = {
        domain: factCheckData.domain || 'unknown',
        text_length: factCheckData.textLength || 0,
        model_used: factCheckData.model || 'unknown',
        rating: factCheckData.rating || null,
        search_used: factCheckData.searchUsed || false,
        client_id: this.clientId,
        session_id: this.sessionId
      };
      
      console.log("Sending data to Supabase:", analyticsData);
      
      // Send data to Supabase
      const response = await fetch(`${this.supabaseUrl}/rest/v1/fact_check_analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(analyticsData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${response.status} ${response.statusText}. Details: ${errorText}`);
      }
      
      // Check if response has content
      const contentType = response.headers.get("content-type");
      
      // Only try to parse JSON if content exists and is JSON
      if (contentType && contentType.includes("application/json")) {
        // Response may be empty even with 201 success
        const responseText = await response.text();
        
        if (responseText.trim()) {
          const data = JSON.parse(responseText);
          console.log("Supabase trackFactCheck successful:", data);
          return data;
        } else {
          console.log("Supabase trackFactCheck successful, no content returned");
          return { success: true, message: "Record created" };
        }
      } else {
        console.log("Supabase trackFactCheck successful, non-JSON response");
        return { success: true, status: response.status };
      }
    } catch (error) {
      this.lastError = error.message;
      console.error("Error tracking fact check in Supabase:", error);
      return { success: false, error: error.message };
    }
  }
  
  /**
 * Track multiple fact checks in a single batch request
 * @param {Array} factCheckBatch Array of fact check data objects
 * @returns {Promise<Object>} Response from Supabase
 */
  async trackFactCheckBatch(factCheckBatch) {
    if (!factCheckBatch || factCheckBatch.length === 0) {
      console.log("No data to batch");
      return { success: true, message: "No data to batch", count: 0 };
    }
    
    try {
      // Check if analytics sharing is enabled
      const { shareAnalytics } = await new Promise(resolve => {
        chrome.storage.sync.get(['shareAnalytics'], resolve);
      });
      
      // Exit if user has opted out
      if (shareAnalytics === false) {
        console.log("Analytics sharing disabled, not sending batch data to Supabase");
        return { success: true, message: "Analytics sharing disabled", count: 0 };
      }
      
      // Make sure client is initialized
      if (!this.initialized) {
        console.log("Supabase client not initialized, initializing now in trackFactCheckBatch");
        try {
          await this.initialize();
          console.log("Supabase client initialized successfully in trackFactCheckBatch");
        } catch (error) {
          console.error("Failed to initialize Supabase client:", error);
          return { success: false, error: `Client initialization failed: ${error.message}` };
        }
      }
      
      // Verify we have required fields
      if (!this.clientId || !this.sessionId) {
        console.error("Missing clientId or sessionId, cannot send data");
        return { success: false, error: "Missing clientId or sessionId" };
      }
      
      // Validate supabaseUrl and key
      if (!this.supabaseUrl || !this.supabaseKey) {
        console.error("Missing Supabase URL or API key");
        return { success: false, error: "Missing Supabase URL or API key" };
      }
      
      console.log(`Sending batch of ${factCheckBatch.length} records to Supabase`);
      console.log(`Target endpoint: ${this.supabaseUrl}/rest/v1/fact_check_analytics`);
      
      try {
        // Send batch data to Supabase
        const response = await fetch(`${this.supabaseUrl}/rest/v1/fact_check_analytics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Prefer': 'return=minimal' // Use minimal for batches to reduce response size
          },
          body: JSON.stringify(factCheckBatch)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          const errorInfo = `Status: ${response.status}, StatusText: ${response.statusText}, Details: ${errorText}`;
          console.error(`Supabase batch error: ${errorInfo}`);
          
          throw new Error(`Supabase batch error: ${response.status}. Details: ${errorText}`);
        }
        
        console.log(`Successfully sent ${factCheckBatch.length} records to Supabase`);
        return { 
          success: true, 
          count: factCheckBatch.length,
          message: `Successfully inserted ${factCheckBatch.length} records`
        };
      } catch (fetchError) {
        console.error("Fetch error in trackFactCheckBatch:", fetchError);
        throw fetchError; // Re-throw for proper handling
      }
    } catch (error) {
      this.lastError = error.message;
      console.error("Error tracking fact check batch in Supabase:", error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Track user feedback on a fact check
   * @param {string} analyticsId The ID of the fact check
   * @param {string} rating The feedback rating ('positive' or 'negative')
   * @returns {Promise<Object>} The response from Supabase or null if tracking disabled
   */
  async trackFeedback(analyticsId, rating) {
    try {
      // Check if analytics sharing is enabled
      const { shareAnalytics } = await new Promise(resolve => {
        chrome.storage.sync.get(['shareAnalytics'], resolve);
      });
      
      // Exit if user has opted out
      if (shareAnalytics === false) {
        return null;
      }
      
      // Make sure client is initialized
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Prepare feedback data
      const feedbackData = {
        analytics_id: analyticsId,
        rating: rating
      };
      
      // Send data to Supabase
      const response = await fetch(`${this.supabaseUrl}/rest/v1/user_feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(feedbackData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${response.status} ${response.statusText}. Details: ${errorText}`);
      }
      
      // Check if response has content
      const contentType = response.headers.get("content-type");
      
      // Only try to parse JSON if content exists and is JSON
      if (contentType && contentType.includes("application/json")) {
        // Response may be empty even with 201 success
        const responseText = await response.text();
        
        if (responseText.trim()) {
          const data = JSON.parse(responseText);
          return data;
        } else {
          return { success: true, message: "Feedback recorded" };
        }
      } else {
        return { success: true, status: response.status };
      }
    } catch (error) {
      this.lastError = error.message;
      console.error("Error tracking feedback in Supabase:", error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Track multiple feedback entries in a batch
   * @param {Array} feedbackBatch Array of feedback data objects
   * @returns {Promise<Object>} Response from Supabase
   */
  async trackFeedbackBatch(feedbackBatch) {
    if (!feedbackBatch || feedbackBatch.length === 0) {
      return { success: true, message: "No feedback to batch", count: 0 };
    }
    
    try {
      // Check if analytics sharing is enabled
      const { shareAnalytics } = await new Promise(resolve => {
        chrome.storage.sync.get(['shareAnalytics'], resolve);
      });
      
      // Exit if user has opted out
      if (shareAnalytics === false) {
        return null;
      }
      
      // Make sure client is initialized
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Send batch data to Supabase
      const response = await fetch(`${this.supabaseUrl}/rest/v1/user_feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(feedbackBatch)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase feedback batch error: ${response.status}. Details: ${errorText}`);
      }
      
      return { 
        success: true, 
        count: feedbackBatch.length,
        message: `Successfully inserted ${feedbackBatch.length} feedback records`
      };
    } catch (error) {
      this.lastError = error.message;
      console.error("Error tracking feedback batch in Supabase:", error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Clear locally stored client ID
   * This is called when user clears all data
   */
  async clearClientData() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(['anonymousClientId'], () => {
        this.clientId = null;
        this.initialized = false;
        resolve();
      });
    });
  }
  
  /**
   * Get the last error that occurred
   */
  getLastError() {
    return this.lastError;
  }
}