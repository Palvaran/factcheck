// services/ModelSelectionService.js - Intelligent model selection based on context
import { MODELS, CONTENT } from '../utils/constants.js';

/**
 * Service for intelligently selecting the optimal AI model based on context
 */
export class ModelSelectionService {
  /**
   * Select the optimal model based on text characteristics and user preferences
   * 
   * @param {Object} options - Selection options
   * @param {string} options.provider - AI provider ('openai' or 'anthropic')
   * @param {string} options.textLength - Length of text to analyze
   * @param {string} options.complexity - Estimated complexity ('low', 'medium', 'high')
   * @param {string} options.urgency - Time sensitivity ('low', 'medium', 'high')
   * @param {boolean} options.costSensitive - Whether to prioritize cost savings
   * @param {string} options.task - Type of task ('fact_check', 'claim_extraction', 'search_query')
   * @returns {string} The selected model name
   */
  static selectOptimalModel(options) {
    const {
      provider = 'openai',
      textLength = 0,
      complexity = 'medium',
      urgency = 'medium',
      costSensitive = true,
      task = 'fact_check'
    } = options;
    
    // Get the model set for the selected provider
    const models = provider === 'anthropic' ? MODELS.ANTHROPIC : MODELS.OPENAI;
    
    // For extraction tasks, always use the fastest model
    if (task === 'claim_extraction' || task === 'search_query') {
      return task === 'claim_extraction' ? models.EXTRACTION : models.FAST;
    }
    
    // For high urgency, prioritize speed
    if (urgency === 'high') {
      return models.FAST;
    }
    
    // For complex, longer texts with low urgency, use the most powerful model
    if (complexity === 'high' && textLength > 3000 && urgency === 'low' && !costSensitive) {
      return models.ADVANCED;
    }
    
    // For medium complexity or medium-length texts
    if ((complexity === 'medium' || (textLength > 1000 && textLength <= 3000)) && !costSensitive) {
      return models.STANDARD;
    }
    
    // Default to the fastest model for cost-sensitive or simple tasks
    return models.FAST;
  }
  
  /**
   * Estimate text complexity based on content
   * 
   * @param {string} text - The text to analyze
   * @returns {string} Complexity level ('low', 'medium', 'high')
   */
  static estimateComplexity(text) {
    if (!text) return 'low';
    
    // Count sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = sentences.reduce((sum, s) => {
      return sum + s.split(/\s+/).filter(w => w.length > 0).length;
    }, 0) / (sentences.length || 1);
    
    // Check for technical terms and specialized vocabulary
    const technicalTerms = [
      'quantum', 'algorithm', 'methodology', 'statistical', 'molecular',
      'hypothesis', 'correlation', 'causation', 'analysis', 'synthesis',
      'theoretical', 'empirical', 'paradigm', 'mechanism', 'infrastructure'
    ];
    
    const technicalTermCount = technicalTerms.reduce((count, term) => {
      const regex = new RegExp(`\\b${term}\\w*\\b`, 'gi');
      const matches = text.match(regex) || [];
      return count + matches.length;
    }, 0);
    
    // Calculate complexity score
    let complexityScore = 0;
    
    // Factor 1: Sentence length
    if (avgWordsPerSentence > 25) complexityScore += 3;
    else if (avgWordsPerSentence > 18) complexityScore += 2;
    else if (avgWordsPerSentence > 12) complexityScore += 1;
    
    // Factor 2: Text length
    if (text.length > 5000) complexityScore += 3;
    else if (text.length > 2000) complexityScore += 2;
    else if (text.length > 800) complexityScore += 1;
    
    // Factor 3: Technical terms
    const technicalDensity = technicalTermCount / (text.length / 100);
    if (technicalDensity > 0.5) complexityScore += 3;
    else if (technicalDensity > 0.2) complexityScore += 2;
    else if (technicalDensity > 0.1) complexityScore += 1;
    
    // Map score to complexity level
    if (complexityScore >= 6) return 'high';
    if (complexityScore >= 3) return 'medium';
    return 'low';
  }
  
  /**
   * Select secondary models for multi-model fact checking
   * 
   * @param {string} primaryModel - The primary model being used
   * @param {string} provider - AI provider ('openai' or 'anthropic')
   * @param {boolean} costSensitive - Whether to prioritize cost savings
   * @returns {string[]} Array of secondary model names
   */
  static selectSecondaryModels(primaryModel, provider, costSensitive = true) {
    const models = provider === 'anthropic' ? MODELS.ANTHROPIC : MODELS.OPENAI;
    
    // If using the advanced model as primary, use standard as secondary
    if (primaryModel === models.ADVANCED) {
      return [models.STANDARD];
    }
    
    // If using standard model as primary, use fast as secondary
    if (primaryModel === models.STANDARD) {
      return [models.FAST];
    }
    
    // If using fast model and not cost sensitive, add standard as secondary
    if (primaryModel === models.FAST && !costSensitive) {
      return [models.STANDARD];
    }
    
    // Default: just use the fast model again with different prompting
    return [models.FAST];
  }
}
