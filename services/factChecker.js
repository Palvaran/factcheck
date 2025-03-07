// services/factChecker.js
import { OpenAIService } from '../api/openai.js';
import { BraveSearchService } from '../api/brave.js';
import { CONTENT, DOMAINS } from '../utils/constants.js';

// Global debug flag - set to false for production
const DEBUG = false;

// Debug logging helper
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

export class FactCheckerService {
  constructor(openaiApiKey, braveApiKey, settings = {}) {
    debugLog("Initializing FactCheckerService with settings:", {
      model: settings.aiModel || 'gpt-4o-mini',
      multiModel: settings.useMultiModel !== false,
      tokens: settings.maxTokens || CONTENT.MAX_TOKENS.DEFAULT,
      caching: settings.enableCaching !== false,
      rateLimit: settings.rateLimit || 5
    });
    
    this.openaiService = new OpenAIService(openaiApiKey);
    this.braveService = braveApiKey ? new BraveSearchService(braveApiKey) : null;
    debugLog("BraveSearchService available:", !!this.braveService);
    
    // Set defaults if settings are missing
    this.settings = {
      aiModel: settings.aiModel || 'gpt-4o-mini',
      useMultiModel: settings.useMultiModel !== false,
      maxTokens: settings.maxTokens || CONTENT.MAX_TOKENS.DEFAULT,
      enableCaching: settings.enableCaching !== false,
      rateLimit: settings.rateLimit || 5
    };
    
    // Update rate limit setting
    this.openaiService.setRateLimit(this.settings.rateLimit);
    
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
      // Get current date for context
      const today = new Date().toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
      debugLog("Today's date for context:", today);
      
      // Extract query for search context
      debugLog("Extracting search query...");
      const queryText = await this.openaiService.extractSearchQuery(text, this.settings.aiModel);
      debugLog("Query extracted, length:", queryText.length);
      
      // Collect all potential operations and run in parallel where possible
      const operations = [];
      
      // Only add the search operation if we have a Brave service
      if (this.braveService) {
        operations.push(
          this.braveService.search(queryText)
            .then(result => ({ type: 'search', data: result }))
            .catch(error => ({ type: 'search', error }))
        );
      }
      
      // Execute all operations in parallel
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
      }
      
      // Determine which model to use based on settings
      const analysisModel = this.settings.aiModel === 'hybrid' ? 'gpt-4o-mini' : this.settings.aiModel;
      debugLog(`Using ${analysisModel} for analysis`);
      
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
      
      debugLog("Fact check completed successfully");
      
      // Combine results and references
      const combinedResult = factCheckResult + referencesHTML;
      
      return { result: combinedResult, queryText };
    } catch (error) {
      console.error("Critical error in factCheck:", error);
      
      // Attempt emergency fallback
      try {
        const emergencyResult = await this.emergencyFallback(text);
        return emergencyResult;
      } catch (fallbackError) {
        // If even the fallback fails, return the original error
        return { 
          result: `Error: ${error.message} - Please try again later or check your API keys.`, 
          queryText: text.substring(0, 100) 
        };
      }
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
      
      // Call OpenAI API with the selected model
      debugLog(`Calling OpenAI API with model: ${model}`);
      const result = await this.openaiService.callWithCache(
        prompt, 
        model,
        this.settings.maxTokens,
        this.settings.enableCaching
      );
      
      debugLog("OpenAI response received, length:", result.length);
      return result;
    } catch (error) {
      console.error("Single model fact check error:", error);
      throw new Error(`Error during fact check: ${error.message}`);
    }
  }

  async performMultiModelFactCheck(text, searchContext, today, primaryModel) {
    debugLog("Starting multi-model fact check with primary model:", primaryModel);
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
        model: "gpt-4o-mini" // Always use 4o for second opinion to save costs
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
          const response = await this.openaiService.callWithCache(
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
        
        Rating and brief explanation only.
      `;
      
      const simpleResult = await this.openaiService.callWithCache(
        simplePrompt, 
        "gpt-4o-mini",
        CONTENT.MAX_TOKENS.CLAIM_EXTRACTION,
        true
      );
      
      debugLog("Emergency fallback succeeded");
      return { 
        result: simpleResult + "<br><br><strong>References:</strong><br>No references available (emergency mode).", 
        queryText: text.substring(0, 100) 
      };
    } catch (finalError) {
      console.error("Final fallback error:", finalError);
      throw new Error('Unable to complete fact-check. Please try again later.');
    }
  }
}