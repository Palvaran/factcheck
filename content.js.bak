// content.js - Module for DOM interaction
(function() {
  // Debug flag - set to false for production
  const DEBUG = false;
  
  // Debug logging helper
  function debugLog(...args) {
    if (DEBUG) console.log(...args);
  }

  // Check if already initialized to prevent duplicate execution
  if (window.__FACT_CHECK_INITIALIZED) {
    debugLog("Content script already initialized, skipping");
    return;
  }
  
  // Mark as initialized
  window.__FACT_CHECK_INITIALIZED = true;
  
  // Create fallback utils first to ensure availability
  const safeMarkdownUtils = {
    parseMarkdown: (text) => {
      if (window.MarkdownUtils && window.MarkdownUtils.parseMarkdown) {
        return window.MarkdownUtils.parseMarkdown(text);
      }
      // Simple fallback markdown parser
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '<br><br>');
    },
    
    isDarkBackground: (bgColor) => {
      if (window.MarkdownUtils && window.MarkdownUtils.isDarkBackground) {
        return window.MarkdownUtils.isDarkBackground(bgColor);
      }
      // Simple fallback dark mode detection
      if (!bgColor || bgColor === "transparent") return false;
      const rgb = bgColor.match(/\d+/g);
      if (!rgb) return window.matchMedia('(prefers-color-scheme: dark)').matches;
      const [r, g, b] = rgb.map(Number);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness < 128;
    },
    
    mapRatingToLetter: (rating) => {
      if (window.MarkdownUtils && window.MarkdownUtils.mapRatingToLetter) {
        return window.MarkdownUtils.mapRatingToLetter(rating);
      }
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
    },
    
    getIconAndColor: (letterGrade) => {
      if (window.MarkdownUtils && window.MarkdownUtils.getIconAndColor) {
        return window.MarkdownUtils.getIconAndColor(letterGrade);
      }
      // Fallback implementation
      switch (letterGrade) {
        case "A+":
        case "A":
        case "A-":
          return { icon: "✅", color: "#2E7D32" };  // Dark Green
        case "B+":
        case "B":
        case "B-":
          return { icon: "✔️", color: "#66BB6A" };  // Light Green
        case "C+":
        case "C":
        case "C-":
          return { icon: "⚠️", color: "#FBC02D" };  // Dark Yellow
        case "D+":
        case "D":
        case "D-":
          return { icon: "⚠️", color: "#FFB74D" };  // Light Yellow/Orange
        default: // F
          return { icon: "❌", color: "#E53935" };  // Red
      }
    }
  };

  // Fallback service implementations
  const fallbackTextExtractor = {
    extractDate: () => {
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
      
      // Look for JSON-LD structured data
      const jsonldElements = document.querySelectorAll('script[type="application/ld+json"]');
      for (const element of jsonldElements) {
        try {
          const data = JSON.parse(element.textContent);
          if (data.datePublished) {
            return data.datePublished;
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
    },
    
    extractAuthor: () => {
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
        '.article-author'
      ];
      
      for (const selector of authorSelectors) {
        const authorElement = document.querySelector(selector);
        if (authorElement && authorElement.textContent.trim()) {
          return authorElement.textContent.trim();
        }
      }
      
      return null;
    },
    
    extractArticleText: () => {
      debugLog("Using fallback text extractor");
      const sourceTitle = document.title || '';
      const sourceUrl = window.location.href || '';
      const author = fallbackTextExtractor.extractAuthor();
      const date = fallbackTextExtractor.extractDate();
      
      let articleText = "";
      
      // Try Readability first if available
      try {
        if (typeof Readability !== 'undefined') {
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
          
          let reader = new Readability(documentClone, {
            debug: false,
            charThreshold: 100, // Lower threshold to extract more content
            classesToPreserve: ['caption', 'figure', 'chart', 'table']
          });
          
          let article = reader.parse();
          if (article && article.textContent && article.textContent.trim().length > 200) {
            debugLog("Successfully extracted article with Readability");
            articleText = article.textContent;
            
            return {
              articleText: articleText,
              metadata: {
                title: article.title || sourceTitle,
                url: sourceUrl,
                author: article.byline || author,
                date: date,
                siteName: article.siteName
              }
            };
          }
        }
      } catch (err) {
        debugLog("Error using Readability:", err);
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
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();
      
      return {
        articleText: articleText,
        metadata: {
          title: sourceTitle,
          url: sourceUrl,
          author: author,
          date: date
        }
      };
    }
  };

  // Enhanced consistency fallback overlay manager
  class FallbackOverlayManager {
    constructor() {
      this.overlayId = 'factCheckOverlay';
    }
    
    createLoadingOverlay() {
      debugLog("Creating fallback overlay");
      const existingOverlay = document.getElementById(this.overlayId);
      if (existingOverlay) existingOverlay.remove();
      
      // Try to detect dark mode with fallback
      const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
      const isDarkMode = safeMarkdownUtils.isDarkBackground(bodyBgColor);
      
      const overlay = document.createElement('div');
      overlay.id = this.overlayId;
      overlay.style.cssText = `
        position:fixed;
        top:20px;
        right:20px;
        background:${isDarkMode ? '#222' : '#fff'};
        color:${isDarkMode ? '#fff' : '#000'};
        padding:15px;
        border:1px solid ${isDarkMode ? '#444' : '#ccc'};
        border-radius:5px;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
        z-index:10000;
        max-width:350px;
      `;
      
      // Create a more consistent loading indicator that mimics the full one
      const loadingContainer = document.createElement('div');
      loadingContainer.style.display = 'flex';
      loadingContainer.style.flexDirection = 'column';
      loadingContainer.style.alignItems = 'center';
      loadingContainer.style.margin = '10px 0';
      
      // Create header
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.width = '100%';
      header.style.marginBottom = '10px';
      header.style.borderBottom = isDarkMode ? '1px solid #444' : '1px solid #eee';
      header.style.paddingBottom = '8px';
      
      const title = document.createElement('div');
      title.innerHTML = '🔍✓ <strong>Fact Check</strong>';
      
      const closeBtn = document.createElement('div');
      closeBtn.textContent = '×';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontWeight = 'bold';
      closeBtn.style.fontSize = '20px';
      closeBtn.onclick = () => overlay.remove();
      
      header.appendChild(title);
      header.appendChild(closeBtn);
      
      // Create spinner
      const spinnerStyle = document.createElement('style');
      spinnerStyle.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(spinnerStyle);
      
      const spinner = document.createElement('div');
      spinner.style.border = isDarkMode ? '3px solid #333' : '3px solid #f3f3f3';
      spinner.style.borderTop = `3px solid ${isDarkMode ? '#4fc3f7' : '#2196f3'}`;
      spinner.style.borderRadius = '50%';
      spinner.style.width = '30px';
      spinner.style.height = '30px';
      spinner.style.animation = 'spin 1s linear infinite';
      
      const loadingText = document.createElement('div');
      loadingText.textContent = 'Analyzing for factual accuracy...';
      loadingText.style.marginTop = '10px';
      loadingText.style.textAlign = 'center';
      
      // Add to container
      loadingContainer.appendChild(spinner);
      loadingContainer.appendChild(loadingText);
      
      overlay.appendChild(header);
      overlay.appendChild(loadingContainer);
      
      document.body.appendChild(overlay);
      
      // Update loading text with progressive messages
      let step = 0;
      const loadingMessages = [
        'Analyzing for factual accuracy...',
        'Checking sources and references...',
        'Evaluating claims...',
        'Almost done...'
      ];
      
      const updateInterval = setInterval(() => {
        step = (step + 1) % loadingMessages.length;
        loadingText.textContent = loadingMessages[step];
        
        // Check if container still exists to prevent memory leaks
        if (!document.body.contains(loadingContainer)) {
          clearInterval(updateInterval);
        }
      }, 3000);
      
      return overlay;
    }
    
    updateOverlayResult(result, metadata) {
      debugLog("Updating fallback overlay");
      const overlay = document.getElementById(this.overlayId);
      if (!overlay) return;
      
      // Try to detect dark mode with fallback
      const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
      const isDarkMode = safeMarkdownUtils.isDarkBackground(bodyBgColor);
      
      overlay.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;border-bottom:1px solid ${isDarkMode ? '#444' : '#ddd'};padding-bottom:8px;">
          <span style="font-weight:bold;">🔍✓ Fact Check</span>
          <span style="cursor:pointer;" onclick="this.parentNode.parentNode.remove()">✕</span>
        </div>
        <div style="max-height:400px;overflow-y:auto;">${result}</div>
      `;
      
      // Add basic styling for sections commonly found in fact check results
      const style = document.createElement('style');
      style.textContent = `
        #${this.overlayId} strong { font-weight: bold; }
        #${this.overlayId} em { font-style: italic; }
        #${this.overlayId} a { color: ${isDarkMode ? '#90CAF9' : '#1976D2'}; text-decoration: none; }
        #${this.overlayId} a:hover { text-decoration: underline; }
      `;
      document.head.appendChild(style);
    }
  }

  // New Enhanced LoadingIndicator class for step-based progress
  class EnhancedLoadingIndicator {
    constructor() {
      this.steps = [
        { id: 'extraction', label: 'Extracting content...', complete: false },
        { id: 'query', label: 'Generating search queries...', complete: false },
        { id: 'search', label: 'Searching for references...', complete: false },
        { id: 'analysis', label: 'Analyzing claims...', complete: false },
        { id: 'verification', label: 'Verifying facts...', complete: false }
      ];
      this.currentStep = 0;
    }
    
    create(isDarkMode) {
      const theme = isDarkMode ? 
        { TEXT: '#FFFFFF', SECONDARY_TEXT: '#bbb', LINK: '#90CAF9' } : 
        { TEXT: '#000000', SECONDARY_TEXT: '#555', LINK: '#1976D2' };
      
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
      spinner.className = 'fact-check-spinner';
      spinner.style.border = isDarkMode ? '3px solid #333' : '3px solid #f3f3f3';
      spinner.style.borderTop = `3px solid ${theme.LINK}`;
      spinner.style.borderRadius = '50%';
      spinner.style.width = '30px';
      spinner.style.height = '30px';
      spinner.style.animation = 'spin 1s linear infinite';
      spinner.setAttribute('aria-hidden', 'true');
      
      // Add keyframes for the spinner if not already added
      if (!document.getElementById('spin-keyframes')) {
        const style = document.createElement('style');
        style.id = 'spin-keyframes';
        style.textContent = `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }
      
      // Main status text
      const loadingText = document.createElement('div');
      loadingText.id = 'fact-check-loading-text';
      loadingText.textContent = this.steps[0].label;
      loadingText.style.marginTop = '10px';
      loadingText.style.marginBottom = '15px';
      loadingText.style.fontWeight = 'bold';
      loadingText.style.textAlign = 'center';
      
      // Add elements to container
      loadingContainer.appendChild(spinner);
      loadingContainer.appendChild(loadingText);
      
      // Create step progress indicator
      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'fact-check-steps';
      stepsContainer.style.width = '100%';
      stepsContainer.style.maxWidth = '300px';
      stepsContainer.style.marginTop = '5px';
      
      // Create progress nodes for each step
      this.steps.forEach((step, index) => {
        const stepElement = document.createElement('div');
        stepElement.id = `step-${step.id}`;
        stepElement.className = 'fact-check-step';
        stepElement.style.display = 'flex';
        stepElement.style.alignItems = 'center';
        stepElement.style.marginBottom = '6px';
        stepElement.style.fontSize = '12px';
        stepElement.style.color = index === 0 ? theme.TEXT : theme.SECONDARY_TEXT;
        stepElement.setAttribute('aria-live', index === 0 ? 'polite' : 'off');
        
        const indicator = document.createElement('span');
        indicator.className = 'step-indicator';
        indicator.textContent = index === 0 ? '◉' : '○';
        indicator.style.marginRight = '8px';
        
        const stepLabel = document.createElement('span');
        stepLabel.className = 'step-label';
        stepLabel.textContent = step.label;
        
        stepElement.appendChild(indicator);
        stepElement.appendChild(stepLabel);
        stepsContainer.appendChild(stepElement);
      });
      
      loadingContainer.appendChild(stepsContainer);
      
      return loadingContainer;
    }
    
    updateProgress(stepId) {
      // Find the step index
      const stepIndex = this.steps.findIndex(step => step.id === stepId);
      if (stepIndex === -1) return;
      
      // Update the main loading text
      const loadingText = document.getElementById('fact-check-loading-text');
      if (loadingText) {
        loadingText.textContent = this.steps[stepIndex].label;
      }
      
      // Mark this step and all previous steps as complete
      for (let i = 0; i <= stepIndex; i++) {
        this.steps[i].complete = true;
        const stepElement = document.getElementById(`step-${this.steps[i].id}`);
        if (stepElement) {
          const indicator = stepElement.querySelector('.step-indicator');
          if (indicator) indicator.textContent = '✓';
          stepElement.style.color = '#2E7D32'; // Success color
        }
      }
      
      // Reset aria-live for all steps
      this.steps.forEach((step) => {
        const element = document.getElementById(`step-${step.id}`);
        if (element) {
          element.setAttribute('aria-live', 'off');
        }
      });
      
      // Set the next step as active
      if (stepIndex + 1 < this.steps.length) {
        const nextElement = document.getElementById(`step-${this.steps[stepIndex + 1].id}`);
        if (nextElement) {
          const indicator = nextElement.querySelector('.step-indicator');
          if (indicator) indicator.textContent = '◉';
          nextElement.style.color = '#000000'; // Active color
          nextElement.setAttribute('aria-live', 'polite');
        }
      }
      
      this.currentStep = stepIndex + 1;
      
      // Announce progress to screen readers
      const announcer = document.createElement('div');
      announcer.className = 'sr-only';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.textContent = `Step ${stepIndex + 1} of ${this.steps.length}: ${this.steps[stepIndex].label}`;
      
      document.body.appendChild(announcer);
      setTimeout(() => {
        document.body.removeChild(announcer);
      }, 1000);
    }
  }

  // Initialize fallbacks first
  let MarkdownUtils = window.MarkdownUtils || safeMarkdownUtils;
  let TextExtractorService = window.TextExtractorService || fallbackTextExtractor;
  let OverlayManager = window.OverlayManager || FallbackOverlayManager;
  let LoadingIndicator = window.LoadingIndicator || EnhancedLoadingIndicator;
  let overlayManager = null;
  let loadingIndicator = null;

  // Try to load the actual modules
  try {
    // Try dynamic imports
    import('./utils/markdown.js').then(module => {
      MarkdownUtils = module.MarkdownUtils;
      window.MarkdownUtils = MarkdownUtils;
      debugLog("MarkdownUtils loaded successfully");
    }).catch(err => {
      if (DEBUG) console.error("Error importing MarkdownUtils:", err);
      // Already using fallback implementation
    });

    import('./services/textExtractor.js').then(module => {
      TextExtractorService = module.TextExtractorService;
      window.TextExtractorService = TextExtractorService;
      debugLog("TextExtractorService loaded successfully");
    }).catch(err => {
      if (DEBUG) console.error("Error importing TextExtractorService:", err);
      // Already using fallback implementation
    });

    import('./ui/components/OverlayManager.js').then(module => {
      OverlayManager = module.OverlayManager;
      window.OverlayManager = OverlayManager;
      debugLog("OverlayManager loaded successfully");
      
      // Re-initialize overlay manager if it exists
      if (overlayManager) {
        overlayManager = new OverlayManager();
      }
    }).catch(err => {
      if (DEBUG) console.error("Error importing OverlayManager:", err);
      // Already using fallback implementation
    });
    
    import('./ui/components/LoadingIndicator.js').then(module => {
      LoadingIndicator = module.LoadingIndicator;
      window.LoadingIndicator = LoadingIndicator;
      debugLog("LoadingIndicator loaded successfully");
      
      // Re-initialize loading indicator if it exists
      if (loadingIndicator) {
        loadingIndicator = new LoadingIndicator();
      }
    }).catch(err => {
      if (DEBUG) console.error("Error importing LoadingIndicator:", err);
      // Using enhanced fallback implementation
    });
  } catch (err) {
    if (DEBUG) console.error("Error with dynamic imports:", err);
    // Fallbacks are already in place
  }

  // Main initialization function that sets up overlay manager
  function initializeContent() {
    try {
      // Always create an overlay manager (either real or fallback)
      overlayManager = new OverlayManager();
      
      // Create loading indicator instance
      loadingIndicator = new LoadingIndicator();
      
      // Store a global reference to the loading indicator
      window.loadingIndicatorInstance = loadingIndicator;
      
      // Verify that the overlay manager has been properly initialized
      if (!overlayManager || !overlayManager.createLoadingOverlay || !overlayManager.updateOverlayResult) {
        debugLog("OverlayManager not properly initialized, using fallback");
        overlayManager = new FallbackOverlayManager();
      }
      
      debugLog("Fact Check Extension content script loaded");
      
      // Now that we're initialized, listen for messages
      setupEventListeners();
    } catch (error) {
      console.error("Error initializing content:", error);
      // Use fallback if initialization fails
      overlayManager = new FallbackOverlayManager();
      loadingIndicator = new EnhancedLoadingIndicator();
      window.loadingIndicatorInstance = loadingIndicator;
      setupEventListeners();
    }
  }

  function setupEventListeners() {
    debugLog("Setting up event listeners in content.js");
    // Listen for messages from the content-loader
    window.addEventListener('FACT_CHECK_MESSAGE', (event) => {
      debugLog("FACT_CHECK_MESSAGE event received");
      
      // Try to get event detail, with fallback to global variable
      let messageData = null;
      
      if (event.detail && event.detail.message) {
        messageData = event.detail;
        debugLog("Using event.detail");
      } else if (window.__FACT_CHECK_LAST_MESSAGE) {
        messageData = window.__FACT_CHECK_LAST_MESSAGE;
        debugLog("Using fallback __FACT_CHECK_LAST_MESSAGE");
      } else {
        console.error("No valid message data found");
        return;
      }
      
      const { message, responseId } = messageData;
      if (!message || !message.action) {
        console.error("Invalid message format - missing action:", message);
        window.dispatchEvent(new CustomEvent('FACT_CHECK_RESPONSE', { 
          detail: { responseId, error: "Invalid message format - missing action" },
          bubbles: true,
          composed: true
        }));
        return;
      }
      
      debugLog("Message received in content script:", message.action);
      
      try {
        // Create a handler for each action
        const handlers = {
          // ADD THIS NEW HANDLER
          'ping': () => {
            // Simple ping handler to verify the content script is loaded and responsive
            debugLog("Ping received, responding with pong");
            return { pong: true };
          },
          
          'getArticleText': () => {
            // For article text, use a simplified extractor if the main one isn't available
            let result;
            
            if (TextExtractorService) {
              debugLog("Using TextExtractorService for extraction");
              result = TextExtractorService.extractArticleText();
            } else {
              debugLog("Using basic extraction - TextExtractorService not available");
              // Should never reach here due to fallback, but just in case
              const title = document.title || '';
              const textContent = document.body.innerText.slice(0, 10000);
              
              result = {
                articleText: textContent,
                metadata: {
                  title: title,
                  url: window.location.href
                }
              };
            }
            
            debugLog("Article extraction result:", result ? "successful" : "failed");
            return result;
          },
          
          'createOverlay': () => {
            try {
              debugLog("Creating overlay with overlayManager:", !!overlayManager);
              
              // Double check that overlay manager exists and has the required method
              if (overlayManager && typeof overlayManager.createLoadingOverlay === 'function') {
                const overlay = overlayManager.createLoadingOverlay();
                return { success: true, overlay: !!overlay };
              } else {
                debugLog("Using fallback overlay creation");
                // Create a fallback manager and use it
                const fallbackManager = new FallbackOverlayManager();
                fallbackManager.createLoadingOverlay();
                
                // Store the fallback for future use
                overlayManager = fallbackManager;
                
                return { success: true, fallback: true };
              }
            } catch (error) {
              console.error("Error creating overlay:", error);
              
              // Last resort fallback
              try {
                const fallbackManager = new FallbackOverlayManager();
                fallbackManager.createLoadingOverlay();
                
                // Store the fallback for future use
                overlayManager = fallbackManager;
                
                return { success: true, emergency: true };
              } catch (err) {
                // Absolute last resort
                const div = document.createElement('div');
                div.id = 'factCheckOverlay';
                div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;background:white;padding:10px;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.2);';
                div.innerHTML = '<p><strong>Fact Check</strong><br>Checking in progress...</p>';
                document.body.appendChild(div);
                return { success: true, lastResort: true };
              }
            }
          },
          
          'updateOverlay': () => {
            try {
              debugLog("Updating overlay with overlayManager:", !!overlayManager);
              const overlay = document.getElementById('factCheckOverlay');
              
              if (!overlay) {
                console.error("No overlay found to update");
                return { success: false, error: "No overlay found" };
              }
              
              // Check if overlay manager exists and has the required method
              if (overlayManager && typeof overlayManager.updateOverlayResult === 'function') {
                overlayManager.updateOverlayResult(message.result, message.metadata);
                return { success: true };
              } else {
                debugLog("Using fallback overlay update");
                // Create a fallback manager and use it
                const fallbackManager = new FallbackOverlayManager();
                fallbackManager.updateOverlayResult(message.result, message.metadata);
                
                // Store the fallback for future use
                overlayManager = fallbackManager;
                
                return { success: true, fallback: true };
              }
            } catch (error) {
              console.error("Error updating overlay:", error);
              
              // Last resort fallback
              try {
                const fallbackManager = new FallbackOverlayManager();
                fallbackManager.updateOverlayResult(message.result, message.metadata);
                
                // Store the fallback for future use
                overlayManager = fallbackManager;
                
                return { success: true, emergency: true };
              } catch (err) {
                // Absolute last resort
                const overlay = document.getElementById('factCheckOverlay');
                if (overlay) {
                  overlay.innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                      <strong>Fact Check</strong>
                      <span style="cursor:pointer;" onclick="this.parentNode.parentNode.remove()">✕</span>
                    </div>
                    <div style="max-height:400px;overflow-y:auto;">${message.result || 'No result available'}</div>
                  `;
                }
                return { success: true, lastResort: true };
              }
            }
          },
          
          // NEW HANDLER: Progress updates
          'updateProgress': () => {
            try {
              debugLog(`Updating progress: ${message.stepId}`);
              
              // Find the loading indicator
              if (window.loadingIndicatorInstance) {
                window.loadingIndicatorInstance.updateProgress(message.stepId);
                return { success: true };
              }
              
              // Try to find it in the DOM if global reference isn't available
              const overlay = document.getElementById('factCheckOverlay');
              if (overlay) {
                const loadingSteps = overlay.querySelector('.fact-check-steps');
                if (loadingSteps && loadingSteps.parentNode) {
                  // Try to trigger an update via a custom event
                  const progressEvent = new CustomEvent('fact-check-progress', {
                    detail: { stepId: message.stepId }
                  });
                  loadingSteps.parentNode.dispatchEvent(progressEvent);
                  return { success: true };
                }
              }
              
              return { success: false, error: "Loading indicator not found" };
            } catch (error) {
              console.error("Error updating progress:", error);
              return { success: false, error: error.message };
            }
          }
        };
        
        // Execute the appropriate handler
        const handler = handlers[message.action];
        if (handler) {
          const result = handler();
          debugLog(`Executed handler for ${message.action}:`, result);
          
          // Send response back with bubbling to ensure it propagates to content-loader
          window.dispatchEvent(new CustomEvent('FACT_CHECK_RESPONSE', {
            detail: { responseId, data: result },
            bubbles: true,
            composed: true
          }));
        } else {
          console.error(`No handler for action: ${message.action}`);
          window.dispatchEvent(new CustomEvent('FACT_CHECK_RESPONSE', {
            detail: { responseId, error: `Unsupported action: ${message.action}` },
            bubbles: true,
            composed: true
          }));
        }
      } catch (error) {
        console.error(`Error handling message:`, error);
        window.dispatchEvent(new CustomEvent('FACT_CHECK_RESPONSE', { 
          detail: { responseId, error: error.message },
          bubbles: true,
          composed: true
        }));
      }
    });

    // Also add a direct chrome.runtime.onMessage listener as a fallback
    try {
      // First check if chrome is defined and we have access to runtime API
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          debugLog("Direct chrome.runtime.onMessage received:", message?.action);
          
          // Handle ping specifically for checking if content script is loaded
          if (message && message.action === 'ping') {
            debugLog("Ping received via chrome.runtime.onMessage");
            sendResponse({ pong: true });
            return true;
          }
          
          // For other messages, try to use the main event system
          if (message && message.action) {
            // Store the message in the global variable for the main handler to use
            window.__FACT_CHECK_LAST_MESSAGE = {
              message: message,
              responseId: Date.now().toString()
            };
            
            // Dispatch an event to trigger the main handler
            window.dispatchEvent(new CustomEvent('FACT_CHECK_MESSAGE', {
              detail: window.__FACT_CHECK_LAST_MESSAGE,
              bubbles: true
            }));
            
            // Handle async response
            window.addEventListener('FACT_CHECK_RESPONSE', function responseHandler(event) {
              if (event.detail && event.detail.responseId === window.__FACT_CHECK_LAST_MESSAGE.responseId) {
                // Remove this listener to prevent memory leaks
                window.removeEventListener('FACT_CHECK_RESPONSE', responseHandler);
                
                // Send the response back to the background script
                if (event.detail.error) {
                  sendResponse({ error: event.detail.error });
                } else {
                  sendResponse(event.detail.data);
                }
              }
            });
            
            return true; // Indicates we'll send a response asynchronously
          }
          
          // Default response for unhandled messages
          sendResponse({ error: "Message not handled" });
          return true;
        });
      } else {
        debugLog("chrome.runtime.onMessage not available in this context");
      }
    } catch (error) {
      console.error("Error setting up chrome.runtime.onMessage listener:", error);
      // This is expected when running in the page context - don't worry about it
    }
  }

  // Start initialization immediately
  initializeContent();

  debugLog("Fact Check Extension setup initiated");
})(); // Self-executing function