// modules/analytics-manager.js
import { STYLES } from '../../utils/constants.js';
import { SupabaseClient } from './supabase-client.js';

/**
 * Manages analytics functionality for the options page
 * Handles visualizations, cost estimates, and analytics data
 */
export class AnalyticsManager {
  constructor() {
    // Constants for cost calculation
    this.API_COSTS = {
      'gpt-3.5-turbo': {
        input: 0.0000015,  // $0.0015 per 1000 tokens
        output: 0.000002   // $0.002 per 1000 tokens
      },
      'gpt-4o-mini': {
        input: 0.00015,    // $0.15 per 1000 tokens
        output: 0.0006     // $0.60 per 1000 tokens
      },
      'hybrid': {
        input: 0.000075,   // Average of both models
        output: 0.0003     // Average of both models
      },
      'brave': {
        request: 0.003     // $3.00 per 1000 requests
      }
    };

    // Average tokens per character for estimation
    this.AVG_TOKENS_PER_CHAR = 0.25;
    this.AVG_OUTPUT_TOKENS = 500;
    
    // Initialize Supabase client (replace with your Supabase project URL and key)
    this.supabaseUrl = 'https://your-project-id.supabase.co';
    this.supabaseKey = 'your-supabase-anon-key';
    this.supabaseClient = new SupabaseClient(this.supabaseUrl, this.supabaseKey);
    
    // Set up event listener for the shareAnalytics checkbox
    this.setupAnalyticsToggle();
  }
  
  /**
   * Set up analytics sharing toggle event listener
   */
  setupAnalyticsToggle() {
    document.addEventListener('DOMContentLoaded', () => {
      const shareAnalyticsCheckbox = document.getElementById('shareAnalytics');
      if (shareAnalyticsCheckbox) {
        shareAnalyticsCheckbox.addEventListener('change', async (e) => {
          const isChecked = e.target.checked;
          
          // Save the preference
          await new Promise(resolve => {
            chrome.storage.sync.set({ shareAnalytics: isChecked }, resolve);
          });
          
          // If enabled, initialize Supabase client
          if (isChecked) {
            try {
              await this.supabaseClient.initialize();
              this.showStatusMessage('Analytics sharing enabled. Thank you for helping improve the extension!', 'success');
            } catch (error) {
              console.error('Error initializing Supabase:', error);
              this.showStatusMessage('Error enabling analytics. Please try again later.', 'error');
              
              // Revert the checkbox if initialization failed
              e.target.checked = false;
              chrome.storage.sync.set({ shareAnalytics: false });
            }
          } else {
            this.showStatusMessage('Analytics sharing disabled. Your privacy choice has been saved.', 'info');
          }
        });
      }
    });
  }

