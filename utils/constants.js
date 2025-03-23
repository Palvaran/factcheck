// utils/constants.js

// API Configuration - Add Anthropic section
export const API = {
  BRAVE: {
    BASE_URL: 'https://api.search.brave.com/res/v1/web/search',
    RESULTS_COUNT: 2
  },
  OPENAI: {
    BASE_URL: 'https://api.openai.com/v1/chat/completions'
  },
  ANTHROPIC: {
    BASE_URL: 'https://api.anthropic.com/v1/messages',
    VERSION: '2023-06-01'
  }
};

// Request Handling - Add Anthropic backoff and rate limits
export const REQUEST = {
  BACKOFF: {
    BRAVE: {
      INITIAL: 500,
      MAX: 5000,
      FACTOR: 1.5
    },
    OPENAI: {
      INITIAL: 1000,
      MAX: 15000,
      FACTOR: 2
    },
    ANTHROPIC: {
      INITIAL: 1000,
      MAX: 15000,
      FACTOR: 2
    }
  },
  RATE_LIMITS: {
    DEFAULT: 5,
    OPENAI: 5,
    ANTHROPIC: 5 // Same default rate limit as OpenAI
  },
  TIMEOUT: {
    RESPONSE_HANDLER: 30000 // 30 seconds
  },
  RETRY: {
    MAX_ATTEMPTS: 3
  }
};
  
  // UI Styling
  export const STYLES = {
    COLORS: {
      LIGHT: {
        BACKGROUND: '#FFFFFF',
        TEXT: '#000000',
        BORDER: '#ccc',
        ACCENT: '#4285f4',
        SECONDARY_TEXT: '#555',
        CODE_BG: '#f5f5f5',
        LINK: '#1976D2',
        BUTTON_BG: '#f5f5f5',
        SUCCESS: '#2E7D32',
        WARNING: '#FBC02D',
        ERROR: '#E53935'
      },
      DARK: {
        BACKGROUND: '#121212',
        TEXT: '#FFFFFF',
        BORDER: '#444',
        ACCENT: '#4285f4',
        SECONDARY_TEXT: '#bbb',
        CODE_BG: '#333',
        LINK: '#90CAF9',
        BUTTON_BG: '#333',
        SUCCESS: '#2E7D32',
        WARNING: '#FBC02D',
        ERROR: '#E53935'
      }
    },
    SIZES: {
      OVERLAY: {
        DEFAULT_WIDTH: '360px',
        EXPANDED_WIDTH: '600px',
        DEFAULT_HEIGHT: '80vh',
        EXPANDED_HEIGHT: '90vh'
      },
      GAUGE: {
        SIZE: 100,
        STROKE_WIDTH: 10
      }
    },
    RATINGS: {
      GRADES: {
        A_PLUS: { MIN: 97, LETTER: 'A+', COLOR: '#2E7D32', ICON: '✅' },
        A: { MIN: 93, LETTER: 'A', COLOR: '#2E7D32', ICON: '✅' },
        A_MINUS: { MIN: 90, LETTER: 'A-', COLOR: '#2E7D32', ICON: '✅' },
        B_PLUS: { MIN: 87, LETTER: 'B+', COLOR: '#66BB6A', ICON: '✔️' },
        B: { MIN: 83, LETTER: 'B', COLOR: '#66BB6A', ICON: '✔️' },
        B_MINUS: { MIN: 80, LETTER: 'B-', COLOR: '#66BB6A', ICON: '✔️' },
        C_PLUS: { MIN: 77, LETTER: 'C+', COLOR: '#FBC02D', ICON: '⚠️' },
        C: { MIN: 73, LETTER: 'C', COLOR: '#FBC02D', ICON: '⚠️' },
        C_MINUS: { MIN: 70, LETTER: 'C-', COLOR: '#FBC02D', ICON: '⚠️' },
        D_PLUS: { MIN: 67, LETTER: 'D+', COLOR: '#FFB74D', ICON: '⚠️' },
        D: { MIN: 63, LETTER: 'D', COLOR: '#FFB74D', ICON: '⚠️' },
        D_MINUS: { MIN: 60, LETTER: 'D-', COLOR: '#FFB74D', ICON: '⚠️' },
        F: { MIN: 0, LETTER: 'F', COLOR: '#E53935', ICON: '❌' }
      }
    }
  };
  
  // Cache Configuration
  export const CACHE = {
    MAX_SIZE: 100
  };
  
  // Content Limits
  export const CONTENT = {
    MAX_CHARS: 12000,
    CHARS_PER_PAGE: 1500,
    MAX_CLAIMS: 2,
    MAX_CLAIM_LENGTH: 80,
    MAX_TOKENS: {
      DEFAULT: 500,
      CLAIM_EXTRACTION: 300
    }
  };
  
  // Trusted Domains
  export const DOMAINS = {
    CREDIBLE: [
      'reuters.com',
      'apnews.com',
      'bbc.com',
      'npr.org',
      'washingtonpost.com',
      'nytimes.com',
      'wsj.com',
      'economist.com',
      'science.org',
      'nature.com',
      'scientificamerican.com'
    ],
    FACT_CHECK: [
      'factcheck.org',
      'politifact.com',
      'snopes.com',
      'fullfact.org',
      'reuters.com/fact-check',
      'apnews.com/hub/ap-fact-check',
      'factcheck.afp.com'
    ]
  };