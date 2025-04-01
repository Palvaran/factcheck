// services/FactCheckManager.js - Core fact checking functionality

import { DebugUtils } from '../utils/debug-utils.js';
import { StorageManager } from '../utils/StorageManager.js';
import { FactCheckerService } from '../services/factChecker.js';
import { DOMAINS } from '../utils/constants.js';

/**
 * Manages fact checking operations
 */
export class FactCheckManager {
  constructor(apiManager, analyticsManager, contentScriptManager) {
    this.apiManager = apiManager;
    this.analyticsManager = analyticsManager;
    this.contentScriptManager = contentScriptManager;
  }

  /**
   * Handle checking an entire page
   * @param {Object} tab - Chrome tab object
   * @returns {Promise<void>}
   */
  async handlePageCheck(tab) {
    DebugUtils.log("FactCheckManager", `Starting page check for tab ${tab.id}: ${tab.url}`);
    
    try {
      // Ensure content script is loaded
      await this.contentScriptManager.ensureContentScriptLoaded(tab.id);
      
      DebugUtils.log("FactCheckManager", "Requesting article text from content script");
      const response = await this.contentScriptManager.getArticleTextFromTab(tab.id);
      DebugUtils.log("FactCheckManager", "Article text response received:", response ? "yes" : "no");
      
      if (response && response.articleText) {
        await this.processFactCheck(response.articleText, tab);
      } else {
        DebugUtils.error("FactCheckManager", "No article text extracted");
        await this.contentScriptManager.executeScript(tab.id, () => alert('Could not extract article text.'));
      }
    } catch (error) {
      DebugUtils.error("FactCheckManager", "Error getting article text:", error);
      await this.contentScriptManager.executeScript(tab.id, () => alert('Error extracting text from page.'));
    }
  }

  /**
   * Handle checking selected text
   * @param {string} text - Selected text to check
   * @param {Object} tab - Chrome tab object
   * @returns {Promise<void>}
   */
  async handleSelectionCheck(text, tab) {
    DebugUtils.log("FactCheckManager", `Starting selection check with ${text.length} characters of text`);
    await this.processFactCheck(text, tab);
  }

  /**
   * Main fact-check processing function
   * @param {string} text - Text to fact check
   * @param {Object} tab - Chrome tab object
   * @returns {Promise<void>}
   */
  async processFactCheck(text, tab) {
    DebugUtils.log("FactCheckManager", "Starting fact check process with text length:", text.length);
    
    // Ensure content script is loaded before showing overlay
    const contentInjected = await this.contentScriptManager.ensureContentScriptLoaded(tab.id);
    DebugUtils.log("FactCheckManager", "Content script loaded status:", contentInjected);
    
    // Show loading overlay
    const overlayShown = await this.contentScriptManager.showOverlayWithRetry(tab.id);
    DebugUtils.log("FactCheckManager", "Overlay shown:", overlayShown);
    
    try {
      // Get settings
      const settings = await StorageManager.get([
        'aiProvider',
        'aiModel', 
        'useMultiModel', 
        'maxTokens', 
        'enableCaching', 
        'rateLimit'
      ]);
      
      DebugUtils.log("FactCheckManager", "Settings retrieved, using provider:", settings.aiProvider);
      
      // Get AI service from API manager
      const aiService = this.apiManager.getAiService();
      
      // Get Brave search service if available
      const braveSearchService = this.apiManager.getBraveSearchService();
      const hasBraveSearch = !!braveSearchService;
      
      // Create fact checker service with AI service and settings
      DebugUtils.log("FactCheckManager", "Creating fact checker with AI service and Brave API available:", 
                    !!aiService, hasBraveSearch);
      
      const factChecker = new FactCheckerService(
        aiService, 
        hasBraveSearch ? this.apiManager.apiKeys.brave : null, 
        settings
      );
      
      // Get article metadata if available
      let sourceMetadata = {};
      try {
        DebugUtils.log("FactCheckManager", "Attempting to get article metadata");
        const response = await this.contentScriptManager.getArticleTextFromTab(tab.id);
        if (response && response.metadata) {
          sourceMetadata = response.metadata;
          DebugUtils.log("FactCheckManager", "Article metadata received");
        }
      } catch (error) {
        DebugUtils.error("FactCheckManager", "Error getting article metadata:", error);
      }
      
      // Perform fact check
      DebugUtils.log("FactCheckManager", "Starting fact check analysis");
      const factCheckResponse = await factChecker.check(text);

      // Destructure all values, making sure to extract the rating
      const { result, queryText, rating } = factCheckResponse;

      DebugUtils.log("FactCheckManager", "Fact check completed", {
        queryTextLength: queryText.length,
        resultLength: result.length,
        rating: rating
      });
      
      // Update overlay with results
      DebugUtils.log("FactCheckManager", "Updating overlay with results");
      await this.contentScriptManager.updateOverlayWithRetry(tab.id, result, sourceMetadata);
      
      // Create analytics data with additional details for Supabase
      const analyticsData = {
        textLength: text.length,
        queryLength: queryText.length,
        domain: tab.url ? new URL(tab.url).hostname : 'unknown',
        model: settings.aiModel || 'unknown',
        searchUsed: hasBraveSearch,
        rating: rating // This should now be correctly included
      };
      
      // Check if domain is in trusted sources
      if (tab.url) {
        const hostname = new URL(tab.url).hostname;
        const isCredible = DOMAINS.CREDIBLE.some(domain => hostname.includes(domain));
        const isFactChecker = DOMAINS.FACT_CHECK.some(domain => hostname.includes(domain));
        
        // Add source credibility info to analytics
        analyticsData.isCredibleSource = isCredible;
        analyticsData.isFactCheckSource = isFactChecker;
      }
      
      // Record analytics
      this.analyticsManager.recordFactCheck(text, queryText, analyticsData);
      DebugUtils.log("FactCheckManager", "Analytics recorded with rating:", rating);
    } catch (error) {
      DebugUtils.error("FactCheckManager", "Error in processFactCheck:", error);
      await this.contentScriptManager.updateOverlayWithRetry(
        tab.id, 
        'Error: An unexpected error occurred during fact-checking. Please try again.', 
        {}
      );
    }
  }
}
