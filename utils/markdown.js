// utils/markdown.js
import { STYLES } from '../utils/constants.js';

export class MarkdownUtils {
  // Check if the libraries are available
  static _getMarked() {
    return window.marked || null;
  }

  static _getDOMPurify() {
    return window.DOMPurify || null;
  }

  static parseMarkdown(text) {
    if (!text) return '';
    
    try {
      // Check if the text already contains HTML tags
      const containsHtml = /<\/?[a-z][\s\S]*>/i.test(text);
      
      // If the text already contains HTML, just sanitize it but don't parse it as markdown
      if (containsHtml) {
        const DOMPurify = this._getDOMPurify();
        if (DOMPurify) {
          return DOMPurify.sanitize(text);
        } else {
          // If DOMPurify isn't available, return the HTML as is, with basic sanitization
          return this._basicSanitizeHtml(text);
        }
      }
      
      // Otherwise, treat it as markdown
      const marked = this._getMarked();
      const DOMPurify = this._getDOMPurify();
      
      // If libraries are loaded and available, use them
      if (marked && DOMPurify) {
        // Configure marked options
        marked.use({
          gfm: true,
          breaks: true,
          smartLists: true
        });
        
        // Parse markdown with marked
        const html = marked.parse(text);
        
        // Configure DOMPurify
        const purifyConfig = {
          ALLOWED_TAGS: ['p', 'a', 'strong', 'em', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 
                        'code', 'pre', 'blockquote', 'br', 'span', 'table', 'thead', 
                        'tbody', 'tr', 'th', 'td'],
          ALLOWED_ATTR: {
            'a': ['href', 'title', 'target', 'rel'],
            'code': ['class'],
            'pre': ['class'],
            'span': ['style', 'class'],
            'table': ['class'],
            'th': ['scope', 'colspan', 'rowspan'],
            'td': ['colspan', 'rowspan']
          },
          ADD_ATTR: {
            'a': ['target', 'rel'] // Force these attributes for all links
          }
        };
        
        // Sanitize the HTML with DOMPurify
        return DOMPurify.sanitize(html, purifyConfig);
      } else {
        // Fall back to original implementation if libraries aren't available
        return this._legacyParseMarkdown(text);
      }
    } catch (error) {
      console.error('Error parsing markdown:', error);
      // Fallback to original implementation in case of error
      return this._legacyParseMarkdown(text);
    }
  }
  
