// utils/requestQueue.js
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
  }
  
  enqueueRequest(requestData) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ data: requestData, resolve, reject });
      this.processQueue();
    });
  }
  
  async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    
    try {
      while (this.requestQueue.length > 0) {
        if (this.rateLimitPerMinute > 0 && this.isRateLimited()) {
          await this.delay(1000);
          continue;
        }
        
        const currentBackoff = this.calculateBackoff();
        if (this.consecutiveErrors > 0) {
          await this.delay(currentBackoff);
        }
        
        const request = this.requestQueue.shift();
        
        try {
          if (this.rateLimitPerMinute > 0) {
            this.recordCall();
          }
          
          const result = await this.processRequestCallback(request.data);
          this.consecutiveErrors = 0;
          request.resolve(result);
        } catch (error) {
          if (error.status === 429) {
            this.consecutiveErrors++;
            this.requestQueue.unshift(request);
            await this.delay(currentBackoff * 2);
            continue;
          }
          
          this.consecutiveErrors++;
          request.reject(error);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }
  
  isRateLimited() {
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter(ts => now - ts < 60000);
    return this.callTimestamps.length >= this.rateLimitPerMinute;
  }
  
  recordCall() {
    this.callTimestamps.push(Date.now());
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