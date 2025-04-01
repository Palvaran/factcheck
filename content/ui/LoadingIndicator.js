// content/ui/LoadingIndicator.js - Loading animation and progress steps
import { DomUtils } from '../utils/DomUtils.js';

/**
 * Enhanced loading indicator with step-based progress
 */
export class LoadingIndicator {
  /**
   * Create a new loading indicator
   */
  constructor() {
    this.steps = [
      { id: 'extraction', label: 'Extracting content...', complete: false },
      { id: 'query', label: 'Generating search queries...', complete: false },
      { id: 'search', label: 'Searching for references...', complete: false },
      { id: 'analysis', label: 'Analyzing claims...', complete: false },
      { id: 'verification', label: 'Verifying facts...', complete: false }
    ];
    this.currentStep = 0;
    this.element = null;
  }
  
  /**
   * Create the loading indicator element
   * @param {boolean} isDarkMode - Whether to use dark mode styling
   * @returns {HTMLElement} The loading indicator element
   */
  create(isDarkMode) {
    const textColor = isDarkMode ? '#f0f0f0' : '#333333';
    const bgColor = isDarkMode ? 'rgba(33, 33, 33, 0.9)' : 'rgba(255, 255, 255, 0.9)';
    const borderColor = isDarkMode ? '#444444' : '#dddddd';
    
    // Create container
    const container = DomUtils.createElement('div', {
      class: 'fact-check-loading-container',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px',
        color: textColor,
        backgroundColor: bgColor,
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        border: `1px solid ${borderColor}`,
        maxWidth: '400px',
        width: '100%'
      }
    });
    
    // Add title
    container.appendChild(
      DomUtils.createElement('h3', {
        style: {
          margin: '0 0 15px 0',
          fontSize: '18px',
          fontWeight: 'bold',
          color: textColor
        }
      }, 'Fact Checking in Progress')
    );
    
    // Create spinner
    const spinner = DomUtils.createElement('div', {
      class: 'fact-check-spinner',
      style: {
        border: '4px solid rgba(0, 0, 0, 0.1)',
        borderTopColor: '#3498db',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        animation: 'fact-check-spin 1s linear infinite',
        marginBottom: '20px'
      }
    });
    container.appendChild(spinner);
    
    // Add spinner animation
    DomUtils.addStyles('fact-check-spinner-style', `
      @keyframes fact-check-spin {
        to { transform: rotate(360deg); }
      }
    `);
    
    // Create steps list
    const stepsList = DomUtils.createElement('div', {
      class: 'fact-check-steps',
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        gap: '8px'
      }
    });
    
    // Add each step
    this.steps.forEach((step, index) => {
      const stepElement = DomUtils.createElement('div', {
        class: `fact-check-step step-${step.id}`,
        'data-step-id': step.id,
        style: {
          display: 'flex',
          alignItems: 'center',
          opacity: index === 0 ? '1' : '0.5',
          transition: 'opacity 0.3s ease'
        }
      });
      
      // Step indicator
      const indicator = DomUtils.createElement('div', {
        class: 'step-indicator',
        style: {
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: '2px solid #ccc',
          marginRight: '10px',
          position: 'relative',
          backgroundColor: index === 0 ? '#3498db' : 'transparent',
          transition: 'background-color 0.3s ease'
        }
      });
      
      // Check mark (hidden initially)
      const checkMark = DomUtils.createElement('span', {
        class: 'step-check',
        style: {
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff',
          fontSize: '12px',
          opacity: '0',
          transition: 'opacity 0.3s ease'
        }
      }, '✓');
      indicator.appendChild(checkMark);
      stepElement.appendChild(indicator);
      
      // Step label
      const label = DomUtils.createElement('span', {
        class: 'step-label',
        style: {
          fontSize: '14px'
        }
      }, step.label);
      stepElement.appendChild(label);
      
      stepsList.appendChild(stepElement);
    });
    
    container.appendChild(stepsList);
    
    // Add cancel button
    const cancelButton = DomUtils.createElement('button', {
      class: 'fact-check-cancel',
      style: {
        marginTop: '20px',
        padding: '8px 16px',
        backgroundColor: isDarkMode ? '#555555' : '#f0f0f0',
        color: isDarkMode ? '#f0f0f0' : '#333333',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        transition: 'background-color 0.2s ease'
      },
      onclick: () => {
        // Dispatch cancel event
        document.dispatchEvent(new CustomEvent('fact-check-cancel'));
        // Remove the overlay
        const overlay = document.getElementById('factCheckOverlay');
        if (overlay) overlay.remove();
      }
    }, 'Cancel');
    
    // Hover effect for cancel button
    cancelButton.addEventListener('mouseover', () => {
      cancelButton.style.backgroundColor = isDarkMode ? '#666666' : '#e0e0e0';
    });
    cancelButton.addEventListener('mouseout', () => {
      cancelButton.style.backgroundColor = isDarkMode ? '#555555' : '#f0f0f0';
    });
    
    container.appendChild(cancelButton);
    
    this.element = container;
    return container;
  }
  
  /**
   * Update the progress based on the current step
   * @param {string} stepId - ID of the current step
   */
  updateProgress(stepId) {
    if (!this.element) return;
    
    // Find the step index
    const stepIndex = this.steps.findIndex(step => step.id === stepId);
    if (stepIndex === -1) return;
    
    // Update current step
    this.currentStep = stepIndex;
    
    // Update all steps
    this.steps.forEach((step, index) => {
      const stepElement = this.element.querySelector(`.step-${step.id}`);
      if (!stepElement) return;
      
      // Mark previous steps as complete
      if (index < stepIndex) {
        step.complete = true;
        stepElement.style.opacity = '1';
        
        const indicator = stepElement.querySelector('.step-indicator');
        const checkMark = stepElement.querySelector('.step-check');
        
        if (indicator) {
          indicator.style.backgroundColor = '#4CAF50';
          indicator.style.borderColor = '#4CAF50';
        }
        
        if (checkMark) {
          checkMark.style.opacity = '1';
        }
      }
      // Highlight current step
      else if (index === stepIndex) {
        step.complete = false;
        stepElement.style.opacity = '1';
        
        const indicator = stepElement.querySelector('.step-indicator');
        if (indicator) {
          indicator.style.backgroundColor = '#3498db';
          indicator.style.borderColor = '#3498db';
        }
      }
      // Dim future steps
      else {
        step.complete = false;
        stepElement.style.opacity = '0.5';
        
        const indicator = stepElement.querySelector('.step-indicator');
        const checkMark = stepElement.querySelector('.step-check');
        
        if (indicator) {
          indicator.style.backgroundColor = 'transparent';
          indicator.style.borderColor = '#ccc';
        }
        
        if (checkMark) {
          checkMark.style.opacity = '0';
        }
      }
    });
  }
}
