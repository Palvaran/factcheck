// Advanced debug functions
async function testAPIIntegration() {
  const debugOutput = document.getElementById('debugOutput');
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
    
    const baseUrl = 'https://api.search.brave.com/res/v1/web/search';
    const testQuery = 'fact checking test';
    const searchUrl = `${baseUrl}?q=${encodeURIComponent(testQuery)}&count=3`;
    
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
    console.error('Debug error:', error);
  }
}

// View debug info
function viewDebugInfo() {
  const debugOutput = document.getElementById('debugOutput');
  debugOutput.style.display = 'block';
  debugOutput.textContent = 'Loading debug information...\n';
  
  // Get all settings and state data
  Promise.all([
    new Promise(resolve => chrome.storage.sync.get(null, resolve)),
    new Promise(resolve => chrome.storage.local.get(['factCheckAnalytics', 'factCheckFeedback'], resolve)),
    new Promise(resolve => chrome.runtime.getPlatformInfo().then(resolve).catch(() => resolve({})))
  ]).then(([syncData, localData, platformInfo]) => {
    // Sanitize API keys for security
    const sanitizedSyncData = { ...syncData };
    if (sanitizedSyncData.openaiApiKey) {
      sanitizedSyncData.openaiApiKey = 'sk-....' + sanitizedSyncData.openaiApiKey.slice(-4);
    }
    if (sanitizedSyncData.braveApiKey) {
      sanitizedSyncData.braveApiKey = 'BSA-....' + sanitizedSyncData.braveApiKey.slice(-4);
    }
    
    // Build debug info
    let debugInfo = 'Fact-Check Extension Debug Information\n';
    debugInfo += '=====================================\n\n';
    
    // Version info
    debugInfo += `Version: ${document.getElementById('version').textContent.replace('Version: ', '')}\n`;
    debugInfo += `Platform: ${platformInfo.os || 'Unknown'}\n\n`;
    
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
  }).catch(error => {
    debugOutput.textContent = `Error retrieving debug info: ${error.message}`;
    console.error('Debug error:', error);
  });
}// Tab navigation functionality
document.addEventListener('DOMContentLoaded', function() {
  // Display version information
  displayVersionInfo();
  
  // Set up keyboard shortcuts for tab navigation
  document.addEventListener('keydown', function(e) {
    // Alt + 1-5 for tabs
    if (e.altKey && e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      const tabIndex = parseInt(e.key) - 1;
      const tabs = document.querySelectorAll('.tab');
      if (tabs[tabIndex]) {
        tabs[tabIndex].click();
      }
    }
  });
  
  // Set up tab navigation
  const tabs = document.querySelectorAll('.tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and tab contents
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Show the corresponding content
      const tabId = tab.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // Load saved settings
  loadAllSettings();
  setupApiKeyVisibility();
  
  // Load analytics data
  loadAnalyticsData();
  
  // Set up event listeners for all buttons
  document.getElementById('save').addEventListener('click', saveSettings);
  document.getElementById('reset').addEventListener('click', resetToDefaults);
  document.getElementById('clearData').addEventListener('click', clearStoredData);
  document.getElementById('exportSettings').addEventListener('click', exportSettings);
  document.getElementById('importSettings').addEventListener('click', function() {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importSettings);
  
  // API key testing
  document.getElementById('testOpenAI').addEventListener('click', testOpenAIKey);
  document.getElementById('testBrave').addEventListener('click', testBraveKey);
  
  // Debug tools
  document.getElementById('testAPIIntegration').addEventListener('click', testAPIIntegration);
  document.getElementById('viewDebugInfo').addEventListener('click', viewDebugInfo);
});

// Function to display version and build date
function displayVersionInfo() {
  try {
    // Get the manifest directly (it's a synchronous method)
    const manifest = chrome.runtime.getManifest();
    
    // Display version from manifest
    document.getElementById('version').textContent = `Version: ${manifest.version}`;
    
    // You can store build date in extension storage or compute it here
    // For now, we'll use a placeholder date that you can update in your build process
    const buildDate = new Date().toLocaleDateString();
    document.getElementById('buildDate').textContent = `Build date: ${buildDate}`;
  } catch (error) {
    console.error("Error getting manifest:", error);
    // Fallback if manifest can't be loaded
    document.getElementById('version').textContent = "Version: 1.0.0";
    document.getElementById('buildDate').textContent = "Build date: March 7, 2025";
  }
}

/* Update the JavaScript toggle function */
function setupApiKeyVisibility() {
  document.querySelectorAll('.toggle-visibility').forEach(button => {
    button.addEventListener('click', function() {
      const inputId = this.getAttribute('data-for');
      const input = document.getElementById(inputId);
      
      if (input.type === 'password') {
        input.type = 'text';
        this.textContent = 'HIDE';
      } else {
        input.type = 'password';
        this.textContent = 'SHOW';
      }
    });
  });
}

// Load all settings from storage
function loadAllSettings() {
  chrome.storage.sync.get([
    // API Keys
    'openaiApiKey', 
    'braveApiKey', 
    // Preferences
    'aiModel',
    'useMultiModel',
    'autoCheckHeadlines',
    'enhancedUI',
    'resultPosition',
    'colorTheme',
    // Analytics
    'shareAnalytics',
    // Additional settings
    'enableCaching',
    'showReferences',
    'maxTokens',
    'rateLimit',
    // Site management
    'siteList',
    'ignoredSites'
  ], function(data) {
    // API Keys
    document.getElementById('openaiApiKey').value = data.openaiApiKey || '';
    document.getElementById('braveApiKey').value = data.braveApiKey || '';
    
    // Preferences
    const aiModel = document.getElementById('aiModel');
    if (data.aiModel) {
      aiModel.value = data.aiModel;
      if (data.aiModel !== defaultSettings.aiModel) {
        markAsModified('aiModel');
      }
    }
    
    document.getElementById('useMultiModel').checked = data.useMultiModel !== false; // Default to true
    if (data.useMultiModel !== defaultSettings.useMultiModel) {
      markAsModified('useMultiModel');
    }
    
    document.getElementById('autoCheckHeadlines').checked = !!data.autoCheckHeadlines; // Default to false
    if (!!data.autoCheckHeadlines !== defaultSettings.autoCheckHeadlines) {
      markAsModified('autoCheckHeadlines');
    }
    
    document.getElementById('enhancedUI').checked = data.enhancedUI !== false; // Default to true
    if (data.enhancedUI !== defaultSettings.enhancedUI) {
      markAsModified('enhancedUI');
    }
    
    const resultPosition = document.getElementById('resultPosition');
    if (data.resultPosition) {
      resultPosition.value = data.resultPosition;
      if (data.resultPosition !== defaultSettings.resultPosition) {
        markAsModified('resultPosition');
      }
    }
    
    const colorTheme = document.getElementById('colorTheme');
    if (data.colorTheme) {
      colorTheme.value = data.colorTheme;
      if (data.colorTheme !== defaultSettings.colorTheme) {
        markAsModified('colorTheme');
      }
    }
    
    // Analytics
    document.getElementById('shareAnalytics').checked = data.shareAnalytics !== false; // Default to true
    if (data.shareAnalytics !== defaultSettings.shareAnalytics) {
      markAsModified('shareAnalytics');
    }
    
    // Additional settings
    if (document.getElementById('enableCaching')) {
      document.getElementById('enableCaching').checked = data.enableCaching !== false; // Default to true
      if (data.enableCaching !== defaultSettings.enableCaching) {
        markAsModified('enableCaching');
      }
    }
    
    if (document.getElementById('showReferences')) {
      document.getElementById('showReferences').checked = data.showReferences !== false; // Default to true
      if (data.showReferences !== defaultSettings.showReferences) {
        markAsModified('showReferences');
      }
    }
    
    if (document.getElementById('maxTokens') && data.maxTokens) {
      document.getElementById('maxTokens').value = data.maxTokens;
      if (data.maxTokens !== defaultSettings.maxTokens) {
        markAsModified('maxTokens');
      }
    }
    
    if (document.getElementById('rateLimit') && data.rateLimit) {
      document.getElementById('rateLimit').value = data.rateLimit;
      if (data.rateLimit !== defaultSettings.rateLimit) {
        markAsModified('rateLimit');
      }
    }
    
    // Site management settings
    if (document.getElementById('siteList')) {
      document.getElementById('siteList').value = data.siteList || '';
      if (data.siteList && data.siteList !== defaultSettings.siteList) {
        markAsModified('siteList');
      }
    }
    
    if (document.getElementById('ignoredSites')) {
      document.getElementById('ignoredSites').value = data.ignoredSites || '';
      if (data.ignoredSites && data.ignoredSites !== defaultSettings.ignoredSites) {
        markAsModified('ignoredSites');
      }
    }
    
    // Set up change listeners to update modified indicators
    setupChangeListeners();
  });
}

// Mark a setting as modified from default
function markAsModified(settingId) {
  const element = document.getElementById(settingId);
  if (!element) return;
  
  // Find the parent option-label if it exists
  let labelElement;
  
  if (element.closest('.option-row')) {
    labelElement = element.closest('.option-row').querySelector('.option-label');
  } else if (element.parentElement.previousElementSibling && element.parentElement.previousElementSibling.tagName === 'LABEL') {
    labelElement = element.parentElement.previousElementSibling;
  } else {
    return; // Can't find label element
  }
  
  // Check if indicator already exists
  if (!labelElement.querySelector('.modified-indicator')) {
    const indicator = document.createElement('span');
    indicator.className = 'modified-indicator';
    indicator.title = 'Modified from default';
    labelElement.appendChild(indicator);
  }
}

// Remove modified indicator
function removeModifiedIndicator(settingId) {
  const element = document.getElementById(settingId);
  if (!element) return;
  
  // Find the parent option-label if it exists
  let labelElement;
  
  if (element.closest('.option-row')) {
    labelElement = element.closest('.option-row').querySelector('.option-label');
  } else if (element.parentElement.previousElementSibling && element.parentElement.previousElementSibling.tagName === 'LABEL') {
    labelElement = element.parentElement.previousElementSibling;
  } else {
    return; // Can't find label element
  }
  
  // Check if indicator exists and remove it
  const indicator = labelElement.querySelector('.modified-indicator');
  if (indicator) {
    labelElement.removeChild(indicator);
  }
}

// Set up change listeners for all form elements to update modified indicators
function setupChangeListeners() {
  // Select elements
  document.querySelectorAll('select').forEach(select => {
    select.addEventListener('change', function() {
      const id = this.id;
      const defaultValue = defaultSettings[id];
      
      if (this.value !== defaultValue) {
        markAsModified(id);
      } else {
        removeModifiedIndicator(id);
      }
    });
  });
  
  // Checkbox elements
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const id = this.id;
      const defaultValue = defaultSettings[id];
      
      if (this.checked !== defaultValue) {
        markAsModified(id);
      } else {
        removeModifiedIndicator(id);
      }
    });
  });
  
  // Textarea elements
  document.querySelectorAll('textarea').forEach(textarea => {
    textarea.addEventListener('input', function() {
      const id = this.id;
      const defaultValue = defaultSettings[id] || '';
      
      if (this.value !== defaultValue) {
        markAsModified(id);
      } else {
        removeModifiedIndicator(id);
      }
    });
  });
}

