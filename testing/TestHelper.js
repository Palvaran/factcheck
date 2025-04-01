// testing/TestHelper.js
export class TestHelper {
    async injectContentScript(tabId) {
      return new Promise((resolve, reject) => {
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-loader.js']
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    }
    
    async pingContentScript(tabId) {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'ping' }, response => {
          if (chrome.runtime.lastError) {
            resolve(false);
          } else if (response && response.pong) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
    }
    
    async runTest(testName, testFn) {
      console.log(`Running test: ${testName}`);
      const startTime = performance.now();
      
      try {
        await testFn();
        const duration = performance.now() - startTime;
        console.log(`✓ Test passed: ${testName} (${duration.toFixed(2)}ms)`);
        return true;
      } catch (error) {
        console.error(`✗ Test failed: ${testName}`);
        console.error(error);
        return false;
      }
    }
  }