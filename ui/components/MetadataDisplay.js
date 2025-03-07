// ui/components/MetadataDisplay.js
import { STYLES } from '../../utils/constants.js';

export class MetadataDisplay {
  create(metadata, isDarkMode) {
    const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
    
    const sourceInfoContainer = document.createElement("div");
    sourceInfoContainer.style.marginBottom = "10px";
    sourceInfoContainer.style.fontSize = "12px";
    sourceInfoContainer.style.color = isDarkMode ? theme.SECONDARY_TEXT : theme.SECONDARY_TEXT;
    
    // Add semantic structure for the source metadata
    sourceInfoContainer.setAttribute('role', 'region');
    sourceInfoContainer.setAttribute('aria-label', 'Source information');
    
    if (metadata.title) {
      const titleDiv = document.createElement("div");
      titleDiv.style.fontWeight = "bold";
      titleDiv.textContent = metadata.title;
      titleDiv.setAttribute('aria-label', 'Article title');
      sourceInfoContainer.appendChild(titleDiv);
    }
    
    // Create a more structured approach to metadata for better accessibility
    if (metadata.date || metadata.author) {
      const metaList = document.createElement("dl");
      metaList.style.margin = "5px 0";
      metaList.style.padding = "0";
      metaList.style.display = "flex";
      metaList.style.flexWrap = "wrap";
      metaList.style.gap = "5px 10px";
      
      if (metadata.date) {
        const dateTerm = document.createElement("dt");
        dateTerm.textContent = "Published:";
        dateTerm.style.display = "inline";
        dateTerm.style.marginRight = "5px";
        dateTerm.style.fontWeight = "normal";
        
        const dateDesc = document.createElement("dd");
        dateDesc.textContent = metadata.date;
        dateDesc.style.display = "inline";
        dateDesc.style.margin = "0";
        
        // Create a wrapper for each item
        const dateWrapper = document.createElement("div");
        dateWrapper.appendChild(dateTerm);
        dateWrapper.appendChild(dateDesc);
        metaList.appendChild(dateWrapper);
      }
      
      if (metadata.author) {
        const authorTerm = document.createElement("dt");
        authorTerm.textContent = "By:";
        authorTerm.style.display = "inline";
        authorTerm.style.marginRight = "5px";
        authorTerm.style.fontWeight = "normal";
        
        const authorDesc = document.createElement("dd");
        authorDesc.textContent = metadata.author;
        authorDesc.style.display = "inline";
        authorDesc.style.margin = "0";
        
        // Create a wrapper for each item
        const authorWrapper = document.createElement("div");
        authorWrapper.appendChild(authorTerm);
        authorWrapper.appendChild(authorDesc);
        metaList.appendChild(authorWrapper);
      }
      
      sourceInfoContainer.appendChild(metaList);
    }
    
    return sourceInfoContainer;
  }
}