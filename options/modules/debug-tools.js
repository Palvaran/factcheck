// modules/debug-tools.js
import { API } from '../../utils/constants.js';
import { ApiKeyManager } from './api-key-manager.js';
import { SUPABASE_CONFIG } from '../../utils/supabase-config.js';
import { DebugUtils } from '../../utils/debug-utils.js';

/**
 * Manages debugging tools for the options page
 */
export class DebugTools {
  constructor() {
    this.apiKeyManager = new ApiKeyManager();
    this.analyticsManager = null; // Will be set by options.js
  }

/**
 * Setup debug controls
 */
setupDebugControls() {
  // Try to find the debug tools card
  const debugToolsCard = document.querySelector('#analytics .card:last-child');
  if (!debugToolsCard) {
    DebugUtils.error("DebugTools", "Debug tools card not found");
    return;
  }
  
  // Create a container for the debug toggle
  const debugToggleContainer = document.createElement('div');
  debugToggleContainer.style.marginTop = '15px';
  debugToggleContainer.style.padding = '10px';
  debugToggleContainer.style.backgroundColor = '#f5f5f5';
  debugToggleContainer.style.borderRadius = '4px';
  
  // Add a heading
  const heading = document.createElement('h3');
  heading.textContent = 'Debug Controls';
  heading.style.marginTop = '0';
  debugToggleContainer.appendChild(heading);
  
  // Create the option row for the debug toggle
  const optionRow = document.createElement('div');
  optionRow.className = 'option-row';
  
  // Create the label
  const label = document.createElement('span');
  label.className = 'option-label';
  label.textContent = 'Enable debug logging:';
  
  // Create the toggle switch
  const toggleSwitch = document.createElement('label');
  toggleSwitch.className = 'toggle-switch';
  
  // Create the checkbox input
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'enableDebug';
  
  // Get initial debug state
  chrome.storage.local.get(['debugEnabled'], (result) => {
    const debugEnabled = result.debugEnabled === true;
    checkbox.checked = debugEnabled;
    
    // Update the debug utility
    DebugUtils.setDebugEnabled(debugEnabled);
  });
  
  // Handle checkbox changes
  checkbox.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    
    // Save the setting
    chrome.storage.local.set({ debugEnabled: enabled });
    
    // Update debug utility
    DebugUtils.setDebugEnabled(enabled);
    
    // Send message to background script to update its debug state
    chrome.runtime.sendMessage({ 
      action: 'setDebugEnabled', 
      enabled: enabled 
    }).catch(err => DebugUtils.error('DebugTools', 'Failed to send debug state message:', err));
    
    // Show a message
    const debugOutput = document.getElementById('debugOutput');
    if (debugOutput) {
      debugOutput.style.display = 'block';
      debugOutput.textContent = `Debug logging ${enabled ? 'enabled' : 'disabled'}.`;
      
      // Add extra info if enabled
      if (enabled) {
        debugOutput.textContent += '\nCheck the browser console (F12) to see debug output.';
      }
    }
  });
  
  // Add the slider to the toggle
  const slider = document.createElement('span');
  slider.className = 'slider';
  
  // Assemble the toggle
  toggleSwitch.appendChild(checkbox);
  toggleSwitch.appendChild(slider);
  
  // Add the label and toggle to the option row
  optionRow.appendChild(label);
  optionRow.appendChild(toggleSwitch);
  
  // Add the option row to the container
  debugToggleContainer.appendChild(optionRow);
  
  // Create a note about debug logging
  const note = document.createElement('div');
  note.className = 'note';
  note.textContent = 'When enabled, debug information will be logged to the browser console (F12). Useful for troubleshooting but may affect performance.';
  debugToggleContainer.appendChild(note);
  
  // Add a button to view the logs
  const viewLogsButton = document.createElement('button');
  viewLogsButton.textContent = 'Open Browser Console';
  viewLogsButton.style.marginTop = '10px';
  viewLogsButton.style.backgroundColor = '#607D8B';
  
  viewLogsButton.addEventListener('click', () => {
    alert('Please press F12 to open the browser developer tools and view the console.');
  });
  
  debugToggleContainer.appendChild(viewLogsButton);
  
  // Add the debug toggle container to the debug tools card
  debugToolsCard.appendChild(debugToggleContainer);
}

