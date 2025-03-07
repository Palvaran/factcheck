// ui/components/TabManager.js
import { STYLES } from '../../utils/constants.js';

export class TabManager {
  constructor() {
    this.activeTab = 'explanation';
  }

  createTabs(explanationContent, fullResult, isDarkMode, hasReferences) {
    const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
    
    // Create tablist container with ARIA role
    const tabsContainer = document.createElement("div");
    tabsContainer.setAttribute('role', 'tablist');
    tabsContainer.style.borderBottom = isDarkMode ? `1px solid ${theme.BORDER}` : `1px solid ${theme.BORDER}`;
    tabsContainer.style.display = "flex";
    tabsContainer.style.marginTop = "15px";
    
    // Create tab for the main explanation with ARIA attributes
    const explanationTab = document.createElement("div");
    explanationTab.textContent = "Explanation";
    explanationTab.className = "fact-check-tab active";
    explanationTab.style.padding = "8px 12px";
    explanationTab.style.cursor = "pointer";
    explanationTab.dataset.tab = "explanation";
    
    // Add accessibility attributes for tab
    explanationTab.setAttribute('role', 'tab');
    explanationTab.id = 'explanation-tab';
    explanationTab.setAttribute('aria-selected', 'true');
    explanationTab.setAttribute('aria-controls', 'explanation-panel');
    explanationTab.setAttribute('tabindex', '0');
    
    // Add keyboard listeners for tab
    explanationTab.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          explanationTab.click();
          break;
        case 'ArrowRight':
          if (hasReferences) {
            e.preventDefault();
            document.getElementById('references-tab').focus();
            document.getElementById('references-tab').click();
          }
          break;
        case 'Home':
          e.preventDefault();
          explanationTab.focus();
          break;
        case 'End':
          if (hasReferences) {
            e.preventDefault();
            document.getElementById('references-tab').focus();
          }
          break;
      }
    });
    
    tabsContainer.appendChild(explanationTab);
    
    // Extract explanation and references content
    let referencesContent = "";
    
    // Create tab for references if they exist
    let referencesTab = null;
    if (hasReferences) {
      referencesTab = document.createElement("div");
      referencesTab.textContent = "References";
      referencesTab.className = "fact-check-tab";
      referencesTab.style.padding = "8px 12px";
      referencesTab.style.cursor = "pointer";
      referencesTab.style.color = isDarkMode ? theme.SECONDARY_TEXT : theme.SECONDARY_TEXT;
      referencesTab.dataset.tab = "references";
      
      // Add accessibility attributes for references tab
      referencesTab.setAttribute('role', 'tab');
      referencesTab.id = 'references-tab';
      referencesTab.setAttribute('aria-selected', 'false');
      referencesTab.setAttribute('aria-controls', 'references-panel');
      referencesTab.setAttribute('tabindex', '-1'); // Only active tab is in tab order
      
      // Add keyboard listeners for tab
      referencesTab.addEventListener('keydown', (e) => {
        switch (e.key) {
          case 'Enter':
          case ' ':
            e.preventDefault();
            referencesTab.click();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            document.getElementById('explanation-tab').focus();
            document.getElementById('explanation-tab').click();
            break;
          case 'Home':
            e.preventDefault();
            document.getElementById('explanation-tab').focus();
            document.getElementById('explanation-tab').click();
            break;
          case 'End':
            e.preventDefault();
            referencesTab.focus();
            break;
        }
      });
      
      tabsContainer.appendChild(referencesTab);
      
      // Extract references section
      const referencesMatch = fullResult.match(/<br><br><strong>References:<\/strong>.*$/s);
      if (referencesMatch) {
        referencesContent = referencesMatch[0];
        // Remove references from explanation content if needed
        explanationContent = explanationContent.replace(/<br><br><strong>References:<\/strong>.*$/s, "");
      }
    }
    
    // Create content sections for tabs
    const explanationSection = document.createElement("div");
    explanationSection.className = "fact-check-content active";
    explanationSection.dataset.content = "explanation";
    explanationSection.style.padding = "10px 0";
    explanationSection.style.lineHeight = "1.6";
    
    // Add accessibility attributes for tab panel
    explanationSection.setAttribute('role', 'tabpanel');
    explanationSection.id = 'explanation-panel';
    explanationSection.setAttribute('aria-labelledby', 'explanation-tab');
    explanationSection.setAttribute('tabindex', '0'); // Make panel focusable
    
    // Parse markdown in explanation content
    const processedExplanation = MarkdownUtils ? MarkdownUtils.parseMarkdown(explanationContent) : explanationContent;
    explanationSection.innerHTML = processedExplanation;
    
    // Fix any negative numbers display issue
    this._cleanNegativeNumbers(explanationSection);
    
    const referencesSection = document.createElement("div");
    referencesSection.className = "fact-check-content";
    referencesSection.dataset.content = "references";
    referencesSection.style.padding = "10px 0";
    referencesSection.style.display = "none";
    
    // Add accessibility attributes for references panel
    if (hasReferences) {
      referencesSection.setAttribute('role', 'tabpanel');
      referencesSection.id = 'references-panel';
      referencesSection.setAttribute('aria-labelledby', 'references-tab');
      referencesSection.setAttribute('tabindex', '0'); // Make panel focusable
      referencesSection.innerHTML = referencesContent; // References already have HTML
    }
    
    // Add event listeners to tabs
    explanationTab.addEventListener("click", () => {
      this._switchTab('explanation', explanationTab, explanationSection, referencesTab, referencesSection);
    });
    
    if (referencesTab) {
      referencesTab.addEventListener("click", () => {
        this._switchTab('references', explanationTab, explanationSection, referencesTab, referencesSection);
      });
    }
    
    return { tabsContainer, explanationSection, referencesSection };
  }
  
  _switchTab(tabName, explanationTab, explanationSection, referencesTab, referencesSection) {
    this.activeTab = tabName;
    
    // Update tabs
    explanationTab.classList.toggle('active', tabName === 'explanation');
    explanationTab.setAttribute('aria-selected', tabName === 'explanation');
    explanationTab.setAttribute('tabindex', tabName === 'explanation' ? '0' : '-1');
    
    if (referencesTab) {
      referencesTab.classList.toggle('active', tabName === 'references');
      referencesTab.setAttribute('aria-selected', tabName === 'references');
      referencesTab.setAttribute('tabindex', tabName === 'references' ? '0' : '-1');
    }
    
    // Update content sections
    explanationSection.style.display = tabName === 'explanation' ? 'block' : 'none';
    if (tabName === 'explanation') {
      explanationTab.focus();
      
      // Announce tab change to screen readers
      const announcer = document.createElement('div');
      announcer.setAttribute('aria-live', 'polite');
      announcer.className = 'sr-only';
      announcer.textContent = 'Showing explanation tab';
      document.body.appendChild(announcer);
      
      setTimeout(() => {
        document.body.removeChild(announcer);
      }, 1000);
    }
    
    if (referencesSection) {
      referencesSection.style.display = tabName === 'references' ? 'block' : 'none';
      if (tabName === 'references') {
        referencesTab.focus();
        
        // Announce tab change to screen readers
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.className = 'sr-only';
        announcer.textContent = 'Showing references tab';
        document.body.appendChild(announcer);
        
        setTimeout(() => {
          document.body.removeChild(announcer);
        }, 1000);
      }
    }
  }
  
  _cleanNegativeNumbers(container) {
    const allElements = container.querySelectorAll('*');
    allElements.forEach(el => {
      // Find elements with negative numbers as content
      if (/^-\d+$/.test(el.textContent.trim())) {
        el.style.display = 'none';
        // Add aria-hidden to prevent screen readers from reading it
        el.setAttribute('aria-hidden', 'true');
      }
      
      // Find text nodes with negative numbers
      if (el.childNodes) {
        for (let i = 0; i < el.childNodes.length; i++) {
          const node = el.childNodes[i];
          if (node.nodeType === 3 && /^-\d+$/.test(node.textContent.trim())) {
            node.textContent = '';
          }
        }
      }
      
      // Fix negative margins
      if (el.style && el.style.marginTop && el.style.marginTop.includes('-')) {
        el.style.marginTop = '0';
      }
    });
    
    // Also check direct text nodes in the container
    for (let i = 0; i < container.childNodes.length; i++) {
      const node = container.childNodes[i];
      if (node.nodeType === 3 && /^-\d+$/.test(node.textContent.trim())) {
        node.textContent = '';
      }
    }
  }
}