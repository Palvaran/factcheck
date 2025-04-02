// services/factChecker.js - Updated to support both OpenAI and Anthropic with enhanced error handling and model selection
import { BraveSearchService } from '../api/brave.js';
import { CONTENT, DOMAINS, MODELS, FEATURES } from '../utils/constants.js';
import { RetryUtils } from '../utils/RetryUtils.js';
import { ErrorHandlingService } from './ErrorHandlingService.js';
import { ModelSelectionService } from './ModelSelectionService.js';
import { CacheService } from './CacheService.js';
import { TelemetryService } from './TelemetryService.js'; // Import TelemetryService directly

// Global debug flag - set to true for debugging
const DEBUG = false;

// Debug logging helper
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

export class FactCheckerService {
  constructor(aiService, braveApiKey, settings = {}) {
    debugLog("Initializing FactCheckerService with settings:", {
      provider: settings.aiProvider || 'openai',
      model: settings.aiModel || 'gpt-4o-mini',
      multiModel: settings.useMultiModel !== false,
      tokens: settings.maxTokens || CONTENT.MAX_TOKENS.DEFAULT,
      caching: settings.enableCaching !== false,
      rateLimit: settings.rateLimit || 5
    });
    
    debugLog("AI service available:", !!aiService);
    debugLog("Brave API key present:", !!braveApiKey);
    
    this.aiService = aiService; // Either OpenAIService or AnthropicService
    this.braveService = braveApiKey ? new BraveSearchService(braveApiKey) : null;
    debugLog("BraveSearchService available:", !!this.braveService);
    
    // Initialize new services
    this.cacheService = new CacheService();
    
    // Only initialize telemetry if the feature is enabled
    this.telemetryService = FEATURES.ERROR_HANDLING.ERROR_TELEMETRY ? new TelemetryService() : null;
    
    // Test the Brave API if available
    if (this.braveService && FEATURES.BRAVE_SEARCH) {
      debugLog("Testing Brave API during initialization");
      
      // Test the API key
      this.braveService.testApiKey()
        .then(result => {
          if (result.valid) {
            debugLog(`✓ Brave API key test successful, API key is valid`);
          } else {
            console.error(`✗ Brave API key test failed: ${result.error}`);
          }
        })
        .catch(error => {
          console.error("✗ Brave API key test failed during initialization:", error);
        });
    }
    
    // Set defaults if settings are missing
    this.settings = {
      aiProvider: settings.aiProvider || 'openai',
      aiModel: settings.aiModel || 'gpt-4o-mini',
      useMultiModel: settings.useMultiModel !== false,
      maxTokens: settings.maxTokens || CONTENT.MAX_TOKENS.DEFAULT,
      enableCaching: settings.enableCaching !== false,
      rateLimit: settings.rateLimit || 5,
      costSensitive: settings.costSensitive !== false
    };
    
    // Update rate limit setting
    if (this.aiService.setRateLimit) {
      this.aiService.setRateLimit(this.settings.rateLimit);
    }
    
    // Keep track of ongoing check operations
    this.pendingChecks = new Map();
    
    // Initialize cache if caching is enabled
    if (FEATURES.CACHING.ENABLED && this.settings.enableCaching) {
      this.cacheService.initialize().catch(error => {
        console.error("Error initializing cache:", error);
      });
    }
  }

  async check(text) {
    const textHash = await this._hashText(text);
    
    // If we already have a pending check for this text, return the existing promise
    if (this.pendingChecks.has(textHash)) {
      debugLog("Returning existing pending check for identical text");
      return this.pendingChecks.get(textHash);
    }
    
    // Create a new promise for this check with retry logic
    const checkPromise = RetryUtils.retryWithBackoff(
      () => this._performCheck(text),
      {
        maxRetries: 2,
        initialDelay: 2000,
        shouldRetry: (error) => {
          // Only retry on temporary errors, not on auth or content policy issues
          return RetryUtils.isTemporaryError(error) && !RetryUtils.isAuthError(error);
        },
        onRetry: (error, retryInfo) => {
          debugLog(`Retrying fact check (${retryInfo.retryCount}/${retryInfo.maxRetries}) after error: ${error.message}`);
          this._updateProgress('retry');
        }
      }
    );
    
    this.pendingChecks.set(textHash, checkPromise);
    
    // Remove from pending checks when done
    checkPromise.finally(() => {
      this.pendingChecks.delete(textHash);
    });
    
    return checkPromise;
  }
  
