// modules/api-key-manager.js
import { API, STYLES } from '../../utils/constants.js';

/**
 * Manages API key functionality for the options page
 * Handles validation, masking, testing, and storage of API keys
 */
export class ApiKeyManager {
  constructor() {
    this.modifiedFields = new Set();
  }

  /**
   * Set up API key fields with proper event listeners
   */
  setupApiKeyFields() {
    const apiKeyFields = ['openaiApiKey', 'braveApiKey'];
    
    apiKeyFields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (!field) return;
      
      // Focus event - replace masked value with full key for editing
      field.addEventListener('focus', () => {
        if (field.dataset.fullKey && !this.modifiedFields.has(fieldId)) {
          field.value = field.dataset.fullKey;
        }
      });
      
      // Input event - track that the field has been modified
      field.addEventListener('input', () => {
        this.modifiedFields.add(fieldId);
        
        // If field is emptied, remove from modified set
        if (!field.value.trim()) {
          this.modifiedFields.delete(fieldId);
        }
      });
      
      // Blur event - remask if the field hasn't been modified
      field.addEventListener('blur', () => {
        if (field.dataset.fullKey && !this.modifiedFields.has(fieldId)) {
          field.value = this.maskApiKey(field.dataset.fullKey);
        }
      });
    });
  }

  /**
   * Set up visibility toggles for API key fields
   */
  setupVisibilityToggles() {
    document.querySelectorAll('.toggle-visibility').forEach(button => {
      button.addEventListener('click', () => {
        const inputId = button.getAttribute('data-for');
        const input = document.getElementById(inputId);
        
        if (input.type === 'password') {
          input.type = 'text';
          button.textContent = 'HIDE';
        } else {
          input.type = 'password';
          button.textContent = 'SHOW';
        }
      });
    });
  }

  /**
   * Test the OpenAI API key
   */
  async testOpenAIKey() {
    // Get the API key from input field OR the stored full key in data attribute
    const inputField = document.getElementById('openaiApiKey');
    let apiKey = inputField.dataset.fullKey || inputField.value.trim();
    
    const errorDiv = document.getElementById('openai-error');
    const testButton = document.getElementById('testOpenAI');
    
    // Show loading state
    testButton.textContent = 'TESTING...';
    testButton.disabled = true;
    errorDiv.style.display = 'none';
    
    try {
      // Simple request to check models endpoint
      const response = await fetch(API.OPENAI.BASE_URL.replace('/chat/completions', '/models'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // API key is valid
        errorDiv.style.display = 'block';
        errorDiv.style.backgroundColor = '#E8F5E9';
        errorDiv.style.color = STYLES.COLORS.LIGHT.SUCCESS;
        errorDiv.textContent = '✓ OpenAI API key is valid';
        
        // Save the valid key immediately
        chrome.storage.sync.set({ openaiApiKey: apiKey }, function() {
          console.log("OpenAI API key saved immediately after successful test");
        });
        
        // Reset after 3 seconds
        setTimeout(() => {
          errorDiv.style.display = 'none';
        }, 3000);
      } else {
        // API key is invalid
        errorDiv.style.display = 'block';
        errorDiv.style.backgroundColor = '#FFEBEE';
        errorDiv.style.color = STYLES.COLORS.LIGHT.ERROR;
        errorDiv.textContent = `✗ Error: ${data.error?.message || 'Invalid API key'}`;
      }
    } catch (error) {
      // Network error or other issue
      errorDiv.style.display = 'block';
      errorDiv.style.backgroundColor = '#FFEBEE';
      errorDiv.style.color = STYLES.COLORS.LIGHT.ERROR;
      errorDiv.textContent = `✗ Error: ${error.message || 'Connection failed'}`;
    } finally {
      // Reset button state
      testButton.textContent = 'TEST';
      testButton.disabled = false;
    }
  }

  /**
   * Test the Anthropic API key
   */
  async testAnthropicKey() {
    const inputField = document.getElementById('anthropicApiKey');
    let apiKey = inputField.dataset.fullKey || inputField.value.trim();
    
    const errorDiv = document.getElementById('anthropic-error');
    const testButton = document.getElementById('testAnthropic');
    
    testButton.textContent = 'TESTING...';
    testButton.disabled = true;
    errorDiv.style.display = 'none';
    
    try {
      // Use the extension's background script for the API call
      const response = await chrome.runtime.sendMessage({
        action: 'testAnthropicKey',
        apiKey: apiKey
      });
      
      if (response.success) {
        errorDiv.style.display = 'block';
        errorDiv.style.backgroundColor = '#E8F5E9';
        errorDiv.style.color = STYLES.COLORS.LIGHT.SUCCESS;
        errorDiv.textContent = '✓ Anthropic API key is valid';
        
        chrome.storage.sync.set({ anthropicApiKey: apiKey });
        
        setTimeout(() => {
          errorDiv.style.display = 'none';
        }, 3000);
      } else {
        errorDiv.style.display = 'block';
        errorDiv.style.backgroundColor = '#FFEBEE';
        errorDiv.style.color = STYLES.COLORS.LIGHT.ERROR;
        errorDiv.textContent = `✗ Error: ${response.error || 'Invalid API key'}`;
      }
    } catch (error) {
      errorDiv.style.display = 'block';
      errorDiv.style.backgroundColor = '#FFEBEE';
      errorDiv.style.color = STYLES.COLORS.LIGHT.ERROR;
      errorDiv.textContent = `✗ Error: ${error.message || 'Connection failed'}`;
    } finally {
      testButton.textContent = 'TEST';
      testButton.disabled = false;
    }
  }

  /**
   * Test the Brave API key
   */
  async testBraveKey() {
    // Get the API key from input field OR the stored full key in data attribute
    const inputField = document.getElementById('braveApiKey');
    let apiKey = inputField.dataset.fullKey || inputField.value.trim();
    
    const errorDiv = document.getElementById('brave-error');
    const testButton = document.getElementById('testBrave');
    
    // Show loading state
    testButton.textContent = 'TESTING...';
    testButton.disabled = true;
    errorDiv.style.display = 'none';
    
    try {
      // Use the correct Brave Search API endpoint from constants
      const searchUrl = `${API.BRAVE.BASE_URL}?q=${encodeURIComponent('test query')}&count=1`;
      
      // Use the proper headers required by Brave API
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey
        }
      });
      
      // Try to get response text first for debugging
      let responseText = await response.text();
      
      // Parse JSON if possible
      let data = {};
      try {
        if (responseText) {
          data = JSON.parse(responseText);
        }
      } catch (e) {
        console.log("Could not parse response as JSON:", e);
      }
      
      if (response.ok) {
        // API key is valid
        errorDiv.style.display = 'block';
        errorDiv.style.backgroundColor = '#E8F5E9';
        errorDiv.style.color = STYLES.COLORS.LIGHT.SUCCESS;
        
        if (data.web && data.web.results && data.web.results.length > 0) {
          errorDiv.textContent = `✓ Brave Search API key is valid - Got ${data.web.results.length} result(s)`;
        } else {
          errorDiv.textContent = '✓ Brave Search API key is valid, but no results returned for test query';
        }
        
        // Save key immediately
        chrome.storage.sync.set({ braveApiKey: apiKey }, function() {
          console.log("Brave API key saved immediately after successful test");
        });
        
        // Reset after 5 seconds
        setTimeout(() => {
          errorDiv.style.display = 'none';
        }, 5000);
      } else {
        // API key is invalid or other error
        errorDiv.style.display = 'block';
        errorDiv.style.backgroundColor = '#FFEBEE';
        errorDiv.style.color = STYLES.COLORS.LIGHT.ERROR;
        
        // Detailed error handling for different status codes
        switch (response.status) {
          case 401:
            errorDiv.textContent = '✗ Error: Invalid API key or unauthorized access';
            break;
          case 422:
            errorDiv.innerHTML = `✗ Error: The API request was rejected (422).<br>
              Likely causes: 
              <ul style="margin-top: 5px; margin-bottom: 0;">
                <li>Incorrect API key format</li>
                <li>The API key may be expired</li>
                <li>Your Brave Search account may need verification</li>
              </ul>`;
            break;
          case 429:
            errorDiv.textContent = '✗ Error: Rate limit exceeded. Try again in a minute.';
            break;
          default:
            errorDiv.textContent = `✗ Error: API request failed (${response.status})`;
            
            // Add any available error details
            if (data && data.error) {
              errorDiv.textContent += ` - ${data.error}`;
            }
        }
      }
    } catch (error) {
      // Network error or other issue
      errorDiv.style.display = 'block';
      errorDiv.style.backgroundColor = '#FFEBEE';
      errorDiv.style.color = STYLES.COLORS.LIGHT.ERROR;
      errorDiv.textContent = `✗ Error: ${error.message || 'Connection failed'}`;
    } finally {
      // Reset button state
      testButton.textContent = 'TEST';
      testButton.disabled = false;
    }
  }

  // Utility methods

  /**
   * Sanitize API key (remove whitespace, control chars, etc.)
   * @param {string} key - The API key to sanitize
   * @returns {string} Sanitized key
   */
  sanitizeApiKey(key) {
    if (!key) return '';
    
    // Remove any whitespace
    let sanitized = key.trim();
    
    // Remove any non-ASCII characters (limits to standard alphanumeric and basic symbols)
    sanitized = sanitized.replace(/[^\x00-\x7F]/g, '');
    
    // Remove any invisible control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    
    return sanitized;
  }

  /**
   * Validate OpenAI API key format
   * @param {string} key - The API key to validate
   * @returns {Object} Validation result with valid flag and message
   */
  validateOpenAIKey(key) {
    // Basic validation for OpenAI API key format
    if (!key || typeof key !== 'string') {
      return { valid: false, message: "API key is missing" };
    }
  
    // Sanitize the key
    const sanitizedKey = this.sanitizeApiKey(key);
    
    // Check format
    if (!sanitizedKey.startsWith('sk-')) {
      return { valid: false, message: "OpenAI API key should start with 'sk-'" };
    }
    
    // Check length (typical OpenAI keys are around 51 characters)
    if (sanitizedKey.length < 30) {
      return { valid: false, message: "OpenAI API key appears to be truncated or incomplete" };
    }
    
    return { valid: true, sanitizedKey };
  }

  /**
   * Validate Anthropic API key format
   * @param {string} key - The API key to validate
   * @returns {Object} Validation result with valid flag and message
   */
  validateAnthropicKey(key) {
    // Basic validation for Anthropic API key format
    if (!key || typeof key !== 'string') {
      return { valid: false, message: "API key is missing" };
    }
    
    // Sanitize the key
    const sanitizedKey = this.sanitizeApiKey(key);
    
    // Check format - Anthropic keys generally start with "sk-ant-"
    if (!sanitizedKey.startsWith('sk-ant-')) {
      return { valid: false, message: "Anthropic API key should start with 'sk-ant-'" };
    }
    
    // Check length (typical Anthropic keys are fairly long)
    if (sanitizedKey.length < 30) {
      return { valid: false, message: "Anthropic API key appears to be truncated or incomplete" };
    }
    
    return { valid: true, sanitizedKey };
  }
  
  /**
   * Validate Brave API key format
   * @param {string} key - The API key to validate
   * @returns {Object} Validation result with valid flag and message
   */
  validateBraveKey(key) {
    // Basic validation for Brave API key format
    if (!key || typeof key !== 'string') {
      return { valid: false, message: "API key is missing" };
    }
  
    // Sanitize the key
    const sanitizedKey = this.sanitizeApiKey(key);
    
    // Check format - typical Brave API keys should start with BSA (but this could vary)
    if (!sanitizedKey.startsWith('BSA')) {
      return { 
        valid: false, 
        message: "Brave API key should typically start with 'BSA'. Make sure you're using the correct key." 
      };
    }
    
    // Check length
    if (sanitizedKey.length < 10) {
      return { valid: false, message: "Brave API key appears to be truncated or incomplete" };
    }
    
    return { valid: true, sanitizedKey };
  }

  /**
   * Mask API key for display (showing only first/last few chars)
   * @param {string} key - The API key to mask
   * @param {number} visibleChars - Number of chars to show at start/end
   * @returns {string} Masked key
   */
  maskApiKey(key, visibleChars = 4) {
    if (!key || key.length <= visibleChars * 2) return key;
    
    const firstPart = key.substring(0, visibleChars);
    const lastPart = key.substring(key.length - visibleChars);
    const middleLength = key.length - (visibleChars * 2);
    const maskedPart = '•'.repeat(Math.min(middleLength, 20)); // Limit the number of dots for very long keys
    
    return `${firstPart}${maskedPart}${lastPart}`;
  }

  /**
   * Get the value of a field with proper handling for masked fields
   * @param {string} fieldId - ID of the field
   * @returns {string} Field value
   */
  getFieldValue(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return '';
    
    return this.modifiedFields.has(fieldId) 
      ? field.value.trim() 
      : (field.dataset.fullKey || field.value.trim());
  }
}