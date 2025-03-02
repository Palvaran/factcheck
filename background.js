// -----------------------
// Setup context menus on install
// -----------------------
chrome.runtime.onInstalled.addListener(() => {
  // Create a context menu for selected text.
  chrome.contextMenus.create({
    id: 'factCheckSelection',
    title: 'Fact-check selected text',
    contexts: ['selection']
  });
  // Create a context menu for the entire page/article.
  chrome.contextMenus.create({
    id: 'factCheckPage',
    title: 'Fact-check entire page',
    contexts: ['page']
  });
  
  // Set default settings if not already set
  chrome.storage.sync.get([
    'aiModel', 
    'useMultiModel', 
    'maxTokens', 
    'enableCaching', 
    'rateLimit'
  ], (data) => {
    // If settings don't exist, set defaults
    if (!data.aiModel) {
      chrome.storage.sync.set({
        aiModel: 'gpt-4o-mini',
        useMultiModel: false,
        maxTokens: 500,
        enableCaching: true,
        rateLimit: 5
      });
    }
  });
});

// -----------------------
// Context menu click handler
// -----------------------
chrome.contextMenus.onClicked.addListener((info, tab) => {
  chrome.storage.sync.get(['openaiApiKey', 'braveApiKey'], (data) => {
    const { openaiApiKey, braveApiKey } = data;
    if (!openaiApiKey) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => alert('Please set your OpenAI API key in the extension options.')
      });
      return;
    }

    if (info.menuItemId === 'factCheckPage') {
      // Extract full article text.
      getArticleTextFromTab(tab.id).then(response => {
        if (response && response.articleText) {
          processFactCheck(response.articleText, openaiApiKey, braveApiKey, tab);
        } else {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => alert('Could not extract article text.')
          });
        }
      }).catch(error => {
        console.error("Error getting article text:", error);
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: () => alert('Error extracting text from page.')
        });
      });
    } else {
      // Process selected text directly
      processFactCheck(info.selectionText, openaiApiKey, braveApiKey, tab);
    }
  });
});

// Listen for a left-click on the extension icon
chrome.action.onClicked.addListener((tab) => {
  // Retrieve API keys from storage
  chrome.storage.sync.get(['openaiApiKey', 'braveApiKey'], async (data) => {
    const { openaiApiKey, braveApiKey } = data;
    if (!openaiApiKey) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => alert('Please set your OpenAI API key in the extension options.')
      });
      return;
    }

    try {
      // Try to get the selected text on the page
      const [{ result: selectedText }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => window.getSelection().toString()
      });

      if (selectedText && selectedText.trim().length > 0) {
        // If there is selected text, process it
        processFactCheck(selectedText, openaiApiKey, braveApiKey, tab);
      } else {
        // If no text is selected, ask the content script to extract the full article text
        try {
          const response = await getArticleTextFromTab(tab.id);
          if (response && response.articleText) {
            processFactCheck(response.articleText, openaiApiKey, braveApiKey, tab);
          } else {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              function: () => alert('Could not extract article text.')
            });
          }
        } catch (error) {
          console.error("Error getting article text:", error);
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => alert('Error extracting text from page.')
          });
        }
      }
    } catch (error) {
      console.error("Error retrieving selection:", error);
    }
  });
});

