// modules/accessibility.js
import { STYLES } from '../../utils/constants.js';

/**
 * Manages accessibility features for the options page
 */
export class AccessibilityHelper {
  constructor() {
    // Nothing to initialize yet
  }

  /**
   * Set up all accessibility improvements
   */
  enhanceAccessibility() {
    // Add skip link for keyboard users
    this.addSkipLink();
    
    // Enhance tab navigation
    this.enhanceTabNavigation();
    
    // Add ARIA labels to all form controls
    this.addAriaLabels();
    
    // Improve button accessibility
    this.enhanceButtonAccessibility();
  }

  /**
   * Add skip link for keyboard users to bypass navigation
   */
  addSkipLink() {
    if (document.getElementById('skip-link')) return; // Already exists
    
    const skipLink = document.createElement('a');
    skipLink.id = 'skip-link';
    skipLink.href = '#main-content';
    skipLink.textContent = 'Skip to main content';
    skipLink.style.cssText = `
      position: absolute;
      top: -40px;
      left: 0;
      padding: 8px;
      background-color: ${STYLES.COLORS.LIGHT.ACCENT};
      color: white;
      z-index: 1000;
      transition: top 0.3s;
    `;
    
    // Show the skip link when it gets focus
    skipLink.addEventListener('focus', () => {
      skipLink.style.top = '0';
    });
    
    // Hide the skip link when it loses focus
    skipLink.addEventListener('blur', () => {
      skipLink.style.top = '-40px';
    });
    
    document.body.insertBefore(skipLink, document.body.firstChild);
    
    // Add ID to main content area
    const mainContentArea = document.querySelector('.tabs');
    if (mainContentArea) {
      mainContentArea.id = 'main-content';
      mainContentArea.setAttribute('tabindex', '-1'); // Make it focusable
    }
  }

  /**
   * Enhance tab navigation for keyboard users
   */
  enhanceTabNavigation() {
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach((tab, index) => {
      // Add ARIA roles and states if they don't exist
      if (!tab.hasAttribute('role')) {
        tab.setAttribute('role', 'tab');
      }
      
      if (!tab.hasAttribute('tabindex')) {
        tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
      }
      
      if (!tab.hasAttribute('aria-selected')) {
        tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
      }
      
      if (!tab.id) {
        tab.id = `tab-${index}`;
      }
      
      const tabContentId = tab.getAttribute('data-tab');
      const tabContent = document.getElementById(tabContentId);
      
      if (tabContent) {
        if (!tabContent.hasAttribute('role')) {
          tabContent.setAttribute('role', 'tabpanel');
        }
        
        if (!tabContent.hasAttribute('aria-labelledby')) {
          tabContent.setAttribute('aria-labelledby', tab.id);
        }
        
        if (!tabContent.hasAttribute('tabindex')) {
          tabContent.setAttribute('tabindex', '0');
        }
      }
      
      // Add keyboard support
      tab.addEventListener('keydown', (e) => {
        const tabsArray = Array.from(tabs);
        const currentIndex = tabsArray.indexOf(tab);
        
        // Handle keyboard navigation
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            if (currentIndex > 0) {
              tabs[currentIndex - 1].click();
              tabs[currentIndex - 1].focus();
            }
            break;
          case 'ArrowRight':
            e.preventDefault();
            if (currentIndex < tabs.length - 1) {
              tabs[currentIndex + 1].click();
              tabs[currentIndex + 1].focus();
            }
            break;
          case 'Home':
            e.preventDefault();
            tabs[0].click();
            tabs[0].focus();
            break;
          case 'End':
            e.preventDefault();
            tabs[tabs.length - 1].click();
            tabs[tabs.length - 1].focus();
            break;
        }
      });
    });
    
