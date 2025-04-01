// content/utils/MarkdownUtils.js - Markdown parsing and formatting utilities

/**
 * Utilities for handling markdown formatting and related UI operations
 */
export class MarkdownUtils {
  /**
   * Parse markdown text to HTML
   * @param {string} text - Markdown text to parse
   * @returns {string} HTML formatted text
   */
  static parseMarkdown(text) {
    if (!text) return '';
    
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }
  
  /**
   * Determine if a background color is dark
   * @param {string} bgColor - CSS color value
   * @returns {boolean} True if background is dark
   */
  static isDarkBackground(bgColor) {
    if (!bgColor || bgColor === "transparent") {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    const rgb = bgColor.match(/\d+/g);
    if (!rgb) return window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const [r, g, b] = rgb.map(Number);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }
  
  /**
   * Map a numerical rating to a letter grade
   * @param {number} rating - Numerical rating (0-100)
   * @returns {string} Letter grade (A+, A, A-, etc.)
   */
  static mapRatingToLetter(rating) {
    if (!rating && rating !== 0) return "N/A";
    
    if (rating >= 97) return "A+";
    else if (rating >= 93) return "A";
    else if (rating >= 90) return "A-";
    else if (rating >= 87) return "B+";
    else if (rating >= 83) return "B";
    else if (rating >= 80) return "B-";
    else if (rating >= 77) return "C+";
    else if (rating >= 73) return "C";
    else if (rating >= 70) return "C-";
    else if (rating >= 67) return "D+";
    else if (rating >= 63) return "D";
    else if (rating >= 60) return "D-";
    else return "F";
  }
  
  /**
   * Get icon and color for a letter grade
   * @param {string} letterGrade - Letter grade (A+, A, etc.)
   * @returns {Object} Object with icon and color properties
   */
  static getIconAndColor(letterGrade) {
    const gradeMap = {
      'A+': { icon: '✅', color: '#2E7D32' },
      'A': { icon: '✅', color: '#2E7D32' },
      'A-': { icon: '✅', color: '#2E7D32' },
      'B+': { icon: '✔️', color: '#66BB6A' },
      'B': { icon: '✔️', color: '#66BB6A' },
      'B-': { icon: '✔️', color: '#66BB6A' },
      'C+': { icon: '⚠️', color: '#FBC02D' },
      'C': { icon: '⚠️', color: '#FBC02D' },
      'C-': { icon: '⚠️', color: '#FBC02D' },
      'D+': { icon: '⚠️', color: '#FFB74D' },
      'D': { icon: '⚠️', color: '#FFB74D' },
      'D-': { icon: '⚠️', color: '#FFB74D' },
      'F': { icon: '❌', color: '#E53935' },
      'N/A': { icon: '❓', color: '#757575' }
    };
    
    return gradeMap[letterGrade] || { icon: '❓', color: '#757575' };
  }
}