// Promise-based wrapper for chrome.tabs.sendMessage
function getArticleTextFromTab(tabId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, { action: 'getArticleText' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// -----------------------
// Main Fact-Check Function (using async/await)
// -----------------------
async function processFactCheck(text, openaiApiKey, braveApiKey, tab) {
  // Get AI settings from storage
  const settings = await getStorageData([
    'aiModel', 
    'useMultiModel', 
    'maxTokens', 
    'enableCaching', 
    'rateLimit'
  ]);
  
  // Set defaults if settings are missing
  const aiModel = settings.aiModel || 'gpt-4o-mini';
  const useMultiModel = settings.useMultiModel !== false;
  const maxTokens = settings.maxTokens || 500;
  const enableCaching = settings.enableCaching !== false;
  const rateLimit = settings.rateLimit || 5;
  
  // Update rate limit setting
  RATE_LIMIT = rateLimit;
  
  // Show loading overlay with retries
  let overlayShown = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await sendMessageToTab(tab.id, { action: 'createOverlay' });
      overlayShown = true;
      break;
    } catch (error) {
      console.log(`Attempt ${attempt+1} to show overlay failed:`, error);
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  if (!overlayShown) {
    console.error("Could not create overlay after multiple attempts");
    // Continue anyway - the content script might become available later
  }
  
  // Get current date for context
  const today = new Date().toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  // Generate query for search context
  let queryText = await extractSearchQuery(text, openaiApiKey, aiModel);
  
  // Initialize variables for metadata
  let sourceMetadata = {};
  
  try {
    // Get article metadata if available
    try {
      const response = await getArticleTextFromTab(tab.id);
      if (response && response.metadata) {
        sourceMetadata = response.metadata;
      }
    } catch (error) {
      console.error("Error getting article metadata:", error);
      // Continue without metadata
    }

    // Only attempt Brave search if API key is provided
    if (braveApiKey) {
      try {
        // Get search context for verification
        const { searchContext, referencesHTML } = await getWebSearchContext(queryText, braveApiKey);
        
        if (searchContext && searchContext.trim().length > 0) {
          console.log("Search context acquired, length:", searchContext.length);
          
          // Determine which model to use based on settings
          const analysisModel = aiModel === 'hybrid' ? 'gpt-4o-mini' : aiModel;
          console.log(`Using ${analysisModel} for analysis`);
          
          // Build prompt with the search context
          const prompt = buildPrompt(text, searchContext, today, true);
          
          let factCheckResult;
          
          // Use multi-model verification if enabled
          if (useMultiModel) {
            factCheckResult = await performMultiModelFactCheck(
              text, 
              searchContext, 
              openaiApiKey, 
              today, 
              analysisModel,
              maxTokens,
              enableCaching
            );
          } else {
            // Use single model approach
            factCheckResult = await singleModelFactCheck(
              text,
              searchContext,
              openaiApiKey,
              today,
              analysisModel,
              maxTokens,
              enableCaching
            );
          }
          
          // Combine results and references
          const combinedResult = factCheckResult + referencesHTML;
          
          // Update the overlay with results and metadata (with retry)
          await updateOverlayWithRetry(tab.id, combinedResult, sourceMetadata);
          
          // Record analytics
          recordFactCheckAnalytics(text, queryText);
          return;
        } else {
          console.log("No search context found, falling back to OpenAI only");
        }
      } catch (error) {
        console.error("Error during fact-checking with Brave search:", error);
      }
    } else {
      console.log("No Brave API key, using OpenAI only");
    }
    
    // Fallback to OpenAI only
    await fallbackToOpenAI(text, openaiApiKey, tab, today, sourceMetadata, aiModel, maxTokens, enableCaching, useMultiModel);
  } catch (error) {
    console.error("Error in processFactCheck:", error);
    try {
      await updateOverlayWithRetry(tab.id, 'Error: An unexpected error occurred during fact-checking. Please try again.', sourceMetadata);
    } catch (innerError) {
      console.error("Error sending error message to tab:", innerError);
    }
  }
  
  // Record analytics
  recordFactCheckAnalytics(text, queryText);
}

// Helper function to safely send messages to tabs with retry
async function updateOverlayWithRetry(tabId, result, metadata, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sendMessageToTab(tabId, { 
        action: 'updateOverlay', 
        result: result,
        metadata: metadata
      });
      return; // Success
    } catch (error) {
      console.log(`Attempt ${attempt+1} to update overlay failed:`, error);
      if (attempt < maxRetries - 1) {
        // Wait longer between each retry
        await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }
  console.error(`Failed to update overlay after ${maxRetries} attempts`);
}

// Helper function to safely send messages to tabs
function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Helper function to get data from storage
function getStorageData(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (data) => {
      resolve(data);
    });
  });
}