  // Basic sanitization for HTML that doesn't convert HTML entities
  static _basicSanitizeHtml(html) {
    const tempDiv = document.createElement('div');
    
    // Set innerHTML rather than textContent to preserve HTML structure
    tempDiv.innerHTML = html;
    
    // Remove potentially dangerous attributes
    const elements = tempDiv.querySelectorAll('*');
    for (const el of elements) {
      // Remove event handlers and javascript: URLs
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on') || 
            (attr.name === 'href' && attr.value.toLowerCase().startsWith('javascript:'))) {
          el.removeAttribute(attr.name);
        }
      });
    }
    
    return tempDiv.innerHTML;
  }
  
  // Original implementation as fallback
  static _legacyParseMarkdown(text) {
    // Check if the text already contains HTML tags
    if (/<\/?[a-z][\s\S]*>/i.test(text)) {
      // If it contains HTML, just do basic sanitization
      return this._basicSanitizeHtml(text);
    }
    
    if (!text) return '';
    
    // Handle code blocks
    text = text.replace(/```([a-z]*)\n([\s\S]*?)\n```/g, '<pre><code class="language-$1">$2</code></pre>');
    
    // Handle inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Handle bold text
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Handle italic text
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Handle headers
    text = text.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    
    // Handle lists (unordered)
    text = text.replace(/^\* (.*?)$/gm, '<li>$1</li>');
    text = text.replace(/^- (.*?)$/gm, '<li>$1</li>');
    
    // Handle lists (ordered)
    text = text.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');
    
    // Wrap lists in proper tags
    let inList = false;
    let listType = '';
    const lines = text.split('\n');
    const processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('<li>')) {
        if (!inList) {
          // Check if this is the start of an ordered list
          const prevLine = i > 0 ? lines[i - 1] : '';
          const isOrderedList = /^\d+\. /.test(prevLine);
          
          listType = isOrderedList ? 'ol' : 'ul';
          processedLines.push(`<${listType}>`);
          inList = true;
        }
        processedLines.push(line);
      } else {
        if (inList) {
          processedLines.push(`</${listType}>`);
          inList = false;
        }
        processedLines.push(line);
      }
    }
    
    if (inList) {
      processedLines.push(`</${listType}>`);
    }
    
    text = processedLines.join('\n');
    
    // Handle blockquotes
    text = text.replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>');
    
    // Handle links
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Handle paragraphs - convert double newlines to paragraph breaks
    text = text.replace(/\n\n/g, '</p><p>');
    
    // Wrap the entire text in a paragraph if it's not already in a block-level element
    if (!text.startsWith('<h') && !text.startsWith('<ul') && 
        !text.startsWith('<ol') && !text.startsWith('<blockquote') && 
        !text.startsWith('<p>')) {
      text = `<p>${text}</p>`;
    }
    
    return text; // Return without additional sanitization to prevent double escaping
  }
  
  static isDarkBackground(bgColor) {
    // If no background color is provided or it's transparent, check for dark mode preference
    if (!bgColor || bgColor === "transparent") {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // Parse RGB values
    const rgb = bgColor.match(/\d+/g);
    if (!rgb) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    const [r, g, b] = rgb.map(Number);
    
    // Enhanced brightness calculation with more weight on blue component for navy backgrounds
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    // Lower threshold to catch dark blue backgrounds (standard is 128)
    return brightness < 140;
  }
  
  static mapRatingToLetter(rating) {
    const grades = STYLES.RATINGS.GRADES;
    
    if (rating >= grades.A_PLUS.MIN) return grades.A_PLUS.LETTER;
    else if (rating >= grades.A.MIN) return grades.A.LETTER;
    else if (rating >= grades.A_MINUS.MIN) return grades.A_MINUS.LETTER;
    else if (rating >= grades.B_PLUS.MIN) return grades.B_PLUS.LETTER;
    else if (rating >= grades.B.MIN) return grades.B.LETTER;
    else if (rating >= grades.B_MINUS.MIN) return grades.B_MINUS.LETTER;
    else if (rating >= grades.C_PLUS.MIN) return grades.C_PLUS.LETTER;
    else if (rating >= grades.C.MIN) return grades.C.LETTER;
    else if (rating >= grades.C_MINUS.MIN) return grades.C_MINUS.LETTER;
    else if (rating >= grades.D_PLUS.MIN) return grades.D_PLUS.LETTER;
    else if (rating >= grades.D.MIN) return grades.D.LETTER;
    else if (rating >= grades.D_MINUS.MIN) return grades.D_MINUS.LETTER;
    else return grades.F.LETTER;
  }
  
  static getIconAndColor(letterGrade) {
    const grades = STYLES.RATINGS.GRADES;
    
    // Define the icon and color based on the letter grade
    switch (letterGrade) {
      case grades.A_PLUS.LETTER:
      case grades.A.LETTER:
      case grades.A_MINUS.LETTER:
        return { icon: grades.A.ICON, color: grades.A.COLOR };
      case grades.B_PLUS.LETTER:
      case grades.B.LETTER:
      case grades.B_MINUS.LETTER:
        return { icon: grades.B.ICON, color: grades.B.COLOR };
      case grades.C_PLUS.LETTER:
      case grades.C.LETTER:
      case grades.C_MINUS.LETTER:
        return { icon: grades.C.ICON, color: grades.C.COLOR };
      case grades.D_PLUS.LETTER:
      case grades.D.LETTER:
      case grades.D_MINUS.LETTER:
        return { icon: grades.D.ICON, color: grades.D.COLOR };
      default: // F
        return { icon: grades.F.ICON, color: grades.F.COLOR };
    }
  }
}