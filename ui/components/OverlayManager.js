// ui/components/OverlayManager.js
import { STYLES } from '../../utils/constants.js';
import { BaseOverlayRenderer } from './BaseOverlayRenderer.js';
import { LoadingIndicator } from './LoadingIndicator.js';
import { RatingVisualizer } from './RatingVisualizer.js';
import { TabManager } from './TabManager.js';
import { PaginationManager } from './PaginationManager.js';
import { FeedbackComponent } from './FeedbackComponent.js';
import { StyleInjector } from './StyleInjector.js';
import { MetadataDisplay } from './MetadataDisplay.js';

export class OverlayManager {
  constructor() {
    this.overlayId = 'factCheckOverlay';
    this.overlayRenderer = new BaseOverlayRenderer(this.overlayId);
    this.loadingIndicator = new LoadingIndicator();
    this.ratingVisualizer = new RatingVisualizer();
    this.tabManager = new TabManager();
    this.paginationManager = new PaginationManager();
    this.feedbackComponent = new FeedbackComponent();
    this.styleInjector = new StyleInjector();
    this.metadataDisplay = new MetadataDisplay();
    
    // Store the trigger element to return focus to when closing
    this.triggerElement = null;
    
    // Store previously focused element to restore focus when closing
    this.previouslyFocusedElement = null;
  }
  
  createLoadingOverlay() {
    // Store currently focused element
    this.previouslyFocusedElement = document.activeElement;
    
    // Remove any existing overlay
    const existingOverlay = document.getElementById(this.overlayId);
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Detect background color to determine light or dark mode
    const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
    const isDarkMode = MarkdownUtils ? MarkdownUtils.isDarkBackground(bodyBgColor) : false;
    
    // Create the base overlay
    const overlay = this.overlayRenderer.create(isDarkMode);
    
    // Add loading indicator
    const textContainer = document.createElement('div');
    textContainer.id = 'factCheckText';
    
    // Create the loading indicator with progress steps
    const loadingContainer = this.loadingIndicator.create(isDarkMode);
    
    // Store a reference to the loading indicator instance for progress updates
    window.loadingIndicatorInstance = this.loadingIndicator;
    
    // Add event listener for progress updates via custom events
    loadingContainer.addEventListener('fact-check-progress', (event) => {
      if (event.detail && event.detail.stepId) {
        this.loadingIndicator.updateProgress(event.detail.stepId);
      }
    });
    
    textContainer.appendChild(loadingContainer);
    
    overlay.appendChild(textContainer);
    document.body.appendChild(overlay);
    
    // Inject necessary styles
    this.styleInjector.injectStyles(isDarkMode);
    
    // Add a screen reader announcement for loading state
    const loadingAnnouncement = document.createElement('div');
    loadingAnnouncement.className = 'sr-only';
    loadingAnnouncement.setAttribute('role', 'status');
    loadingAnnouncement.setAttribute('aria-live', 'assertive');
    loadingAnnouncement.textContent = 'Fact check in progress. Please wait while analyzing for factual accuracy.';
    overlay.appendChild(loadingAnnouncement);
    
    // Set up keyboard trap for the overlay
    this._setupFocusTrap(overlay);
    
    // Focus on the first focusable element in the overlay
    setTimeout(() => {
      const closeButton = overlay.querySelector('[aria-label="Close fact check overlay"]');
      if (closeButton) {
        closeButton.focus();
      }
    }, 100);
    
    return overlay;
  }
  
