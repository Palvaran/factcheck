// ui/components/FeedbackComponent.js
import { STYLES } from '../../utils/constants.js'; 

export class FeedbackComponent {
    create(isDarkMode) {
      const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
      
      const feedbackContainer = document.createElement("div");
      feedbackContainer.style.marginTop = "15px";
      feedbackContainer.style.textAlign = "center";
      feedbackContainer.style.fontSize = "12px";
      feedbackContainer.style.borderTop = isDarkMode ? `1px solid ${theme.BORDER}` : `1px solid #eee`;
      feedbackContainer.style.paddingTop = "10px";
      feedbackContainer.setAttribute('role', 'region');
      feedbackContainer.setAttribute('aria-label', 'Feedback section');
      
      const feedbackText = document.createElement("div");
      feedbackText.textContent = "Was this fact check helpful?";
      feedbackText.style.marginBottom = "5px";
      feedbackText.id = "feedback-prompt";
      
      // Create feedback button group
      const buttonGroup = document.createElement("div");
      buttonGroup.setAttribute('role', 'group');
      buttonGroup.setAttribute('aria-labelledby', 'feedback-prompt');
      
      // Create thumbs up button
      const thumbsUpBtn = document.createElement("button");
      thumbsUpBtn.innerHTML = "👍";
      thumbsUpBtn.style.margin = "0 5px";
      thumbsUpBtn.style.padding = "3px 10px";
      thumbsUpBtn.style.border = "none";
      thumbsUpBtn.style.borderRadius = "3px";
      thumbsUpBtn.style.backgroundColor = theme.BUTTON_BG;
      thumbsUpBtn.style.cursor = "pointer";
      
      // Add accessibility attributes
      thumbsUpBtn.setAttribute('aria-label', 'This fact check was helpful');
      thumbsUpBtn.setAttribute('tabindex', '0');
      
      // Add focus styles
      thumbsUpBtn.addEventListener('focus', () => {
        thumbsUpBtn.style.outline = `2px solid ${theme.LINK}`;
        thumbsUpBtn.style.outlineOffset = '2px';
      });
      
      thumbsUpBtn.addEventListener('blur', () => {
        thumbsUpBtn.style.outline = 'none';
      });
      
      // Event handler
      thumbsUpBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: "recordFeedback", rating: "positive" });
        this._showFeedbackThanks(feedbackContainer);
        
        // Announce to screen readers
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.className = 'sr-only';
        announcer.textContent = 'Thank you for your positive feedback';
        feedbackContainer.appendChild(announcer);
        
        setTimeout(() => {
          feedbackContainer.removeChild(announcer);
        }, 1000);
      };
      
      // Create thumbs down button
      const thumbsDownBtn = document.createElement("button");
      thumbsDownBtn.innerHTML = "👎";
      thumbsDownBtn.style.margin = "0 5px";
      thumbsDownBtn.style.padding = "3px 10px";
      thumbsDownBtn.style.border = "none";
      thumbsDownBtn.style.borderRadius = "3px";
      thumbsDownBtn.style.backgroundColor = theme.BUTTON_BG;
      thumbsDownBtn.style.cursor = "pointer";
      
      // Add accessibility attributes
      thumbsDownBtn.setAttribute('aria-label', 'This fact check was not helpful');
      thumbsDownBtn.setAttribute('tabindex', '0');
      
      // Add focus styles
      thumbsDownBtn.addEventListener('focus', () => {
        thumbsDownBtn.style.outline = `2px solid ${theme.LINK}`;
        thumbsDownBtn.style.outlineOffset = '2px';
      });
      
      thumbsDownBtn.addEventListener('blur', () => {
        thumbsDownBtn.style.outline = 'none';
      });
      
      // Event handler
      thumbsDownBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: "recordFeedback", rating: "negative" });
        this._showFeedbackThanks(feedbackContainer);
        
        // Announce to screen readers
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.className = 'sr-only';
        announcer.textContent = 'Thank you for your feedback';
        feedbackContainer.appendChild(announcer);
        
        setTimeout(() => {
          feedbackContainer.removeChild(announcer);
        }, 1000);
      };
      
      // Create button container and add buttons
      feedbackContainer.appendChild(feedbackText);
      buttonGroup.appendChild(thumbsUpBtn);
      buttonGroup.appendChild(thumbsDownBtn);
      feedbackContainer.appendChild(buttonGroup);
      
      return feedbackContainer;
    }
    
    _showFeedbackThanks(container) {
      // Save the previous role and label
      const previousRole = container.getAttribute('role');
      const previousLabel = container.getAttribute('aria-label');
      
      // Update content
      container.innerHTML = "Thanks for your feedback!";
      
      // Restore accessibility attributes
      container.setAttribute('role', previousRole);
      container.setAttribute('aria-label', previousLabel);
    }
  }