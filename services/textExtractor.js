// services/textExtractor.js
export class TextExtractorService {
  static extractDate() {
    // Look for common date meta tags
    const dateMetaTags = [
      'article:published_time',
      'datePublished',
      'date',
      'DC.date.issued',
      'pubdate'
    ];
    
    for (const tag of dateMetaTags) {
      const metaTag = document.querySelector(`meta[property="${tag}"], meta[name="${tag}"]`);
      if (metaTag && metaTag.content) {
        return metaTag.content;
      }
    }
    
    // Look for time elements with datetime attribute
    const timeElements = document.querySelectorAll('time[datetime]');
    if (timeElements.length > 0) {
      return timeElements[0].getAttribute('datetime');
    }
    
    // Look for structured data in JSON-LD
    const jsonldElements = document.querySelectorAll('script[type="application/ld+json"]');
    for (const element of jsonldElements) {
      try {
        const data = JSON.parse(element.textContent);
        if (data.datePublished) {
          return data.datePublished;
        } else if (data['@graph']) {
          // Handle nested data in @graph array
          for (const item of data['@graph']) {
            if (item.datePublished) {
              return item.datePublished;
            }
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }
    
    // Look for common date patterns in text
    const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/i;
    const bodyText = document.body.textContent;
    const dateMatch = bodyText.match(dateRegex);
    if (dateMatch) {
      return dateMatch[0];
    }
    
    return null;
  }
  
  static extractAuthor() {
    // Check meta tags
    const authorMeta = document.querySelector('meta[name="author"], meta[property="article:author"]');
    if (authorMeta && authorMeta.content) {
      return authorMeta.content;
    }
    
    // Look for JSON-LD structured data
    const jsonldElements = document.querySelectorAll('script[type="application/ld+json"]');
    for (const element of jsonldElements) {
      try {
        const data = JSON.parse(element.textContent);
        if (data.author) {
          if (typeof data.author === 'string') {
            return data.author;
          } else if (data.author.name) {
            return data.author.name;
          }
        } else if (data['@graph']) {
          // Handle nested data in @graph array
          for (const item of data['@graph']) {
            if (item.author) {
              if (typeof item.author === 'string') {
                return item.author;
              } else if (item.author.name) {
                return item.author.name;
              }
            }
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }
    
    // Look for common author HTML patterns
    const authorSelectors = [
      '.byline',
      '.author',
      '[rel="author"]',
      '.entry-author',
      '.article-author',
      '.post-author',
      '.writer'
    ];
    
    for (const selector of authorSelectors) {
      const authorElement = document.querySelector(selector);
      if (authorElement && authorElement.textContent.trim()) {
        return authorElement.textContent.trim();
      }
    }
    
    return null;
  }
  
  static extractArticleText() {
    let articleText = "";
    let sourceTitle = document.title || "";
    let sourceUrl = window.location.href || "";
    
    // Extract metadata
    const articleMetadata = {
      title: sourceTitle,
      url: sourceUrl,
      date: this.extractDate(),
      author: this.extractAuthor()
    };
    
    // Try Readability first if available - Use safer check
    try {
      // Check if Readability exists on window object only
      if (typeof window !== 'undefined' && window.Readability) {
        console.log("Readability library found, using it for extraction");
        
        // Clone the document to avoid modifying the live DOM
        let documentClone = document.cloneNode(true);
        
        // Remove known noise elements before parsing
        const noiseSelectors = [
          'aside', 'nav', 'footer', '.comment', '.comments', '.ad', 
          '.advertisement', '.promo', 'script', 'style', 'iframe',
          '[aria-hidden="true"]', '[hidden]', '[role="banner"]', '[role="navigation"]', 
          '.social-share', '.share-buttons', '.related-posts'
        ];
        
        noiseSelectors.forEach(selector => {
          try {
            const elements = documentClone.querySelectorAll(selector);
            elements.forEach(el => el.parentNode?.removeChild(el));
          } catch (e) {
            // Ignore errors removing elements
          }
        });
        
        // Use window.Readability explicitly
        try {
          let reader = new window.Readability(documentClone, {
            debug: false,
            charThreshold: 100,
            classesToPreserve: ['caption', 'figure', 'chart', 'table']
          });
          
          let article = reader.parse();
          if (article && article.textContent && article.textContent.trim().length > 200) {
            articleText = article.textContent;
            
            // Use article metadata if available
            if (article.title) {
              articleMetadata.title = article.title;
            }
            if (article.byline) {
              articleMetadata.author = article.byline;
            }
            if (article.siteName) {
              articleMetadata.siteName = article.siteName;
            }
            if (article.excerpt) {
              articleMetadata.excerpt = article.excerpt;
            }
            
            console.log("Successfully extracted article with Readability");
          } else {
            console.log("Readability parse returned insufficient content");
          }
        } catch (readerError) {
          console.error("Error using Readability reader:", readerError);
        }
      } else {
        console.log("Readability library not available, using fallback extraction");
      }
    } catch (err) {
      console.error("Error checking for Readability:", err);
    }
    
    // Fallback to intelligent DOM selection if needed
    if (!articleText || articleText.trim().length < 200) {
      console.log("Using fallback extraction method");
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
        articleText = bestElement.textContent;
      } else {
        // Last resort: intelligent extraction from body
        const paragraphs = [];
        const paragraphElements = document.querySelectorAll('p');
        
        // Find paragraphs with substantial content
        for (const p of paragraphElements) {
          const text = p.textContent.trim();
          if (text.length > 50 && text.length < 2000) { // Avoid very short or very long paragraphs
            // Check if paragraph is likely part of main content
            // (Avoid navigation, footer, etc. which tend to have many links)
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
          articleText = extractedText;
        } else {
          // If all else fails, use a portion of the body text
          articleText = document.body.textContent.slice(0, 15000);
        }
      }
    }
    
    // Clean up the text
    articleText = articleText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    // Intelligent length limitation for very large texts
    if (articleText.length > 15000) {
      // Find the best places to split the text to preserve meaning
      const paragraphs = articleText.split(/\n\s*\n/);
      let processedText = '';
      
      // Take first 40% of content from beginning
      let beginningText = '';
      let beginningLength = 0;
      const targetBeginningLength = Math.floor(15000 * 0.4);
      
      for (let i = 0; i < paragraphs.length && beginningLength < targetBeginningLength; i++) {
        beginningText += paragraphs[i] + '\n\n';
        beginningLength += paragraphs[i].length + 2;
      }
      
      // Take 40% from middle
      let middleText = '';
      let middleLength = 0;
      const targetMiddleLength = Math.floor(15000 * 0.4);
      const midIndex = Math.floor(paragraphs.length / 2);
      
      for (let i = midIndex; i < paragraphs.length && middleLength < targetMiddleLength; i++) {
        middleText += paragraphs[i] + '\n\n';
        middleLength += paragraphs[i].length + 2;
      }
      
      // Take 20% from end
      let endText = '';
      let endLength = 0;
      const targetEndLength = Math.floor(15000 * 0.2);
      const endIndex = Math.max(midIndex + 5, paragraphs.length - 10);
      
      for (let i = endIndex; i < paragraphs.length && endLength < targetEndLength; i++) {
        endText += paragraphs[i] + '\n\n';
        endLength += paragraphs[i].length + 2;
      }
      
      // Combine with indicators that content was omitted
      articleText = beginningText + 
                    '\n\n[...content omitted for length...]\n\n' + 
                    middleText + 
                    '\n\n[...content omitted for length...]\n\n' + 
                    endText;
    }
    
    return { articleText, metadata: articleMetadata };
  }
}