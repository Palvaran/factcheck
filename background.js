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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'factCheckSelection' || info.menuItemId === 'factCheckPage') {
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
        // Ask the content script to extract the full article text.
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
        const selectedText = info.selectionText;
        processFactCheck(selectedText, openaiApiKey, braveApiKey, tab);
      }
    });
  }
});

// Process fact-checking using Brave search and OpenAI.
function processFactCheck(text, openaiApiKey, braveApiKey, tab) {
  // Create a loading overlay on the page.
  chrome.tabs.sendMessage(tab.id, { action: 'createOverlay' });

  if (braveApiKey) {
    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(text)}&count=5`;
    fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': braveApiKey
      }
    })
    .then(response => response.json())
    .then(searchData => {
      let searchContext = '';
      // Use Brave's "web" key first.
      if (searchData.web && searchData.web.results && Array.isArray(searchData.web.results) && searchData.web.results.length > 0) {
        searchContext = searchData.web.results
          .map(result => `${result.title}: ${result.description || result.snippet || ''}`)
          .join("\n");
      }
      // Fallback: check "mixed" key.
      else if (searchData.mixed && searchData.mixed.main && Array.isArray(searchData.mixed.main) && searchData.mixed.main.length > 0) {
        searchContext = searchData.mixed.main
          .map(result => `${result.title || 'No title'}: ${result.description || result.snippet || ''}`)
          .join("\n");
      }
      
      // Extra instructions to ignore future date errors.
      const prompt = `Please evaluate the factual accuracy of the following text, considering additional context from a web search.
Note: If the text includes dates that fall beyond your training data cutoff, assume those dates are accurate and do not flag them as inaccuracies.
      
Statement: "${text}"
      
Web Search Context:
${searchContext}
      
Provide a rating from 0 to 100 (with 100 being completely accurate) and a brief explanation with sources if applicable.

Rating and Explanation:`;
      
      const requestBody = {
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: prompt
        }],
        max_tokens: 300,
        temperature: 0.3
      };
      
      // Call the OpenAI API.
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify(requestBody)
      })
      .then(response => response.json())
      .then(data => {
        const factCheckResult = data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content.trim()
          : 'No result.';
        chrome.tabs.sendMessage(tab.id, { action: 'updateOverlay', result: factCheckResult });
      })
      .catch(error => {
        chrome.tabs.sendMessage(tab.id, { action: 'updateOverlay', result: 'Error calling OpenAI API. Check console for details.' });
      });
    })
    .catch(error => {
      fallbackToOpenAI(text, openaiApiKey, tab);
    });
  } else {
    // No Brave API key—use OpenAI directly.
    fallbackToOpenAI(text, openaiApiKey, tab);
  }
}

// Fallback function to call OpenAI directly.
function fallbackToOpenAI(text, openaiApiKey, tab) {
  const prompt = `Please evaluate the factual accuracy of the following text.
Note: If the text includes dates that fall beyond your training data cutoff, assume those dates are accurate and do not flag them as inaccuracies.
      
Statement: "${text}"
      
Provide a rating from 0 to 100 (with 100 being completely accurate) and a brief explanation with sources if applicable.

Rating and Explanation:`;
  const requestBody = {
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: prompt
    }],
    max_tokens: 300,
    temperature: 0.3
  };
  fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify(requestBody)
  })
  .then(response => response.json())
  .then(data => {
    const factCheckResult = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content.trim()
      : 'No result.';
    chrome.tabs.sendMessage(tab.id, { action: 'updateOverlay', result: factCheckResult });
  })
  .catch(error => {
    chrome.tabs.sendMessage(tab.id, { action: 'updateOverlay', result: 'Error calling OpenAI API in fallback. Check console for details.' });
  });
}
