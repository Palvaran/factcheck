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
      chrome.tabs.sendMessage(tab.id, { action: 'getArticleText' }, (response) => {
        if (response && response.articleText) {
          processFactCheck(response.articleText, openaiApiKey, braveApiKey, tab);
        } else {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => alert('Could not extract article text.')
          });
        }
      });
    } else {
      // Use the selected text.
      processFactCheck(info.selectionText, openaiApiKey, braveApiKey, tab);
    }
  });
});

// -----------------------
// Main Fact-Check Function
// -----------------------
function processFactCheck(text, openaiApiKey, braveApiKey, tab) {
  chrome.tabs.sendMessage(tab.id, { action: 'createOverlay' });
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // If text is long (entire page), extract a focused query (first sentence or up to 250 chars).
  let queryText = text;
  if (queryText.length > 250) {
    const sentences = queryText.split('.');
    if (sentences[0] && sentences[0].trim().length > 0) {
      queryText = sentences[0].trim();
    }
    if (queryText.length > 250) {
      queryText = queryText.substring(0, 250);
    }
  }

  if (braveApiKey) {
    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(queryText)}&count=5`;
    fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': braveApiKey
      }
    })
      .then(response => response.json())
      .then(searchData => {
        let searchContext = '';
        let referencesHTML = "";

        if (searchData.web && Array.isArray(searchData.web.results) && searchData.web.results.length > 0) {
          // Build search context for prompt.
          searchContext = searchData.web.results
            .map(result => `${result.title}: ${result.description || result.snippet || ''}`)
            .join("\n");
          
          // Build HTML references.
          referencesHTML += "<br><br><strong>References:</strong><br>";
          searchData.web.results.forEach(result => {
            if (result.url) {
              referencesHTML += `<a href="${result.url}" target="_blank" style="color: inherit;">${result.title}</a><br>`;
            }
          });
        } else if (searchData.mixed && Array.isArray(searchData.mixed.main) && searchData.mixed.main.length > 0) {
          searchContext = searchData.mixed.main
            .map(result => `${result.title || 'No title'}: ${result.description || result.snippet || ''}`)
            .join("\n");
          
          referencesHTML += "<br><br><strong>References:</strong><br>";
          searchData.mixed.main.forEach(result => {
            if (result.url) {
              referencesHTML += `<a href="${result.url}" target="_blank" style="color: inherit;">${result.title}</a><br>`;
            }
          });
        }

        // Include video results if available.
        if (searchData.video && Array.isArray(searchData.video.results) && searchData.video.results.length > 0) {
          const videoContext = searchData.video.results
            .map(result => `${result.title}: ${result.description || result.snippet || ''}`)
            .join("\n");
          searchContext += "\n" + videoContext;
          
          referencesHTML += "<br><br><strong>Video References:</strong><br>";
          searchData.video.results.forEach(result => {
            if (result.url) {
              referencesHTML += `<a href="${result.url}" target="_blank" style="color: inherit;">${result.title}</a><br>`;
            }
          });
        }

        if (!referencesHTML) {
          referencesHTML = "<br><br><strong>References:</strong><br>No references available.";
        }
        
        console.log("Query Text:", queryText);
        console.log("Search Context:", searchContext);
        
        const prompt = buildPrompt(text, searchContext, today, true);
        callOpenAIWithCache(prompt, openaiApiKey)
          .then(factCheckResult => {
            const combinedResult = factCheckResult + referencesHTML;
            chrome.tabs.sendMessage(tab.id, { action: 'updateOverlay', result: combinedResult });
          })
          .catch(() => {
            fallbackToOpenAI(text, openaiApiKey, tab, today);
          });
      })
      .catch(() => {
        fallbackToOpenAI(text, openaiApiKey, tab, today);
      });
  } else {
    fallbackToOpenAI(text, openaiApiKey, tab, today);
  }
}

// -----------------------
// Helper Functions: Build Prompt, Call OpenAI, Fallback
// -----------------------
function buildPrompt(text, searchContext, today, isBrave) {
  if (isBrave) {
    return `Please evaluate the factual accuracy of the following text based ONLY on the web search context provided below.
    
Important:
- Disregard any historical knowledge or prior training data. Do NOT rely on information outside the provided context.
- Use ONLY the web search results below—including any multimedia evidence (e.g. videos or images)—as your definitive factual basis.
- Assume that today's date is ${today}. Use this as the reference for any date comparisons.
- If the web search results contain credible evidence for the events described, reflect that in your rating.
- If the search results contradict or do not confirm the events, adjust your rating accordingly.
      
Statement: "${text}"
      
Web Search Context:
${searchContext}
      
Provide a rating from 0 to 100 (with 100 being completely accurate) and a brief explanation with sources if applicable.
      
Rating and Explanation:`;
  } else {
    return `Please evaluate the factual accuracy of the following text using ONLY the context provided.
    
Important:
- Disregard any historical knowledge or training data. Base your evaluation solely on the available context.
- Assume that today's date is ${today}.
      
Statement: "${text}"
      
Provide a rating from 0 to 100 (with 100 being completely accurate) and a brief explanation with sources if applicable.
      
Rating and Explanation:`;
  }
}

function callOpenAIWithCache(prompt, openaiApiKey) {
  const key = getCacheKey(prompt);

  // Check cache with exact query match
  if (cache[key] && cache[key].query === prompt) {
      console.log("Returning cached response.");
      return Promise.resolve(cache[key].response);
  }  

  if (isRateLimited()) {
      return Promise.reject("Rate limit exceeded. Please try again later.");
  }

  addTimestamp();

  const requestBody = {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.3
  };

  return fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify(requestBody)
  })
  .then(response => response.json())
  .then(data => {
      const result = data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content.trim()
          : 'No result.';

      // Store in cache with query reference
      cache[key] = { query: prompt, response: result };
      
      return result;
  });
}

function fallbackToOpenAI(text, openaiApiKey, tab, today) {
  const prompt = buildPrompt(text, "", today, false);
  callOpenAIWithCache(prompt, openaiApiKey)
    .then(factCheckResult => {
      chrome.tabs.sendMessage(tab.id, { action: 'updateOverlay', result: factCheckResult });
    })
    .catch(() => {
      chrome.tabs.sendMessage(tab.id, { action: 'updateOverlay', result: 'Error calling OpenAI API in fallback. Check console for details.' });
    });
}

// -----------------------
// In-Memory Cache and Rate Limiting
// -----------------------
const cache = {};
const RATE_LIMIT = 5; // maximum 5 calls per minute
let callTimestamps = [];

function isRateLimited() {
  const now = Date.now();
  callTimestamps = callTimestamps.filter(ts => now - ts < 60000);
  return callTimestamps.length >= RATE_LIMIT;
}

function addTimestamp() {
  callTimestamps.push(Date.now());
}

function getCacheKey(text) {
  return btoa(unescape(encodeURIComponent(text))).substring(0, 50);
}
