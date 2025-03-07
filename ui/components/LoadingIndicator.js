// ui/components/LoadingIndicator.js
import { STYLES } from '../../utils/constants.js';

export class LoadingIndicator {
  create(isDarkMode) {
    const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
    
    const loadingContainer = document.createElement('div');
    loadingContainer.style.display = 'flex';
    loadingContainer.style.flexDirection = 'column';
    loadingContainer.style.alignItems = 'center';
    loadingContainer.style.margin = '20px 0';
    
    // Add ARIA attributes
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
    
    // Add keyframes for the spinner
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    
    const loadingText = document.createElement('div');
    loadingText.id = 'fact-check-loading-text'; // Add ID for updates
    loadingText.textContent = 'Analyzing for factual accuracy...';
    loadingText.style.marginTop = '10px';
    loadingText.style.textAlign = 'center';
    
    // Add an additional progress indicator for better accessibility
    const progressText = document.createElement('div');
    progressText.className = 'sr-only';
    progressText.textContent = 'This may take a few seconds.';
    
    loadingContainer.appendChild(spinner);
    loadingContainer.appendChild(loadingText);
    loadingContainer.appendChild(progressText);
    
    // Update the loading message every few seconds to indicate progress
    let step = 0;
    const loadingMessages = [
      'Analyzing for factual accuracy...',
      'Checking sources and references...',
      'Evaluating claims...',
      'Almost done...'
    ];
    
    // Store the current interval ID
    if (window.__factCheckLoadingInterval) {
      clearInterval(window.__factCheckLoadingInterval);
    }
    
    const updateInterval = setInterval(() => {
      step = (step + 1) % loadingMessages.length;
      
      // Find the text element by ID in case the DOM has been updated
      const textElement = document.getElementById('fact-check-loading-text');
      if (textElement) {
        textElement.textContent = loadingMessages[step];
        
        // Also update the aria-label for screen readers
        const container = textElement.closest('[role="status"]');
        if (container) {
          container.setAttribute('aria-label', loadingMessages[step]);
        }
      }
      
      // Check if container still exists to prevent memory leaks
      if (!document.querySelector('.fact-check-spinner')) {
        clearInterval(window.__factCheckLoadingInterval);
        window.__factCheckLoadingInterval = null;
      }
    }, 3000);
    
    // Store the interval ID globally for cleanup
    window.__factCheckLoadingInterval = updateInterval;
    
    return loadingContainer;
  }
}