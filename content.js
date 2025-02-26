chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getArticleText') {
      // Try to extract article text:
      // First, check for an <article> element
      let articleElem = document.querySelector('article');
      // Then check for a <main> element
      let mainElem = document.querySelector('main');
      let articleText = "";
  
      // Use the element that has more substantial text (e.g., over 200 characters)
      if (articleElem && articleElem.innerText.trim().length > 200) {
        articleText = articleElem.innerText;
      } else if (mainElem && mainElem.innerText.trim().length > 200) {
        articleText = mainElem.innerText;
      } else {
        articleText = document.body.innerText;
      }
  
      // Optionally limit the text length to avoid hitting API token limits
      if (articleText.length > 10000) {
        articleText = articleText.substring(0, 10000) + '...';
      }
      sendResponse({ articleText: articleText });
    } else if (message.action === 'createOverlay') {
      createLoadingOverlay();
    } else if (message.action === 'updateOverlay') {
      updateOverlayResult(message.result);
    }
  });
  
  function createLoadingOverlay() {
    // Remove any existing overlay.
    const existingOverlay = document.getElementById('factCheckOverlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    // Create the overlay element.
    const overlay = document.createElement('div');
    overlay.id = 'factCheckOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '20px';
    overlay.style.right = '20px';
    overlay.style.backgroundColor = 'white';
    overlay.style.border = '1px solid #ccc';
    overlay.style.padding = '10px';
    overlay.style.borderRadius = '4px';
    overlay.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    overlay.style.zIndex = '10000';
    overlay.style.maxWidth = '300px';
    // Instead of a fixed height, use a viewport-based max height.
    overlay.style.maxHeight = '80vh';
    overlay.style.overflowY = 'auto';
    overlay.style.fontSize = '14px';
    overlay.style.lineHeight = '1.4';
  
    // Create the text container.
    const textContainer = document.createElement('div');
    textContainer.id = 'factCheckText';
    textContainer.textContent = 'Fact-checking...';
    overlay.appendChild(textContainer);
  
    // Create a close button.
    const closeButton = document.createElement('span');
    closeButton.textContent = ' ×';
    closeButton.style.marginLeft = '10px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '5px';
    closeButton.style.right = '5px';
    closeButton.onclick = () => overlay.remove();
    overlay.appendChild(closeButton);
  
    document.body.appendChild(overlay);
  }
  
  function updateOverlayResult(result) {
    const overlay = document.getElementById('factCheckOverlay');
    if (!overlay) return;
    const textContainer = document.getElementById('factCheckText');
    if (textContainer) {
      let formattedResult = result;
      
      // Extract the numeric rating and convert it to a letter grade.
      const ratingRegex = /Rating:\s*(\d+(\.\d+)?)/i;
      const ratingMatch = formattedResult.match(ratingRegex);
      if (ratingMatch) {
        const numericRating = parseFloat(ratingMatch[1]);
        const letterGrade = mapRatingToLetter(numericRating);
        // Replace the numeric rating with "Rating: [number] ([letter])" wrapped in <strong>.
        formattedResult = formattedResult.replace(ratingRegex, `<strong>Rating: ${numericRating} (${letterGrade})</strong>`);
      }
      
      // Insert a line break and bold the Explanation label.
      formattedResult = formattedResult.replace(/(Explanation:)/i, "<br><strong>$1</strong>");
      
      // Prepend the header on its own line.
      textContainer.innerHTML = "Fact-check result:<br>" + formattedResult;
    } else {
      overlay.innerHTML = result;
    }
  }
  
  function mapRatingToLetter(rating) {
    // Define your thresholds here. Adjust as needed.
    if (rating >= 97) return "A+";
    else if (rating >= 93) return "A";
    else if (rating >= 90) return "A-";
    else if (rating >= 87) return "B+";
    else if (rating >= 83) return "B";
    else if (rating >= 80) return "B-";
    else if (rating >= 77) return "C+";
    else if (rating >= 73) return "C";
    else if (rating >= 70) return "C-";
    else if (rating >= 67) return "D+";
    else if (rating >= 63) return "D";
    else if (rating >= 60) return "D-";
    else return "F";
  }
  