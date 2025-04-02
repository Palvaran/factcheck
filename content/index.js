// content/index.js - Main entry point for content script
import { Config } from './utils/config.js';
// Import the existing utilities from their original locations
import { MarkdownUtils } from '../utils/markdown.js';
import { TextExtractorService } from '../services/textExtractor.js';
import { MessageHandler } from './services/messageHandler.js';
// Import existing components from ui/components
import { OverlayManager } from '../ui/components/OverlayManager.js';
import { LoadingIndicator } from '../ui/components/LoadingIndicator.js';

// Self-executing function to initialize the content script
(function() {
  // Check if already initialized to prevent duplicate execution
  if (Config.isInitialized()) {
    Config.debugLog("Content script already initialized, skipping");
    return;
  }
  
  // Mark as initialized
  Config.markInitialized();
  Config.debugLog("Initializing Fact Check content script");
  
  // Expose components to the global scope for fallback and interop
  window.MarkdownUtils = MarkdownUtils;
  window.TextExtractorService = TextExtractorService;
  
  // Initialize components
  let overlayManager = null;
  let loadingIndicator = null;
  
  try {
    // Create instances of the UI components
    overlayManager = new OverlayManager();
    loadingIndicator = new LoadingIndicator();
    
    // Store global references
    window.overlayManager = overlayManager;
    window.loadingIndicatorInstance = loadingIndicator;
    
    // Set up message handlers
    MessageHandler.setupEventListeners();
    
    Config.debugLog("Fact Check Extension content script loaded successfully");
  } catch (error) {
    console.error("Error initializing content script:", error);
    
    // Try to initialize with basic functionality
    try {
      if (!overlayManager) {
        overlayManager = new OverlayManager();
        window.overlayManager = overlayManager;
      }
      
      if (!loadingIndicator) {
        loadingIndicator = new LoadingIndicator();
        window.loadingIndicatorInstance = loadingIndicator;
      }
      
      // Set up message handlers even if there were errors
      MessageHandler.setupEventListeners();
    } catch (fallbackError) {
      console.error("Critical error, content script initialization failed:", fallbackError);
    }
  }
  
  // Confirm that the content script is ready
  window.dispatchEvent(new CustomEvent('FACT_CHECK_CONTENT_READY', {
    detail: { initialized: true },
    bubbles: true
  }));
  
  Config.debugLog("Fact Check content initialization complete");
})();
