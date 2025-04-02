// content.js - Module for DOM interaction (Legacy Wrapper)
// This is now a minimal wrapper that redirects to the modular implementation

(function() {
  // Debug flag - set to false for production
  const DEBUG = false;
  
  // Debug logging helper
  function debugLog(...args) {
    if (DEBUG) console.log('[Legacy Wrapper]', ...args);
  }

  // Check if already initialized to prevent duplicate execution
  if (window.__FACT_CHECK_INITIALIZED) {
    debugLog('Content script already initialized, skipping');
    return;
  }
  
  debugLog('Content.js legacy wrapper is loading modular implementation');
  
  // This wrapper just loads the modular implementation
  try {
    // First attempt to import as a module
    import('./content/index.js').then(() => {
      debugLog('Successfully loaded modular implementation via import');
    }).catch(err => {
      debugLog('Error importing modular implementation:', err);
      
      // Fallback to script tag approach
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/index.js');
      script.type = 'module';
      script.onload = () => debugLog('Successfully loaded modular implementation via script tag');
      script.onerror = (e) => debugLog('Error loading modular implementation via script tag:', e);
      document.head.appendChild(script);
    });
  } catch (error) {
    console.error('Critical error in content.js wrapper:', error);
  }
})();
