// ui/components/LoadingIndicator.js
import { STYLES } from '../../utils/constants.js';

export class LoadingIndicator {
  constructor() {
    // Define all the steps in the fact-checking process
    this.steps = [
      { id: 'extraction', label: 'Extracting content...', complete: false },
      { id: 'query', label: 'Generating search queries...', complete: false },
      { id: 'search', label: 'Searching for references...', complete: false },
      { id: 'analysis', label: 'Analyzing claims...', complete: false },
      { id: 'verification', label: 'Verifying facts...', complete: false }
    ];
    this.currentStep = 0;
  }
  
  create(isDarkMode) {
    const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
    
    const loadingContainer = document.createElement('div');
    loadingContainer.style.display = 'flex';
    loadingContainer.style.flexDirection = 'column';
    loadingContainer.style.alignItems = 'center';
    loadingContainer.style.margin = '20px 0';
    
    // Add ARIA attributes for accessibility
    loadingContainer.setAttribute('role', 'status');
    loadingContainer.setAttribute('aria-live', 'polite');
    loadingContainer.setAttribute('aria-label', 'Analyzing for factual accuracy');
    
    // Create spinner
    const spinner = document.createElement('div');
    spinner.className = 'fact-check-spinner'; // Add a class for easier identification
    spinner.style.border = isDarkMode ? '3px solid #333' : '3px solid #f3f3f3';
    spinner.style.borderTop = isDarkMode ? `3px solid ${theme.LINK}` : `3px solid ${theme.LINK}`;
    spinner.style.borderRadius = '50%';
    spinner.style.width = '30px';
    spinner.style.height = '30px';
    spinner.style.animation = 'spin 1s linear infinite';
    spinner.setAttribute('aria-hidden', 'true'); // Hide spinner from screen readers
    
    // Add keyframes for the spinner if not already added
    if (!document.getElementById('spin-keyframes')) {
      const style = document.createElement('style');
      style.id = 'spin-keyframes';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Main status text
    const loadingText = document.createElement('div');
    loadingText.id = 'fact-check-loading-text';
    loadingText.textContent = this.steps[0].label;
    loadingText.style.marginTop = '10px';
    loadingText.style.marginBottom = '15px';
    loadingText.style.fontWeight = 'bold';
    loadingText.style.textAlign = 'center';
    
    // Add elements to container
    loadingContainer.appendChild(spinner);
    loadingContainer.appendChild(loadingText);
    
    // Create step progress indicator
    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'fact-check-steps';
    stepsContainer.style.width = '100%';
    stepsContainer.style.maxWidth = '300px';
    stepsContainer.style.marginTop = '5px';
    
    // Create progress nodes for each step
    this.steps.forEach((step, index) => {
      const stepElement = document.createElement('div');
      stepElement.id = `step-${step.id}`;
      stepElement.className = 'fact-check-step';
      stepElement.style.display = 'flex';
      stepElement.style.alignItems = 'center';
      stepElement.style.marginBottom = '6px';
      stepElement.style.fontSize = '12px';
      stepElement.style.color = index === 0 ? theme.TEXT : theme.SECONDARY_TEXT;
      stepElement.setAttribute('aria-live', index === 0 ? 'polite' : 'off');
      
      const indicator = document.createElement('span');
      indicator.className = 'step-indicator';
      indicator.textContent = index === 0 ? '◉' : '○';
      indicator.style.marginRight = '8px';
      
      const stepLabel = document.createElement('span');
      stepLabel.className = 'step-label';
      stepLabel.textContent = step.label;
      
      stepElement.appendChild(indicator);
      stepElement.appendChild(stepLabel);
      stepsContainer.appendChild(stepElement);
    });
    
    loadingContainer.appendChild(stepsContainer);
    
    return loadingContainer;
  }
  
  updateProgress(stepId) {
    // Find the step index
    const stepIndex = this.steps.findIndex(step => step.id === stepId);
    if (stepIndex === -1) return;
    
    // Update the main loading text
    const loadingText = document.getElementById('fact-check-loading-text');
    if (loadingText) {
      loadingText.textContent = this.steps[stepIndex].label;
    }
    
    // Mark this step and all previous steps as complete
    for (let i = 0; i <= stepIndex; i++) {
      this.steps[i].complete = true;
      const stepElement = document.getElementById(`step-${this.steps[i].id}`);
      if (stepElement) {
        const indicator = stepElement.querySelector('.step-indicator');
        if (indicator) indicator.textContent = '✓';
        stepElement.style.color = '#2E7D32'; // Success color
        stepElement.classList.add('completed');
      }
    }
    
    // Reset aria-live for all steps
    this.steps.forEach((step) => {
      const element = document.getElementById(`step-${step.id}`);
      if (element) {
        element.setAttribute('aria-live', 'off');
      }
    });
    
    // Set the next step as active
    if (stepIndex + 1 < this.steps.length) {
      const nextElement = document.getElementById(`step-${this.steps[stepIndex + 1].id}`);
      if (nextElement) {
        const indicator = nextElement.querySelector('.step-indicator');
        if (indicator) indicator.textContent = '◉';
        nextElement.style.color = '#000000'; // Active color
        nextElement.classList.add('active');
        nextElement.setAttribute('aria-live', 'polite');
      }
    }
    
    this.currentStep = stepIndex + 1;
    
    // Announce progress to screen readers
    const announcer = document.createElement('div');
    announcer.className = 'sr-only';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.textContent = `Step ${stepIndex + 1} of ${this.steps.length}: ${this.steps[stepIndex].label}`;
    
    document.body.appendChild(announcer);
    setTimeout(() => {
      document.body.removeChild(announcer);
    }, 1000);
  }
}