// api/brave.js - Updated with proper rate limiting for Free plan
import { RequestQueueManager } from '../utils/requestQueue.js';
import { DOMAINS, REQUEST, API, CONTENT } from '../utils/constants.js';

export class BraveSearchService {
  constructor(apiKey) {
    console.log(`BraveSearchService initialized with API key: ${apiKey ? 'PRESENT' : 'MISSING'}`);
    if (!apiKey || apiKey.trim() === '') {
      console.error('BraveSearchService initialized with empty or invalid API key');
    }
    
    this.apiKey = apiKey;
    this.CREDIBLE_DOMAINS = DOMAINS.CREDIBLE;
    this.FACT_CHECK_DOMAINS = DOMAINS.FACT_CHECK;
    
    // IMPORTANT: Override the backoff settings for Brave Free tier (1 req/sec limit)
    const braveRequestSettings = {
      baseBackoff: 1000,       // 1 second minimum between requests
      maxBackoff: 10000,       // Up to 10 seconds for retries
      backoffFactor: 2,        // Exponential backoff
      rateLimitPerMinute: 60,  // Maximum 60 requests per minute (1 per second)
      processRequestCallback: this._executeSearch.bind(this)
    };
    
    // Initialize request queue manager with conservative rate limiting
    this.requestQueue = new RequestQueueManager(braveRequestSettings);
  }
  
  async _executeSearch(query) {
    try {
      console.log(`Executing Brave search with query: "${query}"`);
      
      // Validate API key before making the request
      if (!this.apiKey || this.apiKey.trim() === '') {
        throw new Error('Missing or invalid Brave API key');
      }
      
      // Execute the search
      const searchUrl = `${API.BRAVE.BASE_URL}?q=${encodeURIComponent(query)}&count=${API.BRAVE.RESULTS_COUNT}`;
      
      console.log(`Making request to: ${API.BRAVE.BASE_URL} with query length: ${query.length}`);
      
      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey
        }
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Brave search error: ${response.status} ${response.statusText}`);
        console.error(`Error details: ${errorBody}`);
        
        // Handle rate limiting specifically
        if (response.status === 429) {
          // Delay before retrying based on the Retry-After header, or default to 1.5 seconds
          const retryAfter = response.headers.get('Retry-After') || 1.5;
          const delayMs = parseInt(retryAfter) * 1000;
          console.log(`Rate limited. Waiting ${delayMs}ms before retry...`);
          
          // Add artificial delay
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          // Throw specific rate limit error to be handled
          const error = new Error("Rate limit exceeded");
          error.status = 429;
          error.retryAfter = retryAfter;
          throw error;
        }
        
        const error = new Error(`Brave search error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.details = errorBody;
        throw error;
      }
      
      // Request succeeded, parse the data
      const searchData = await response.json();
      console.log(`Brave search successful, received data:`, 
                  searchData.web ? `${searchData.web.results?.length || 0} web results` : 'No web results',
                  searchData.news ? `${searchData.news.results?.length || 0} news results` : 'No news results');
      
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
      
      console.log(`Processed ${results.length} total results from Brave search`);
      
      // Add a mandatory delay before returning to ensure we don't exceed rate limits
      // This ensures at least 1 second between requests for the Free plan
      await new Promise(resolve => setTimeout(resolve, 1010)); // Slightly over 1 second
      
      return results;
    } catch (error) {
      console.error(`Error in _executeSearch:`, error);
      throw error; // Re-throw to be handled by the calling code
    }
  }
  
  // Test the API key to ensure it's valid
  async testApiKey() {
    try {
      // Use a simple test query
      const testResults = await this._executeSearch('test');
      return { valid: true, results: testResults.length };
    } catch (error) {
      console.error('API key test failed:', error);
      return { valid: false, error: error.message };
    }
  }
  
  // Enqueue a search request
  enqueueSearch(query) {
    console.log(`Enqueueing search for query: "${query}"`);
    return this.requestQueue.enqueueRequest(query);
  }

  async search(queryText) {
    console.log(`BraveSearchService.search called with text length: ${queryText?.length || 0}`);
    
    try {
      // Verify API key is available
      if (!this.apiKey) {
        console.error("No Brave API key available in search method!");
        return { 
          searchContext: "", 
          referencesHTML: "<br><br><strong>References:</strong><br>No references available (API key missing)." 
        };
      }
      
      // 1. Generate shorter, more focused search queries
      console.log("Generating search queries from text");
      const claims = queryText.split(/;|\./).filter(claim => claim.trim().length > 10);
      console.log(`Found ${claims.length} potential claims in text`);
      
      const shortQueries = claims.map(claim => {
        // Keep only the first N characters of each claim
        const sanitizedClaim = claim.trim().replace(/[^\w\s.,'"]/g, ' ').trim();
        return sanitizedClaim.substring(0, CONTENT.MAX_CLAIM_LENGTH);
      }).slice(0, CONTENT.MAX_CLAIMS); // Only use first N claims max
      
      console.log(`Generated ${shortQueries.length} search queries:`, shortQueries);
      
      let allResults = [];
      let referencesHTML = "";
      
      // 2. Execute searches SEQUENTIALLY to avoid rate limits instead of in parallel
      try {
        console.log("Executing search queries SEQUENTIALLY to avoid rate limits");
        
        // Process each query one at a time instead of in parallel
        for (let i = 0; i < shortQueries.length; i++) {
          const query = shortQueries[i];
          console.log(`Processing query ${i+1}/${shortQueries.length}: "${query}"`);
          
          try {
            // Use the queue manager which enforces rate limits
            const results = await this.enqueueSearch(query);
            console.log(`Query ${i+1} successful: ${results.length} results`);
            allResults = [...allResults, ...results];
          } catch (searchError) {
            console.error(`Query ${i+1} failed:`, searchError);
            // Continue with other queries even if one fails
          }
          
          // For safety, add a small delay between queries
          if (i < shortQueries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
      } catch (error) {
        console.error("Error executing searches:", error);
      }
      
      // Handle no results case
      if (allResults.length === 0) {
        console.warn("No search results found");
        return { 
          searchContext: "", 
          referencesHTML: "<br><br><strong>References:</strong><br>No references available (no results found)." 
        };
      }
      
      // Deduplicate results by URL
      const uniqueResults = [...new Map(allResults.map(item => [item.url, item])).values()];
      console.log(`After deduplication: ${uniqueResults.length} unique results`);
      
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
        
        console.log("Generated references HTML with links to search results");
      } else {
        referencesHTML = "<br><br><strong>References:</strong><br>No references available (results processing error).";
        console.warn("No references generated despite having results");
      }
      
      return { searchContext, referencesHTML };
    } catch (error) {
      console.error("Error in BraveSearchService.search:", error);
      return { 
        searchContext: "", 
        referencesHTML: `<br><br><strong>References:</strong><br>Error fetching references. Details: ${error.message}` 
      };
    }
  }
}