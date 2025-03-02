// Tab navigation functionality
document.addEventListener('DOMContentLoaded', function() {
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
  document.getElementById('clearData').addEventListener('click', clearStoredData);
});

/* Update the JavaScript toggle function */
function setupApiKeyVisibility() {
  document.querySelectorAll('.toggle-visibility').forEach(button => {
    button.addEventListener('click', function() {
      const inputId = this.getAttribute('data-for');
      const input = document.getElementById(inputId);
      
      if (input.type === 'password') {
        input.type = 'text';
        this.textContent = 'hide';
      } else {
        input.type = 'password';
        this.textContent = 'show';
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
    // Analytics
    'shareAnalytics'
  ], function(data) {
    // API Keys
    document.getElementById('openaiApiKey').value = data.openaiApiKey || '';
    document.getElementById('braveApiKey').value = data.braveApiKey || '';
    
    // Preferences
    document.getElementById('useMultiModel').checked = data.useMultiModel !== false; // Default to true
    document.getElementById('autoCheckHeadlines').checked = !!data.autoCheckHeadlines; // Default to false
    document.getElementById('enhancedUI').checked = data.enhancedUI !== false; // Default to true
    
    const resultPosition = document.getElementById('resultPosition');
    if (data.resultPosition) {
      resultPosition.value = data.resultPosition;
    }
    
    // Analytics
    document.getElementById('shareAnalytics').checked = data.shareAnalytics !== false; // Default to true
  });
}

// Save all settings
function saveSettings() {
  const settings = {
    // API Keys
    openaiApiKey: document.getElementById('openaiApiKey').value.trim(),
    braveApiKey: document.getElementById('braveApiKey').value.trim(),
    
    // Preferences
    aiModel: document.getElementById('aiModel').value.trim(),
    useMultiModel: document.getElementById('useMultiModel').checked,
    autoCheckHeadlines: document.getElementById('autoCheckHeadlines').checked,
    enhancedUI: document.getElementById('enhancedUI').checked,
    resultPosition: document.getElementById('resultPosition').value,
    
    // Analytics
    shareAnalytics: document.getElementById('shareAnalytics').checked
  };
  
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

// Load analytics data
function loadAnalyticsData() {
  const statsContainer = document.getElementById('statsContainer');
  
  // Get fact check analytics
  chrome.storage.local.get(['factCheckAnalytics', 'factCheckFeedback'], (data) => {
    const analytics = data.factCheckAnalytics || [];
    const feedback = data.factCheckFeedback || [];
    
    if (analytics.length === 0 && feedback.length === 0) {
      statsContainer.innerHTML = `<p>No usage data available yet. Start fact-checking to generate statistics.</p>`;
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
  });
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