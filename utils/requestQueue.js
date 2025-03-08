// utils/requestQueue.js - Updated with better rate limiting
export class RequestQueueManager {
  constructor(options = {}) {
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.consecutiveErrors = 0;
    
    // Configure backoff settings
    this.baseBackoff = options.baseBackoff || 1000;
    this.maxBackoff = options.maxBackoff || 15000;
    this.backoffFactor = options.backoffFactor || 2;
    
    // Rate limiting
    this.rateLimitPerMinute = options.rateLimitPerMinute || 0;
    this.callTimestamps = [];
    
    // Request processor callback
    this.processRequestCallback = options.processRequestCallback;
    
    console.log(`RequestQueueManager initialized with settings:`, {
      baseBackoff: this.baseBackoff,
      maxBackoff: this.maxBackoff,
      backoffFactor: this.backoffFactor,
      rateLimitPerMinute: this.rateLimitPerMinute
    });
  }
  
  enqueueRequest(requestData) {
    console.log(`Request enqueued: ${JSON.stringify(requestData).substring(0, 50)}...`);
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ data: requestData, resolve, reject });
      this.processQueue();
    });
  }
  
  async processQueue() {
    if (this.isProcessingQueue) {
      console.log("Queue already being processed, waiting...");
      return;
    }
    
    this.isProcessingQueue = true;
    console.log(`Processing queue with ${this.requestQueue.length} pending requests`);
    
    try {
      while (this.requestQueue.length > 0) {
        // Check rate limiting
        if (this.rateLimitPerMinute > 0 && this.isRateLimited()) {
          console.log(`Rate limited (${this.callTimestamps.length}/${this.rateLimitPerMinute} per minute). Waiting 1 second...`);
          await this.delay(1000);
          continue;
        }
        
        // Apply backoff if we've had errors
        const currentBackoff = this.calculateBackoff();
        if (this.consecutiveErrors > 0) {
          console.log(`Applying backoff of ${currentBackoff}ms after ${this.consecutiveErrors} consecutive errors`);
          await this.delay(currentBackoff);
        }
        
        // Get the next request
        const request = this.requestQueue.shift();
        console.log(`Processing request: ${JSON.stringify(request.data).substring(0, 50)}...`);
        
        try {
          // Record this call for rate limiting
          if (this.rateLimitPerMinute > 0) {
            this.recordCall();
          }
          
          const result = await this.processRequestCallback(request.data);
          this.consecutiveErrors = 0;
          request.resolve(result);
        } catch (error) {
          console.error("Error processing request:", error);
          
          // Special handling for rate limit errors (429)
          if (error.status === 429) {
            this.consecutiveErrors++;
            console.log(`Rate limit error (429) detected. Adding request back to queue.`);
            this.requestQueue.unshift(request);
            
            // Use Retry-After header if available or default backoff
            const retryDelay = error.retryAfter ? (parseInt(error.retryAfter) * 1000) : (currentBackoff * 2);
            console.log(`Waiting ${retryDelay}ms before retry...`);
            await this.delay(retryDelay);
            continue;
          }
          
          this.consecutiveErrors++;
          request.reject(error);
        }
      }
    } finally {
      console.log("Queue processing completed");
      this.isProcessingQueue = false;
      
      // If new items were added while processing, start processing again
      if (this.requestQueue.length > 0) {
        console.log(`Found ${this.requestQueue.length} new items in queue, restarting processing`);
        this.processQueue();
      }
    }
  }
  
  isRateLimited() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Keep only timestamps from the last minute
    this.callTimestamps = this.callTimestamps.filter(ts => ts > oneMinuteAgo);
    
    // Check if we're at the limit
    return this.callTimestamps.length >= this.rateLimitPerMinute;
  }
  
  recordCall() {
    this.callTimestamps.push(Date.now());
    console.log(`Call recorded. Recent calls in last minute: ${this.callTimestamps.length}/${this.rateLimitPerMinute}`);
  }
  
  calculateBackoff() {
    return Math.min(
      this.baseBackoff * Math.pow(this.backoffFactor, this.consecutiveErrors),
      this.maxBackoff
    );
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}