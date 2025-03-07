// ui/components/PaginationManager.js
import { CONTENT } from '../../utils/constants.js';

export class PaginationManager {
  /**
   * Add pagination to content container using a DOM-based approach
   * that ensures complete paragraphs and prevents text truncation
   */
  addPagination(container) {
    // Clone the container to work with its content
    const contentClone = container.cloneNode(true);
    const originalContent = container.innerHTML;
    
    // Get all paragraphs and block elements that should be kept together
    const paragraphs = [];
    this._extractBlockElements(contentClone, paragraphs);
    
    // If we have very few paragraphs, don't paginate
    if (paragraphs.length <= 2) return;
    
    // Create pages by testing actual rendered height
    const pages = [];
    let currentPage = document.createElement('div');
    
    // Create a hidden test container with the same styling
    const testContainer = document.createElement('div');
    testContainer.style.position = 'absolute';
    testContainer.style.visibility = 'hidden';
    testContainer.style.width = getComputedStyle(container).width;
    testContainer.style.padding = getComputedStyle(container).padding;
    testContainer.style.font = getComputedStyle(container).font;
    testContainer.style.lineHeight = getComputedStyle(container).lineHeight;
    document.body.appendChild(testContainer);
    
    // Estimated max page height (90% of container height to leave room for pagination controls)
    // Subtract additional 20px as safety margin
    const maxPageHeight = container.clientHeight * 0.85 - 20;
    
    for (const paragraph of paragraphs) {
      // Clone the current page to test with the new paragraph
      const testPage = currentPage.cloneNode(true);
      testPage.appendChild(paragraph.cloneNode(true));
      
      // Measure height with new paragraph
      testContainer.innerHTML = '';
      testContainer.appendChild(testPage);
      
      if (testContainer.scrollHeight > maxPageHeight && currentPage.childNodes.length > 0) {
        // This paragraph would make the page too tall, save current page and start new one
        pages.push(currentPage.innerHTML);
        currentPage = document.createElement('div');
        currentPage.appendChild(paragraph.cloneNode(true));
      } else {
        // Add to current page
        currentPage.appendChild(paragraph.cloneNode(true));
      }
    }
    
    // Add the last page if it has content
    if (currentPage.childNodes.length > 0) {
      pages.push(currentPage.innerHTML);
    }
    
    // Clean up the test container
    document.body.removeChild(testContainer);
    
    // If pagination resulted in only one page, don't apply pagination
    if (pages.length <= 1) return;
    
    // Set up pagination in the container
    this._setupPaginationUI(container, pages);
  }
  
