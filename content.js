// Improved markdown parser function
function parseMarkdown(text) {
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
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  
  // Handle paragraphs - convert double newlines to paragraph breaks
  text = text.replace(/\n\n/g, '</p><p>');
  
  // Wrap the entire text in a paragraph if it's not already in a block-level element
  if (!text.startsWith('<h') && !text.startsWith('<ul') && 
      !text.startsWith('<ol') && !text.startsWith('<blockquote') && 
      !text.startsWith('<p>')) {
    text = `<p>${text}</p>`;
  }
  
  return text;
}

// Enhanced article text extraction function
function extractArticleText() {
  let articleText = "";
  let sourceTitle = document.title || "";
  let sourceUrl = window.location.href || "";
  let articleMetadata = {};
  
  // Try to extract publication date
  const extractDate = () => {
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
    
    // Look for common date patterns in text
    const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/i;
    const bodyText = document.body.textContent;
    const dateMatch = bodyText.match(dateRegex);
    if (dateMatch) {
      return dateMatch[0];
    }
    
    return null;
  };
  
  // Try to extract author information
  const extractAuthor = () => {
    // Check meta tags
    const authorMeta = document.querySelector('meta[name="author"], meta[property="article:author"]');
    if (authorMeta && authorMeta.content) {
      return authorMeta.content;
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
  };
  
  // Extract metadata
  articleMetadata = {
    title: sourceTitle,
    url: sourceUrl,
    date: extractDate(),
    author: extractAuthor()
  };
  
  // Enhanced extraction using Mozilla's Readability.
  try {
    // Clone the document to avoid modifying the live DOM.
    let documentClone = document.cloneNode(true);
    
    // Remove known noise elements before parsing
    ['aside', 'nav', 'footer', '.comment', '.comments', '.ad', '.advertisement', '.promo'].forEach(selector => {
      const elements = documentClone.querySelectorAll(selector);
      elements.forEach(el => el.parentNode?.removeChild(el));
    });
    
    let reader = new Readability(documentClone);
    let article = reader.parse();
    if (article && article.textContent && article.textContent.trim().length > 200) {
      articleText = article.textContent;
      
      // Use article title if available
      if (article.title) {
        articleMetadata.title = article.title;
      }
      
      console.log("Readability extracted text:", articleText.substring(0, 100) + "...");
    }
  } catch (err) {
    console.error("Error using Readability:", err);
  }
  
  // Fallback: if Readability didn't yield enough content.
  if (!articleText || articleText.trim().length < 200) {
    console.log("Falling back to DOM selection for text extraction");
    
    // Try common article containers in priority order
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '#content',
      '.content'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Use the element with the most text content
        const element = Array.from(elements).sort((a, b) => 
          b.innerText.length - a.innerText.length
        )[0];
        
        if (element && element.innerText.trim().length > 200) {
          articleText = element.innerText;
          break;
        }
      }
    }
    
    // If still no good content, use body as last resort
    if (!articleText || articleText.trim().length < 200) {
      articleText = document.body.innerText;
    }
  }
  
  // Clean up the text
  articleText = articleText
    .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
    .replace(/\n+/g, '\n')          // Replace multiple newlines with single newline
    .trim();
  
  // Limit length if necessary.
  if (articleText.length > 12000) {  // Increased limit but still manageable
    // Try to extract a meaningful subset
    // First paragraph + middle content + last paragraph approach
    const paragraphs = articleText.split(/\n\s*\n/);
    if (paragraphs.length > 3) {
      const firstPara = paragraphs[0];
      const lastPara = paragraphs[paragraphs.length - 1];
      // Take some paragraphs from the middle
      const middleStart = Math.floor(paragraphs.length * 0.3);
      const middleEnd = Math.floor(paragraphs.length * 0.7);
      const middleParas = paragraphs.slice(middleStart, middleEnd).join('\n\n');
      
      articleText = firstPara + '\n\n' + middleParas + '\n\n' + lastPara;
      
      // If still too long, simply truncate
      if (articleText.length > 12000) {
        articleText = articleText.substring(0, 12000) + '...';
      }
    } else {
      articleText = articleText.substring(0, 12000) + '...';
    }
  }
  
  return { articleText, metadata: articleMetadata };
}

