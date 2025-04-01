// content/ui/OverlayManager.js - Manages the fact-check overlay UI
import { DomUtils } from '../utils/DomUtils.js';
import { MarkdownUtils } from '../utils/MarkdownUtils.js';
import { LoadingIndicator } from './LoadingIndicator.js';

/**
 * Manages the fact-check overlay UI
 */
export class OverlayManager {
  /**
   * Create a new overlay manager
   */
  constructor() {
    this.overlayId = 'factCheckOverlay';
    this.loadingIndicator = new LoadingIndicator();
  }
  
  /**
   * Create and show the loading overlay
   * @returns {HTMLElement} The created overlay element
   */
  createLoadingOverlay() {
    // Remove existing overlay if present
    this.removeOverlay();
    
    // Get background color to determine if dark mode should be used
    const bgColor = DomUtils.getBackgroundColor(document.body);
    const isDarkMode = MarkdownUtils.isDarkBackground(bgColor);
    
    // Create overlay container
    const overlay = DomUtils.createElement('div', {
      id: this.overlayId,
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: '2147483647', // Max z-index
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '16px',
        lineHeight: '1.5'
      },
      onclick: (e) => this.handleOverlayClick(e)
    });
    
    // Create loading indicator
    const loadingElement = this.loadingIndicator.create(isDarkMode);
    overlay.appendChild(loadingElement);
    
    // Add to document
    document.body.appendChild(overlay);
    
    // Store reference to loading indicator for updates
    window.loadingIndicatorInstance = this.loadingIndicator;
    
