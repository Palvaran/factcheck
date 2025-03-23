// services/factChecker.js - Updated to support both OpenAI and Anthropic
import { BraveSearchService } from '../api/brave.js';
import { CONTENT, DOMAINS } from '../utils/constants.js';

// Global debug flag - set to true for debugging
const DEBUG = true;

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
    
    // Immediately test the Brave API if available
    if (this.braveService) {
      debugLog("Testing Brave API during initialization");
      
      // Run a quick test query
      this.braveService.enqueueSearch("test query")
        .then(results => {
          debugLog(`✓ Brave API test successful, got ${results.length} results`);
        })
        .catch(error => {
          console.error("✗ Brave API test failed during initialization:", error);
        });
    }
    
    // Set defaults if settings are missing
    this.settings = {
      aiProvider: settings.aiProvider || 'openai',
      aiModel: settings.aiModel || 'gpt-4o-mini',
      useMultiModel: settings.useMultiModel !== false,
      maxTokens: settings.maxTokens || CONTENT.MAX_TOKENS.DEFAULT,
      enableCaching: settings.enableCaching !== false,
      rateLimit: settings.rateLimit || 5
    };
    
    // Update rate limit setting
    if (this.aiService.setRateLimit) {
      this.aiService.setRateLimit(this.settings.rateLimit);
    }
    
    // Keep track of ongoing check operations
    this.pendingChecks = new Map();
  }

  async check(text) {
    const textHash = await this._hashText(text);
    
    // If we already have a pending check for this text, return the existing promise
    if (this.pendingChecks.has(textHash)) {
      debugLog("Returning existing pending check for identical text");
      return this.pendingChecks.get(textHash);
    }
    
    // Create a new promise for this check
    const checkPromise = this._performCheck(text);
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
    
    try {
      // Signal the content extraction step
      await this._updateProgress('extraction');
      
      // Get current date for context
      const today = new Date().toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
      debugLog("Today's date for context:", today);
      
      // Extract query for search context
      debugLog("Extracting search query...");
      
      // Signal the query generation step
      await this._updateProgress('query');
      
      const queryText = await this.aiService.extractSearchQuery(text, this.settings.aiModel);
      debugLog("Query extracted, length:", queryText.length);  
      
      // Verify if Brave service is available
      if (!this.braveService) {
        debugLog("WARNING: Brave service is null. API key might be missing or invalid.");
        
        // Attempt emergency reinitialization
        try {
          // Retrieve the API key from storage again
          chrome.storage.sync.get(['braveApiKey'], (result) => {
            if (result.braveApiKey) {
              debugLog("Found Brave API key in storage, attempting to reinitialize service");
              this.braveService = new BraveSearchService(result.braveApiKey);
            } else {
              debugLog("No Brave API key found in storage");
            }
          });
        } catch (storageError) {
          console.error("Error accessing storage:", storageError);
        }
      }
      
      // Collect all potential operations and run in parallel where possible
      const operations = [];
      
      // Only add the search operation if we have a Brave service
      if (this.braveService) {
        debugLog("Adding Brave search operation");
        
        // Signal the search step
        await this._updateProgress('search');
        
        operations.push(
          this.braveService.search(queryText)
            .then(result => ({ type: 'search', data: result }))
            .catch(error => {
              console.error("Error in Brave search operation:", error);
              return { type: 'search', error };
            })
        );
      } else {
        debugLog("Skipping Brave search operation - service not available");
      }
      
      // Execute all operations in parallel
      debugLog(`Executing ${operations.length} operations in parallel`);
      const results = await Promise.all(operations);
      
      // Extract results from the operations
      let searchResult = results.find(r => r.type === 'search');
      let searchContext = '';
      let referencesHTML = '<br><br><strong>References:</strong><br>No references available.';
      
      if (searchResult && !searchResult.error) {
        searchContext = searchResult.data.searchContext;
        referencesHTML = searchResult.data.referencesHTML;
        debugLog("Search context acquired, length:", searchContext.length);
      } else if (searchResult?.error) {
        console.error("Error with search:", searchResult.error);
        referencesHTML = `<br><br><strong>References:</strong><br>Error fetching references: ${searchResult.error.message}`;
      }
      
      // Determine which model to use based on settings
      const analysisModel = this.settings.aiModel === 'hybrid' ? 
        (this.settings.aiProvider === 'anthropic' ? 'claude-3-opus-20240229' : 'gpt-4o-mini') : 
        this.settings.aiModel;
      
      debugLog(`Using ${analysisModel} for analysis`);
      
      // Signal the analysis step
      await this._updateProgress('analysis');
      
      let factCheckResult;
      
      // Use multi-model verification if enabled
      if (this.settings.useMultiModel) {
        debugLog("Using multi-model approach");
        factCheckResult = await this.performMultiModelFactCheck(
          text, 
          searchContext, 
          today, 
          analysisModel
        );
      } else {
        // Use single model approach
        debugLog("Using single model approach");
        factCheckResult = await this.singleModelFactCheck(
          text,
          searchContext,
          today,
          analysisModel
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
      
      // Return all three values in a consistent object
      return { 
        result: combinedResult, 
        queryText, 
        rating
      };
    } catch (error) {
      console.error("Critical error in factCheck:", error);
      
      // Attempt emergency fallback
      try {
        debugLog("Attempting emergency fallback...");
        const emergencyResult = await this.emergencyFallback(text);
        return emergencyResult; // This should already be returning { result, queryText, rating }
      } catch (fallbackError) {
        console.error("Even fallback failed:", fallbackError);
        // If even the fallback fails, return the original error
        return { 
          result: `Error: ${error.message} - Please try again later or check your API keys.`, 
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

  async singleModelFactCheck(text, searchContext, today, model) {
    debugLog(`Starting single model fact check with model: ${model}`);
    try {
      // Build the prompt with search context if available
      const prompt = this.buildPrompt(text, searchContext, today, !!searchContext);
      debugLog("Prompt built, length:", prompt.length);
      
      // Call AI API with the selected model
      debugLog(`Calling AI API with model: ${model}`);
      const result = await this.aiService.callWithCache(
        prompt, 
        model,
        this.settings.maxTokens,
        this.settings.enableCaching
      );
      
      debugLog("AI response received, length:", result.length);
      return result;
    } catch (error) {
      console.error("Single model fact check error:", error);
      throw new Error(`Error during fact check: ${error.message}`);
    }
  }

  async performMultiModelFactCheck(text, searchContext, today, primaryModel) {
    debugLog("Starting multi-model approach with primary model:", primaryModel);
    
    // Choose appropriate secondary model based on provider
    const secondaryModel = this.settings.aiProvider === 'anthropic' 
      ? 'claude-3-haiku-20240307'  // Use Haiku for Anthropic
      : 'gpt-4o-mini';            // Use GPT-4o-mini for OpenAI
    
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
        model: secondaryModel
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
          const response = await this.aiService.callWithCache(
            fullPrompt, 
            promptType.model,
            this.settings.maxTokens,
            this.settings.enableCaching
          );
          
          debugLog(`${promptType.name} response received, length:`, response.length);
          return {
            name: promptType.name,
            response: response
          };
        } catch (error) {
          console.error(`Error with ${promptType.name} prompt:`, error);
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

      debugLog("Combined result created, length:", combinedResult.length);
      return combinedResult;
    } catch (error) {
      console.error("Multi-model fact check error:", error);
      return `Rating: 50\n\nExplanation: An error occurred during the fact-checking process. This default rating should not be considered accurate.\n\nConfidence Level: Low`;
    }
  }

  async emergencyFallback(text) {
    debugLog("Using emergency fallback for fact check");
    try {
      const simplePrompt = `
        Please fact-check the following statement and rate its accuracy from 0-100:
        "${text.substring(0, 1000)}"
        
        Format your response with:
        "Rating: [numerical score]"
        "Explanation: [your brief explanation]"
      `;
      
      const simpleResult = await this.aiService.callWithCache(
        simplePrompt, 
        this.settings.aiProvider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o-mini',
        CONTENT.MAX_TOKENS.CLAIM_EXTRACTION,
        true
      );
      
      debugLog("Emergency fallback succeeded");
      
      // Extract rating from the simpleResult
      let rating = null;
      const ratingMatch = simpleResult.match(/Rating:\s*(\d+)/i);
      if (ratingMatch && ratingMatch[1]) {
        rating = parseInt(ratingMatch[1], 10);
        debugLog(`Extracted emergency rating: ${rating}`);
      }
      
      return { 
        result: simpleResult + "<br><br><strong>References:</strong><br>No references available (emergency mode).", 
        queryText: text.substring(0, 100),
        rating: rating
      };
    } catch (finalError) {
      console.error("Final fallback error:", finalError);
      throw new Error('Unable to complete fact-check. Please try again later.');
    }
  }
}