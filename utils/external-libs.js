// utils/external-libs.js
let markedLib = null;
let DOMPurifyLib = null;

// Load libraries synchronously to ensure availability
function loadExternalLibraries() {
  try {
    // Load Marked
    const markedScript = document.createElement('script');
    markedScript.src = chrome.runtime.getURL('libs/marked.min.js');
    markedScript.async = false;
    document.head.appendChild(markedScript);
    
    // Load DOMPurify
    const purifyScript = document.createElement('script');
    purifyScript.src = chrome.runtime.getURL('libs/purify.min.js');
    purifyScript.async = false;
    document.head.appendChild(purifyScript);
    
    console.log('External libraries loaded successfully');
  } catch (error) {
    console.error('Error loading external libraries:', error);
  }
}

// Initialize libraries
loadExternalLibraries();

// Export getters for the libraries
export function getMarked() {
  if (!window.marked) {
    console.warn('Marked library not available yet');
    return null;
  }
  return window.marked;
}

export function getDOMPurify() {
  if (!window.DOMPurify) {
    console.warn('DOMPurify library not available yet');
    return null;
  }
  return window.DOMPurify;
}