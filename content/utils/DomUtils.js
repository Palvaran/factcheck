// content/utils/DomUtils.js - DOM manipulation utilities

/**
 * Utilities for DOM manipulation and interaction
 */
export class DomUtils {
  /**
   * Create an element with attributes and children
   * @param {string} tag - HTML tag name
   * @param {Object} attributes - Element attributes
   * @param {Array|string|Node} children - Child elements or text content
   * @returns {HTMLElement} The created element
   */
  static createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    
    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        const eventName = key.substring(2).toLowerCase();
        element.addEventListener(eventName, value);
      } else {
        element.setAttribute(key, value);
      }
    });
    
    // Add children
    if (children) {
      if (Array.isArray(children)) {
        children.forEach(child => {
          if (child) {
            element.appendChild(
              typeof child === 'string' || typeof child === 'number'
                ? document.createTextNode(child)
                : child
            );
          }
        });
      } else if (typeof children === 'string' || typeof children === 'number') {
        element.textContent = children;
      } else if (children instanceof Node) {
        element.appendChild(children);
      }
    }
    
    return element;
  }
  
  /**
   * Add CSS styles to the document
   * @param {string} id - Unique ID for the style element
   * @param {string} css - CSS rules to add
   */
  static addStyles(id, css) {
    // Remove existing style element if it exists
    const existingStyle = document.getElementById(id);
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Create and append new style element
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }
  
  /**
   * Get computed background color of an element
   * @param {HTMLElement} element - Element to check
   * @returns {string} CSS color value
   */
  static getBackgroundColor(element) {
    if (!element) return 'transparent';
    
    const bgColor = window.getComputedStyle(element).backgroundColor;
    if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
      // If transparent, check parent
      return element.parentElement 
        ? this.getBackgroundColor(element.parentElement) 
        : 'transparent';
    }
    
    return bgColor;
  }
  
  /**
   * Check if the user has selected text
   * @returns {boolean} True if text is selected
   */
  static hasSelectedText() {
    const selection = window.getSelection();
    return selection && selection.toString().trim().length > 0;
  }
  
  /**
   * Get the selected text
   * @returns {string} Selected text or empty string
   */
  static getSelectedText() {
    const selection = window.getSelection();
    return selection ? selection.toString().trim() : '';
  }
  
  /**
   * Get the element that contains the selected text
   * @returns {HTMLElement|null} Container element or null
   */
  static getSelectionContainer() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    return range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;
  }
}