  updateOverlayResult(result, sourceMetadata = {}) {
    const overlay = document.getElementById(this.overlayId);
    if (!overlay) return;

    // Clear the overlay to remove any previous content
    overlay.innerHTML = "";

    // Detect dark mode again to ensure consistent styling
    const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
    const isDarkMode = MarkdownUtils ? MarkdownUtils.isDarkBackground(bodyBgColor) : false;
    const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
    
    // Reset overlay with base styling
    this.overlayRenderer.applyBaseStyles(overlay, isDarkMode);
    
    // Create overlay header
    const header = this.overlayRenderer.createHeader(isDarkMode, () => this._toggleOverlaySize());
    overlay.appendChild(header);

    // Add source metadata display if available
    if (sourceMetadata.title || sourceMetadata.date || sourceMetadata.author) {
      const sourceInfoContainer = this.metadataDisplay.create(sourceMetadata, isDarkMode);
      overlay.appendChild(sourceInfoContainer);
    }

    // Extract the rating information
    const { numericRating, confidenceLevel, formattedResult, modelName } = this._extractRatingInfo(result);

    // Create rating visualization
    const ratingVisual = this.ratingVisualizer.create(numericRating, confidenceLevel, isDarkMode, modelName);
    overlay.appendChild(ratingVisual);
    
    // Create tabbed interface for explanation and references
    const hasReferences = result.includes("References:");
    const { tabsContainer, explanationSection, referencesSection } = 
      this.tabManager.createTabs(formattedResult, result, isDarkMode, hasReferences);
    
    overlay.appendChild(tabsContainer);
    overlay.appendChild(explanationSection);
    
    // Add references section if available
    if (hasReferences) {
      overlay.appendChild(referencesSection);
    }
    
    // Add pagination for long content if needed
    const explanationText = explanationSection.textContent || "";
    if (explanationText.length > 1500) { // Using a constant value here for clarity
      this.paginationManager.addPagination(explanationSection);
    }
    
    // Add feedback buttons
    const feedbackContainer = this.feedbackComponent.create(isDarkMode);
    overlay.appendChild(feedbackContainer);
    
    // Add a screen reader announcement for completion
    const completionAnnouncement = document.createElement('div');
    completionAnnouncement.className = 'sr-only';
    completionAnnouncement.setAttribute('role', 'status');
    completionAnnouncement.setAttribute('aria-live', 'polite');
    completionAnnouncement.textContent = `Fact check completed with a rating of ${numericRating} out of 100 and ${confidenceLevel} confidence level.`;
    overlay.appendChild(completionAnnouncement);
    
    // Update tab indexing to ensure right elements are focusable
    this._updateTabIndexes(overlay);
    
    // Set focus on first tab for keyboard navigation
    setTimeout(() => {
      const firstTab = overlay.querySelector('[role="tab"]');
      if (firstTab) {
        firstTab.focus();
      }
    }, 100);
    
    // Restore focus trap for keyboard accessibility
    this._setupFocusTrap(overlay);
  }
  
  // Updated _extractRatingInfo method for the OverlayManager class
  _extractRatingInfo(result) {
    // First look for a rating in the Verdict section (most authoritative)
    const verdictSection = result.match(/Verdict:[\s\S]*?Score:?\s*(\d+(\.\d+)?)/i);
    const verdictRating = verdictSection ? parseFloat(verdictSection[1]) : null;
    
    // Look for model information - make it more specific to avoid capturing HTML
    const modelMatch = result.match(/Model:\s*([^\n<]+)/i);
    const modelName = modelMatch ? modelMatch[1].trim() : null;
    
    // If we found a verdict rating, use it as our primary source
    if (verdictRating !== null) {
      // Get confidence level from the full result
      const confidenceMatch = result.match(/Confidence Level:\s*(High|Moderate|Low)/i);
      const confidenceLevel = confidenceMatch ? confidenceMatch[1] : "Moderate";
      
      // Format the result by removing rating information that will be displayed visually
      let formattedResult = result
        .replace(/Rating:\s*\d+(\.\d+)?/i, "")
        .replace(/Confidence Level:.+?(?=\n|$)/i, "")
        .replace(/Model:\s*[^\n<]+(?=\n|$)/i, "") // More precise model removal
        .trim();
      
      return { numericRating: verdictRating, confidenceLevel, formattedResult, modelName };
    }
    
    // Fallback: Extract the general rating if no verdict-specific rating is found
    const ratingMatch = result.match(/Rating:\s*(\d+(\.\d+)?)/i);
    const confidenceMatch = result.match(/Confidence Level:\s*(High|Moderate|Low)/i);
    
    let numericRating = 0;
    let confidenceLevel = "Moderate";
    
    if (ratingMatch) {
      numericRating = parseFloat(ratingMatch[1]);
    }
    
    if (confidenceMatch) {
      confidenceLevel = confidenceMatch[1];
    }
  
    // Format the result by removing rating information that will be displayed visually
    let formattedResult = result
      .replace(/Rating:\s*\d+(\.\d+)?/i, "")
      .replace(/Confidence Level:.+?(?=\n|$)/i, "")
      .replace(/Model:\s*[^\n<]+(?=\n|$)/i, "") // More precise model removal
      .trim();
    
    return { numericRating, confidenceLevel, formattedResult, modelName };
  }
  