  async _hashText(text) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text.substring(0, 1000)); // Only hash first 1000 chars
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      // Simple fallback hash
      return text.substring(0, 100).split('').reduce(
        (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0
      ).toString(36);
    }
  }

  async _performCheck(text) {
    debugLog("Starting fact check with text length:", text.length);
    debugLog("Using AI model:", this.settings.aiModel);
    debugLog("Multi-model enabled:", this.settings.useMultiModel);
    
    if (this.telemetryService) {
      this.telemetryService.startOperation('factCheck', {
        textLength: text.length,
        provider: this.settings.aiProvider,
        model: this.settings.aiModel,
        multiModel: this.settings.useMultiModel
      });
    }
    
    try {
      // Signal the start of the process
      await this._updateProgress('start');
      
      // Get today's date for context
      const today = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      // Analyze text complexity for model selection if enabled
      let textComplexity = 'medium';
      if (FEATURES.CONTENT_EXTRACTION.TEXT_COMPLEXITY_ANALYSIS) {
        textComplexity = ModelSelectionService.estimateComplexity(text);
        debugLog(`Text complexity estimated as: ${textComplexity}`);
      }
      
      // Select optimal model based on complexity if auto-selection is enabled
      let selectedModel = this.settings.aiModel;
      if (FEATURES.MODEL_AUTO_SELECTION) {
        const modelOptions = {
          provider: this.settings.aiProvider,
          textLength: text.length,
          complexity: textComplexity,
          urgency: 'medium',
          costSensitive: this.settings.costSensitive,
          task: 'fact_check'
        };
        
        selectedModel = ModelSelectionService.selectOptimalModel(modelOptions);
        debugLog(`Model auto-selected: ${selectedModel} based on complexity: ${textComplexity}`);
      }
      
      // Use the optimized query extraction with the selected model
      const queryText = await this.aiService.extractSearchQuery(text, 
        FEATURES.SEARCH_QUERY_OPTIMIZATION ? selectedModel : this.settings.aiModel);
      debugLog("Query extracted, length:", queryText.length);  
      
      // Verify if Brave service is available
      let braveServiceAvailable = false;
      if (!this.braveService && FEATURES.BRAVE_SEARCH) {
        console.warn("WARNING: Brave service is null. API key might be missing or invalid.");
        
        // Attempt emergency reinitialization
        try {
          // Retrieve the API key from storage again
          const storageResult = await new Promise((resolve) => {
            chrome.storage.sync.get(['braveApiKey'], (result) => {
              resolve(result);
            });
          });
          
          if (storageResult.braveApiKey) {
            console.log("Found Brave API key in storage, attempting to reinitialize service");
            this.braveService = new BraveSearchService(storageResult.braveApiKey);
            braveServiceAvailable = true;
          } else {
            console.warn("No Brave API key found in storage");
          }
        } catch (storageError) {
          console.error("Error accessing storage:", storageError);
        }
      } else if (this.braveService) {
        braveServiceAvailable = true;
      }
      
      // Collect all potential operations and run in parallel where possible
      const operations = [];
      
      // Only add the search operation if we have a Brave service and the feature is enabled
      if (braveServiceAvailable && FEATURES.BRAVE_SEARCH) {
        debugLog("Adding Brave search operation");
        
        // Signal the search step
        await this._updateProgress('search');
        
        operations.push(
          this.braveService.search(queryText)
            .then(result => {
              debugLog("Search operation completed successfully");
              return { type: 'search', data: result };
            })
            .catch(error => {
              console.error("Error in Brave search operation:", error);
              return { type: 'search', error };
            })
        );
      } else {
        console.warn("Skipping Brave search operation - service not available or feature disabled");
        console.warn("Brave service available:", braveServiceAvailable);
        console.warn("FEATURES.BRAVE_SEARCH enabled:", FEATURES.BRAVE_SEARCH);
      }
      
      // Execute all operations in parallel
      debugLog(`Executing ${operations.length} operations in parallel`);
      const results = await Promise.all(operations);
      
      // Extract results from the operations
      let searchResult = results.find(r => r.type === 'search');
      let searchContext = '';
      let referencesHTML = '<br><br><strong>References:</strong><br>No references available (emergency mode).';
      
      if (searchResult && !searchResult.error) {
        searchContext = searchResult.data.searchContext;
        referencesHTML = searchResult.data.referencesHTML;
        debugLog("Search context acquired, length:", searchContext.length);
      } else if (searchResult?.error) {
        console.error("Error with search:", searchResult.error);
        referencesHTML = `<br><br><strong>References:</strong><br>Error fetching references: ${searchResult.error.message}`;
      } else if (!braveServiceAvailable) {
        // Create a fallback message for when Brave service is not available
        referencesHTML = `<br><br><strong>References:</strong><br>Unable to fetch references - Brave Search API is not available. Please check your API key in settings.`;
      }
      
      // Determine which model to use based on settings and provider
      let analysisModel = selectedModel || this.settings.aiModel;
  
      // Parse provider-specific model values (e.g., 'openai-standard', 'anthropic-premium')
      if (analysisModel.includes('-')) {
        const [provider, tier] = analysisModel.split('-');
        // If the provider in the model matches the current provider, use the tier
        if (provider === this.settings.aiProvider) {
          const modelType = tier.toUpperCase();
          analysisModel = this.settings.aiProvider === 'anthropic' 
            ? MODELS.ANTHROPIC[modelType] 
            : MODELS.OPENAI[modelType];
        } else {
          // If providers don't match, use the standard model for the current provider
          analysisModel = this.settings.aiProvider === 'anthropic' 
            ? MODELS.ANTHROPIC.STANDARD 
            : MODELS.OPENAI.STANDARD;
        }
      } else if (analysisModel === 'standard' || analysisModel === 'premium') {
        // Handle legacy model values
        const modelType = analysisModel.toUpperCase();
        analysisModel = this.settings.aiProvider === 'anthropic' 
          ? MODELS.ANTHROPIC[modelType] 
          : MODELS.OPENAI[modelType];
      }
      
      // Store the selected model in the class instance for reuse
      this.selectedModel = analysisModel;
      debugLog(`Using ${this.selectedModel} for analysis with provider ${this.settings.aiProvider}`);

      // Add validation to ensure model matches provider
      if (this.settings.aiProvider === 'openai') {
        // Ensure we're using an OpenAI model
        const openaiModels = ['standard', 'premium'];
        if (!openaiModels.includes(this.selectedModel) && !this.selectedModel.includes('gpt-')) {
          debugLog(`Invalid OpenAI model: ${this.selectedModel}, falling back to default`);
          this.selectedModel = MODELS.OPENAI.STANDARD; // Use constant for default model
        }
      } else if (this.settings.aiProvider === 'anthropic') {
        // Ensure we're using an Anthropic model
        if (!this.selectedModel.includes('claude-')) {
          debugLog(`Invalid Anthropic model: ${this.selectedModel}, falling back to default`);
          this.selectedModel = MODELS.ANTHROPIC.STANDARD; // Use constant for default model
        }
      }

      debugLog(`Final validated model for ${this.settings.aiProvider}: ${this.selectedModel}`);

      // Signal the analysis step
      await this._updateProgress('analysis');
      
      let factCheckResult;
      
      // Use multi-model verification if enabled
      if (this.settings.useMultiModel && FEATURES.MULTI_MODEL_CHECK) {
        debugLog("Using multi-model approach");
        factCheckResult = await this.performMultiModelFactCheck(
          text, 
          searchContext, 
          today, 
          this.selectedModel
        );
      } else {
        // Use single model approach
        debugLog("Using single model approach");
        factCheckResult = await this.factCheckWithSearch(
          text,
          searchContext,
          today,
          this.selectedModel
        );
      }
      
      // Signal the verification step
      await this._updateProgress('verification');
      
      debugLog("Fact check completed successfully");
  
      // Extract rating from the factCheckResult
      let rating = null;
      const ratingMatch = factCheckResult.match(/Rating:\s*(\d+)/i);
      if (ratingMatch && ratingMatch[1]) {
        rating = parseInt(ratingMatch[1], 10);
        debugLog(`Extracted rating: ${rating}`);
      } else {
        debugLog("No rating found in fact check result");
      }
      
      // Combine results and references
      const combinedResult = factCheckResult + referencesHTML;
      
      // End telemetry tracking with success
      if (this.telemetryService) {
        this.telemetryService.endOperation('factCheck', { 
          success: true,
          rating,
          hasReferences: searchContext.length > 0
        });
      }
      
      // Return all three values in a consistent object
      return { 
        result: combinedResult, 
        queryText, 
        rating
      };
    } catch (error) {
      console.error("Critical error in factCheck:", error);
      
      // Log error with the error handling service
      ErrorHandlingService.logError(error, {
        operation: 'factCheck',
        model: this.selectedModel || this.settings.aiModel,
        provider: this.settings.aiProvider
      });
      
      // End telemetry tracking with failure
      if (this.telemetryService) {
        this.telemetryService.endOperation('factCheck', { 
          success: false,
          errorType: ErrorHandlingService.categorizeError(error),
          errorMessage: error.message
        });
      }
      
      // Get recovery strategy
      const errorType = ErrorHandlingService.categorizeError(error);
      const strategy = ErrorHandlingService.getRecoveryStrategy(errorType, {
        provider: this.settings.aiProvider,
        model: this.selectedModel || this.settings.aiModel
      });
      
      // Create user-friendly error message
      const userMessage = ErrorHandlingService.createUserFriendlyMessage(error, {
        operation: 'factCheck',
        model: this.selectedModel || this.settings.aiModel,
        provider: this.settings.aiProvider
      });
      
      // Attempt emergency fallback if we should
      if (strategy.fallbackModel) {
        try {
          debugLog(`Attempting emergency fallback with model: ${strategy.fallbackModel}...`);
          const emergencyResult = await this.emergencyFallback(text, strategy.fallbackModel);
          return emergencyResult; // This should already be returning { result, queryText, rating }
        } catch (fallbackError) {
          console.error("Even fallback failed:", fallbackError);
          // If even the fallback fails, return the original error
          return { 
            result: `Error: ${userMessage}`, 
            queryText: text.substring(0, 100),
            rating: null 
          };
        }
      } else {
        // No fallback strategy, return error directly
        return { 
          result: `Error: ${userMessage}`, 
          queryText: text.substring(0, 100),
          rating: null 
        };
      }
    }
  }

  // Helper method to send progress updates
  async _updateProgress(stepId) {
    try {
      debugLog(`Updating progress step: ${stepId}`);
      
      // Send message to content script to update progress
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateProgress',
            stepId: stepId
          }, (response) => {
            if (chrome.runtime.lastError) {
              debugLog("Error sending progress update:", chrome.runtime.lastError);
            } else if (response) {
              debugLog(`Progress update response: ${response.success ? 'success' : 'failed'}`);
            }
          });
        }
      });
    } catch (error) {
      console.error("Error updating progress:", error);
      // Non-critical error, continue with fact check
    }
  }

  async factCheckWithSearch(text, searchContext, today, model) {
    debugLog(`Starting fact check with search context using model: ${model}`);
    try {
      // Track this operation if telemetry is enabled
      if (this.telemetryService) {
        this.telemetryService.startOperation('factCheckWithSearch', {
          model,
          hasSearchContext: !!searchContext && searchContext.length > 0
        });
      }
      
      // Build the prompt with search context if available
      const prompt = this.buildPrompt(text, searchContext, today, !!searchContext);
      debugLog("Prompt built, length:", prompt.length);
      
      // Call AI API with the selected model using retry mechanism
      debugLog(`Calling AI API with model: ${model}`);
      
      const result = await RetryUtils.retryWithBackoff(
        async () => this.aiService.callWithCache(
          prompt, 
          model,
          this.settings.maxTokens,
          this.settings.enableCaching
        ),
        {
          maxRetries: 2,
          initialDelay: 2000,
          shouldRetry: (error) => RetryUtils.isTemporaryError(error)
        }
      );
      
      // Add model information to the result
      const resultWithModel = result + `\n\nModel: ${model}`;
      
      // End telemetry tracking with success
      if (this.telemetryService) {
        this.telemetryService.endOperation('factCheckWithSearch', { success: true });
      }
      
      debugLog("AI response received, length:", resultWithModel.length);
      return resultWithModel;
    } catch (error) {
      // End telemetry tracking with failure
      if (this.telemetryService) {
        this.telemetryService.endOperation('factCheckWithSearch', { 
          success: false,
          errorType: ErrorHandlingService.categorizeError(error),
          errorMessage: error.message
        });
      }
      
      console.error("Fact check with search error:", error);
      throw new Error(`Error during fact check: ${error.message}`);
    }
  }

  buildPrompt(text, searchContext, today, isBrave) {
    debugLog("Building prompt with search context:", !!searchContext);
    const factCheckTemplate = `
I need your help to fact-check the following statement. Please carefully analyze this for accuracy:

STATEMENT TO VERIFY: "${text}"

${isBrave && searchContext ? `
REFERENCE INFORMATION:
${searchContext}
` : ''}

TODAY'S DATE: ${today}

Please follow this specific evaluation framework:

1. KEY CLAIMS IDENTIFICATION:
   - Identify the 2-3 main factual claims in the statement
   - For each claim, note if it's verifiable with available information

2. EVIDENCE EVALUATION:
   - Rate the strength of supporting evidence from references (Strong/Moderate/Weak/None)
   - Note contradictory evidence where applicable
   - Consider source credibility and recency
   - Identify information gaps

3. CONTEXTUAL ANALYSIS:
   - Note any missing context that affects interpretation
   - Identify if the statement misleads through selective presentation

4. VERDICT:
   - Assign a numerical accuracy score (0-100):
     * 90-100: Completely or almost completely accurate
     * 70-89: Mostly accurate with minor issues
     * 50-69: Mixed accuracy with significant issues
     * 30-49: Mostly inaccurate with some truth
     * 0-29: Completely or almost completely false
   - Provide a concise explanation for your rating

5. LIMITATIONS:
   - Note any limitations in your assessment due to incomplete information

FORMAT YOUR RESPONSE WITH THESE HEADERS:
"Rating: [numerical score]"
"Explanation: [your concise explanation with specific references]"
`;

    return factCheckTemplate;
  }

  async performMultiModelFactCheck(text, searchContext, today, primaryModel) {
    debugLog("Starting multi-model approach with primary model:", primaryModel);
    
    // Track this operation if telemetry is enabled
    if (this.telemetryService) {
      this.telemetryService.startOperation('multiModelFactCheck', {
        primaryModel,
        hasSearchContext: !!searchContext && searchContext.length > 0
      });
    }
    
    // Choose appropriate secondary models based on provider using ModelSelectionService
    const secondaryModels = ModelSelectionService.selectSecondaryModels(
      primaryModel, 
      this.settings.aiProvider, 
      this.settings.costSensitive
    );
    
    debugLog(`Selected secondary models: ${secondaryModels.join(', ')}`);
    
    // Define different prompt types
    const promptTypes = [
      {
        name: "Evidence Analysis",
        prompt: `Based strictly on the provided search context, evaluate the factual claims in: "${text}". 
        List each claim and assess whether the search results support, contradict, or are silent on each claim. 
        Provide a numeric accuracy rating from 0-100 and brief explanation.`,
        model: primaryModel
      },
      {
        name: "Logical Consistency",
        prompt: `Analyze the internal logical consistency of the following statement: "${text}". 
        Identify if there are any contradictions or logical fallacies. 
        Provide a numeric consistency rating from 0-100 and brief explanation.`,
        model: secondaryModels[0] || primaryModel
      }
    ];

    try {
      // If no search context is available, adjust the first prompt
      if (!searchContext || searchContext.trim().length === 0) {
        debugLog("No search context available, adjusting prompt");
        promptTypes[0].prompt = `Analyze the factual claims in: "${text}". 
          Based on your knowledge, evaluate how accurate these claims are likely to be.
          Provide a numeric accuracy rating from 0-100 and brief explanation.`;
      }
      
      debugLog("Sending prompts to different models...");
      // Get responses from different prompts/models in parallel
      const responsePromises = promptTypes.map(async (promptType) => {
        let fullPrompt = promptType.prompt;
        
        // Only add search context to Evidence Analysis
        if (promptType.name === "Evidence Analysis" && searchContext && searchContext.trim().length > 0) {
          fullPrompt += `\n\nSearch Context:\n${searchContext}`;
        }
        
        debugLog(`Sending ${promptType.name} prompt to ${promptType.model}`);
        try {
          const response = await RetryUtils.retryWithBackoff(
            async () => this.aiService.callWithCache(
              fullPrompt, 
              promptType.model,
              this.settings.maxTokens,
              this.settings.enableCaching
            ),
            {
              maxRetries: 2,
              initialDelay: 1000,
              shouldRetry: (error) => RetryUtils.isTemporaryError(error)
            }
          );
          
          debugLog(`${promptType.name} response received, length:`, response.length);
          return {
            name: promptType.name,
            response: response
          };
        } catch (error) {
          console.error(`Error with ${promptType.name} prompt:`, error);
          
          // Log error with the error handling service
          ErrorHandlingService.logError(error, {
            operation: `multiModelFactCheck_${promptType.name}`,
            model: promptType.model,
            provider: this.settings.aiProvider
          });
          
          return {
            name: promptType.name,
            response: `Error: Could not complete ${promptType.name} analysis.`
          };
        }
      });
      
      const responses = await Promise.all(responsePromises);
      debugLog("All model responses received");
      
      // Extract ratings from each response
      const ratings = responses.map(resp => {
        const match = resp.response.match(/Rating:\s*(\d+)/i);
        return match ? parseInt(match[1]) : null;
      }).filter(rating => rating !== null);
      
      debugLog("Extracted ratings:", ratings);

      // Calculate an aggregate rating with fallback
      let aggregateRating = 50; // Default if no ratings found
      if (ratings.length > 0) {
        aggregateRating = Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length);
      }
      
      debugLog("Aggregate rating:", aggregateRating);

      // Create a combined result
      let combinedResult = `Rating: ${aggregateRating}\n\nExplanation: `;
      
      // Check if we have valid responses
      const validResponses = responses.filter(r => 
        !r.response.includes("Error:") && 
        r.response.length > 20
      );
      
      if (validResponses.length === 0) {
        debugLog("No valid responses, using default message");
        combinedResult += "Could not perform a complete fact-check due to technical issues. The rating provided is a default value and may not be accurate.";
      } else {
        // Add a summary of the individual analyses
        validResponses.forEach((resp) => {
          // Extract just the explanation part
          const explanationMatch = resp.response.match(/Explanation:(.*?)(?:$|(?:\n\n))/s);
          if (explanationMatch && explanationMatch[1]) {
            combinedResult += `\n\n${resp.name}: ${explanationMatch[1].trim()}`;
          } else {
            // If no explanation format found, use the whole response
            combinedResult += `\n\n${resp.name}: ${resp.response.trim()}`;
          }
        });
      }

      // Add confidence level based on agreement between models
      if (ratings.length > 1) {
        const ratingVariance = Math.max(...ratings) - Math.min(...ratings);
        let confidenceLevel = "High";
        if (ratingVariance > 30) {
          confidenceLevel = "Low";
        } else if (ratingVariance > 15) {
          confidenceLevel = "Moderate";
        }
        
        combinedResult += `\n\nConfidence Level: ${confidenceLevel} (based on agreement between different analysis methods)`;
      } else {
        // Only one rating or none
        combinedResult += "\n\nConfidence Level: Low (limited analysis methods available)";
      }
      
      // Add model information
      combinedResult += `\n\nPrimary Model: ${primaryModel}`;
      if (secondaryModels.length > 0) {
        combinedResult += `\nSecondary Model(s): ${secondaryModels.join(', ')}`;
      }
      
      // End telemetry tracking with success
      if (this.telemetryService) {
        this.telemetryService.endOperation('multiModelFactCheck', { 
          success: true,
          validResponseCount: validResponses.length,
          ratingCount: ratings.length,
          aggregateRating
        });
      }
      
      debugLog("Combined result created, length:", combinedResult.length);
      return combinedResult;
    } catch (error) {
      console.error("Multi-model fact check error:", error);
      
      // Log error with the error handling service
      ErrorHandlingService.logError(error, {
        operation: 'multiModelFactCheck',
        model: primaryModel,
        provider: this.settings.aiProvider
      });
      
      // End telemetry tracking with failure
      if (this.telemetryService) {
        this.telemetryService.endOperation('multiModelFactCheck', { 
          success: false,
          errorType: ErrorHandlingService.categorizeError(error),
          errorMessage: error.message
        });
      }
      
      return `Rating: 50\n\nExplanation: An error occurred during the fact-checking process. This default rating should not be considered accurate.\n\nConfidence Level: Low`;
    }
  }

  async emergencyFallback(text, fallbackModel) {
    debugLog("Using emergency fallback for fact check");
    
    // Track this operation if telemetry is enabled
    if (this.telemetryService) {
      this.telemetryService.startOperation('emergencyFallback', {
        fallbackModel,
        textLength: text.length
      });
    }
    
    try {
      // If no fallback model is specified, select a safe default
      if (!fallbackModel) {
        fallbackModel = this.settings.aiProvider === 'anthropic' 
          ? MODELS.ANTHROPIC.FAST 
          : MODELS.OPENAI.FAST;
      }
      
      debugLog(`Using fallback model: ${fallbackModel}`);
      
      const simplePrompt = `
        Please fact-check the following statement and rate its accuracy from 0-100:
        "${text.substring(0, 1000)}"
        
        Format your response with:
        "Rating: [numerical score]"
        "Explanation: [your brief explanation]"
      `;
      
      // Use retry mechanism for the emergency fallback
      const simpleResult = await RetryUtils.retryWithBackoff(
        async () => this.aiService.callWithCache(
          simplePrompt, 
          fallbackModel,
          CONTENT.MAX_TOKENS.CLAIM_EXTRACTION,
          true
        ),
        {
          maxRetries: 1,
          initialDelay: 1000,
          shouldRetry: (error) => RetryUtils.isTemporaryError(error)
        }
      );
      
      debugLog("Emergency fallback succeeded");
      
      // Extract rating from the simpleResult
      let rating = null;
      const ratingMatch = simpleResult.match(/Rating:\s*(\d+)/i);
      if (ratingMatch && ratingMatch[1]) {
        rating = parseInt(ratingMatch[1], 10);
        debugLog(`Extracted emergency rating: ${rating}`);
      }
      
      // End telemetry tracking with success
      if (this.telemetryService) {
        this.telemetryService.endOperation('emergencyFallback', { 
          success: true,
          rating
        });
      }
      
      return { 
        result: simpleResult + `<br><br><strong>References:</strong><br>No references available (emergency mode).<br><br><em>Note: This is a simplified fact-check using the ${fallbackModel} model.</em>`, 
        queryText: text.substring(0, 100),
        rating: rating
      };
    } catch (finalError) {
      console.error("Final fallback error:", finalError);
      
      // Log error with the error handling service
      ErrorHandlingService.logError(finalError, {
        operation: 'emergencyFallback',
        model: fallbackModel,
        provider: this.settings.aiProvider
      });
      
      // End telemetry tracking with failure
      if (this.telemetryService) {
        this.telemetryService.endOperation('emergencyFallback', { 
          success: false,
          errorType: ErrorHandlingService.categorizeError(finalError),
          errorMessage: finalError.message
        });
      }
      
      throw new Error('Unable to complete fact-check. Please try again later.');
    }
  }
}