    // Update click handler to manage tabindex
    tabs.forEach(tab => {
      const originalClick = tab.onclick;
      
      tab.onclick = function(e) {
        // Update tabindex for all tabs
        tabs.forEach(t => {
          t.setAttribute('tabindex', t === this ? '0' : '-1');
          t.setAttribute('aria-selected', t === this ? 'true' : 'false');
        });
        
        // Call original click handler if it exists
        if (originalClick) {
          originalClick.call(this, e);
        }
      };
    });
  }

  /**
   * Add ARIA labels to form controls
   */
  addAriaLabels() {
    // Add labels to checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      if (!checkbox.hasAttribute('aria-label')) {
        const parentLabel = checkbox.closest('.option-row')?.querySelector('.option-label');
        if (parentLabel) {
          checkbox.setAttribute('aria-label', parentLabel.textContent.trim());
        }
      }
    });
    
    // Add labels to buttons without text
    document.querySelectorAll('button').forEach(button => {
      if (!button.textContent.trim() && !button.hasAttribute('aria-label')) {
        // Try to derive a label from context
        const nearbyLabel = button.previousElementSibling?.textContent || 
                           button.parentElement?.previousElementSibling?.textContent;
        
        if (nearbyLabel) {
          button.setAttribute('aria-label', `${nearbyLabel} button`);
        }
      }
    });
    
    // Add descriptions to form fields
    document.querySelectorAll('.note').forEach(note => {
      const previousInput = note.previousElementSibling?.querySelector('input, select, textarea');
      if (previousInput) {
        const descriptionId = `desc-${Math.random().toString(36).substring(2, 9)}`;
        note.id = descriptionId;
        previousInput.setAttribute('aria-describedby', descriptionId);
      }
    });
  }

  /**
   * Enhance button accessibility
   */
  enhanceButtonAccessibility() {
    document.querySelectorAll('button').forEach(button => {
      // Ensure buttons have type attribute
      if (!button.hasAttribute('type')) {
        button.setAttribute('type', 'button'); // Prevent default submit behavior
      }
      
      // Add focus styles
      button.addEventListener('focus', () => {
        button.style.outline = `2px solid ${STYLES.COLORS.LIGHT.ACCENT}`;
        button.style.outlineOffset = '2px';
      });
      
      button.addEventListener('blur', () => {
        button.style.outline = '';
        button.style.outlineOffset = '';
      });
      
      // Add press state for keyboard users
      button.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          button.click();
        }
      });
    });
  }

  /**
   * Show keyboard shortcut help
   * Static method so it can be called without instantiating the class
   */
  static showAccessibilityHelp() {
    // Remove any existing help modal
    const existingModal = document.getElementById('accessibility-help-modal');
    if (existingModal) {
      document.body.removeChild(existingModal);
    }
    
    const helpModal = document.createElement('div');
    helpModal.id = 'accessibility-help-modal';
    helpModal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      box-shadow: 0 0 20px rgba(0,0,0,0.3);
      border-radius: 8px;
      z-index: 10000;
      max-width: 400px;
    `;
    
    helpModal.innerHTML = `
      <h2>Keyboard Shortcuts</h2>
      <ul>
        <li><strong>Alt + 1-5</strong>: Switch between tabs</li>
        <li><strong>Ctrl + S</strong>: Save settings</li>
        <li><strong>Ctrl + R</strong>: Reset to defaults</li>
        <li><strong>Tab</strong>: Navigate between controls</li>
        <li><strong>Enter/Space</strong>: Activate buttons</li>
        <li><strong>Alt + /</strong>: Show this help</li>
      </ul>
      <button id="close-help" style="margin-top: 15px;">Close</button>
    `;
    
    document.body.appendChild(helpModal);
    
    // Focus on close button
    const closeButton = document.getElementById('close-help');
    if (closeButton) {
      closeButton.focus();
      
      // Add close functionality
      closeButton.addEventListener('click', () => {
        document.body.removeChild(helpModal);
      });
    }
    
    // Close on escape key
    helpModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(helpModal);
      }
    });
  }
}