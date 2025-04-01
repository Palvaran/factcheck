// content/utils/TextExtractor.js - Extract text content from web pages

/**
 * Service for extracting text content from web pages
 */
export class TextExtractor {
  /**
   * Extract publication date from the article
   * @returns {string|null} Publication date or null if not found
   */
  static extractDate() {
    try {
      // Try to find date in meta tags first
      const metaDate = document.querySelector('meta[property="article:published_time"]') ||
                       document.querySelector('meta[name="pubdate"]') ||
                       document.querySelector('meta[name="publishdate"]') ||
                       document.querySelector('meta[name="date"]') ||
                       document.querySelector('meta[itemprop="datePublished"]');
      
      if (metaDate && metaDate.content) {
        const date = new Date(metaDate.content);
        if (!isNaN(date)) {
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        }
      }
      
      // Try to find date in structured data
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.datePublished) {
            const date = new Date(data.datePublished);
            if (!isNaN(date)) {
              return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              });
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
      
      // Try common date selectors
      const dateSelectors = [
        '.article-date', '.post-date', '.published-date', '.date', '.timestamp',
        'time', '[itemprop="datePublished"]', '.byline time', '.article__date', '.article-meta time'
      ];
      
      for (const selector of dateSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const dateText = element.getAttribute('datetime') || element.textContent;
          if (dateText) {
            const date = new Date(dateText);
            if (!isNaN(date)) {
              return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              });
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error("Error extracting date:", error);
      return null;
    }
  }
  
  /**
   * Extract author information from the article
   * @returns {string|null} Author name or null if not found
   */
  static extractAuthor() {
    try {
      // Try to find author in meta tags first
      const metaAuthor = document.querySelector('meta[name="author"]') ||
                         document.querySelector('meta[property="article:author"]') ||
                         document.querySelector('meta[name="twitter:creator"]');
      
      if (metaAuthor && metaAuthor.content) {
        return metaAuthor.content.trim();
      }
      
      // Try to find author in structured data
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.author) {
            if (typeof data.author === 'string') {
              return data.author.trim();
            } else if (data.author.name) {
              return data.author.name.trim();
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
      
      // Try common author selectors
      const authorSelectors = [
        '.author', '.byline', '.article-author', '.post-author', '[rel="author"]',
        '[itemprop="author"]', '.article__author', '.entry-author', '.writer'
      ];
      
      for (const selector of authorSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const authorText = element.textContent;
          if (authorText && authorText.trim()) {
            return authorText.trim();
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error("Error extracting author:", error);
      return null;
    }
  }
  
  /**
   * Extract the main article text from the page
   * @returns {Object} Object containing article text and metadata
   */
  static extractArticleText() {
    try {
      let articleText = '';
      let title = document.title || '';
      let author = this.extractAuthor();
      let date = this.extractDate();
      let siteName = window.location.hostname;
      
      // Try Readability first (if available)
      try {
        if (window.Readability) {
          debugLog("Using Readability for extraction");
          const documentClone = document.cloneNode(true);
          const reader = new window.Readability(documentClone);
          const article = reader.parse();
          
          if (article && article.textContent) {
            articleText = article.textContent.trim();
            title = article.title || title;
            author = article.byline || author;
            date = date;
            siteName = article.siteName || siteName;
            
            return {
              articleText,
              metadata: {
                title,
                excerpt: article.excerpt,
                siteName,
                author,
                date,
                url: window.location.href
              }
            };
          }
        }
      } catch (err) {
        console.error("Error using Readability:", err);
      }
      
      // Fallback to intelligent DOM selection if needed
      if (!articleText || articleText.trim().length < 200) {
        debugLog("Falling back to DOM-based extraction");
        // Find the most likely content element based on content density
        const contentSelectors = [
          'article',
          'main',
          '[role="main"]',
          '.post-content',
          '.article-content',
          '.entry-content',
          '#content',
          '.content',
          '.post',
          '.article'
        ];
        
        let bestElement = null;
        let highestTextDensity = 0;
        
        for (const selector of contentSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            // Find the element with the most text content
            Array.from(elements).forEach(element => {
              // Calculate text density (text content vs number of tags)
              const text = element.textContent || '';
              const numberOfTags = element.getElementsByTagName('*').length || 1; // Avoid division by zero
              const density = text.length / numberOfTags;
              
              if (density > highestTextDensity && text.length > 200) {
                highestTextDensity = density;
                bestElement = element;
              }
            });
          }
        }
        
        // If we found a good content element
        if (bestElement && bestElement.textContent.trim().length > 200) {
          debugLog("Found best content element with selector-based approach");
          articleText = bestElement.textContent;
        } else {
          // Last resort: intelligent extraction from body
          debugLog("Using paragraph-based extraction approach");
          const paragraphs = [];
          const paragraphElements = document.querySelectorAll('p');
          
          // Find paragraphs with substantial content
          for (const p of paragraphElements) {
            const text = p.textContent.trim();
            if (text.length > 50 && text.length < 2000) { // Avoid very short or very long paragraphs
              // Check if paragraph is likely part of main content
              const links = p.querySelectorAll('a');
              const linkDensity = links.length > 0 ? links.length / text.length : 0;
              
              if (linkDensity < 0.1) { // Low link density suggests main content
                paragraphs.push({
                  element: p,
                  text: text,
                  length: text.length
                });
              }
            }
          }
          
          // Sort by length (longer paragraphs are more likely to be main content)
          paragraphs.sort((a, b) => b.length - a.length);
          
          // Extract the top paragraphs (up to 15000 characters)
          let extractedText = '';
          let currentLength = 0;
          const maxLength = 15000;
          
          for (const paragraph of paragraphs) {
            if (currentLength + paragraph.length <= maxLength) {
              extractedText += paragraph.text + '\n\n';
              currentLength += paragraph.length + 2; // +2 for the newlines
            } else {
              break;
            }
          }
          
          if (extractedText.length > 200) {
            debugLog("Successfully extracted text using paragraph analysis");
            articleText = extractedText;
          } else {
            // If all else fails, use a portion of the body text
            debugLog("Falling back to body text extraction with intelligent sampling");
            const bodyText = document.body.textContent;
            
            // For very large body text, intelligently sample from beginning, middle, and end
            if (bodyText.length > 15000) {
              const firstPart = bodyText.substring(0, 6000); // First 6000 chars
              const middleStart = Math.floor(bodyText.length / 2) - 3000;
              const middlePart = bodyText.substring(middleStart, middleStart + 6000);
              const endPart = bodyText.substring(bodyText.length - 3000);
              
              articleText = firstPart + '\n\n[...]\n\n' + middlePart + '\n\n[...]\n\n' + endPart;
            } else {
              articleText = bodyText.slice(0, 15000);
            }
          }
        }
      }
      
      // Clean up the text
      articleText = articleText
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/\n\s*\n/g, '\n\n')  // Normalize paragraph breaks
        .trim();
      
      // Extract metadata from meta tags if not already set
      const metaDescription = document.querySelector('meta[name="description"]');
      const description = metaDescription ? metaDescription.content : '';
      
      return {
        articleText,
        metadata: {
          title,
          excerpt: description,
          siteName,
          author,
          date,
          url: window.location.href
        }
      };
    } catch (error) {
      console.error("Error extracting article text:", error);
      
      // Return a minimal result in case of error
      return {
        articleText: document.body.textContent.trim(),
        metadata: {
          title: document.title,
          url: window.location.href
        }
      };
    }
  }
  
  // Helper function for debugging
  static debugLog(...args) {
    if (window.DEBUG) console.log(...args);
  }
}
