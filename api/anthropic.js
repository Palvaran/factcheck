// api/anthropic.js - Updated to use BaseApiService
import { BaseApiService } from './BaseApiService.js';
import { REQUEST, API, MODELS } from '../utils/constants.js';

export class AnthropicService extends BaseApiService {
  constructor(apiKey) {
    // Set up request settings for Anthropic
    const anthropicRequestSettings = {
      baseBackoff: REQUEST.BACKOFF.ANTHROPIC?.INITIAL || 1000,
      maxBackoff: REQUEST.BACKOFF.ANTHROPIC?.MAX || 15000,
      backoffFactor: REQUEST.BACKOFF.ANTHROPIC?.FACTOR || 2,
      rateLimitPerMinute: REQUEST.RATE_LIMITS.ANTHROPIC || REQUEST.RATE_LIMITS.DEFAULT
    };
    
    // Call the base class constructor
    super(apiKey, anthropicRequestSettings);
    
    console.log(`AnthropicService initialized with API key: ${apiKey ? 'PRESENT' : 'MISSING'}`);
  }

  /**
   * Process a request to the Anthropic API
   * @param {Object} requestData - Request data
   * @returns {Promise<string>} API response
   * @override
   */
  async _processRequest(requestData) {
    const { prompt, model, maxTokens } = requestData;
    
    // Convert maxTokens to integer
    const maxTokensInt = parseInt(maxTokens, 10);
    
    // Log for debugging
    console.log(`Making Anthropic API request with model: ${model}, max_tokens: ${maxTokensInt}`);
    
    // Map OpenAI-style model names to Anthropic models if needed
    const actualModel = this._getActualModel(model);
    
    const requestBody = {
      model: actualModel,
      max_tokens: maxTokensInt,
      temperature: 0.3,
      messages: [
        { role: "user", content: prompt }
      ]
    };
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(`Anthropic API error (${response.status}): ${errorData.error?.message || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    
    const data = await response.json();
    
    // Extract text content from Anthropic's response format
    if (data.content && data.content[0] && data.content[0].type === 'text') {
      return data.content[0].text.trim();
    } else {
      return 'No result.';
    }
  }

  /**
   * Map model names if needed (for compatibility with existing code)
   * @param {string} model - The input model name
   * @returns {string} The actual model name to use with Anthropic API
   */
  _getActualModel(model) {
    // If it's already a valid Claude model, return it as is
    if (model.includes('claude-') && 
        !model.includes('claude-3-5-haiku-20240307')) { // Skip specific invalid models
      return model;
    }
    
    // Check if it's a generic model that needs mapping
    if (MODELS.GENERIC[model] && MODELS.GENERIC[model].anthropic) {
      return MODELS.GENERIC[model].anthropic;
    }
    
    // Use appropriate model based on name
    switch (model) {
      case 'gpt-4o-mini':
        return MODELS.ANTHROPIC.FAST;
      case 'o3-mini':
        return MODELS.ANTHROPIC.STANDARD;
      case 'hybrid':
        return MODELS.ANTHROPIC.ADVANCED;
      default:
        return MODELS.ANTHROPIC.DEFAULT;
    }
  }

  /**
   * Get the model to use for claim extraction
   * @param {string} model - The base model
   * @returns {string} The model to use for extraction
   * @override
   */
  getExtractionModel(model) {
    // Always use a fast model for extraction
    return MODELS.ANTHROPIC.EXTRACTION;
  }
}