  /**
   * Load analytics data and display stats
   */
  loadAnalyticsData() {
    const statsContainer = document.getElementById('statsContainer');
    if (!statsContainer) return;
    
    // Get fact check analytics
    chrome.storage.local.get(['factCheckAnalytics', 'factCheckFeedback'], (data) => {
      const analytics = data.factCheckAnalytics || [];
      const feedback = data.factCheckFeedback || [];
      
      if (analytics.length === 0 && feedback.length === 0) {
        statsContainer.innerHTML = `<p>No usage data available yet. Start fact-checking to generate statistics.</p>`;
        return;
      }
      
      // Calculate statistics
      const totalChecks = analytics.length;
      const avgTextLength = Math.round(analytics.reduce((sum, item) => sum + item.textLength, 0) / Math.max(1, totalChecks));
      
      // Count checks by domain
      const domainCounts = {};
      analytics.forEach(item => {
        if (!domainCounts[item.domain]) {
          domainCounts[item.domain] = 0;
        }
        domainCounts[item.domain]++;
      });
      
      // Sort domains by count
      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      // Generate feedback stats
      const positiveFeedback = feedback.filter(item => item.rating === 'positive').length;
      const negativeFeedback = feedback.filter(item => item.rating === 'negative').length;
      const totalFeedback = positiveFeedback + negativeFeedback;
      const satisfactionRate = totalFeedback > 0 
        ? Math.round((positiveFeedback / totalFeedback) * 100) 
        : 0;
      
      // Build the HTML
      let statsHTML = `
        <div style="margin-bottom: 15px;">
          <strong>Total fact checks:</strong> ${totalChecks}
        </div>
        
        <div style="margin-bottom: 15px;">
          <strong>Average text length:</strong> ${avgTextLength} characters
        </div>
      `;
      
      if (topDomains.length > 0) {
        statsHTML += `<div style="margin-bottom: 15px;">
          <strong>Most checked websites:</strong>
          <ul style="margin-top: 5px;">
            ${topDomains.map(([domain, count]) => 
              `<li>${domain === 'unknown' ? 'Direct text' : domain}: ${count} checks</li>`
            ).join('')}
          </ul>
        </div>`;
      }
      
      if (totalFeedback > 0) {
        statsHTML += `<div>
          <strong>User satisfaction:</strong> ${satisfactionRate}% (based on ${totalFeedback} ratings)
        </div>`;
        
        // Add visual chart of satisfaction
        statsHTML += `
          <div style="margin-top: 15px;">
            <div style="height: 20px; background-color: #f0f0f0; border-radius: 10px; overflow: hidden; display: flex;">
              <div style="width: ${satisfactionRate}%; background-color: ${STYLES.COLORS.LIGHT.SUCCESS}; height: 100%"></div>
              <div style="width: ${100-satisfactionRate}%; background-color: ${STYLES.COLORS.LIGHT.ERROR}; height: 100%"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 12px;">
              <span>${positiveFeedback} positive</span>
              <span>${negativeFeedback} negative</span>
            </div>
          </div>
        `;
      }
      
      // Show Supabase analytics status
      chrome.storage.sync.get(['shareAnalytics'], (settings) => {
        const analyticsEnabled = settings.shareAnalytics !== false;
        
        statsHTML += `
          <div style="margin-top: 20px; padding: 10px; background-color: ${analyticsEnabled ? '#E8F5E9' : '#FFEBEE'}; border-radius: 4px;">
            <strong>Analytics sharing:</strong> ${analyticsEnabled ? 'Enabled ✓' : 'Disabled ✗'}
            <div style="font-size: 12px; margin-top: 5px;">
              ${analyticsEnabled 
                ? 'Thank you for helping improve the extension! Anonymous usage data is being collected.' 
                : 'You have opted out of analytics sharing. No data is being sent to our servers.'}
            </div>
          </div>
        `;
        
        statsContainer.innerHTML = statsHTML;
      });
    });
  }

