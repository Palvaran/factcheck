// ui/components/BaseOverlayRenderer.js
import { STYLES } from '../../utils/constants.js';

export class BaseOverlayRenderer {
  constructor(overlayId) {
    this.overlayId = overlayId;
  }
  
  create(isDarkMode) {
    const overlay = document.createElement('div');
    overlay.id = this.overlayId;
    
    // Add ARIA attributes for accessibility
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-labelledby', `${this.overlayId}-title`);
    overlay.setAttribute('aria-modal', 'true');
    
    this.applyBaseStyles(overlay, isDarkMode);
    
    // Create header with icon and title
    const header = this.createHeader(isDarkMode);
    overlay.appendChild(header);
    
    // Add ESC key handler to close overlay
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById(this.overlayId)) {
        document.getElementById(this.overlayId).remove();
      }
    });
    
    return overlay;
  }
  
  applyBaseStyles(overlay, isDarkMode) {
    const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
    const sizes = STYLES.SIZES.OVERLAY;
    
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      backgroundColor: theme.BACKGROUND,
      color: theme.TEXT,
      border: `1px solid ${theme.BORDER}`,
      padding: '12px',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: '10000',
      maxWidth: sizes.DEFAULT_WIDTH,
      maxHeight: sizes.DEFAULT_HEIGHT,
      overflowY: 'auto',
      fontSize: '14px',
      lineHeight: '1.5',
      transition: 'all 0.3s ease'
    });
  }
  
  createHeader(isDarkMode, toggleSizeCallback = null) {
    const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
    
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10px',
      borderBottom: isDarkMode ? '1px solid #333' : '1px solid #eee',
      paddingBottom: '8px'
    });

    // Add title with icon
    const titleContainer = document.createElement('div');
    titleContainer.style.display = 'flex';
    titleContainer.style.alignItems = 'center';

    // Create icon
    const iconSpan = document.createElement('span');
    iconSpan.textContent = '🔍✓';
    iconSpan.style.marginRight = '6px';
    iconSpan.style.fontSize = '16px';
    iconSpan.setAttribute('aria-hidden', 'true'); // Hide icon from screen readers

    const titleSpan = document.createElement('span');
    titleSpan.textContent = 'Fact Check';
    titleSpan.style.fontWeight = 'bold';
    titleSpan.id = `${this.overlayId}-title`; // Add ID for aria-labelledby reference

    titleContainer.appendChild(iconSpan);
    titleContainer.appendChild(titleSpan);
    header.appendChild(titleContainer);

    // Add control buttons (expand/collapse, close)
    const controlsContainer = document.createElement("div");
    controlsContainer.style.display = "flex";
    controlsContainer.style.alignItems = "center";
    
    // Add expand/collapse button
    const expandButton = document.createElement("span");
    expandButton.textContent = "□";
    expandButton.title = "Expand/Collapse";
    expandButton.style.cursor = "pointer";
    expandButton.style.marginRight = "10px";
    expandButton.style.fontSize = "16px";
    expandButton.style.color = theme.TEXT;
    
    // Add accessibility attributes and keyboard support
    expandButton.setAttribute('role', 'button');
    expandButton.setAttribute('tabindex', '0');
    expandButton.setAttribute('aria-label', 'Expand or collapse fact check overlay');
    
    expandButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        expandButton.click();
      }
    });
    
    // Add focus styles
    expandButton.addEventListener('focus', () => {
      expandButton.style.outline = `2px solid ${theme.LINK}`;
      expandButton.style.outlineOffset = '2px';
    });
    
    expandButton.addEventListener('blur', () => {
      expandButton.style.outline = 'none';
    });
    
    if (toggleSizeCallback) {
      expandButton.onclick = toggleSizeCallback;
    } else {
      expandButton.onclick = () => {
        const overlay = document.getElementById(this.overlayId);
        if (!overlay) return;
        
        const sizes = STYLES.SIZES.OVERLAY;
        
        if (overlay.dataset.expanded === 'true') {
          overlay.style.maxWidth = sizes.DEFAULT_WIDTH;
          overlay.style.maxHeight = sizes.DEFAULT_HEIGHT;
          overlay.dataset.expanded = 'false';
          expandButton.setAttribute('aria-expanded', 'false');
        } else {
          overlay.style.maxWidth = sizes.EXPANDED_WIDTH;
          overlay.style.maxHeight = sizes.EXPANDED_HEIGHT;
          overlay.dataset.expanded = 'true';
          expandButton.setAttribute('aria-expanded', 'true');
        }
        
        // Announce to screen readers
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.className = 'sr-only';
        announcer.textContent = overlay.dataset.expanded === 'true' ? 'Overlay expanded' : 'Overlay collapsed';
        overlay.appendChild(announcer);
        
        setTimeout(() => {
          overlay.removeChild(announcer);
        }, 1000);
      };
    }
    
    // Create a close button
    const closeButton = document.createElement('span');
    closeButton.textContent = '×';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.fontSize = '20px';
    closeButton.style.color = theme.TEXT;
    
    // Add accessibility attributes and keyboard support
    closeButton.setAttribute('role', 'button');
    closeButton.setAttribute('tabindex', '0');
    closeButton.setAttribute('aria-label', 'Close fact check overlay');
    
    closeButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeButton.click();
      }
    });
    
    // Add focus styles
    closeButton.addEventListener('focus', () => {
      closeButton.style.outline = `2px solid ${theme.LINK}`;
      closeButton.style.outlineOffset = '2px';
    });
    
    closeButton.addEventListener('blur', () => {
      closeButton.style.outline = 'none';
    });
    
    closeButton.onclick = () => {
      const overlay = document.getElementById(this.overlayId);
      if (overlay) {
        overlay.remove();
        
        // Announce to screen readers
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'assertive');
        announcer.className = 'sr-only';
        announcer.textContent = 'Fact check overlay closed';
        document.body.appendChild(announcer);
        
        setTimeout(() => {
          document.body.removeChild(announcer);
        }, 1000);
      }
    };
    
    controlsContainer.appendChild(expandButton);
    controlsContainer.appendChild(closeButton);
    header.appendChild(controlsContainer);

    return header;
  }
}