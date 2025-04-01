// api/openai.js - Updated to use BaseApiService
import { BaseApiService } from './BaseApiService.js';
import { REQUEST, API, MODELS } from '../utils/constants.js';

export class OpenAIService extends BaseApiService {
  constructor(apiKey) {
    // Set up request settings for OpenAI
    const requestSettings = {
      baseBackoff: REQUEST.BACKOFF.OPENAI.INITIAL,
      maxBackoff: REQUEST.BACKOFF.OPENAI.MAX,
      backoffFactor: REQUEST.BACKOFF.OPENAI.FACTOR,
      rateLimitPerMinute: REQUEST.RATE_LIMITS.OPENAI
    };
    
    // Call the base class constructor
    super(apiKey, requestSettings);
    
    console.log(`OpenAIService initialized with API key: ${apiKey ? 'PRESENT' : 'MISSING'}`);
  }

  /**
   * Process a request to the OpenAI API
   * @param {Object} requestData - Request data
   * @returns {Promise<string>} API response
   * @override
   */
  async _processRequest(requestData) {
    const { prompt, model, maxTokens } = requestData;
    
    // Convert maxTokens to integer
    const maxTokensInt = parseInt(maxTokens, 10);
    
    // Log for debugging
    console.log(`Making OpenAI API request with model: ${model}, max_tokens: ${maxTokensInt}`);
    
    const requestBody = {
      model: this._getActualModel(model),
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokensInt,
      temperature: 0.3
    };
    
    const response = await fetch(API.OPENAI.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(`OpenAI API error (${response.status}): ${errorData.error?.message || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    
    const data = await response.json();
    return data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content.trim()
      : 'No result.';
  }

  /**
   * Map model names if needed (for compatibility with existing code)
   * @param {string} model - The input model name
   * @returns {string} The actual model name to use with OpenAI API
   */
  _getActualModel(model) {
    // If it's already a valid OpenAI model, return it as is
    if (model.includes('gpt-')) {
      return model;
    }
    
    // Check if it's a generic model that needs mapping
    if (MODELS.GENERIC[model] && MODELS.GENERIC[model].openai) {
      return MODELS.GENERIC[model].openai;
    }
    
    // Use appropriate model based on name
    switch (model) {
      case 'hybrid':
        return MODELS.OPENAI.ADVANCED;
      case 'o3-mini':
        return MODELS.OPENAI.STANDARD;
      default:
        return MODELS.OPENAI.DEFAULT;
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
    return MODELS.OPENAI.EXTRACTION;
  }
}