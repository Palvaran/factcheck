// ui/components/StyleInjector.js
import { STYLES } from '../../utils/constants.js';

export class StyleInjector {
  injectStyles(isDarkMode) {
    const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
    const color = STYLES.COLORS.LIGHT.ACCENT; // Default accent color
    
    const style = document.createElement('style');
    style.textContent = `
      /* Base accessibility styles */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      
      /* Focus styles for keyboard navigation */
      *:focus-visible {
        outline: 2px solid ${theme.LINK};
        outline-offset: 2px;
      }
      
      /* Tab indicator styles */
      .fact-check-tab {
        position: relative;
        transition: background-color 0.2s;
      }
      
      .fact-check-tab:hover {
        background-color: ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
      }
      
      .fact-check-tab.active {
        border-bottom: 2px solid ${color};
        color: ${theme.TEXT};
      }
      
      .fact-check-tab:focus {
        outline: 2px solid ${theme.LINK};
        outline-offset: -2px;
        z-index: 1;
      }
      
      /* Content styles */
      blockquote {
        border-left: 3px solid ${theme.BORDER};
        padding-left: 10px;
        margin-left: 0;
        color: ${theme.SECONDARY_TEXT};
      }
      
      h1, h2, h3 {
        margin-top: 16px;
        margin-bottom: 8px;
        color: ${theme.TEXT};
      }
      
      ul, ol {
        padding-left: 20px;
        margin: 8px 0;
      }
      
      li {
        margin-bottom: 4px;
      }
      
      p {
        margin: 8px 0;
      }
      
      code {
        background-color: ${theme.CODE_BG};
        padding: 2px 4px;
        border-radius: 3px;
        font-family: monospace;
      }
      
      pre {
        background-color: ${theme.CODE_BG};
        padding: 8px;
        border-radius: 4px;
        overflow-x: auto;
      }
      
      pre code {
        background-color: transparent;
        padding: 0;
      }
      
      a {
        color: ${theme.LINK};
        text-decoration: none;
      }
      
      a:hover {
        text-decoration: underline;
      }
      
      a:focus {
        text-decoration: underline;
        outline: 2px solid ${theme.LINK};
        outline-offset: 2px;
      }
      
      /* Pagination controls */
      .pagination-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
        border-top: 1px solid ${theme.BORDER};
        padding-top: 8px;
      }
      
      .pagination-button {
        background: ${theme.BUTTON_BG};
        border: none;
        border-radius: 3px;
        padding: 5px 10px;
        cursor: pointer;
        color: ${theme.TEXT};
        transition: background-color 0.2s, box-shadow 0.2s;
      }
      
      .pagination-button:not(:disabled):hover {
        background: ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
      }
      
      .pagination-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        color: ${isDarkMode ? '#999' : '#666'};
      }
      
      .pagination-button:focus {
        outline: 2px solid ${theme.LINK};
        outline-offset: 2px;
      }
      
      .pagination-info {
        font-size: 12px;
        color: ${theme.SECONDARY_TEXT};
      }
      
      /* Typography */
      strong, b {
        font-weight: bold;
      }
      
      em, i {
        font-style: italic;
      }
      
      /* Ensure clickable elements have sufficient size for touch targets */
      button,
      [role="button"],
      .pagination-button,
      .fact-check-tab {
        min-height: 32px;
        min-width: 32px;
      }
      
      /* Make content sections focusable with appropriate styling */
      [role="tabpanel"]:focus {
        outline: none;
        box-shadow: inset 0 0 0 2px ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'};
      }
      
      /* Ensure sufficient color contrast */
      .pagination-info {
        color: ${isDarkMode ? '#bbb' : '#555'};
      }
    `;
    document.head.appendChild(style);
    
    // Add CSS variables for theming
    const cssVars = document.createElement('style');
    cssVars.textContent = `
      :root {
        --fact-check-text: ${theme.TEXT};
        --fact-check-bg: ${theme.BACKGROUND};
        --fact-check-border: ${theme.BORDER};
        --fact-check-link: ${theme.LINK};
        --fact-check-focus: ${theme.LINK};
      }
    `;
    document.head.appendChild(cssVars);
  }
}