// services/analytics.js
export class AnalyticsService {
    static recordFactCheck(text, queryText) {
      // Store anonymized analytics
      const analyticsData = {
        timestamp: Date.now(),
        textLength: text.length,
        queryLength: queryText.length,
        // Don't store actual text for privacy
        domain: 'unknown' // Service workers don't have access to window
      };
      
      // Get existing analytics
      chrome.storage.local.get(['factCheckAnalytics'], (data) => {
        let analytics = data.factCheckAnalytics || [];
        analytics.push(analyticsData);
        
        // Keep only last 100 entries
        if (analytics.length > 100) {
          analytics = analytics.slice(-100);
        }
        
        chrome.storage.local.set({ factCheckAnalytics: analytics });
      });
    }
    
    static recordFeedback(rating, tab) {
      // Store feedback for improving the extension
      chrome.storage.local.get(['factCheckFeedback'], (data) => {
        let feedback = data.factCheckFeedback || [];
        feedback.push({
          timestamp: Date.now(),
          rating: rating,
          domain: tab ? new URL(tab.url).hostname : 'unknown'
        });
        
        chrome.storage.local.set({ factCheckFeedback: feedback });
      });
    }
  }
  