// Updated message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getArticleText') {
    const { articleText, metadata } = extractArticleText();
    sendResponse({ 
      articleText,
      metadata
    });
  } else if (message.action === 'createOverlay') {
    createLoadingOverlay();
    sendResponse({ success: true });
  } else if (message.action === 'updateOverlay') {
    updateOverlayResult(message.result, message.metadata);
    sendResponse({ success: true });
  }
  // No need to return true since we're responding synchronously
});

function createLoadingOverlay() {
  // Remove any existing overlay.
  const existingOverlay = document.getElementById('factCheckOverlay');
  if (existingOverlay) {
      existingOverlay.remove();
  }

  // Detect background color to determine light or dark mode
  const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
  const isDarkMode = isDarkBackground(bodyBgColor);

  // Create the overlay element.
  const overlay = document.createElement('div');
  overlay.id = 'factCheckOverlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '20px';
  overlay.style.right = '20px';
  overlay.style.backgroundColor = isDarkMode ? '#121212' : '#FFFFFF'; // Black for dark mode, White for light mode
  overlay.style.color = isDarkMode ? '#FFFFFF' : '#000000'; // White text on dark mode, Black text on light mode
  overlay.style.border = isDarkMode ? '1px solid #444' : '1px solid #ccc'; // Darker border for dark mode
  overlay.style.padding = '12px';
  overlay.style.borderRadius = '6px';
  overlay.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  overlay.style.zIndex = '10000';
  overlay.style.maxWidth = '360px'; // Slightly wider for better readability
  overlay.style.maxHeight = '80vh';
  overlay.style.overflowY = 'auto';
  overlay.style.fontSize = '14px';
  overlay.style.lineHeight = '1.5';
  overlay.style.transition = 'all 0.3s ease'; // Smooth transition for UI updates

  // Create header with icon and title
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '10px';
  header.style.borderBottom = isDarkMode ? '1px solid #333' : '1px solid #eee';
  header.style.paddingBottom = '8px';

  // Add title with icon
  const titleContainer = document.createElement('div');
  titleContainer.style.display = 'flex';
  titleContainer.style.alignItems = 'center';

  // Create icon (magnifying glass with check mark)
  const iconSpan = document.createElement('span');
  iconSpan.textContent = '🔍✓';
  iconSpan.style.marginRight = '6px';
  iconSpan.style.fontSize = '16px';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = 'Fact Check';
  titleSpan.style.fontWeight = 'bold';

  titleContainer.appendChild(iconSpan);
  titleContainer.appendChild(titleSpan);
  header.appendChild(titleContainer);

  // Create a close button.
  const closeButton = document.createElement('span');
  closeButton.textContent = '×';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontWeight = 'bold';
  closeButton.style.fontSize = '20px';
  closeButton.style.color = isDarkMode ? '#FFFFFF' : '#000000';
  closeButton.onclick = () => overlay.remove();
  header.appendChild(closeButton);

  overlay.appendChild(header);

  // Create the text container.
  const textContainer = document.createElement('div');
  textContainer.id = 'factCheckText';
  
  // Create a loading animation
  const loadingContainer = document.createElement('div');
  loadingContainer.style.display = 'flex';
  loadingContainer.style.flexDirection = 'column';
  loadingContainer.style.alignItems = 'center';
  loadingContainer.style.margin = '20px 0';
  
  const spinner = document.createElement('div');
  spinner.style.border = isDarkMode ? '3px solid #333' : '3px solid #f3f3f3';
  spinner.style.borderTop = isDarkMode ? '3px solid #90caf9' : '3px solid #3498db';
  spinner.style.borderRadius = '50%';
  spinner.style.width = '30px';
  spinner.style.height = '30px';
  spinner.style.animation = 'spin 1s linear infinite';
  
  // Add keyframes for the spinner
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  const loadingText = document.createElement('div');
  loadingText.textContent = 'Analyzing for factual accuracy...';
  loadingText.style.marginTop = '10px';
  loadingText.style.textAlign = 'center';
  
  loadingContainer.appendChild(spinner);
  loadingContainer.appendChild(loadingText);
  textContainer.appendChild(loadingContainer);
  
  overlay.appendChild(textContainer);
  document.body.appendChild(overlay);
}