    return overlay;
  }
  
  /**
   * Handle clicks on the overlay
   * @param {Event} e - Click event
   */
  handleOverlayClick(e) {
    // Close overlay if clicking outside the content
    if (e.target.id === this.overlayId) {
      this.removeOverlay();
      // Dispatch cancel event
      document.dispatchEvent(new CustomEvent('fact-check-cancel'));
    }
  }
  
  /**
   * Remove the overlay
   */
  removeOverlay() {
    const overlay = document.getElementById(this.overlayId);
    if (overlay) {
      overlay.remove();
    }
    // Clear the global reference
    if (window.loadingIndicatorInstance) {
      window.loadingIndicatorInstance = null;
    }
  }
  
  /**
   * Update the overlay with fact-check results
   * @param {Object} result - Fact-check result data
   * @param {Object} metadata - Additional metadata
   */
  updateOverlayResult(result, metadata = {}) {
    // Get existing overlay or create new one
    let overlay = document.getElementById(this.overlayId);
    if (!overlay) {
      overlay = this.createLoadingOverlay();
    }
    
    // Clear existing content
    overlay.innerHTML = '';
    
    // Get background color to determine if dark mode should be used
    const bgColor = DomUtils.getBackgroundColor(document.body);
    const isDarkMode = MarkdownUtils.isDarkBackground(bgColor);
    
    // Create result container
    const resultContainer = this.createResultContainer(result, metadata, isDarkMode);
    overlay.appendChild(resultContainer);
    
    // Add event listener for close button
    const closeButton = resultContainer.querySelector('.fact-check-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => this.removeOverlay());
    }
  }
  
  /**
   * Create the result container element
   * @param {Object} result - Fact-check result data
   * @param {Object} metadata - Additional metadata
   * @param {boolean} isDarkMode - Whether to use dark mode styling
   * @returns {HTMLElement} The result container element
   */
  createResultContainer(result, metadata, isDarkMode) {
    const textColor = isDarkMode ? '#f0f0f0' : '#333333';
    const bgColor = isDarkMode ? 'rgba(33, 33, 33, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const borderColor = isDarkMode ? '#444444' : '#dddddd';
    const linkColor = isDarkMode ? '#64B5F6' : '#1976D2';
    
    // Create container
    const container = DomUtils.createElement('div', {
      class: 'fact-check-result-container',
      style: {
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        border: `1px solid ${borderColor}`,
        padding: '20px',
        maxWidth: '800px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        position: 'relative'
      }
    });
    
    // Add close button
    const closeButton = DomUtils.createElement('button', {
      class: 'fact-check-close',
      style: {
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'none',
        border: 'none',
        fontSize: '20px',
        cursor: 'pointer',
        color: textColor,
        opacity: '0.7',
        transition: 'opacity 0.2s ease'
      }
    }, '×');
    
    // Add hover effect
    closeButton.addEventListener('mouseover', () => {
      closeButton.style.opacity = '1';
    });
    closeButton.addEventListener('mouseout', () => {
      closeButton.style.opacity = '0.7';
    });
    
    container.appendChild(closeButton);
    
    // Add header with rating if available
    if (result.rating !== undefined) {
      const letterGrade = MarkdownUtils.mapRatingToLetter(result.rating);
      const { icon, color } = MarkdownUtils.getIconAndColor(letterGrade);
      
      const header = DomUtils.createElement('div', {
        class: 'fact-check-header',
        style: {
          display: 'flex',
          alignItems: 'center',
          marginBottom: '15px',
          borderBottom: `1px solid ${borderColor}`,
          paddingBottom: '15px'
        }
      });
      
      // Add rating badge
      const ratingBadge = DomUtils.createElement('div', {
        class: 'fact-check-rating',
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '60px',
          height: '60px',
          backgroundColor: color,
          color: '#ffffff',
          borderRadius: '8px',
          marginRight: '15px',
          padding: '5px'
        }
      });
      
      // Add icon
      const iconElement = DomUtils.createElement('div', {
        style: {
          fontSize: '24px',
          marginBottom: '2px'
        }
      }, icon);
      ratingBadge.appendChild(iconElement);
      
      // Add letter grade
      const gradeElement = DomUtils.createElement('div', {
        style: {
          fontSize: '20px',
          fontWeight: 'bold'
        }
      }, letterGrade);
      ratingBadge.appendChild(gradeElement);
      
      header.appendChild(ratingBadge);
      
      // Add title and summary
      const headerContent = DomUtils.createElement('div', {
        class: 'fact-check-header-content'
      });
      
      // Add title
      const title = DomUtils.createElement('h2', {
        style: {
          margin: '0 0 5px 0',
          fontSize: '18px',
          fontWeight: 'bold'
        }
      }, 'Fact Check Result');
      headerContent.appendChild(title);
      
      // Add summary if available
      if (result.summary) {
        const summary = DomUtils.createElement('p', {
          style: {
            margin: '0',
            fontSize: '14px'
          }
        });
        summary.innerHTML = MarkdownUtils.parseMarkdown(result.summary);
        headerContent.appendChild(summary);
      }
      
      header.appendChild(headerContent);
      container.appendChild(header);
    } else {
      // Simple header if no rating
      const title = DomUtils.createElement('h2', {
        style: {
          margin: '0 0 15px 0',
          fontSize: '20px',
          fontWeight: 'bold',
          borderBottom: `1px solid ${borderColor}`,
          paddingBottom: '10px'
        }
      }, 'Fact Check Result');
      container.appendChild(title);
    }
    
    // Add main content
    const content = DomUtils.createElement('div', {
      class: 'fact-check-content',
      style: {
        maxHeight: '400px',
        overflowY: 'auto'
      }
    });
    
    // Format the result content
    if (typeof result === 'string') {
      content.innerHTML = MarkdownUtils.parseMarkdown(result);
    } else if (result.html) {
      content.innerHTML = result.html;
    } else if (result.markdown) {
      content.innerHTML = MarkdownUtils.parseMarkdown(result.markdown);
    } else if (result.text) {
      content.innerHTML = MarkdownUtils.parseMarkdown(result.text);
    } else if (result.result) {
      content.innerHTML = MarkdownUtils.parseMarkdown(result.result);
    } else {
      content.textContent = 'No result available';
    }
    
    // Style links in content
    const links = content.querySelectorAll('a');
    links.forEach(link => {
      link.style.color = linkColor;
      link.style.textDecoration = 'none';
      link.style.borderBottom = `1px solid ${linkColor}`;
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    
    container.appendChild(content);
    
    // Add metadata footer if available
    if (metadata && Object.keys(metadata).length > 0) {
      const footer = DomUtils.createElement('div', {
        class: 'fact-check-footer',
        style: {
          marginTop: '20px',
          paddingTop: '10px',
          borderTop: `1px solid ${borderColor}`,
          fontSize: '12px',
          color: isDarkMode ? '#aaaaaa' : '#666666'
        }
      });
      
      // Add source if available
      if (metadata.source) {
        const source = DomUtils.createElement('div', {
          style: { marginBottom: '5px' }
        }, `Source: ${metadata.source}`);
        footer.appendChild(source);
      }
      
      // Add date if available
      if (metadata.date) {
        const date = DomUtils.createElement('div', {
          style: { marginBottom: '5px' }
        }, `Date: ${metadata.date}`);
        footer.appendChild(date);
      }
      
      // Add provider if available
      if (metadata.provider) {
        const provider = DomUtils.createElement('div', {
          style: { marginBottom: '5px' }
        }, `Provider: ${metadata.provider}`);
        footer.appendChild(provider);
      }
      
      container.appendChild(footer);
    }
    
    return container;
  }
}
