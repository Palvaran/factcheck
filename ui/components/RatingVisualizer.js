// ui/components/RatingVisualizer.js
import { STYLES } from '../../utils/constants.js';

export class RatingVisualizer {
  create(numericRating, confidenceLevel, isDarkMode) {
    const theme = isDarkMode ? STYLES.COLORS.DARK : STYLES.COLORS.LIGHT;
    const gaugeSize = STYLES.SIZES.GAUGE.SIZE;
    const strokeWidth = STYLES.SIZES.GAUGE.STROKE_WIDTH;
    
    // Main container for all elements
    const container = document.createElement("div");
    container.style.margin = "20px 0";
    container.style.position = "relative";
    container.style.height = `${gaugeSize + 40}px`; // Add space for confidence indicator
    
    // Add ARIA attributes for accessibility
    container.setAttribute('role', 'figure');
    
    // Grade/letter calculation
    const letterGrade = MarkdownUtils ? MarkdownUtils.mapRatingToLetter(numericRating) : 
      (numericRating >= 90 ? "A" : numericRating >= 80 ? "B" : numericRating >= 70 ? "C" : 
      numericRating >= 60 ? "D" : "F");
    
    // Set the ARIA label for the entire gauge
    container.setAttribute('aria-label', `Fact check rating: ${numericRating} out of 100, grade ${letterGrade}, ${confidenceLevel} confidence level`);
    
    // Create screen reader text that describes the rating
    const srText = document.createElement('span');
    srText.className = 'sr-only';
    srText.textContent = `Fact check rating: ${numericRating} out of 100, grade ${letterGrade}, ${confidenceLevel} confidence level`;
    srText.style.position = 'absolute';
    srText.style.width = '1px';
    srText.style.height = '1px';
    srText.style.padding = '0';
    srText.style.margin = '-1px';
    srText.style.overflow = 'hidden';
    srText.style.clip = 'rect(0, 0, 0, 0)';
    srText.style.whiteSpace = 'nowrap';
    srText.style.border = '0';
    
    container.appendChild(srText);
    
    // Gauge container with fixed dimensions
    const gaugeContainer = document.createElement("div");
    gaugeContainer.style.width = `${gaugeSize}px`;
    gaugeContainer.style.height = `${gaugeSize}px`;
    gaugeContainer.style.position = "relative";
    gaugeContainer.style.margin = "0 auto";
    
    // Calculate gauge parameters
    const radius = (gaugeSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const ratingPercent = numericRating / 100;
    
    // Create SVG in its own container
    const svgContainer = document.createElement("div");
    svgContainer.style.position = "absolute";
    svgContainer.style.top = "0";
    svgContainer.style.left = "0";
    svgContainer.style.width = "100%";
    svgContainer.style.height = "100%";
    svgContainer.setAttribute('aria-hidden', 'true'); // Hide SVG from screen readers as we describe it elsewhere
    
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${gaugeSize} ${gaugeSize}`);
    
    // Set color based on rating
    let color;
    if (numericRating >= 90) color = theme.SUCCESS;
    else if (numericRating >= 80) color = "#66BB6A";
    else if (numericRating >= 70) color = "#AED581";
    else if (numericRating >= 60) color = theme.WARNING;
    else if (numericRating >= 50) color = "#FFB74D";
    else if (numericRating >= 40) color = "#FF9800";
    else if (numericRating >= 30) color = "#FB8C00";
    else color = theme.ERROR;
    
    // Background circle
    const bgCircle = document.createElementNS(svgNS, "circle");
    bgCircle.setAttribute("cx", gaugeSize / 2);
    bgCircle.setAttribute("cy", gaugeSize / 2);
    bgCircle.setAttribute("r", radius);
    bgCircle.setAttribute("fill", "none");
    bgCircle.setAttribute("stroke", isDarkMode ? "#333" : "#eee");
    bgCircle.setAttribute("stroke-width", strokeWidth);
    
    // Progress circle - using stroke-dasharray and offset
    const progressCircle = document.createElementNS(svgNS, "circle");
    progressCircle.setAttribute("cx", gaugeSize / 2);
    progressCircle.setAttribute("cy", gaugeSize / 2);
    progressCircle.setAttribute("r", radius);
    progressCircle.setAttribute("fill", "none");
    progressCircle.setAttribute("stroke", color);
    progressCircle.setAttribute("stroke-width", strokeWidth);
    progressCircle.setAttribute("stroke-linecap", "round");
    progressCircle.setAttribute("stroke-dasharray", circumference);
    progressCircle.setAttribute("stroke-dashoffset", circumference * (1 - ratingPercent));
    progressCircle.setAttribute("transform", `rotate(-90 ${gaugeSize/2} ${gaugeSize/2})`);
    
    svg.appendChild(bgCircle);
    svg.appendChild(progressCircle);
    svgContainer.appendChild(svg);
    
    // Text container (centered)
    const textContainer = document.createElement("div");
    textContainer.style.position = "absolute";
    textContainer.style.top = "0";
    textContainer.style.left = "0";
    textContainer.style.width = "100%";
    textContainer.style.height = "100%";
    textContainer.style.display = "flex";
    textContainer.style.flexDirection = "column";
    textContainer.style.alignItems = "center";
    textContainer.style.justifyContent = "center";
    textContainer.setAttribute('aria-hidden', 'true'); // Hide from screen readers
    
    // Grade text
    const gradeText = document.createElement("div");
    gradeText.style.fontWeight = "bold";
    gradeText.style.fontSize = "24px";
    gradeText.style.color = color;
    gradeText.textContent = letterGrade;
    
    // Score text
    const scoreText = document.createElement("div");
    scoreText.style.fontSize = "14px";
    scoreText.textContent = numericRating;
    
    textContainer.appendChild(gradeText);
    textContainer.appendChild(scoreText);
    
    // Add SVG and text containers to gauge container
    gaugeContainer.appendChild(svgContainer);
    gaugeContainer.appendChild(textContainer);
    container.appendChild(gaugeContainer);
    
    // Add confidence indicator
    const confidenceIndicator = this._createConfidenceIndicator(confidenceLevel, isDarkMode);
    container.appendChild(confidenceIndicator);
    
    return container;
  }
  
  _createConfidenceIndicator(confidenceLevel, isDarkMode) {
    const confidenceContainer = document.createElement("div");
    confidenceContainer.style.width = "fit-content";
    confidenceContainer.style.margin = "10px auto 0";
    confidenceContainer.style.padding = "3px 8px";
    confidenceContainer.style.borderRadius = "12px";
    confidenceContainer.style.fontSize = "12px";
    
    // Ensure sufficient color contrast for accessibility
    let bgColor, textColor;
    
    if (confidenceLevel === "High") {
      bgColor = isDarkMode ? "#1B5E20" : "#C8E6C9";
      textColor = isDarkMode ? "#FFFFFF" : "#1B5E20";
      confidenceContainer.textContent = "High Confidence";
    } else if (confidenceLevel === "Moderate") {
      bgColor = isDarkMode ? "#F57F17" : "#FFF8E1";
      textColor = isDarkMode ? "#FFFFFF" : "#5D4037";
      confidenceContainer.textContent = "Moderate Confidence";
    } else {
      bgColor = isDarkMode ? "#B71C1C" : "#FFEBEE";
      textColor = isDarkMode ? "#FFFFFF" : "#B71C1C";
      confidenceContainer.textContent = "Low Confidence";
    }
    
    // Apply colors with contrast check
    confidenceContainer.style.backgroundColor = bgColor;
    confidenceContainer.style.color = textColor;
    
    // Add icon for non-text indicator (for color blindness)
    let icon = '';
    if (confidenceLevel === "High") {
      icon = '●'; // Filled circle
    } else if (confidenceLevel === "Moderate") {
      icon = '◐'; // Half-filled circle
    } else {
      icon = '○'; // Empty circle
    }
    
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon + ' ';
    iconSpan.setAttribute('aria-hidden', 'true');
    
    // Insert icon before text
    confidenceContainer.insertBefore(iconSpan, confidenceContainer.firstChild);
    
    return confidenceContainer;
  }
}