function updateOverlayResult(result, sourceMetadata = {}) {
  const overlay = document.getElementById('factCheckOverlay');
  if (!overlay) return;

  // Clear the overlay to remove any previous content.
  overlay.innerHTML = "";

  // Detect dark mode again to ensure consistent styling
  const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
  const isDarkMode = isDarkBackground(bodyBgColor);
  
  // Set overlay background based on mode
  overlay.style.backgroundColor = isDarkMode ? '#121212' : '#FFFFFF';
  overlay.style.color = isDarkMode ? '#FFFFFF' : '#000000';
  overlay.style.border = isDarkMode ? '1px solid #444' : '1px solid #ccc';

  // Create overlay header
  const header = document.createElement("div");
  header.style.borderBottom = isDarkMode ? '1px solid #444' : '1px solid #ccc';
  header.style.padding = "5px 0";
  header.style.marginBottom = "10px";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  // Add extension icon and name to header
  const iconContainer = document.createElement("div");
  iconContainer.style.display = "flex";
  iconContainer.style.alignItems = "center";
  
  const iconSpan = document.createElement('span');
  iconSpan.textContent = '🔍✓';
  iconSpan.style.marginRight = '6px';
  iconSpan.style.fontSize = '16px';
  
  const titleText = document.createElement("span");
  titleText.textContent = "Fact Check";
  titleText.style.fontWeight = "bold";
  
  iconContainer.appendChild(iconSpan);
  iconContainer.appendChild(titleText);
  header.appendChild(iconContainer);

  // Add control buttons (close, expand/collapse)
  const controlsContainer = document.createElement("div");
  controlsContainer.style.display = "flex";
  controlsContainer.style.alignItems = "center";
  
  // Add expand/collapse button
  const expandButton = document.createElement("span");
  expandButton.textContent = "□";
  expandButton.title = "Expand/Collapse";
  expandButton.style.cursor = "pointer";
  expandButton.style.marginRight = "10px";
  expandButton.style.fontSize = "16px";
  expandButton.style.color = isDarkMode ? '#FFFFFF' : '#000000';
  expandButton.onclick = toggleOverlaySize;
  
  // Add close button in header
  const closeButton = document.createElement("span");
  closeButton.textContent = "×";
  closeButton.title = "Close";
  closeButton.style.cursor = "pointer";
  closeButton.style.fontWeight = "bold";
  closeButton.style.fontSize = "20px";
  closeButton.style.color = isDarkMode ? '#FFFFFF' : '#000000';
  closeButton.onclick = () => overlay.remove();
  
  controlsContainer.appendChild(expandButton);
  controlsContainer.appendChild(closeButton);
  header.appendChild(controlsContainer);
  
  overlay.appendChild(header);

  // Create source info section if metadata available
  if (sourceMetadata.title || sourceMetadata.date || sourceMetadata.author) {
    const sourceInfoContainer = document.createElement("div");
    sourceInfoContainer.style.marginBottom = "10px";
    sourceInfoContainer.style.fontSize = "12px";
    sourceInfoContainer.style.color = isDarkMode ? '#BBB' : '#555';
    
    if (sourceMetadata.title) {
      const titleDiv = document.createElement("div");
      titleDiv.style.fontWeight = "bold";
      titleDiv.textContent = sourceMetadata.title;
      sourceInfoContainer.appendChild(titleDiv);
    }
    
    if (sourceMetadata.date || sourceMetadata.author) {
      const metaDiv = document.createElement("div");
      let metaText = "";
      if (sourceMetadata.date) metaText += `Published: ${sourceMetadata.date}`;
      if (sourceMetadata.date && sourceMetadata.author) metaText += " | ";
      if (sourceMetadata.author) metaText += `By: ${sourceMetadata.author}`;
      metaDiv.textContent = metaText;
      sourceInfoContainer.appendChild(metaDiv);
    }
    
    overlay.appendChild(sourceInfoContainer);
  }

  // Create result container
  const resultContainer = document.createElement("div");
  resultContainer.id = "factCheckText";
  resultContainer.style.fontWeight = "normal";

  // Process the result text
  let formattedResult = result;

  // Extract the numeric rating and confidence level
  const ratingRegex = /Rating:\s*(\d+(\.\d+)?)/i;
  const confidenceRegex = /Confidence Level:\s*(High|Moderate|Low)/i;
  
  const ratingMatch = formattedResult.match(ratingRegex);
  const confidenceMatch = formattedResult.match(confidenceRegex);
  
  let numericRating = 0;
  let confidenceLevel = "Moderate";
  
  if (ratingMatch) {
    numericRating = parseFloat(ratingMatch[1]);
  }
  
  if (confidenceMatch) {
    confidenceLevel = confidenceMatch[1];
    // Remove the confidence level from the text as we'll display it graphically
    formattedResult = formattedResult.replace(/Confidence Level:.+?(?=\n|$)/i, "");
  }

  // Create rating visualization
  const ratingVisual = document.createElement("div");
  ratingVisual.style.margin = "10px 0";
  ratingVisual.style.textAlign = "center";
  
  // Create circular gauge for rating
  const gaugeSize = 100;
  const strokeWidth = 10;
  const radius = (gaugeSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratingPercent = numericRating / 100;
  const offset = circumference * (1 - ratingPercent);
  
  // Create SVG for gauge
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", gaugeSize);
  svg.setAttribute("height", gaugeSize);
  svg.style.transform = "rotate(-90deg)";
  
  // Background circle
  const bgCircle = document.createElementNS(svgNS, "circle");
  bgCircle.setAttribute("cx", gaugeSize / 2);
  bgCircle.setAttribute("cy", gaugeSize / 2);
  bgCircle.setAttribute("r", radius);
  bgCircle.setAttribute("fill", "none");
  bgCircle.setAttribute("stroke", isDarkMode ? "#333" : "#eee");
  bgCircle.setAttribute("stroke-width", strokeWidth);
  
  // Rating circle
  const ratingCircle = document.createElementNS(svgNS, "circle");
  ratingCircle.setAttribute("cx", gaugeSize / 2);
  ratingCircle.setAttribute("cy", gaugeSize / 2);
  ratingCircle.setAttribute("r", radius);
  ratingCircle.setAttribute("fill", "none");
  ratingCircle.setAttribute("stroke-dasharray", circumference);
  ratingCircle.setAttribute("stroke-dashoffset", offset);
  ratingCircle.setAttribute("stroke-width", strokeWidth);
  ratingCircle.setAttribute("stroke-linecap", "round");
  
  // Set color based on rating
  let color;
  if (numericRating >= 90) color = "#2E7D32"; // Dark Green
  else if (numericRating >= 80) color = "#66BB6A"; // Light Green
  else if (numericRating >= 70) color = "#AED581"; // Very Light Green
  else if (numericRating >= 60) color = "#FBC02D"; // Dark Yellow
  else if (numericRating >= 50) color = "#FFB74D"; // Light Yellow/Orange
  else if (numericRating >= 40) color = "#FF9800"; // Orange
  else if (numericRating >= 30) color = "#FB8C00"; // Dark Orange
  else color = "#E53935"; // Red
  
  ratingCircle.setAttribute("stroke", color);
  
  svg.appendChild(bgCircle);
  svg.appendChild(ratingCircle);
  
  // Add the letter grade and score in the middle of the gauge
  const letterGrade = mapRatingToLetter(numericRating);
  const ratingText = document.createElement("div");
  ratingText.style.position = "relative";
  ratingText.style.top = "-" + (gaugeSize - 10) + "px";
  ratingText.style.color = color;
  ratingText.style.fontWeight = "bold";
  ratingText.style.fontSize = "24px";
  ratingText.textContent = letterGrade;
  
  const scoreText = document.createElement("div");
  scoreText.style.position = "relative";
  scoreText.style.top = "-" + (gaugeSize - 10) + "px";
  scoreText.style.fontSize = "14px";
  scoreText.textContent = numericRating;
  
  // Confidence indicator
  const confidenceContainer = document.createElement("div");
  confidenceContainer.style.margin = "0 auto";
  confidenceContainer.style.width = "fit-content";
  confidenceContainer.style.padding = "3px 8px";
  confidenceContainer.style.borderRadius = "12px";
  confidenceContainer.style.fontSize = "12px";
  confidenceContainer.style.marginTop = "-" + (gaugeSize - 35) + "px";
  
  // Set color and text based on confidence level
  if (confidenceLevel === "High") {
    confidenceContainer.style.backgroundColor = isDarkMode ? "#1B5E20" : "#C8E6C9";
    confidenceContainer.style.color = isDarkMode ? "#FFFFFF" : "#1B5E20";
    confidenceContainer.textContent = "High Confidence";
  } else if (confidenceLevel === "Moderate") {
    confidenceContainer.style.backgroundColor = isDarkMode ? "#F57F17" : "#FFF8E1";
    confidenceContainer.style.color = isDarkMode ? "#FFFFFF" : "#F57F17";
    confidenceContainer.textContent = "Moderate Confidence";
  } else {
    confidenceContainer.style.backgroundColor = isDarkMode ? "#B71C1C" : "#FFEBEE";
    confidenceContainer.style.color = isDarkMode ? "#FFFFFF" : "#B71C1C";
    confidenceContainer.textContent = "Low Confidence";
  }
  
  ratingVisual.appendChild(svg);
  ratingVisual.appendChild(ratingText);
  ratingVisual.appendChild(scoreText);
  ratingVisual.appendChild(confidenceContainer);
  
  // Parse and format the explanation text
  formattedResult = formattedResult
    .replace(/Rating:\s*\d+(\.\d+)?/i, "") // Remove the rating as we display it visually
    .trim();
  
  // Create content container for the explanation with tabs
  const tabsContainer = document.createElement("div");
  tabsContainer.style.borderBottom = isDarkMode ? "1px solid #333" : "1px solid #ddd";
  tabsContainer.style.display = "flex";
  tabsContainer.style.marginTop = "15px";
  
  // Create tab for the main explanation
  const explanationTab = document.createElement("div");
  explanationTab.textContent = "Explanation";
  explanationTab.className = "fact-check-tab active";
  explanationTab.style.padding = "8px 12px";
  explanationTab.style.cursor = "pointer";
  explanationTab.style.borderBottom = `2px solid ${color}`;
  explanationTab.style.fontWeight = "bold";
  explanationTab.dataset.tab = "explanation";
  
  // Create tab for references if they exist
  const referencesTab = document.createElement("div");
  referencesTab.textContent = "References";
  referencesTab.className = "fact-check-tab";
  referencesTab.style.padding = "8px 12px";
  referencesTab.style.cursor = "pointer";
  referencesTab.style.color = isDarkMode ? "#AAA" : "#777";
  referencesTab.dataset.tab = "references";
  
  // Add event listeners to tabs
  explanationTab.addEventListener("click", () => switchTab(explanationTab, "explanation"));
  referencesTab.addEventListener("click", () => switchTab(referencesTab, "references"));
  
  tabsContainer.appendChild(explanationTab);
  
  // Extract explanation and references content
  let explanationContent = formattedResult;
  let referencesContent = "";
  
  // Check if references exist and add the tab if they do
  const hasReferences = result.includes("References:");
  if (hasReferences) {
    tabsContainer.appendChild(referencesTab);
    
    // Extract references section
    const referencesMatch = result.match(/<br><br><strong>References:<\/strong>.*$/s);
    if (referencesMatch) {
      referencesContent = referencesMatch[0];
      // Remove references from explanation content
      explanationContent = explanationContent.replace(/<br><br><strong>References:<\/strong>.*$/s, "");
    }
  }
  
  // Create content sections for tabs
  const explanationSection = document.createElement("div");
  explanationSection.className = "fact-check-content active";
  explanationSection.dataset.content = "explanation";
  explanationSection.style.padding = "10px 0";
  explanationSection.style.lineHeight = "1.6";
  
  // Parse markdown in explanation content
  const processedExplanation = parseMarkdown(explanationContent);
  explanationSection.innerHTML = processedExplanation;
  
  const referencesSection = document.createElement("div");
  referencesSection.className = "fact-check-content";
  referencesSection.dataset.content = "references";
  referencesSection.style.padding = "10px 0";
  referencesSection.style.display = "none";
  referencesSection.innerHTML = referencesContent; // References already have HTML
  
  // Assemble the UI
  overlay.appendChild(ratingVisual);
  overlay.appendChild(tabsContainer);
  overlay.appendChild(explanationSection);
  
  if (hasReferences) {
    overlay.appendChild(referencesSection);
  }
  
  // Add pagination for long content
  const explanationText = explanationSection.textContent || "";
  if (explanationText.length > 1500) {
    addPagination(explanationSection, 1500);
  }
  
  // Add feedback buttons
  const feedbackContainer = document.createElement("div");
  feedbackContainer.style.marginTop = "15px";
  feedbackContainer.style.textAlign = "center";
  feedbackContainer.style.fontSize = "12px";
  feedbackContainer.style.borderTop = isDarkMode ? "1px solid #333" : "1px solid #eee";
  feedbackContainer.style.paddingTop = "10px";
  
  const feedbackText = document.createElement("div");
  feedbackText.textContent = "Was this fact check helpful?";
  feedbackText.style.marginBottom = "5px";
  
  const thumbsUpBtn = document.createElement("button");
  thumbsUpBtn.innerHTML = "👍";
  thumbsUpBtn.style.margin = "0 5px";
  thumbsUpBtn.style.padding = "3px 10px";
  thumbsUpBtn.style.border = "none";
  thumbsUpBtn.style.borderRadius = "3px";
  thumbsUpBtn.style.backgroundColor = isDarkMode ? "#333" : "#eee";
  thumbsUpBtn.style.cursor = "pointer";
  thumbsUpBtn.onclick = () => {
    chrome.runtime.sendMessage({ action: "recordFeedback", rating: "positive" });
    showFeedbackThanks(feedbackContainer);
  };
  
  const thumbsDownBtn = document.createElement("button");
  thumbsDownBtn.innerHTML = "👎";
  thumbsDownBtn.style.margin = "0 5px";
  thumbsDownBtn.style.padding = "3px 10px";
  thumbsDownBtn.style.border = "none";
  thumbsDownBtn.style.borderRadius = "3px";
  thumbsDownBtn.style.backgroundColor = isDarkMode ? "#333" : "#eee";
  thumbsDownBtn.style.cursor = "pointer";
  thumbsDownBtn.onclick = () => {
    chrome.runtime.sendMessage({ action: "recordFeedback", rating: "negative" });
    showFeedbackThanks(feedbackContainer);
  };
  
  feedbackContainer.appendChild(feedbackText);
  feedbackContainer.appendChild(thumbsUpBtn);
  feedbackContainer.appendChild(thumbsDownBtn);
  
  overlay.appendChild(feedbackContainer);
  
  // Add CSS for tabs and markdown styling
  const style = document.createElement('style');
  style.textContent = `
    .fact-check-tab.active {
      border-bottom: 2px solid ${color};
      color: ${isDarkMode ? "#FFFFFF" : "#000000"};
    }
    
    blockquote {
      border-left: 3px solid ${isDarkMode ? "#555" : "#ccc"};
      padding-left: 10px;
      margin-left: 0;
      color: ${isDarkMode ? "#bbb" : "#555"};
    }
    
    h1, h2, h3 {
      margin-top: 16px;
      margin-bottom: 8px;
      color: ${isDarkMode ? "#fff" : "#000"};
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
      background-color: ${isDarkMode ? "#333" : "#f5f5f5"};
      padding: 2px 4px;
      border-radius: 3px;
      font-family: monospace;
    }
    
    pre {
      background-color: ${isDarkMode ? "#333" : "#f5f5f5"};
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
    }
    
    pre code {
      background-color: transparent;
      padding: 0;
    }
    
    a {
      color: ${isDarkMode ? "#90CAF9" : "#1976D2"};
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
    
    .pagination-controls {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      border-top: 1px solid ${isDarkMode ? "#333" : "#eee"};
      padding-top: 8px;
    }
    
    .pagination-button {
      background: ${isDarkMode ? "#333" : "#f5f5f5"};
      border: none;
      border-radius: 3px;
      padding: 5px 10px;
      cursor: pointer;
      color: ${isDarkMode ? "#fff" : "#333"};
    }
    
    .pagination-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .pagination-info {
      font-size: 12px;
      color: ${isDarkMode ? "#bbb" : "#777"};
    }
    
    strong, b {
      font-weight: bold;
    }
    
    em, i {
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
}

function showFeedbackThanks(container) {
  container.innerHTML = "Thanks for your feedback!";
}

// Helper function to determine if background is dark
function isDarkBackground(bgColor) {
  if (!bgColor || bgColor === "transparent") return false;

  const rgb = bgColor.match(/\d+/g);
  if (!rgb) return false;

  const [r, g, b] = rgb.map(Number);
  // Perceived brightness formula (from W3C contrast guidelines)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128; // If brightness is below 128, consider it dark mode
}

function mapRatingToLetter(rating) {
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

function getIconAndColor(letterGrade) {
  // Define the icon and color based on the letter grade.
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

// Function to switch between tabs
function switchTab(tabElement, tabName) {
  // Get all tabs and contents
  const tabs = document.querySelectorAll('.fact-check-tab');
  const contents = document.querySelectorAll('.fact-check-content');
  
  // Remove active class from all tabs and hide all contents
  tabs.forEach(tab => tab.classList.remove('active'));
  contents.forEach(content => {
    content.style.display = 'none';
  });
  
  // Add active class to the clicked tab
  tabElement.classList.add('active');
  
  // Show the selected content
  const selectedContent = document.querySelector(`.fact-check-content[data-content="${tabName}"]`);
  if (selectedContent) {
    selectedContent.style.display = 'block';
  }
}

// Function to toggle overlay size (expanded/collapsed)
function toggleOverlaySize() {
  const overlay = document.getElementById('factCheckOverlay');
  if (!overlay) return;
  
  if (overlay.dataset.expanded === 'true') {
    // Collapse
    overlay.style.maxWidth = '360px';
    overlay.style.maxHeight = '80vh';
    overlay.dataset.expanded = 'false';
  } else {
    // Expand
    overlay.style.maxWidth = '600px';
    overlay.style.maxHeight = '90vh';
    overlay.dataset.expanded = 'true';
  }
}

// Fix for pagination setup - update the addPagination function
function addPagination(container, charsPerPage) {
  const content = container.innerHTML;
  const pages = [];
  
  // Split content into pages
  let currentPage = '';
  const paragraphs = content.split('</p>');
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i] + (i < paragraphs.length - 1 ? '</p>' : '');
    
    if (currentPage.length + paragraph.length <= charsPerPage || currentPage.length === 0) {
      currentPage += paragraph;
    } else {
      pages.push(currentPage);
      currentPage = paragraph;
    }
  }
  
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }
  
  // If only one page, don't add pagination
  if (pages.length <= 1) return;
  
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
  
  const prevButton = document.createElement('button');
  prevButton.className = 'pagination-button prev';
  prevButton.textContent = '← Previous';
  prevButton.disabled = true;
  prevButton.addEventListener('click', () => changePage(container, -1));
  
  const pageInfo = document.createElement('span');
  pageInfo.className = 'pagination-info';
  pageInfo.textContent = `Page 1 of ${pages.length}`;
  
  const nextButton = document.createElement('button');
  nextButton.className = 'pagination-button next';
  nextButton.textContent = 'Next →';
  nextButton.addEventListener('click', () => changePage(container, 1));
  
  controls.appendChild(prevButton);
  controls.appendChild(pageInfo);
  controls.appendChild(nextButton);
  
  container.appendChild(controls);
}

// Fix for pagination issue - replace the changePage function
function changePage(container, direction) {
  const currentPage = parseInt(container.dataset.currentPage);
  const totalPages = parseInt(container.dataset.totalPages);
  const pages = JSON.parse(container.dataset.pages);
  
  const newPage = currentPage + direction;
  
  if (newPage >= 0 && newPage < totalPages) {
    // Get the content section (without the pagination controls)
    const contentSection = container.querySelector('.pagination-controls').previousSibling;
    
    // Update content by replacing only the content part
    if (contentSection) {
      container.removeChild(contentSection);
    }
    
    // Create new content element
    const newContent = document.createElement('div');
    newContent.className = 'content-section';
    newContent.innerHTML = pages[newPage];
    
    // Insert before pagination controls
    container.insertBefore(newContent, container.querySelector('.pagination-controls'));
    
    // Update buttons and page info
    const prevButton = container.querySelector('.pagination-button.prev');
    const nextButton = container.querySelector('.pagination-button.next');
    const pageInfo = container.querySelector('.pagination-info');
    
    prevButton.disabled = newPage === 0;
    nextButton.disabled = newPage === totalPages - 1;
    pageInfo.textContent = `Page ${newPage + 1} of ${totalPages}`;
    
    // Update current page
    container.dataset.currentPage = newPage;
    
    // Scroll to top of container
    container.scrollTop = 0;
  }
}