// Get current settings from form
function getCurrentSettings() {
  return {
    // API Keys
    openaiApiKey: document.getElementById('openaiApiKey').value.trim(),
    braveApiKey: document.getElementById('braveApiKey').value.trim(),
    
    // Preferences
    aiModel: document.getElementById('aiModel').value.trim(),
    useMultiModel: document.getElementById('useMultiModel').checked,
    autoCheckHeadlines: document.getElementById('autoCheckHeadlines').checked,
    enhancedUI: document.getElementById('enhancedUI').checked,
    resultPosition: document.getElementById('resultPosition').value,
    colorTheme: document.getElementById('colorTheme').value,
    
    // Analytics
    shareAnalytics: document.getElementById('shareAnalytics').checked,
    
    // Additional settings that might be available
    enableCaching: document.getElementById('enableCaching')?.checked ?? true,
    showReferences: document.getElementById('showReferences')?.checked ?? true,
    maxTokens: document.getElementById('maxTokens')?.value ?? '1000',
    rateLimit: document.getElementById('rateLimit')?.value ?? '5',
    
    // Site management
    siteList: document.getElementById('siteList')?.value ?? '',
    ignoredSites: document.getElementById('ignoredSites')?.value ?? ''
  };
}

// Save all settings
function saveSettings() {
  const settings = getCurrentSettings();
  
  chrome.storage.sync.set(settings, function() {
    // Show saved message
    const status = document.getElementById('status');
    status.style.display = 'block';
    status.textContent = 'Settings saved successfully!';
    
    setTimeout(function() {
      status.style.display = 'none';
    }, 3000);
  });
}