  /**
   * Load recent fact checks
   */
  loadRecentFactChecks() {
    const recentChecksContainer = document.getElementById('recentChecksContainer');
    if (!recentChecksContainer) return;
    
    // Get fact check analytics data
    chrome.storage.local.get(['factCheckAnalytics'], (data) => {
      const analytics = data.factCheckAnalytics || [];
      
      if (analytics.length === 0) {
        recentChecksContainer.innerHTML = `<p>No fact checks recorded yet. Start fact-checking to see your history.</p>`;
        return;
      }
      
      // Sort by timestamp (newest first)
      const sortedChecks = [...analytics].sort((a, b) => b.timestamp - a.timestamp);
      
      // Take only the 10 most recent
      const recentChecks = sortedChecks.slice(0, 10);
      
      // Format the data for display
      let recentChecksHTML = `
        <div class="fact-check-log">
          <h3>Last ${recentChecks.length} Fact Checks</h3>
          <div class="log-entries">
      `;
      
      recentChecks.forEach((check) => {
        const date = new Date(check.timestamp);
        const formattedDate = date.toLocaleDateString(undefined, { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        // Get the domain or show "Direct text"
        const source = check.domain !== 'unknown' ? check.domain : 'Direct text';
        
        // Determine status color based on analytics if available
        let statusColor = '#888'; // Default gray
        let statusText = 'Checked';
        
        // If we have more detailed analysis add it here
        if (check.rating) {
          const rating = parseInt(check.rating);
          
          if (rating >= 80) {
            statusColor = STYLES.COLORS.LIGHT.SUCCESS; // Green for high accuracy
            statusText = `Accurate (${rating}%)`;
          } else if (rating >= 60) {
            statusColor = STYLES.COLORS.LIGHT.WARNING; // Yellow for moderate accuracy
            statusText = `Mostly accurate (${rating}%)`;
          } else if (rating >= 40) {
            statusColor = STYLES.COLORS.LIGHT.WARNING; // Orange for mixed accuracy
            statusText = `Mixed (${rating}%)`;
          } else {
            statusColor = STYLES.COLORS.LIGHT.ERROR; // Red for low accuracy
            statusText = `Inaccurate (${rating}%)`;
          }
        }
        
        // Create an entry for each fact check
        recentChecksHTML += `
          <div class="log-entry" style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <div class="log-info">
              <div><strong>${formattedDate}</strong></div>
              <div>Source: ${source}</div>
              <div>Length: ${check.textLength} characters</div>
            </div>
            <div class="log-status" style="background-color: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
              ${statusText}
            </div>
          </div>
        `;
      });
      
      recentChecksHTML += `
          </div>
        </div>
      `;
      
      recentChecksContainer.innerHTML = recentChecksHTML;
    });
  }

  /**
   * Record a fact check event (local and Supabase if enabled)
   * @param {Object} factCheckData - Data about the fact check
   */
  async recordFactCheck(factCheckData) {
    try {
      // Store locally first
      await this.recordLocalFactCheck(factCheckData);
      
      // Then send to Supabase if user has opted in
      await this.supabaseClient.trackFactCheck(factCheckData);
    } catch (error) {
      console.error("Error recording fact check:", error);
    }
  }
  
  /**
   * Store a fact check event locally
   * @param {Object} factCheckData - Data about the fact check
   * @returns {Promise} Promise that resolves when data is stored
   */
  recordLocalFactCheck(factCheckData) {
    return new Promise((resolve, reject) => {
      // Get existing analytics
      chrome.storage.local.get(['factCheckAnalytics'], (data) => {
        try {
          let analytics = data.factCheckAnalytics || [];
          
          // Create analytics data
          const analyticsData = {
            timestamp: Date.now(),
            textLength: factCheckData.textLength || 0,
            queryLength: factCheckData.queryLength || 0,
            domain: factCheckData.domain || 'unknown',
            model: factCheckData.model || 'unknown',
            rating: factCheckData.rating || null
          };
          
          analytics.push(analyticsData);
          
          // Keep only last 100 entries
          if (analytics.length > 100) {
            analytics = analytics.slice(-100);
          }
          
          chrome.storage.local.set({ factCheckAnalytics: analytics }, () => {
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  
  /**
   * Record user feedback (local and Supabase if enabled)
   * @param {string} rating - The feedback rating ('positive' or 'negative')
   * @param {object} context - Context information
   */
  async recordFeedback(rating, context) {
    try {
      // Store locally first
      await this.recordLocalFeedback(rating, context);
      
      // Get the latest check ID for associating feedback
      const analytics = await new Promise(resolve => {
        chrome.storage.local.get(['factCheckAnalytics'], (data) => {
          resolve(data.factCheckAnalytics || []);
        });
      });
      
      // If we have analytics and Supabase is using UUIDs, we'd need to track the IDs
      // This is a simplified approach - in a real implementation, you'd store Supabase IDs
      if (analytics.length > 0) {
        const lastAnalyticId = analytics[analytics.length - 1].supabaseId;
        if (lastAnalyticId) {
          await this.supabaseClient.trackFeedback(lastAnalyticId, rating);
        }
      }
    } catch (error) {
      console.error("Error recording feedback:", error);
    }
  }
  
  /**
   * Store feedback locally
   * @param {string} rating - The feedback rating
   * @param {object} context - Context information
   * @returns {Promise} Promise that resolves when data is stored
   */
  recordLocalFeedback(rating, context) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['factCheckFeedback'], (data) => {
        try {
          let feedback = data.factCheckFeedback || [];
          
          feedback.push({
            timestamp: Date.now(),
            rating: rating,
            domain: context && context.url ? new URL(context.url).hostname : 'unknown'
          });
          
          chrome.storage.local.set({ factCheckFeedback: feedback }, () => {
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Calculate usage costs based on analytics data
   */
  calculateUsageCosts() {
    const costEstimateContainer = document.getElementById('costEstimateContainer');
    if (!costEstimateContainer) return;
    
    // Get settings and analytics data
    chrome.storage.sync.get(['aiModel'], (settings) => {
      chrome.storage.local.get(['factCheckAnalytics'], (data) => {
        const analytics = data.factCheckAnalytics || [];
        
        if (analytics.length === 0) {
          costEstimateContainer.innerHTML = `<p>No usage data available yet. Start fact-checking to generate cost estimates.</p>`;
          return;
        }
        
        // Get model selection
        const model = settings.aiModel || 'gpt-4o-mini';
        const modelCosts = this.API_COSTS[model] || this.API_COSTS['gpt-4o-mini'];
        
        // Calculate total tokens processed
        let totalInputChars = analytics.reduce((sum, item) => sum + (item.textLength || 0), 0);
        let totalQueryChars = analytics.reduce((sum, item) => sum + (item.queryLength || 0), 0);
        
        // Estimate tokens
        const estimatedInputTokens = totalInputChars * this.AVG_TOKENS_PER_CHAR;
        const estimatedOutputTokens = analytics.length * this.AVG_OUTPUT_TOKENS;
        
        // Calculate costs
        const inputCost = (estimatedInputTokens / 1000) * modelCosts.input;
        const outputCost = (estimatedOutputTokens / 1000) * modelCosts.output;
        
        // Calculate Brave API costs if used
        const searchRequestCost = this.API_COSTS.brave.request * (analytics.length / 1000);
        
        // Format with 2 decimal places
        const formatCost = (cost) => `$${cost.toFixed(2)}`;
        
        // Create time-based estimate (daily, weekly, monthly)
        const timeEstimates = this.calculateTimeEstimates(analytics, inputCost + outputCost + searchRequestCost);
        
        // Create the HTML output
        const usageCostHTML = `
          <div class="cost-summary">
            <h3>Cost Summary</h3>
            
            <div class="current-model">
              <strong>Current Model:</strong> ${this.getModelDisplayName(model)}
            </div>
            
            <div class="usage-stats" style="margin-top: 15px;">
              <div style="margin-bottom: 8px;"><strong>Total checks:</strong> ${analytics.length}</div>
              <div style="margin-bottom: 8px;"><strong>Estimated input tokens:</strong> ${Math.round(estimatedInputTokens).toLocaleString()}</div>
              <div style="margin-bottom: 8px;"><strong>Estimated output tokens:</strong> ${Math.round(estimatedOutputTokens).toLocaleString()}</div>
            </div>
            
            <div class="cost-breakdown" style="margin-top: 15px;">
              <h4>Cost Breakdown</h4>
              <div style="margin-bottom: 8px;"><strong>Input processing:</strong> ${formatCost(inputCost)}</div>
              <div style="margin-bottom: 8px;"><strong>Output generation:</strong> ${formatCost(outputCost)}</div>
              <div style="margin-bottom: 8px;"><strong>Brave search:</strong> ${formatCost(searchRequestCost)}</div>
              <div style="margin-top: 12px; font-weight: bold; border-top: 1px solid #ccc; padding-top: 8px;">
                <strong>Total estimated cost:</strong> ${formatCost(inputCost + outputCost + searchRequestCost)}
              </div>
            </div>
            
            <div class="projected-costs" style="margin-top: 20px;">
              <h4>Projected Costs</h4>
              <div style="margin-bottom: 8px;"><strong>Daily (est.):</strong> ${formatCost(timeEstimates.daily)}</div>
              <div style="margin-bottom: 8px;"><strong>Weekly (est.):</strong> ${formatCost(timeEstimates.weekly)}</div>
              <div style="margin-bottom: 8px;"><strong>Monthly (est.):</strong> ${formatCost(timeEstimates.monthly)}</div>
            </div>
            
            <div class="cost-disclaimer" style="margin-top: 15px; font-style: italic; color: #666; font-size: 12px;">
              Note: These are estimates based on average token usage and may not match actual API costs.
            </div>
          </div>
        `;
        
        costEstimateContainer.innerHTML = usageCostHTML;
      });
    });
  }

  /**
   * Clear recent fact checks
   */
  clearRecentFactChecks() {
    if (!confirm('Are you sure you want to clear your recent fact checks?')) return;
    
    chrome.storage.local.get(['factCheckAnalytics'], (data) => {
      // Clear the history
      chrome.storage.local.set({ factCheckAnalytics: [] }, () => {
        // Update the display
        const recentChecksContainer = document.getElementById('recentChecksContainer');
        if (recentChecksContainer) {
          recentChecksContainer.innerHTML = 
            `<p>No fact checks recorded yet. Start fact-checking to see your history.</p>`;
        }
        
        // Show success message
        this.showStatusMessage('Recent fact checks cleared successfully!', 'success');
      });
    });
  }

  /**
   * Clear all stored data
   */
  async clearStoredData() {
    if (!confirm('Are you sure you want to clear all stored data? This cannot be undone.')) return;
    
    try {
      // Clear local storage
      await new Promise(resolve => {
        chrome.storage.local.clear(resolve);
      });
      
      // Also clear Supabase client ID if analytics were enabled
      await this.supabaseClient.clearClientData();
      
      // Reset the analytics display
      const statsContainer = document.getElementById('statsContainer');
      if (statsContainer) {
        statsContainer.innerHTML = `
          <p>No usage data available yet. Start fact-checking to generate statistics.</p>
        `;
      }
      
      // Reset recent checks display
      const recentChecksContainer = document.getElementById('recentChecksContainer');
      if (recentChecksContainer) {
        recentChecksContainer.innerHTML = `
          <p>No fact checks recorded yet. Start fact-checking to see your history.</p>
        `;
      }
      
      // Reset cost estimates display
      const costEstimateContainer = document.getElementById('costEstimateContainer');
      if (costEstimateContainer) {
        costEstimateContainer.innerHTML = `
          <p>No usage data available yet. Start fact-checking to generate cost estimates.</p>
        `;
      }
      
      this.showStatusMessage('All stored data has been cleared!', 'success');
    } catch (error) {
      console.error("Error clearing data:", error);
      this.showStatusMessage('Error clearing data. Please try again.', 'error');
    }
  }

  /**
   * Show a status message
   * @param {string} message - Message to display
   * @param {string} type - Message type: 'success', 'error', or 'info'
   */
  showStatusMessage(message, type = 'success') {
    const status = document.getElementById('status');
    if (!status) return;
    
    status.textContent = message;
    status.style.display = 'block';
    
    switch (type) {
      case 'error':
        status.style.color = '#d32f2f';
        status.style.backgroundColor = '#ffebee';
        break;
      case 'info':
        status.style.color = '#0288d1';
        status.style.backgroundColor = '#e1f5fe';
        break;
      case 'success':
      default:
        status.style.color = '#2e7d32';
        status.style.backgroundColor = '#e8f5e9';
        break;
    }
    
    setTimeout(() => {
      status.style.display = 'none';
      // Reset to success style after hiding
      status.style.color = '#2e7d32';
      status.style.backgroundColor = '#e8f5e9';
    }, 3000);
  }

  // Helper methods

  /**
   * Get friendly display name for models
   * @param {string} modelId - Model identifier
   * @returns {string} Display name
   */
  getModelDisplayName(modelId) {
    const modelNames = {
      'gpt-3.5-turbo': 'GPT-3.5 Turbo (Legacy)',
      'gpt-4o-mini': 'GPT-4o Mini (Standard)',
      'hybrid': 'Hybrid (3.5 + 4o)'
    };
    
    return modelNames[modelId] || modelId;
  }

  /**
   * Calculate time-based cost projections
   * @param {Array} analytics - Analytics data
   * @param {number} totalCost - Total cost
   * @returns {Object} Time-based estimates
   */
  calculateTimeEstimates(analytics, totalCost) {
    if (analytics.length === 0) return { daily: 0, weekly: 0, monthly: 0 };
    
    // Find oldest and newest timestamps
    const timestamps = analytics.map(item => item.timestamp);
    const oldestTime = Math.min(...timestamps);
    const newestTime = Math.max(...timestamps);
    
    // Calculate the date range in days
    const dateRangeMs = newestTime - oldestTime;
    const dateRangeDays = Math.max(1, dateRangeMs / (1000 * 60 * 60 * 24));
    
    // Calculate daily cost
    const dailyCost = totalCost / dateRangeDays;
    
    return {
      daily: dailyCost,
      weekly: dailyCost * 7,
      monthly: dailyCost * 30
    };
  }
}