// services/ProgressiveFactCheckService.js - Progressive enhancement for fact checking
import { FEATURES, CONTENT } from '../utils/constants.js';
import { ModelSelectionService } from './ModelSelectionService.js';
import { RetryUtils } from '../utils/RetryUtils.js';
import { ErrorHandlingService } from './ErrorHandlingService.js';

/**
 * Service for progressive fact checking with escalation based on complexity
 */
export class ProgressiveFactCheckService {
  /**
   * Create a new progressive fact check service
   * 
   * @param {Object} factCheckerService - The main fact checker service
   * @param {Object} searchService - The search service for context
   * @param {Object} aiService - The AI service for queries
   * @param {Object} settings - User settings
   */
  constructor(factCheckerService, searchService, aiService, settings) {
    this.factCheckerService = factCheckerService;
    this.searchService = searchService;
    this.aiService = aiService;
    this.settings = settings;
  }
  
  /**
   * Perform a progressive fact check with escalation based on complexity
   * 
   * @param {string} text - Text to fact check
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Fact check result
   */
  async progressiveFactCheck(text, options = {}) {
    try {
      // Step 1: Analyze text complexity
      const complexity = ModelSelectionService.estimateComplexity(text);
      console.log(`Text complexity estimated as: ${complexity}`);
      
      // Step 2: Determine if we need search context based on complexity
      const needsSearch = complexity !== 'low' || options.forceSearch;
      
      // Step 3: Select the appropriate model based on complexity
      const modelOptions = {
        provider: this.settings.aiProvider,
        textLength: text.length,
        complexity,
        urgency: options.urgency || 'medium',
        costSensitive: this.settings.costSensitive !== false,
        task: 'fact_check'
      };
      
      const selectedModel = ModelSelectionService.selectOptimalModel(modelOptions);
      console.log(`Selected model for fact check: ${selectedModel}`);
      
      // Step 4: Start with a quick check if complexity is low
      if (complexity === 'low' && !options.skipQuickCheck) {
        try {
          const quickResult = await this._quickFactCheck(text, selectedModel);
          
          // If confidence is high, return the quick result
          if (quickResult.confidence >= 0.8) {
            console.log('Quick fact check returned high confidence result');
            return quickResult;
          }
          
          console.log('Quick fact check confidence too low, escalating to full check');
        } catch (error) {
          // If quick check fails, continue to full check
          console.error('Quick fact check failed, falling back to full check:', error);
        }
      }
      
      // Step 5: Perform a full fact check with search if needed
      return await this._fullFactCheck(text, {
        ...options,
        useSearch: needsSearch,
        model: selectedModel
      });
    } catch (error) {
      // Handle errors with proper recovery strategies
      ErrorHandlingService.logError(error, {
        operation: 'progressiveFactCheck',
        model: this.settings.aiModel,
        provider: this.settings.aiProvider
      });
      
      // Try emergency fallback
      return await this.factCheckerService.emergencyFallback(text);
    }
  }
  
  /**
   * Perform a quick fact check for simple claims
   * 
   * @param {string} text - Text to fact check
   * @param {string} model - Model to use
   * @returns {Promise<Object>} Quick fact check result
   * @private
   */
  async _quickFactCheck(text, model) {
    const simplePrompt = `
      Please quickly assess if the following statement is likely true or false:
      "${text.substring(0, 1000)}"
      
      Provide a brief response with:
      - Rating (0-100)
      - Short explanation (1-2 sentences)
      - Confidence level (0.0-1.0)
      
      Format: 
      Rating: [number]
      Explanation: [text]
      Confidence: [number]
    `;
    
    const result = await RetryUtils.retryWithBackoff(
      async () => this.aiService.call(simplePrompt, model, CONTENT.MAX_TOKENS.DEFAULT / 2),
      {
        maxRetries: 1,
        initialDelay: 1000,
        shouldRetry: (error) => RetryUtils.isTemporaryError(error)
      }
    );
    
    // Parse the result
    const ratingMatch = result.match(/Rating:\s*(\d+)/i);
    const explanationMatch = result.match(/Explanation:\s*(.+?)(?=\n|Confidence:|$)/is);
    const confidenceMatch = result.match(/Confidence:\s*([0-9]\.[0-9]+|[01])/i);
    
    const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : null;
    const explanation = explanationMatch ? explanationMatch[1].trim() : '';
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
    
    return {
      result: `Rating: ${rating}\n\nExplanation: ${explanation}\n\nNote: This was a quick assessment with ${Math.round(confidence * 100)}% confidence.`,
      rating,
      confidence,
      quickCheck: true
    };
  }
  
  /**
   * Perform a full fact check with search context if needed
   * 
   * @param {string} text - Text to fact check
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Full fact check result
   * @private
   */
  async _fullFactCheck(text, options) {
    const { useSearch = true, model = null } = options;
    
    // Use the factCheckerService for the full check
    if (useSearch && FEATURES.BRAVE_SEARCH) {
      // With search context
      return await this.factCheckerService.factCheckWithSearch(text, {
        ...options,
        model: model || this.settings.aiModel
      });
    } else {
      // Without search context
      return await this.factCheckerService.singleModelFactCheck(text, {
        ...options,
        model: model || this.settings.aiModel
      });
    }
  }
}