// Export settings to JSON file
function exportSettings() {
  const settings = getCurrentSettings();
  
  // Remove sensitive API keys before exporting
  const exportData = { ...settings };
  delete exportData.openaiApiKey;
  delete exportData.braveApiKey;
  
  // Add export timestamp
  exportData._exportDate = new Date().toISOString();
  exportData._exportVersion = document.getElementById('version').textContent.replace('Version: ', '');
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `factcheck-settings-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Test OpenAI API key
async function testOpenAIKey() {
  const apiKey = document.getElementById('openaiApiKey').value.trim();
  const errorDiv = document.getElementById('openai-error');
  const testButton = document.getElementById('testOpenAI');
  
  if (!apiKey) {
    errorDiv.style.display = 'block';
    errorDiv.textContent = 'Please enter an API key to test.';
    return;
  }
  
  // Show loading state
  testButton.textContent = 'TESTING...';
  testButton.disabled = true;
  errorDiv.style.display = 'none';
  
  try {
    // Simple request to check models endpoint
    const response = await fetch('https://api.openai.com/v1/models', {
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
      errorDiv.style.color = '#388E3C';
      errorDiv.textContent = '✓ OpenAI API key is valid';
      
      // Reset after 3 seconds
      setTimeout(() => {
        errorDiv.style.display = 'none';
      }, 3000);
    } else {
      // API key is invalid
      errorDiv.style.display = 'block';
      errorDiv.style.backgroundColor = '#FFEBEE';
      errorDiv.style.color = '#D32F2F';
      errorDiv.textContent = `✗ Error: ${data.error?.message || 'Invalid API key'}`;
    }
  } catch (error) {
    // Network error or other issue
    errorDiv.style.display = 'block';
    errorDiv.textContent = `✗ Error: ${error.message || 'Connection failed'}`;
  } finally {
    // Reset button state
    testButton.textContent = 'TEST';
    testButton.disabled = false;
  }
}

// Test Brave Search API key
async function testBraveKey() {
  const apiKey = document.getElementById('braveApiKey').value.trim();
  const errorDiv = document.getElementById('brave-error');
  const testButton = document.getElementById('testBrave');
  
  if (!apiKey) {
    errorDiv.style.display = 'block';
    errorDiv.textContent = 'Please enter an API key to test.';
    return;
  }
  
  // Show loading state
  testButton.textContent = 'TESTING...';
  testButton.disabled = true;
  errorDiv.style.display = 'none';
  
  try {
    // Use the exact same API endpoint and parameters from brave.js
    const baseUrl = 'https://api.search.brave.com/res/v1/web/search';
    const testQuery = 'test query'; 
    const searchUrl = `${baseUrl}?q=${encodeURIComponent(testQuery)}&count=1`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Show more detailed success information
      errorDiv.style.display = 'block';
      errorDiv.style.backgroundColor = '#E8F5E9';
      errorDiv.style.color = '#388E3C';
      
      if (data.web && data.web.results && data.web.results.length > 0) {
        errorDiv.textContent = `✓ Brave Search API key is valid - Got ${data.web.results.length} result(s)`;
      } else {
        errorDiv.textContent = '✓ Brave Search API key is valid, but no results returned for test query';
      }
      
      // Save key immediately to ensure it's available
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
      errorDiv.style.color = '#D32F2F';
      errorDiv.textContent = `✗ Error: ${response.status} - ${data.error || data.message || 'Unknown API error'}`;
    }
  } catch (error) {
    // Network error or other issue
    console.error("Error testing Brave API:", error);
    errorDiv.style.display = 'block';
    errorDiv.style.backgroundColor = '#FFEBEE';
    errorDiv.style.color = '#D32F2F';
    errorDiv.textContent = `✗ Error: ${error.message || 'Connection failed'}`;
  } finally {
    // Reset button state
    testButton.textContent = 'TEST';
    testButton.disabled = false;
  }
}

// Import settings from JSON file
function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedSettings = JSON.parse(e.target.result);
      
      // Apply imported settings to form
      if (importedSettings.aiModel) {
        document.getElementById('aiModel').value = importedSettings.aiModel;
      }
      
      if (typeof importedSettings.useMultiModel === 'boolean') {
        document.getElementById('useMultiModel').checked = importedSettings.useMultiModel;
      }
      
      if (typeof importedSettings.autoCheckHeadlines === 'boolean') {
        document.getElementById('autoCheckHeadlines').checked = importedSettings.autoCheckHeadlines;
      }
      
      if (typeof importedSettings.enhancedUI === 'boolean') {
        document.getElementById('enhancedUI').checked = importedSettings.enhancedUI;
      }
      
      if (importedSettings.resultPosition) {
        document.getElementById('resultPosition').value = importedSettings.resultPosition;
      }
      
      if (importedSettings.colorTheme) {
        document.getElementById('colorTheme').value = importedSettings.colorTheme;
      }
      
      if (typeof importedSettings.shareAnalytics === 'boolean') {
        document.getElementById('shareAnalytics').checked = importedSettings.shareAnalytics;
      }
      
      if (typeof importedSettings.enableCaching === 'boolean' && document.getElementById('enableCaching')) {
        document.getElementById('enableCaching').checked = importedSettings.enableCaching;
      }
      
      if (typeof importedSettings.showReferences === 'boolean' && document.getElementById('showReferences')) {
        document.getElementById('showReferences').checked = importedSettings.showReferences;
      }
      
      if (importedSettings.maxTokens && document.getElementById('maxTokens')) {
        document.getElementById('maxTokens').value = importedSettings.maxTokens;
      }
      
      if (importedSettings.rateLimit && document.getElementById('rateLimit')) {
        document.getElementById('rateLimit').value = importedSettings.rateLimit;
      }
      
      // Show success message
      const status = document.getElementById('status');
      status.style.display = 'block';
      status.textContent = 'Settings imported successfully! Click Save to apply changes.';
      
      setTimeout(function() {
        status.style.display = 'none';
      }, 3000);
      
    } catch (error) {
      console.error('Error importing settings:', error);
      
      // Show error message
      const status = document.getElementById('status');
      status.style.display = 'block';
      status.style.color = '#d32f2f';
      status.style.backgroundColor = '#ffebee';
      status.textContent = 'Error importing settings. Invalid file format.';
      
      setTimeout(function() {
        status.style.display = 'none';
        status.style.color = 'green';
        status.style.backgroundColor = '#E8F5E9';
      }, 3000);
    }
    
    // Reset the file input
    event.target.value = '';
  };
  
  reader.readAsText(file);
}

// Load analytics data
function loadAnalyticsData() {
  const statsContainer = document.getElementById('statsContainer');
  
  // Get fact check analytics
  chrome.storage.local.get(['factCheckAnalytics', 'factCheckFeedback'], (data) => {
    const analytics = data.factCheckAnalytics || [];
    const feedback = data.factCheckFeedback || [];
    
    if (analytics.length === 0 && feedback.length === 0) {
      statsContainer.innerHTML = `<p>No usage data available yet. Start fact-checking to generate statistics.</p>`;
      document.getElementById('satisfactionChart').innerHTML = `<div style="text-align: center; padding-top: 60px; color: #666;">No feedback data available yet.</div>`;
      return;
    }
    
    // Calculate statistics
    const totalChecks = analytics.length;
    const avgTextLength = Math.round(analytics.reduce((sum, item) => sum + item.textLength, 0) / Math.max(1, totalChecks));
    
    // Count checks by domain
    const domainCounts = {};
    analytics.forEach(item => {
      if (!domainCounts[item.domain]) {
        domainCounts[item.domain] = 0;
      }
      domainCounts[item.domain]++;
    });
    
    // Sort domains by count
    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    // Generate feedback stats
    const positiveFeedback = feedback.filter(item => item.rating === 'positive').length;
    const negativeFeedback = feedback.filter(item => item.rating === 'negative').length;
    const totalFeedback = positiveFeedback + negativeFeedback;
    const satisfactionRate = totalFeedback > 0 
      ? Math.round((positiveFeedback / totalFeedback) * 100) 
      : 0;
    
    // Build the HTML
    let statsHTML = `
      <div style="margin-bottom: 15px;">
        <strong>Total fact checks:</strong> ${totalChecks}
      </div>
      
      <div style="margin-bottom: 15px;">
        <strong>Average text length:</strong> ${avgTextLength} characters
      </div>
    `;
    
    if (topDomains.length > 0) {
      statsHTML += `<div style="margin-bottom: 15px;">
        <strong>Most checked websites:</strong>
        <ul style="margin-top: 5px;">
          ${topDomains.map(([domain, count]) => 
            `<li>${domain === 'unknown' ? 'Direct text' : domain}: ${count} checks</li>`
          ).join('')}
        </ul>
      </div>`;
    }
    
    if (totalFeedback > 0) {
      statsHTML += `<div>
        <strong>User satisfaction:</strong> ${satisfactionRate}% (based on ${totalFeedback} ratings)
      </div>`;
    }
    
    statsContainer.innerHTML = statsHTML;
    
    // Render the satisfaction chart
    if (totalFeedback > 0) {
      renderSatisfactionChart(positiveFeedback, negativeFeedback);
    } else {
      document.getElementById('satisfactionChart').innerHTML = `<div style="text-align: center; padding-top: 60px; color: #666;">No feedback data available yet.</div>`;
    }
  });
}

// Render a simple satisfaction chart
function renderSatisfactionChart(positive, negative) {
  const total = positive + negative;
  const positivePercentage = Math.round((positive / total) * 100);
  const negativePercentage = 100 - positivePercentage;
  
  const chartContainer = document.getElementById('satisfactionChart');
  
  // Clear any existing content
  chartContainer.innerHTML = '';
  
  // Create the chart HTML
  const chartHTML = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <div style="width: 90%; height: 40px; display: flex; margin-bottom: 10px; border-radius: 4px; overflow: hidden;">
        <div style="width: ${positivePercentage}%; height: 100%; background-color: #4CAF50; display: flex; justify-content: center; align-items: center; color: white;">
          ${positive} (${positivePercentage}%)
        </div>
        <div style="width: ${negativePercentage}%; height: 100%; background-color: #F44336; display: flex; justify-content: center; align-items: center; color: white;">
          ${negative} (${negativePercentage}%)
        </div>
      </div>
      <div style="display: flex; width: 90%; justify-content: space-between; font-size: 0.9em; color: #666;">
        <div style="display: flex; align-items: center;">
          <div style="width: 12px; height: 12px; background-color: #4CAF50; margin-right: 5px; border-radius: 2px;"></div>
          Positive feedback
        </div>
        <div style="display: flex; align-items: center;">
          <div style="width: 12px; height: 12px; background-color: #F44336; margin-right: 5px; border-radius: 2px;"></div>
          Negative feedback
        </div>
      </div>
    </div>
  `;
  
  chartContainer.innerHTML = chartHTML;
}