  /**
   * Extract all block elements from the container that should be kept together
   */
  _extractBlockElements(container, blocks) {
    // Get direct children
    const children = Array.from(container.childNodes);
    
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        // Check if this is a block element we want to keep intact
        if (this._isBlockElement(child)) {
          blocks.push(child);
        } else {
          // If not a block element, recursively check its children
          this._extractBlockElements(child, blocks);
        }
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
        // Create a paragraph for non-empty text nodes
        const p = document.createElement('p');
        p.textContent = child.textContent;
        blocks.push(p);
      }
    }
  }
  
  /**
   * Check if element is a block element that should be kept intact
   */
  _isBlockElement(element) {
    const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'TABLE', 'PRE'];
    return blockTags.includes(element.tagName) || element.style.display === 'block';
  }
  
  /**
   * Set up the pagination UI in the container with accessibility features
   */
  _setupPaginationUI(container, pages) {
    // Clear container and add first page with wrapper
    const firstPageContent = document.createElement('div');
    firstPageContent.className = 'content-section';
    firstPageContent.innerHTML = pages[0];
    container.innerHTML = '';
    container.appendChild(firstPageContent);
    
    // Set up pagination data
    container.dataset.currentPage = 0;
    container.dataset.totalPages = pages.length;
    container.dataset.pages = JSON.stringify(pages);
    
    // Add pagination controls
    const controls = document.createElement('div');
    controls.className = 'pagination-controls';
    controls.setAttribute('role', 'navigation');
    controls.setAttribute('aria-label', 'Pagination controls');
    
    const prevButton = document.createElement('button');
    prevButton.className = 'pagination-button prev';
    prevButton.textContent = '← Previous';
    prevButton.disabled = true;
    prevButton.setAttribute('aria-label', 'Go to previous page');
    prevButton.setAttribute('aria-disabled', 'true');
    prevButton.addEventListener('click', () => this._changePage(container, -1));
    
    // Add keyboard support for prev button
    prevButton.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !prevButton.disabled) {
        e.preventDefault();
        this._changePage(container, -1);
      }
    });
    
    const pageInfo = document.createElement('span');
    pageInfo.className = 'pagination-info';
    pageInfo.textContent = `Page 1 of ${pages.length}`;
    pageInfo.setAttribute('aria-live', 'polite');
    pageInfo.setAttribute('role', 'status');
    
    const nextButton = document.createElement('button');
    nextButton.className = 'pagination-button next';
    nextButton.textContent = 'Next →';
    nextButton.setAttribute('aria-label', 'Go to next page');
    nextButton.addEventListener('click', () => this._changePage(container, 1));
    
    // Add keyboard support for next button
    nextButton.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !nextButton.disabled) {
        e.preventDefault();
        this._changePage(container, 1);
      }
    });
    
    controls.appendChild(prevButton);
    controls.appendChild(pageInfo);
    controls.appendChild(nextButton);
    
    container.appendChild(controls);
    
    // Create hidden screen reader announcer element 
    const announcer = document.createElement('div');
    announcer.className = 'sr-only';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('role', 'status');
    announcer.id = 'pagination-announcer';
    container.appendChild(announcer);
  }
  
  /**
   * Change the current page with accessibility announcements
   */
  _changePage(container, direction) {
    const currentPage = parseInt(container.dataset.currentPage);
    const totalPages = parseInt(container.dataset.totalPages);
    const pages = JSON.parse(container.dataset.pages);
    
    const newPage = currentPage + direction;
    
    if (newPage >= 0 && newPage < totalPages) {
      // Get the content section (without the pagination controls)
      const contentSection = container.querySelector('.content-section');
      
      // Update content
      contentSection.innerHTML = pages[newPage];
      
      // Update buttons and page info
      const prevButton = container.querySelector('.pagination-button.prev');
      const nextButton = container.querySelector('.pagination-button.next');
      const pageInfo = container.querySelector('.pagination-info');
      
      // Update button states with ARIA attributes
      prevButton.disabled = newPage === 0;
      prevButton.setAttribute('aria-disabled', newPage === 0);
      
      nextButton.disabled = newPage === totalPages - 1;
      nextButton.setAttribute('aria-disabled', newPage === totalPages - 1);
      
      // Update page info with appropriate ARIA live announcement
      pageInfo.textContent = `Page ${newPage + 1} of ${totalPages}`;
      
      // Announce page change to screen readers
      const announcer = container.querySelector('#pagination-announcer');
      if (announcer) {
        announcer.textContent = `Page ${newPage + 1} of ${totalPages}`;
      }
      
      // Update current page
      container.dataset.currentPage = newPage;
      
      // Scroll to top of container
      container.scrollTop = 0;
      
      // Set focus to first heading or first paragraph if no heading
      setTimeout(() => {
        const firstHeading = contentSection.querySelector('h1, h2, h3, h4, h5, h6');
        const firstParagraph = contentSection.querySelector('p');
        
        if (firstHeading) {
          firstHeading.setAttribute('tabindex', '-1');
          firstHeading.focus();
        } else if (firstParagraph) {
          firstParagraph.setAttribute('tabindex', '-1');
          firstParagraph.focus();
        }
      }, 50);
    }
  }
}