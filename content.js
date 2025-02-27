chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getArticleText') {
      let articleText = "";
  
      // Enhanced extraction using Mozilla's Readability.
      try {
        // Clone the document to avoid modifying the live DOM.
        let documentClone = document.cloneNode(true);
        let reader = new Readability(documentClone);
        let article = reader.parse();
        if (article && article.textContent && article.textContent.trim().length > 200) {
          articleText = article.textContent;
        }
        console.log("Readability extracted text:", articleText);
      } catch (err) {
        console.error("Error using Readability:", err);
      }
  
      // Fallback: if Readability didn't yield enough content.
      if (!articleText || articleText.trim().length < 200) {
        let articleElem = document.querySelector('article');
        let mainElem = document.querySelector('main');
        if (articleElem && articleElem.innerText.trim().length > 200) {
          articleText = articleElem.innerText;
        } else if (mainElem && mainElem.innerText.trim().length > 200) {
          articleText = mainElem.innerText;
        } else {
          articleText = document.body.innerText;
        }
        console.log("Fallback extracted text:", articleText);
      }
  
      // Limit length if necessary.
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

    // Detect background color to determine light or dark mode
    const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
    const isDarkMode = isDarkBackground(bodyBgColor);

    // Create the overlay element.
    const overlay = document.createElement('div');
    overlay.id = 'factCheckOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '20px';
    overlay.style.right = '20px';
    overlay.style.backgroundColor = isDarkMode ? '#121212' : '#FFFFFF'; // Black for dark mode, White for light mode
    overlay.style.color = isDarkMode ? '#FFFFFF' : '#000000'; // White text on dark mode, Black text on light mode
    overlay.style.border = isDarkMode ? '1px solid #444' : '1px solid #ccc'; // Darker border for dark mode
    overlay.style.padding = '12px';
    overlay.style.borderRadius = '6px';
    overlay.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    overlay.style.zIndex = '10000';
    overlay.style.maxWidth = '320px';
    overlay.style.maxHeight = '80vh';
    overlay.style.overflowY = 'auto';
    overlay.style.fontSize = '14px';
    overlay.style.lineHeight = '1.5';
    overlay.style.fontWeight = 'bold';

    // Create the text container.
    const textContainer = document.createElement('div');
    textContainer.id = 'factCheckText';
    textContainer.textContent = 'Fact-checking...';
    textContainer.style.color = isDarkMode ? '#FFFFFF' : '#000000'; // Force text color to match theme
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
    closeButton.style.color = isDarkMode ? '#FFFFFF' : '#000000'; // Close button adapts to theme
    closeButton.onclick = () => overlay.remove();
    overlay.appendChild(closeButton);

    document.body.appendChild(overlay);
}

// Helper function to determine if background is dark
function isDarkBackground(bgColor) {
    if (!bgColor || bgColor === "transparent") return false;

    const rgb = bgColor.match(/\d+/g);
    if (!rgb) return false;

    const [r, g, b] = rgb.map(Number);
    // Perceived brightness formula (from W3C contrast guidelines)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128; // If brightness is below 128, consider it dark mode
}

function updateOverlayResult(result) {
  const overlay = document.getElementById('factCheckOverlay');
  if (!overlay) return;

  // Clear the overlay to remove any previous content.
  overlay.innerHTML = "";

  // Create close button.
  const closeButton = document.createElement("span");
  closeButton.textContent = " ×";
  closeButton.style.position = "absolute";
  closeButton.style.top = "5px";
  closeButton.style.right = "10px";
  closeButton.style.cursor = "pointer";
  closeButton.style.fontWeight = "bold";
  closeButton.style.fontSize = "16px";
  closeButton.onclick = () => overlay.remove();

  // Create text container.
  const textContainer = document.createElement("div");
  textContainer.id = "factCheckText";
  textContainer.style.fontWeight = "normal"; // Ensure normal weight for body text

  let formattedResult = result;

  // Extract the numeric rating and convert it to a letter grade.
  const ratingRegex = /Rating:\s*(\d+(\.\d+)?)/i;
  const ratingMatch = formattedResult.match(ratingRegex);
  if (ratingMatch) {
      const numericRating = parseFloat(ratingMatch[1]);
      const letterGrade = mapRatingToLetter(numericRating);
      const { icon, color } = getIconAndColor(letterGrade);
      formattedResult = formattedResult.replace(
          ratingRegex,
          `<strong style="color: ${color}">Rating:</strong> ${icon} ${letterGrade} (${numericRating})`
      );
  }

  // Bold only the "Explanation:" label.
  formattedResult = formattedResult.replace(/(Explanation:)/i, "<br><strong>$1</strong>");

  // Prepend "Fact-check result:" at the top.
  formattedResult = `<strong>Fact-check result:</strong><br>` + formattedResult;

  textContainer.innerHTML = formattedResult;
  overlay.appendChild(closeButton);
  overlay.appendChild(textContainer);
}
  
  function mapRatingToLetter(rating) {
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
  
  function getIconAndColor(letterGrade) {
    // Define the icon and color based on the letter grade.
    switch (letterGrade) {
      case "A+":
      case "A":
      case "A-":
        return { icon: "✅", color: "#2E7D32" };  // Dark Green
      case "B+":
      case "B":
      case "B-":
        return { icon: "✔️", color: "#66BB6A" };  // Light Green
      case "C+":
      case "C":
      case "C-":
        return { icon: "⚠️", color: "#FBC02D" };  // Dark Yellow
      case "D+":
      case "D":
      case "D-":
        return { icon: "⚠️", color: "#FFB74D" };  // Light Yellow/Orange
      default: // F
        return { icon: "❌", color: "#E53935" };  // Red
    }
  }
  