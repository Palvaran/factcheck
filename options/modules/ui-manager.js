// modules/ui-manager.js

/**
 * Manages UI-related functionality for the options page
 * Handles tabs, version info, and other UI elements
 */
export class UiManager {
  constructor(versionManager = null) {
    // Track active tab
    this.activeTabId = null;
    this.versionManager = versionManager;
    this.tabsInitialized = false;
  }

  /**
   * Set up tab navigation
   */
  setupTabs() {
    console.log("Setting up tabs...");
    
    // Prevent multiple initializations
    if (this.tabsInitialized) {
      console.log("Tabs already initialized, skipping");
      return;
    }
    
    const tabs = document.querySelectorAll('.tab');
    console.log(`Found ${tabs.length} tabs`);
    
    if (tabs.length === 0) {
      console.error("No tabs found in the document");
      return;
    }
    
    // Remove any existing click handlers first (to avoid duplicates)
    tabs.forEach(tab => {
      const newTab = tab.cloneNode(true);
      tab.parentNode.replaceChild(newTab, tab);
    });
    
    // Get fresh references after cloning
    const freshTabs = document.querySelectorAll('.tab');
    
    // Set up tab click events
    freshTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        console.log(`Tab clicked: ${tab.getAttribute('data-tab')}`);
        e.preventDefault();
        
        // Remove active class from all tabs and tab contents
        document.querySelectorAll('.tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
          t.setAttribute('tabindex', '-1');
        });
        
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active class to clicked tab
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        tab.setAttribute('tabindex', '0');
        
        // Show the corresponding content
        const tabId = tab.getAttribute('data-tab');
        console.log(`Activating tab content: ${tabId}`);
        const tabContent = document.getElementById(tabId);
        if (tabContent) {
          tabContent.classList.add('active');
          this.activeTabId = tabId;
        } else {
          console.error(`Tab content with ID ${tabId} not found`);
        }
      });
      
      console.log(`Added click handler to tab: ${tab.getAttribute('data-tab')}`);
    });
    
    // Set up keyboard navigation for tabs (Alt+1-5)
    document.addEventListener('keydown', (e) => {
      // Alt + 1-5 for tabs
      if (e.altKey && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        const tab = freshTabs[tabIndex];
        if (tab) {
          console.log(`Alt+${e.key} pressed, clicking tab ${tabIndex}`);
          tab.click();
        }
      }
    });
    
    this.tabsInitialized = true;
    console.log("Tab setup complete");
  }

  /**
   * Set up version info display
   * This is a placeholder that will be updated by the VersionManager
   */
  setupVersionInfo() {
    console.log('Setting up version info UI (placeholder)');
    
    // Set version elements to "Loading..." state if they're not already set
    const versionElement = document.getElementById('version');
    const buildDateElement = document.getElementById('buildDate');
    const commitLinkElement = document.getElementById('commitLink');
    
    if (versionElement && versionElement.textContent === 'Version: 1.0.0') {
      versionElement.textContent = 'Version: Loading...';
    }
    
    if (buildDateElement && buildDateElement.textContent === 'Build date: March 7, 2025') {
      buildDateElement.textContent = 'Build date: Loading...';
    }
    
    if (commitLinkElement) {
      commitLinkElement.style.display = 'none';
    }
  }
  
  /**
   * Switch to a specific tab
   * @param {string} tabId - ID of the tab to switch to
   */
  switchToTab(tabId) {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (tab) {
      tab.click();
    }
  }

  /**
   * Show a status message
   * @param {string} message - Message to display
   * @param {string} type - Type of message ('success' or 'error')
   * @param {number} duration - How long to show the message in ms
   */
  showStatusMessage(message, type = 'success', duration = 3000) {
    const status = document.getElementById('status');
    if (!status) return;
    
    status.textContent = message;
    status.style.display = 'block';
    
    if (type === 'error') {
      status.style.color = '#d32f2f';
      status.style.backgroundColor = '#ffebee';
    } else {
      status.style.color = 'green';
      status.style.backgroundColor = '#E8F5E9';
    }
    
    setTimeout(() => {
      status.style.display = 'none';
      
      // Reset to success style after hiding
      if (type === 'error') {
        status.style.color = 'green';
        status.style.backgroundColor = '#E8F5E9';
      }
    }, duration);
  }

  /**
   * Create a confirmation dialog
   * @param {string} message - Confirmation message
   * @returns {Promise<boolean>} True if confirmed, false otherwise
   */
  async confirmDialog(message) {
    return new Promise((resolve) => {
      // Using native confirm for simplicity
      const result = confirm(message);
      resolve(result);
    });
  }
}