// Extract claims for search query
async function extractSearchQuery(text, openaiApiKey, model = 'gpt-4o-mini') {
  let queryText = text;
  
  // Only process if text is long
  if (queryText.length > 300) {
    try {
      const claimExtractionPrompt = `
        Extract the 2-3 most important factual claims from this text. 
        Focus on specific, verifiable statements rather than opinions.
        Return ONLY the claims, separated by semicolons, with no additional text:
        
        "${text.substring(0, 2000)}"
      `;
      
      // Always use gpt4o-mini for extraction to save costs
      const claimsResponse = await callOpenAIWithCache(
        claimExtractionPrompt, 
        openaiApiKey, 
        'gpt-4o-mini',
        300, // Lower token limit for extraction
        true  // Always enable caching for extraction
      );
      
      // Use the extracted claims as our query text
      if (claimsResponse && claimsResponse.length > 10) {
        queryText = claimsResponse;
        console.log("Extracted claims for search:", queryText);
      } else {
        // Default to first few sentences if claim extraction fails
        const sentences = text.split(/[.!?]+/);
        if (sentences[0] && sentences[0].trim().length > 0) {
          queryText = sentences.slice(0, 3).join(". ").trim();
          if (queryText.length > 300) {
            queryText = queryText.substring(0, 300);
          }
        }
      }
    } catch (error) {
      console.error("Error extracting claims:", error);
      // Fallback to simple approach
      const sentences = text.split(/[.!?]+/);
      if (sentences[0] && sentences[0].trim().length > 0) {
        queryText = sentences.slice(0, 2).join(". ").trim();
        if (queryText.length > 300) {
          queryText = queryText.substring(0, 300);
        }
      }
    }
  }
  
  return queryText;
}