// Setup debug tools function
setupDebugTools() {
  this.addApiDocButtons();
  this.setupDebugControls(); // Add this line
  
  // Wait for DOM to be ready before adding Supabase buttons
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      this.setupSupabaseDebugButtons();
    });
  } else {
    this.setupSupabaseDebugButtons();
  }
}
  
  /**
   * Set analytics manager reference
   */
  setAnalyticsManager(analyticsManager) {
    this.analyticsManager = analyticsManager;
  }

  /**
   * Add API documentation buttons to debug tools section
   */
  addApiDocButtons() {
    const debugToolsContainer = document.querySelector('#analytics .card:last-child div:first-child');
    
    if (debugToolsContainer) {
      // Create a button to open Brave API documentation
      const braveDocsButton = document.createElement('button');
      braveDocsButton.textContent = 'Brave API Docs';
      braveDocsButton.style.backgroundColor = '#FF7139'; // Brave color
      braveDocsButton.style.marginLeft = '10px';
      
      braveDocsButton.addEventListener('click', () => {
        window.open('https://api.search.brave.com/app/documentation', '_blank');
      });
      
      // Create a button to open OpenAI API documentation
      const openaiDocsButton = document.createElement('button');
      openaiDocsButton.textContent = 'OpenAI API Docs';
      openaiDocsButton.style.backgroundColor = '#10a37f'; // OpenAI green
      openaiDocsButton.style.marginLeft = '10px';
      
      openaiDocsButton.addEventListener('click', () => {
        window.open('https://platform.openai.com/docs/api-reference', '_blank');
      });
      
      // Add the buttons to the container
      debugToolsContainer.appendChild(braveDocsButton);
      debugToolsContainer.appendChild(openaiDocsButton);
    }
  }
  
  /**
   * Set up Supabase debug buttons
   */
  setupSupabaseDebugButtons() {
    try {
      DebugUtils.log("DebugTools", "Setting up Supabase debug buttons");
      
      // Try to find existing buttons first
      if (document.getElementById('testSupabaseBtn') && document.getElementById('checkAnalyticsBtn')) {
        DebugUtils.log("DebugTools", "Supabase debug buttons already exist");
        
        // Add event listeners to existing buttons
        document.getElementById('testSupabaseBtn').addEventListener('click', this.testSupabaseConnection.bind(this));
        document.getElementById('checkAnalyticsBtn').addEventListener('click', this.checkAnalyticsStatus.bind(this));
        return;
      }
      
      // Find the debug tools card
      const debugToolsCard = document.querySelector('#analytics .card:last-child');
      if (!debugToolsCard) {
        DebugUtils.error("DebugTools", "Debug tools card not found");
        return;
      }
      
      // Create a container for Supabase debug tools
      const supabaseDebugContainer = document.createElement('div');
      supabaseDebugContainer.id = "supabase-buttons";
      supabaseDebugContainer.style.display = 'flex';
      supabaseDebugContainer.style.gap = '10px';
      supabaseDebugContainer.style.marginTop = '15px';
      
      // Create a button to test Supabase connection
      const testSupabaseButton = document.createElement('button');
      testSupabaseButton.id = 'testSupabaseBtn';
      testSupabaseButton.textContent = 'Test Supabase Connection';
      testSupabaseButton.style.backgroundColor = '#3ECF8E'; // Supabase green
      
      // Create a button to check analytics status
      const checkStatusButton = document.createElement('button');
      checkStatusButton.id = 'checkAnalyticsBtn';
      checkStatusButton.textContent = 'Check Analytics Status';
      checkStatusButton.style.backgroundColor = '#9c27b0'; // Purple
      
      // Add buttons to container
      supabaseDebugContainer.appendChild(testSupabaseButton);
      supabaseDebugContainer.appendChild(checkStatusButton);
      
      // Add container to the debug tools card
      debugToolsCard.appendChild(supabaseDebugContainer);
      
      DebugUtils.log("DebugTools", "Adding event listeners to Supabase debug buttons");
      
      // Add event listeners for the buttons - making sure to bind 'this'
      testSupabaseButton.addEventListener('click', this.testSupabaseConnection.bind(this));
      checkStatusButton.addEventListener('click', this.checkAnalyticsStatus.bind(this));
      
      DebugUtils.log("DebugTools", "Supabase debug buttons setup complete");
    } catch (error) {
      DebugUtils.error("DebugTools", "Error setting up Supabase debug buttons:", error);
    }
  }

  /**
   * Test Supabase connection
   */
  async testSupabaseConnection() {
    DebugUtils.log("DebugTools", "Test Supabase connection clicked");
    const debugOutput = document.getElementById('debugOutput');
    if (!debugOutput) {
      DebugUtils.error("DebugTools", "Debug output element not found");
      alert("Debug output element not found");
      return;
    }
    
    debugOutput.style.display = 'block';
    debugOutput.textContent = 'Testing Supabase connection...\n';
    
    try {
      // Check if analyticsManager is set
      if (!this.analyticsManager) {
        const analyticsManager = window.getAnalyticsManager?.();
        if (analyticsManager) {
          this.analyticsManager = analyticsManager;
        } else {
          throw new Error("Analytics manager not available. This may be a timing issue.");
        }
      }
      
      // Log Supabase configuration (without API key)
      debugOutput.textContent += `\nSupabase Configuration:\n`;
      debugOutput.textContent += `URL: ${SUPABASE_CONFIG.PROJECT_URL}\n`;
      debugOutput.textContent += `Analytics Table: ${SUPABASE_CONFIG.TABLES.ANALYTICS}\n`;
      debugOutput.textContent += `Feedback Table: ${SUPABASE_CONFIG.TABLES.FEEDBACK}\n\n`;
      
      // Check analytics sharing status
      const { shareAnalytics } = await new Promise(resolve => {
        chrome.storage.sync.get(['shareAnalytics'], resolve);
      });
      
      debugOutput.textContent += `Analytics sharing: ${shareAnalytics !== false ? 'Enabled ✓' : 'Disabled ✗'}\n\n`;
      
      if (shareAnalytics === false) {
        debugOutput.textContent += `Analytics sharing is disabled. Please enable it in the Privacy Settings to test Supabase.\n`;
        return;
      }
      
      // Initialize Supabase client
      await this.analyticsManager.supabaseClient.initialize();
      debugOutput.textContent += `Supabase client initialized successfully ✓\n\n`;
      
      // Create test data
      debugOutput.textContent += `Creating test record in Supabase...\n`;
      const testData = {
        domain: 'test.com',
        textLength: 100,
        model: 'test-model',
        rating: 90,
        searchUsed: true
      };
      
      // Send test data to Supabase
      const result = await this.analyticsManager.supabaseClient.trackFactCheck(testData);
      
      debugOutput.textContent += `Test completed. Response: \n${JSON.stringify(result, null, 2)}\n\n`;
      
      if (result && result.success === false) {
        debugOutput.textContent += `Error: ${result.error}\n\n`;
        debugOutput.textContent += `Troubleshooting suggestions:\n`;
        debugOutput.textContent += `1. Check that your Row Level Security (RLS) policies are correctly set\n`;
        debugOutput.textContent += `2. Make sure the anon role has INSERT privileges on the table\n`;
        debugOutput.textContent += `3. Verify your table structure matches the expected fields\n`;
        debugOutput.textContent += `4. Review the Supabase documentation on RLS: https://supabase.com/docs/guides/auth/row-level-security\n`;
      } else {
        debugOutput.textContent += `Supabase connection is working correctly! ✓\n`;
        debugOutput.textContent += `Analytics data will be recorded when fact checks are performed.\n`;
      }
    } catch (error) {
      DebugUtils.error("DebugTools", "Supabase test error:", error);
      debugOutput.textContent += `\nError testing Supabase: ${error.message}\n\n`;
      debugOutput.textContent += `Troubleshooting steps:\n`;
      debugOutput.textContent += `1. Check that your Supabase URL and API key are correct in supabase-config.js\n`;
      debugOutput.textContent += `2. Make sure your Supabase tables are properly created\n`;
      debugOutput.textContent += `3. Verify that you have the correct permissions set up\n`;
      debugOutput.textContent += `4. Check the browser console for more detailed error messages\n`;
    }
  }
  
  /**
   * Check analytics status
   */
  async checkAnalyticsStatus() {
    DebugUtils.log("DebugTools", "Check analytics status clicked");
    const debugOutput = document.getElementById('debugOutput');
    if (!debugOutput) {
      DebugUtils.error("DebugTools", "Debug output element not found");
      alert("Debug output element not found");
      return;
    }
    
    debugOutput.style.display = 'block';
    debugOutput.textContent = 'Checking analytics status...\n';
    
    try {
      // Get analytics sharing preference
      const { shareAnalytics } = await new Promise(resolve => {
        chrome.storage.sync.get(['shareAnalytics'], resolve);
      });
      
      // Get anonymous client ID if it exists
      const { anonymousClientId } = await new Promise(resolve => {
        chrome.storage.local.get(['anonymousClientId'], resolve);
      });
      
      // Get local analytics data
      const { factCheckAnalytics } = await new Promise(resolve => {
        chrome.storage.local.get(['factCheckAnalytics'], resolve);
      });
      
      // Build status report
      let statusReport = 'Analytics Status Report\n';
      statusReport += '=====================\n\n';
      
      statusReport += `Analytics Sharing: ${shareAnalytics !== false ? 'ENABLED' : 'DISABLED'}\n`;
      statusReport += `Anonymous Client ID: ${anonymousClientId || 'None generated yet'}\n`;
      statusReport += `Local Fact Checks: ${factCheckAnalytics ? factCheckAnalytics.length : 0}\n\n`;
      
      statusReport += 'Supabase Configuration:\n';
      statusReport += `URL: ${SUPABASE_CONFIG.PROJECT_URL}\n`;
      statusReport += `Tables: ${SUPABASE_CONFIG.TABLES.ANALYTICS}, ${SUPABASE_CONFIG.TABLES.FEEDBACK}\n\n`;
      
      if (shareAnalytics === false) {
        statusReport += 'Analytics sharing is DISABLED. No data is being sent to Supabase.\n';
        statusReport += 'To enable analytics sharing, check the box in the Privacy Settings section.\n';
      } else {
        statusReport += 'Analytics sharing is ENABLED. Anonymized data is being sent to Supabase.\n';
        
        // If we have a client ID, the client has been initialized at least once
        if (anonymousClientId) {
          statusReport += 'Supabase client has been initialized previously.\n';
          statusReport += `Client ID: ${anonymousClientId}\n`;
        } else {
          statusReport += 'Supabase client has not been initialized yet. No data has been sent.\n';
        }
      }
      
      debugOutput.textContent = statusReport;
    } catch (error) {
      DebugUtils.error("DebugTools", "Error checking analytics status:", error);
      debugOutput.textContent += `\nError checking analytics status: ${error.message}\n`;
    }
  }

  /**
   * Test API integration and show results
   */
  async testAPIIntegration() {
    const debugOutput = document.getElementById('debugOutput');
    if (!debugOutput) return;
    
    debugOutput.style.display = 'block';
    debugOutput.textContent = 'Testing API integration...\n';
    
    try {
      // Get stored API keys
      const data = await new Promise(resolve => {
        chrome.storage.sync.get(['openaiApiKey', 'braveApiKey'], resolve);
      });
      
      debugOutput.textContent += `\nAPI Keys status:\n`;
      debugOutput.textContent += `- OpenAI API Key: ${data.openaiApiKey ? 'Present ✓' : 'Missing ✗'}\n`;
      debugOutput.textContent += `- Brave API Key: ${data.braveApiKey ? 'Present ✓' : 'Missing ✗'}\n`;
      
      if (!data.braveApiKey) {
        debugOutput.textContent += '\nNo Brave API key found. This explains "emergency mode" - the extension cannot search for references without this key.\n';
        return;
      }
      
      // Test Brave API with a simple query
      debugOutput.textContent += '\nTesting Brave Search API...\n';
      
      const searchUrl = `${API.BRAVE.BASE_URL}?q=${encodeURIComponent('fact checking test')}&count=3`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': data.braveApiKey
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        debugOutput.textContent += `\nBrave API Error (${response.status}): ${errorText}\n`;
        debugOutput.textContent += '\nThis explains the "emergency mode" - the extension cannot get references due to API errors.\n';
        return;
      }
      
      const searchData = await response.json();
      
      if (!searchData.web || !searchData.web.results || searchData.web.results.length === 0) {
        debugOutput.textContent += '\nBrave API returned no results for test query.\n';
        debugOutput.textContent += 'This might explain "emergency mode" - no search results means no references.\n';
        return;
      }
      
      debugOutput.textContent += `\nBrave API Success: Received ${searchData.web.results.length} results ✓\n`;
      debugOutput.textContent += `Example result: "${searchData.web.results[0].title}"\n`;
      
      debugOutput.textContent += '\nAPI integration looks good. If you\'re still seeing "emergency mode", check:\n';
      debugOutput.textContent += '1. Is the fact-check extension using the correct API key?\n';
      debugOutput.textContent += '2. Is there a network issue when the extension runs?\n';
      debugOutput.textContent += '3. Is the content being checked producing valid search queries?\n';
      
    } catch (error) {
      debugOutput.textContent += `\nError during testing: ${error.message}\n`;
      DebugUtils.error("DebugTools", "Debug error:", error);
    }
  }

  /**
   * View debug information about settings and data
   */
  async viewDebugInfo() {
    const debugOutput = document.getElementById('debugOutput');
    if (!debugOutput) return;
    
    debugOutput.style.display = 'block';
    debugOutput.textContent = 'Loading debug information...\n';
    
    try {
      // Get all settings and state data
      const [syncData, localData, platformInfo] = await Promise.all([
        new Promise(resolve => chrome.storage.sync.get(null, resolve)),
        new Promise(resolve => chrome.storage.local.get(['factCheckAnalytics', 'factCheckFeedback', 'anonymousClientId'], resolve)),
        new Promise(resolve => chrome.runtime.getPlatformInfo().then(resolve).catch(() => resolve({})))
      ]);
      
      // Build debug info
      let debugInfo = 'Fact-Check Extension Debug Information\n';
      debugInfo += '=====================================\n\n';
      
      // Version info
      const versionElement = document.getElementById('version');
      const versionText = versionElement ? versionElement.textContent.replace('Version: ', '') : 'Unknown';
      debugInfo += `Version: ${versionText}\n`;
      debugInfo += `Platform: ${platformInfo.os || 'Unknown'}\n\n`;
      
      // API Key Validation Section
      debugInfo += 'API Key Validation:\n';
      debugInfo += '==================\n';
      
      // Check OpenAI API key
      if (syncData.openaiApiKey) {
        const openaiValidation = this.apiKeyManager.validateOpenAIKey(syncData.openaiApiKey);
        const maskedKey = syncData.openaiApiKey.startsWith('sk-') 
          ? 'sk-' + '●'.repeat(6) + syncData.openaiApiKey.slice(-4)
          : '●'.repeat(10);
        
        debugInfo += `OpenAI API Key: ${maskedKey}\n`;
        debugInfo += `  - Format valid: ${openaiValidation.valid ? '✓' : '✗'}\n`;
        if (!openaiValidation.valid) {
          debugInfo += `  - Issue: ${openaiValidation.message}\n`;
        }
        debugInfo += `  - Key length: ${syncData.openaiApiKey.length} characters\n`;
      } else {
        debugInfo += 'OpenAI API Key: Not set\n';
      }
      
      // Check Brave API key
      if (syncData.braveApiKey) {
        const braveValidation = this.apiKeyManager.validateBraveKey(syncData.braveApiKey); 
        let maskedKey;
        
        if (syncData.braveApiKey.startsWith('BSA')) {
          maskedKey = 'BSA-' + '●'.repeat(6) + syncData.braveApiKey.slice(-4);
        } else {
          maskedKey = syncData.braveApiKey.slice(0, 3) + '●'.repeat(6) + syncData.braveApiKey.slice(-4);
        }
        
        debugInfo += `Brave API Key: ${maskedKey}\n`;
        debugInfo += `  - Format valid: ${braveValidation.valid ? '✓' : '✗'}\n`;
        if (!braveValidation.valid) {
          debugInfo += `  - Issue: ${braveValidation.message}\n`;
        }
        debugInfo += `  - Key length: ${syncData.braveApiKey.length} characters\n`;
      } else {
        debugInfo += 'Brave API Key: Not set\n';
      }
      
      debugInfo += '\n';
      
      // Sanitize API keys for security
      const sanitizedSyncData = { ...syncData };
      if (sanitizedSyncData.openaiApiKey) {
        sanitizedSyncData.openaiApiKey = 'sk-....' + sanitizedSyncData.openaiApiKey.slice(-4);
      }
      if (sanitizedSyncData.braveApiKey) {
        sanitizedSyncData.braveApiKey = syncData.braveApiKey.slice(0, 3) + '....' + sanitizedSyncData.braveApiKey.slice(-4);
      }
      
      // Analytics status
      debugInfo += 'Analytics Status:\n';
      debugInfo += '================\n';
      debugInfo += `Analytics Sharing: ${syncData.shareAnalytics !== false ? 'Enabled' : 'Disabled'}\n`;
      debugInfo += `Anonymous Client ID: ${localData.anonymousClientId || 'Not generated yet'}\n\n`;
      
      // Settings
      debugInfo += 'Settings:\n';
      debugInfo += '=========\n';
      debugInfo += JSON.stringify(sanitizedSyncData, null, 2) + '\n\n';
      
      // Usage stats
      const analytics = localData.factCheckAnalytics || [];
      const feedback = localData.factCheckFeedback || [];
      
      debugInfo += 'Usage Statistics:\n';
      debugInfo += '================\n';
      debugInfo += `Total fact checks: ${analytics.length}\n`;
      debugInfo += `Feedback received: ${feedback.length}\n\n`;
      
      // Most recent check
      if (analytics.length > 0) {
        const latestCheck = analytics[analytics.length - 1];
        debugInfo += 'Most recent check:\n';
        debugInfo += '-----------------\n';
        debugInfo += `Time: ${new Date(latestCheck.timestamp).toLocaleString()}\n`;
        debugInfo += `Domain: ${latestCheck.domain || 'unknown'}\n`;
        debugInfo += `Text length: ${latestCheck.textLength} characters\n\n`;
      }
      
      debugOutput.textContent = debugInfo;
    } catch (error) {
      debugOutput.textContent = `Error retrieving debug info: ${error.message}`;
      DebugUtils.error("DebugTools", "Debug error:", error);
    }
  }
  
  /**
   * Show a debug message in the debug output area
   * @param {string} title - Message title
   * @param {string} content - Message content
   */
  showDebugMessage(title, content) {
    const debugOutput = document.getElementById('debugOutput');
    if (!debugOutput) return;
    
    debugOutput.style.display = 'block';
    debugOutput.textContent = `${title}\n${'='.repeat(title.length)}\n\n${content}`;
  }
}