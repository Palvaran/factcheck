document.getElementById('checkBtn').addEventListener('click', () => {
    const text = document.getElementById('factText').value.trim();
    const deepCheck = document.getElementById('deepCheck').checked;
    if (!text) {
      document.getElementById('result').textContent = "Please enter text to fact-check.";
      return;
    }
    // Show a loading message
    document.getElementById('result').textContent = "Fact-checking...";
    
    chrome.runtime.sendMessage({ action: "factCheck", text, deepCheck }, (response) => {
      if (chrome.runtime.lastError) {
        document.getElementById('result').textContent = "Error: " + chrome.runtime.lastError.message;
        return;
      }
      // Update the result container with the fact-check result
      document.getElementById('result').innerHTML = formatResult(response.result);
    });
  });
  
  // A helper function to format the result with enhanced visuals (see next section)
  function formatResult(resultText) {
    // Example: find "Rating: <num>" in the result and wrap the number in <strong>
    const ratingMatch = resultText.match(/Rating:\s*(\d+)/i);
    let formatted = resultText;
    if (ratingMatch) {
      const rating = parseInt(ratingMatch[1]);
      const ratingHtml = `Rating: <strong>${rating}</strong>`;
      formatted = formatted.replace(/Rating:\s*\d+/i, ratingHtml);
      // Add a CSS class based on rating
      let cssClass = "";
      if (rating >= 80) cssClass = "high";
      else if (rating >= 50) cssClass = "moderate";
      else cssClass = "low";
      formatted = `<div class="${cssClass}">${formatted}</div>`;
    }
    return formatted;
  }
  