// -----------------------
// Enhanced Web Search Function
// -----------------------
async function getWebSearchContext(queryText, braveApiKey) {
  try {
    console.log("Original query text:", queryText);
    
    // 1. Generate shorter, more focused search queries
    const claims = queryText.split(/;|\./).filter(claim => claim.trim().length > 10);
    const shortQueries = claims.map(claim => {
      // Keep only the first 80 characters of each claim
      const sanitizedClaim = claim.trim().replace(/[^\w\s.,'"]/g, ' ').trim();
      return sanitizedClaim.substring(0, 80);
    }).slice(0, 2); // Only use first 2 claims max
    
    console.log("Shortened search queries:", shortQueries);
    
    let allResults = [];
    let referencesHTML = "";
    
    // 2. Add delay between requests to avoid rate limiting
    for (let i = 0; i < shortQueries.length; i++) {
      const query = shortQueries[i];
      try {
        // Add delay between requests (500ms)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log(`Searching for: "${query}"`);
        
        // Properly encode URI components
        const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=2`;
        
        const response = await fetch(searchUrl, {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': braveApiKey
          }
        });
        
        // Handle error responses
        if (response.status === 429) {
          console.error("Rate limit exceeded - waiting longer between requests");
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
          continue;
        }
        
        if (!response.ok) {
          console.error(`Brave search error: ${response.status} ${response.statusText}`);
          continue;
        }
        
        const searchData = await response.json();
        console.log("Search response received, status:", searchData.status || "unknown");
        
        // Process web results
        if (searchData.web && Array.isArray(searchData.web.results)) {
          console.log(`Found ${searchData.web.results.length} web results`);
          
          // Filter for credible sources
          const resultsToProcess = searchData.web.results;
          
          allResults = [...allResults, ...resultsToProcess.map(result => ({
            title: result.title || 'No title',
            description: result.description || result.snippet || '',
            url: result.url,
            type: 'web',
            // Add domain info and publication date if available
            domain: new URL(result.url).hostname,
            date: result.published_date || ''
          }))];
        }
        
        // Process news results if available
        if (searchData.news && Array.isArray(searchData.news.results)) {
          console.log(`Found ${searchData.news.results.length} news results`);
          
          allResults = [...allResults, ...searchData.news.results.map(result => ({
            title: result.title || 'No title',
            description: result.description || '',
            url: result.url,
            type: 'news',
            domain: new URL(result.url).hostname,
            date: result.published_date || ''
          }))];
        }
      } catch (error) {
        console.error(`Error searching for "${query}":`, error);
      }
    }
    
    // Handle no results case
    if (allResults.length === 0) {
      console.log("No search results found");
      return { 
        searchContext: "", 
        referencesHTML: "<br><br><strong>References:</strong><br>No references available." 
      };
    }
    
    // Deduplicate results by URL
    const uniqueResults = [...new Map(allResults.map(item => [item.url, item])).values()];
    console.log(`Found ${uniqueResults.length} unique results after deduplication`);
    
    // Sort by credibility and recency
    uniqueResults.sort((a, b) => {
      // Prioritize fact-checking sites
      const aIsFact = FACT_CHECK_DOMAINS.some(domain => a.domain.includes(domain));
      const bIsFact = FACT_CHECK_DOMAINS.some(domain => b.domain.includes(domain));
      
      if (aIsFact && !bIsFact) return -1;
      if (!aIsFact && bIsFact) return 1;
      
      // Then sort by date if available
      if (a.date && b.date) {
        return new Date(b.date) - new Date(a.date);
      }
      
      return 0;
    });
    
    // Build search context for the prompt
    let searchContext = uniqueResults
      .map(result => {
        let context = `Source: ${result.title} (${result.domain})`;
        if (result.date) context += ` [${result.date}]`;
        context += `\nContent: ${result.description}`;
        return context;
      })
      .join("\n\n");
    
    // Build HTML references
    if (uniqueResults.length > 0) {
      referencesHTML += "<br><br><strong>References:</strong><br>";
      uniqueResults.forEach(result => {
        const sourceType = result.type === 'news' ? '📰' : '🔍';
        if (FACT_CHECK_DOMAINS.some(domain => result.domain.includes(domain))) {
          referencesHTML += `${sourceType} <a href="${result.url}" target="_blank" style="color: inherit;"><strong>Fact-Check:</strong> ${result.title}</a><br>`;
        } else {
          referencesHTML += `${sourceType} <a href="${result.url}" target="_blank" style="color: inherit;">${result.title}</a><br>`;
        }
      });
    } else {
      referencesHTML = "<br><br><strong>References:</strong><br>No references available.";
    }
    
    console.log("Search context built, length:", searchContext.length);
    return { searchContext, referencesHTML };
  } catch (error) {
    console.error("Error in getWebSearchContext:", error);
    return { 
      searchContext: "", 
      referencesHTML: "<br><br><strong>References:</strong><br>Error fetching references." 
    };
  }
}

// List of credible domains to prioritize
const CREDIBLE_DOMAINS = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'npr.org',
  'washingtonpost.com',
  'nytimes.com',
  'wsj.com',
  'economist.com',
  'science.org',
  'nature.com',
  'scientificamerican.com'
];

// Fact-checking specific domains
const FACT_CHECK_DOMAINS = [
  'factcheck.org',
  'politifact.com',
  'snopes.com',
  'fullfact.org',
  'reuters.com/fact-check',
  'apnews.com/hub/ap-fact-check',
  'factcheck.afp.com'
];

// -----------------------
// Enhanced Prompt Engineering
// -----------------------
function buildPrompt(text, searchContext, today, isBrave) {
  const factCheckTemplate = `
I need your help to fact-check the following statement. Please carefully analyze this for accuracy:

STATEMENT TO VERIFY: "${text}"

${isBrave && searchContext ? `
REFERENCE INFORMATION:
${searchContext}
` : ''}

TODAY'S DATE: ${today}

Please follow this specific evaluation framework:

1. KEY CLAIMS IDENTIFICATION:
   - Identify the 2-3 main factual claims in the statement
   - For each claim, note if it's verifiable with available information

2. EVIDENCE EVALUATION:
   - Rate the strength of supporting evidence from references (Strong/Moderate/Weak/None)
   - Note contradictory evidence where applicable
   - Consider source credibility and recency
   - Identify information gaps

3. CONTEXTUAL ANALYSIS:
   - Note any missing context that affects interpretation
   - Identify if the statement misleads through selective presentation

4. VERDICT:
   - Assign a numerical accuracy score (0-100):
     * 90-100: Completely or almost completely accurate
     * 70-89: Mostly accurate with minor issues
     * 50-69: Mixed accuracy with significant issues
     * 30-49: Mostly inaccurate with some truth
     * 0-29: Completely or almost completely false
   - Provide a concise explanation for your rating

5. LIMITATIONS:
   - Note any limitations in your assessment due to incomplete information

FORMAT YOUR RESPONSE WITH THESE HEADERS:
"Rating: [numerical score]"
"Explanation: [your concise explanation with specific references]"
`;

  return factCheckTemplate;
}

// -----------------------
// Single Model Fact Check
// -----------------------
async function singleModelFactCheck(text, searchContext, openaiApiKey, today, model, maxTokens, enableCaching) {
  try {
    // Build the prompt with search context if available
    const prompt = buildPrompt(text, searchContext, today, !!searchContext);
    
    // Call OpenAI API with the selected model
    const result = await callOpenAIWithCache(
      prompt, 
      openaiApiKey, 
      model,
      maxTokens,
      enableCaching
    );
    
    return result;
  } catch (error) {
    console.error("Single model fact check error:", error);
    throw error;
  }
}

// -----------------------
// Multi-Model Verification
// -----------------------
async function performMultiModelFactCheck(text, searchContext, openaiApiKey, today, primaryModel, maxTokens, enableCaching) {
  // Define different prompt types
  const promptTypes = [
    {
      name: "Evidence Analysis",
      prompt: `Based strictly on the provided search context, evaluate the factual claims in: "${text}". 
      List each claim and assess whether the search results support, contradict, or are silent on each claim. 
      Provide a numeric accuracy rating from 0-100 and brief explanation.`,
      model: primaryModel
    },
    {
      name: "Logical Consistency",
      prompt: `Analyze the internal logical consistency of the following statement: "${text}". 
      Identify if there are any contradictions or logical fallacies. 
      Provide a numeric consistency rating from 0-100 and brief explanation.`,
      model: "gpt-4o-mini" // Always use 4o for second opinion to save costs
    }
  ];

  try {
    // If no search context is available, adjust the first prompt
    if (!searchContext || searchContext.trim().length === 0) {
      promptTypes[0].prompt = `Analyze the factual claims in: "${text}". 
        Based on your knowledge, evaluate how accurate these claims are likely to be.
        Provide a numeric accuracy rating from 0-100 and brief explanation.`;
    }
    
    // Get responses from different prompts/models
    const responses = await Promise.all(promptTypes.map(async (promptType) => {
      let fullPrompt = promptType.prompt;
      
      // Only add search context to Evidence Analysis
      if (promptType.name === "Evidence Analysis" && searchContext && searchContext.trim().length > 0) {
        fullPrompt += `\n\nSearch Context:\n${searchContext}`;
      }
      
      try {
        const response = await callOpenAIWithCache(
          fullPrompt, 
          openaiApiKey, 
          promptType.model,
          maxTokens,
          enableCaching
        );
        return {
          name: promptType.name,
          response: response
        };
      } catch (error) {
        console.error(`Error with ${promptType.name} prompt:`, error);
        return {
          name: promptType.name,
          response: `Error: Could not complete ${promptType.name} analysis.`
        };
      }
    }));

    // Extract ratings from each response
    const ratings = responses.map(resp => {
      const match = resp.response.match(/Rating:\s*(\d+)/i);
      return match ? parseInt(match[1]) : null;
    }).filter(rating => rating !== null);

    // Calculate an aggregate rating with fallback
    let aggregateRating = 50; // Default if no ratings found
    if (ratings.length > 0) {
      aggregateRating = Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length);
    }

    // Create a combined result
    let combinedResult = `Rating: ${aggregateRating}\n\nExplanation: `;
    
    // Check if we have valid responses
    const validResponses = responses.filter(r => 
      !r.response.includes("Error:") && 
      r.response.length > 20
    );
    
    if (validResponses.length === 0) {
      combinedResult += "Could not perform a complete fact-check due to technical issues. The rating provided is a default value and may not be accurate.";
    } else {
      // Add a summary of the individual analyses
      validResponses.forEach((resp) => {
        // Extract just the explanation part
        const explanationMatch = resp.response.match(/Explanation:(.*?)(?:$|(?:\n\n))/s);
        if (explanationMatch && explanationMatch[1]) {
          combinedResult += `\n\n${resp.name}: ${explanationMatch[1].trim()}`;
        } else {
          // If no explanation format found, use the whole response
          combinedResult += `\n\n${resp.name}: ${resp.response.trim()}`;
        }
      });
    }

    // Add confidence level based on agreement between models
    if (ratings.length > 1) {
      const ratingVariance = Math.max(...ratings) - Math.min(...ratings);
      let confidenceLevel = "High";
      if (ratingVariance > 30) {
        confidenceLevel = "Low";
      } else if (ratingVariance > 15) {
        confidenceLevel = "Moderate";
      }
      
      combinedResult += `\n\nConfidence Level: ${confidenceLevel} (based on agreement between different analysis methods)`;
    } else {
      // Only one rating or none
      combinedResult += "\n\nConfidence Level: Low (limited analysis methods available)";
    }

    return combinedResult;
  } catch (error) {
    console.error("Multi-model fact check error:", error);
    return `Rating: 50\n\nExplanation: An error occurred during the fact-checking process. This default rating should not be considered accurate.\n\nConfidence Level: Low`;
  }
}

// Fallback function
async function fallbackToOpenAI(text, openaiApiKey, tab, today, sourceMetadata, model, maxTokens, enableCaching, useMultiModel) {
  try {
    let factCheckResult;
    
    if (useMultiModel) {
      // Even without search context, we can still use multi-model approach
      factCheckResult = await performMultiModelFactCheck(
        text, 
        "", 
        openaiApiKey, 
        today,
        model,
        maxTokens,
        enableCaching
      );
    } else {
      // Use simple single model approach
      factCheckResult = await singleModelFactCheck(
        text,
        "",
        openaiApiKey,
        today,
        model,
        maxTokens,
        enableCaching
      );
    }
    
    await updateOverlayWithRetry(tab.id, factCheckResult, sourceMetadata);
  } catch (error) {
    console.error("Fallback OpenAI API error:", error);
    
    // One more fallback attempt with a simpler model
    try {
      const simplePrompt = `
        Please fact-check the following statement and rate its accuracy from 0-100:
        "${text}"
        
        Rating and brief explanation only.
      `;
      
      const simpleResult = await callOpenAIWithCache(
        simplePrompt, 
        openaiApiKey, 
        "gpt-4o-mini",
        300,
        true
      );
      
      await updateOverlayWithRetry(tab.id, simpleResult, sourceMetadata);
    } catch (finalError) {
      console.error("Final fallback error:", finalError);
      
      await updateOverlayWithRetry(tab.id, 'Error: Unable to complete fact-check. Please try again later.', sourceMetadata);
    }
  }
}

// -----------------------
// In-Memory Cache and Rate Limiting with Model Support
// -----------------------
const cache = {};
let RATE_LIMIT = 5; // default, can be adjusted through settings
let callTimestamps = [];

function isRateLimited() {
  const now = Date.now();
  callTimestamps = callTimestamps.filter(ts => now - ts < 60000);
  return callTimestamps.length >= RATE_LIMIT;
}

function addTimestamp() {
  callTimestamps.push(Date.now());
}

// Modified API call function to support different models
async function callOpenAIWithCache(prompt, openaiApiKey, model = "gpt-4o-mini", maxTokens = 500, enableCaching = true) {
  try {
    // Generate cache key
    const key = await getCacheKey(prompt + model);

    // Check cache with exact query match if caching is enabled
    if (enableCaching && cache[key] && cache[key].query === prompt && cache[key].model === model) {
      console.log("Returning cached response for model:", model);
      return cache[key].response;
    }  

    if (isRateLimited()) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }

    addTimestamp();

    const requestBody = {
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3
    };

    console.log(`Calling OpenAI API with model: ${model}`);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("OpenAI API error response:", errorData);
      
      throw new Error(`OpenAI API error (${response.status}): ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    const result = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content.trim()
      : 'No result.';

    // Store in cache with query and model reference if caching is enabled
    if (enableCaching) {
      cache[key] = { query: prompt, model: model, response: result };
    }
    
    return result;
  } catch (error) {
    console.error(`Error calling OpenAI API (${model}):`, error);
    throw error;
  }
}

// Analytics tracking
function recordFactCheckAnalytics(originalText, queryText) {
  // Store anonymized analytics
  const analyticsData = {
    timestamp: Date.now(),
    textLength: originalText.length,
    queryLength: queryText.length,
    // Don't store actual text for privacy
    domain: 'unknown' // Service workers don't have access to window
  };
  
  // Get existing analytics
  chrome.storage.local.get(['factCheckAnalytics'], (data) => {
    let analytics = data.factCheckAnalytics || [];
    analytics.push(analyticsData);
    
    // Keep only last 100 entries
    if (analytics.length > 100) {
      analytics = analytics.slice(-100);
    }
    
    chrome.storage.local.set({ factCheckAnalytics: analytics });
  });
}

// -----------------------
// Cache Key Generation using SHA-256
// -----------------------
async function getCacheKey(text) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 50);
  } catch (error) {
    console.error("Error generating cache key:", error);
    // Fallback to a simpler method if SHA-256 fails
    return String(text).split('').reduce(
      (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0
    ).toString(36);
  }
}

// Listen for feedback from users
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "recordFeedback") {
    // Store feedback for improving the extension
    chrome.storage.local.get(['factCheckFeedback'], (data) => {
      let feedback = data.factCheckFeedback || [];
      feedback.push({
        timestamp: Date.now(),
        rating: message.rating,
        domain: sender.tab ? new URL(sender.tab.url).hostname : 'unknown'
      });
      
      chrome.storage.local.set({ factCheckFeedback: feedback });
      sendResponse({ success: true });
    });
    return true; // Keep message channel open for async response
  }
});