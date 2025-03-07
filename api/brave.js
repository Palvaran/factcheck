// api/brave.js
import { RequestQueueManager } from '../utils/requestQueue.js';
import { DOMAINS, REQUEST, API, CONTENT } from '../utils/constants.js';

export class BraveSearchService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.CREDIBLE_DOMAINS = DOMAINS.CREDIBLE;
    this.FACT_CHECK_DOMAINS = DOMAINS.FACT_CHECK;
    
    // Initialize request queue manager
    this.requestQueue = new RequestQueueManager({
      baseBackoff: REQUEST.BACKOFF.BRAVE.INITIAL,
      maxBackoff: REQUEST.BACKOFF.BRAVE.MAX,
      backoffFactor: REQUEST.BACKOFF.BRAVE.FACTOR,
      processRequestCallback: this._executeSearch.bind(this)
    });
  }
  
  async _executeSearch(query) {
    // Execute the search
    const searchUrl = `${API.BRAVE.BASE_URL}?q=${encodeURIComponent(query)}&count=${API.BRAVE.RESULTS_COUNT}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': this.apiKey
      }
    });
    
    if (!response.ok) {
      const error = new Error(`Brave search error: ${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    
    // Request succeeded, parse the data
    const searchData = await response.json();
    
    // Filter and organize results
    let results = [];
    
    // Process web results
    if (searchData.web && Array.isArray(searchData.web.results)) {
      results = [...results, ...searchData.web.results.map(result => ({
        title: result.title || 'No title',
        description: result.description || result.snippet || '',
        url: result.url,
        type: 'web',
        domain: new URL(result.url).hostname,
        date: result.published_date || ''
      }))];
    }
    
    // Process news results if available
    if (searchData.news && Array.isArray(searchData.news.results)) {
      results = [...results, ...searchData.news.results.map(result => ({
        title: result.title || 'No title',
        description: result.description || '',
        url: result.url,
        type: 'news',
        domain: new URL(result.url).hostname,
        date: result.published_date || ''
      }))];
    }
    
    return results;
  }
  
  // Enqueue a search request
  enqueueSearch(query) {
    return this.requestQueue.enqueueRequest(query);
  }

  async search(queryText) {
    try {
      // 1. Generate shorter, more focused search queries
      const claims = queryText.split(/;|\./).filter(claim => claim.trim().length > 10);
      const shortQueries = claims.map(claim => {
        // Keep only the first N characters of each claim
        const sanitizedClaim = claim.trim().replace(/[^\w\s.,'"]/g, ' ').trim();
        return sanitizedClaim.substring(0, CONTENT.MAX_CLAIM_LENGTH);
      }).slice(0, CONTENT.MAX_CLAIMS); // Only use first N claims max
      
      let allResults = [];
      let referencesHTML = "";
      
      // 2. Execute all searches in parallel with rate limiting
      try {
        const searchPromises = shortQueries.map(query => this.enqueueSearch(query));
        const searchResults = await Promise.allSettled(searchPromises);
        
        // Process successful results
        searchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            allResults = [...allResults, ...result.value];
          }
        });
      } catch (error) {
        console.error("Error executing searches:", error);
      }
      
      // Handle no results case
      if (allResults.length === 0) {
        return { 
          searchContext: "", 
          referencesHTML: "<br><br><strong>References:</strong><br>No references available." 
        };
      }
      
      // Deduplicate results by URL
      const uniqueResults = [...new Map(allResults.map(item => [item.url, item])).values()];
      
      // Sort by credibility and recency
      uniqueResults.sort((a, b) => {
        // Prioritize fact-checking sites
        const aIsFact = this.FACT_CHECK_DOMAINS.some(domain => a.domain.includes(domain));
        const bIsFact = this.FACT_CHECK_DOMAINS.some(domain => b.domain.includes(domain));
        
        if (aIsFact && !bIsFact) return -1;
        if (!aIsFact && bIsFact) return 1;
        
        // Then sort by date if available
        if (a.date && b.date) {
          return new Date(b.date) - new Date(a.date);
        }
        
        return 0;
      });
      
      // Build search context for the prompt
      let searchContext = uniqueResults
        .map(result => {
          let context = `Source: ${result.title} (${result.domain})`;
          if (result.date) context += ` [${result.date}]`;
          context += `\nContent: ${result.description}`;
          return context;
        })
        .join("\n\n");
      
      // Build HTML references
      if (uniqueResults.length > 0) {
        referencesHTML += "<br><br><strong>References:</strong><br>";
        uniqueResults.forEach(result => {
          const sourceType = result.type === 'news' ? '📰' : '🔍';
          if (this.FACT_CHECK_DOMAINS.some(domain => result.domain.includes(domain))) {
            referencesHTML += `${sourceType} <a href="${result.url}" target="_blank" style="color: inherit;"><strong>Fact-Check:</strong> ${result.title}</a><br>`;
          } else {
            referencesHTML += `${sourceType} <a href="${result.url}" target="_blank" style="color: inherit;">${result.title}</a><br>`;
          }
        });
      } else {
        referencesHTML = "<br><br><strong>References:</strong><br>No references available.";
      }
      
      return { searchContext, referencesHTML };
    } catch (error) {
      console.error("Error in BraveSearchService:", error);
      return { 
        searchContext: "", 
        referencesHTML: "<br><br><strong>References:</strong><br>Error fetching references." 
      };
    }
  }
}