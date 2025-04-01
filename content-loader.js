// content-loader.js - Simplified approach that doesn't rely on script loading
// Debug flag - set to false for production
const DEBUG = false;

// Debug logging helper
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

debugLog("Fact Check Extension loader initializing");

// Store response handlers for later use
window.__responseHandlers = {};

// First, check if we can inject Readability directly
try {
  chrome.runtime.sendMessage({ action: 'injectReadability' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error requesting Readability injection:", chrome.runtime.lastError);
    }
    
    debugLog("Readability injection requested, continuing with other libraries");
    
    // Load the other libraries
    const markedScript = document.createElement('script');
    markedScript.src = chrome.runtime.getURL('libs/marked.min.js');
    document.head.appendChild(markedScript);
    
    const purifyScript = document.createElement('script');
    purifyScript.src = chrome.runtime.getURL('libs/purify.min.js');
    document.head.appendChild(purifyScript);
    
    // Load modular content script instead of monolithic content.js
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/index.js');
    script.type = 'module';
    document.head.appendChild(script);
  });
} catch (error) {
  console.error("Error requesting Readability injection:", error);
  
  // Fall back to loading content script directly
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/index.js');
  script.type = 'module';
  document.head.appendChild(script);
}

// Bridge for communication between extension context and page context
window.addEventListener('FACT_CHECK_RESPONSE', (event) => {
  debugLog("FACT_CHECK_RESPONSE event received");
  if (!event.detail) {
    console.error("FACT_CHECK_RESPONSE event detail is null");
    return;
  }
  
  const responseId = event.detail.responseId;
  if (!responseId) {
    console.error("FACT_CHECK_RESPONSE missing responseId");
    return;
  }
  
  // Try to find the matching response handler
  if (window.__responseHandlers[responseId]) {
    debugLog("Found matching response handler, sending response");
    
    if (event.detail.data) {
      window.__responseHandlers[responseId](event.detail.data);
    } else if (event.detail.error) {
      window.__responseHandlers[responseId]({ error: event.detail.error });
    } else {
      window.__responseHandlers[responseId]({ error: "No data or error in response" });
    }
    
    // Clean up the handler
    delete window.__responseHandlers[responseId];
  } else {
    debugLog("No matching handler found, sending generic message");
    if (event.detail.data) {
      chrome.runtime.sendMessage({
        type: "fact_check_result", 
        data: event.detail.data
      });
    } else if (event.detail.error) {
      chrome.runtime.sendMessage({
        type: "fact_check_error",
        error: event.detail.error
      });
    }
  }
});

// Forward messages from extension to page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog("Content-loader received message from background");
  
  if (!message || !message.action) {
    console.error("Invalid message received:", message);
    sendResponse({ error: "Invalid message format" });
    return false;
  }
  
  // Create a unique response ID and store the sendResponse function
  const responseId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  window.__responseHandlers[responseId] = sendResponse;
  
  // Set a timeout to clean up unused handlers
  setTimeout(() => {
    if (window.__responseHandlers[responseId]) {
      delete window.__responseHandlers[responseId];
    }
  }, 30000); // 30 second timeout
  
  // Create a simple object that can be safely serialized
  const eventDetail = { 
    message: message, 
    responseId: responseId
  };
  
  // Use a global variable as fallback communication mechanism
  window.__FACT_CHECK_LAST_MESSAGE = eventDetail;
  
  try {
    // Dispatch event with properly structured detail and bubbling
    window.dispatchEvent(new CustomEvent('FACT_CHECK_MESSAGE', { 
      detail: eventDetail,
      bubbles: true,
      composed: true
    }));
    debugLog("Event dispatched to content script");
  } catch (error) {
    console.error("Error dispatching event:", error);
    sendResponse({ error: "Failed to dispatch message event: " + error.message });
    return true;
  }
  
  return true; // Keep channel open for async response
});

debugLog("Fact Check Extension loader ready");