// Default settings
const defaultSettings = {
  aiModel: 'gpt-4o-mini',
  useMultiModel: false,
  autoCheckHeadlines: false,
  enhancedUI: true,
  resultPosition: 'right',
  colorTheme: 'auto',
  shareAnalytics: true,
  enableCaching: true,
  rateLimit: '5',
  maxTokens: '1000',
  showReferences: true,
  siteList: '',
  ignoredSites: ''
};

// Reset to default settings
function resetToDefaults() {
  if (confirm('Reset all settings to their default values? This will not affect your API keys or stored data.')) {
    // Apply defaults to UI
    document.getElementById('aiModel').value = defaultSettings.aiModel;
    document.getElementById('useMultiModel').checked = defaultSettings.useMultiModel;
    document.getElementById('autoCheckHeadlines').checked = defaultSettings.autoCheckHeadlines;
    document.getElementById('enhancedUI').checked = defaultSettings.enhancedUI;
    document.getElementById('resultPosition').value = defaultSettings.resultPosition;
    document.getElementById('colorTheme').value = defaultSettings.colorTheme;
    document.getElementById('shareAnalytics').checked = defaultSettings.shareAnalytics;
    document.getElementById('enableCaching').checked = defaultSettings.enableCaching;
    
    if (document.getElementById('rateLimit')) {
      document.getElementById('rateLimit').value = defaultSettings.rateLimit;
    }
    
    if (document.getElementById('maxTokens')) {
      document.getElementById('maxTokens').value = defaultSettings.maxTokens;
    }
    
    if (document.getElementById('showReferences')) {
      document.getElementById('showReferences').checked = defaultSettings.showReferences;
    }
    
    if (document.getElementById('siteList')) {
      document.getElementById('siteList').value = defaultSettings.siteList;
    }
    
    if (document.getElementById('ignoredSites')) {
      document.getElementById('ignoredSites').value = defaultSettings.ignoredSites;
    }
    
    // Show status message
    const status = document.getElementById('status');
    status.style.display = 'block';
    status.textContent = 'Settings reset to defaults. Click Save to apply changes.';
    
    setTimeout(function() {
      status.style.display = 'none';
    }, 3000);
  }
}

// Clear stored data
function clearStoredData() {
  if (confirm('Are you sure you want to clear all stored data? This cannot be undone.')) {
    chrome.storage.local.clear(() => {
      const status = document.getElementById('status');
      status.style.display = 'block';
      status.textContent = 'All stored data has been cleared!';
      
      // Reset the analytics display
      document.getElementById('statsContainer').innerHTML = `
        <p>No usage data available yet. Start fact-checking to generate statistics.</p>
      `;
      
      setTimeout(function() {
        status.style.display = 'none';
      }, 3000);
    });
  }
}