  _toggleOverlaySize() {
    const overlay = document.getElementById(this.overlayId);
    if (!overlay) return;
    
    const sizes = STYLES.SIZES.OVERLAY;
    
    if (overlay.dataset.expanded === 'true') {
      // Collapse
      overlay.style.maxWidth = sizes.DEFAULT_WIDTH;
      overlay.style.maxHeight = sizes.DEFAULT_HEIGHT;
      overlay.dataset.expanded = 'false';
      
      // Announce state change to screen readers
      this._announceToScreenReader('Fact check overlay collapsed');
    } else {
      // Expand
      overlay.style.maxWidth = sizes.EXPANDED_WIDTH;
      overlay.style.maxHeight = sizes.EXPANDED_HEIGHT;
      overlay.dataset.expanded = 'true';
      
      // Announce state change to screen readers
      this._announceToScreenReader('Fact check overlay expanded');
    }
    
    // After size change, ensure focus stays trapped in the overlay
    this._updateTabIndexes(overlay);
  }
  
  _setupFocusTrap(overlay) {
    // Get all focusable elements within the overlay
    const focusableElements = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"]');
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];
    
    // Add keydown handler to trap focus within the overlay
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        // If shift+tab and focus is on first element, move to last
        if (e.shiftKey && document.activeElement === firstFocusableElement) {
          e.preventDefault();
          lastFocusableElement.focus();
        }
        // If tab and focus is on last element, move to first
        else if (!e.shiftKey && document.activeElement === lastFocusableElement) {
          e.preventDefault();
          firstFocusableElement.focus();
        }
      }
      // Close on Escape key
      else if (e.key === 'Escape') {
        e.preventDefault();
        overlay.remove();
        
        // Restore focus to the previously focused element
        if (this.previouslyFocusedElement && document.body.contains(this.previouslyFocusedElement)) {
          this.previouslyFocusedElement.focus();
        }
      }
    });
    
    // Add handler to restore focus when overlay is closed
    const closeButton = overlay.querySelector('[aria-label="Close fact check overlay"]');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        if (this.previouslyFocusedElement && document.body.contains(this.previouslyFocusedElement)) {
          this.previouslyFocusedElement.focus();
        }
      });
    }
  }
  
  _updateTabIndexes(overlay) {
    // Make sure all interactive elements have appropriate tabindex
    const interactiveElements = overlay.querySelectorAll('button, a, [role="tab"], [role="button"]');
    interactiveElements.forEach(el => {
      if (el.getAttribute('aria-disabled') === 'true' || el.disabled) {
        el.setAttribute('tabindex', '-1');
      } else if (!el.hasAttribute('tabindex') && el.getAttribute('role') !== 'tab') {
        el.setAttribute('tabindex', '0');
      }
    });
    
    // Ensure only the active tab is in the tab order
    const tabs = overlay.querySelectorAll('[role="tab"]');
    tabs.forEach(tab => {
      const isSelected = tab.getAttribute('aria-selected') === 'true';
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
  }
  
  _announceToScreenReader(message) {
    const announcer = document.createElement('div');
    announcer.className = 'sr-only';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.textContent = message;
    
    document.body.appendChild(announcer);
    
    // Remove the announcer after the announcement is made
    setTimeout(() => {
      document.body.removeChild(announcer);
    }, 1000);
  }
}