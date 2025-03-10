// modules/ui-manager.js

/**
 * Manages UI-related functionality for the options page
 * Handles tabs, version info, and other UI elements
 */
export class UiManager {
    constructor() {
      // Track active tab
      this.activeTabId = null;
    }
  
    /**
     * Set up tab navigation
     */
    setupTabs() {
      const tabs = document.querySelectorAll('.tab');
      
      // Set up tab click events
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Remove active class from all tabs and tab contents
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          
          // Add active class to clicked tab
          tab.classList.add('active');
          
          // Show the corresponding content
          const tabId = tab.getAttribute('data-tab');
          const tabContent = document.getElementById(tabId);
          if (tabContent) {
            tabContent.classList.add('active');
            this.activeTabId = tabId;
          }
        });
      });
  
      // Set up keyboard navigation for tabs (Alt+1-5)
      document.addEventListener('keydown', (e) => {
        // Alt + 1-5 for tabs
        if (e.altKey && e.key >= '1' && e.key <= '5') {
          e.preventDefault();
          const tabIndex = parseInt(e.key) - 1;
          const tab = tabs[tabIndex];
          if (tab) {
            tab.click();
          }
        }
      });
    }
  
    /**
     * Set up version info display
     */
    setupVersionInfo() {
      try {
        // Get the manifest directly (it's a synchronous method)
        const manifest = chrome.runtime.getManifest();
        
        // Display version from manifest
        const versionElement = document.getElementById('version');
        if (versionElement) {
          versionElement.textContent = `Version: ${manifest.version}`;
        }
        
        // You can store build date in extension storage or compute it here
        // For now, we'll use a placeholder date that you can update in your build process
        const buildDateElement = document.getElementById('buildDate');
        if (buildDateElement) {
          const buildDate = new Date().toLocaleDateString();
          buildDateElement.textContent = `Build date: ${buildDate}`;
        }
      } catch (error) {
        console.error("Error getting manifest:", error);
        // Fallback if manifest can't be loaded
        const versionElement = document.getElementById('version');
        if (versionElement) {
          versionElement.textContent = "Version: 1.0.0";
        }
        
        const buildDateElement = document.getElementById('buildDate');
        if (buildDateElement) {
          buildDateElement.textContent = "Build date: March 7, 2025";
        }
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
        // Could be replaced with custom modal implementation
        const result = confirm(message);
        resolve(result);
      });
    }
  }