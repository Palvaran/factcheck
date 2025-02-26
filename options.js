document.getElementById('save').addEventListener('click', function() {
    const openaiApiKey = document.getElementById('apiKey').value.trim();
    const braveApiKey = document.getElementById('braveApiKey').value.trim();
    if (!openaiApiKey || !braveApiKey) {
      alert('Please enter valid API keys for both services.');
      return;
    }
    chrome.storage.sync.set({ openaiApiKey, braveApiKey }, function() {
      alert('API Keys saved successfully!');
    });
  });
  