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

// Model definitions for AI providers
export const MODELS = {
  OPENAI: {
    DEFAULT: 'gpt-4o-mini',
    FAST: 'gpt-4o-mini',
    STANDARD: 'gpt-4o-mini',
    ADVANCED: 'gpt-4o',
    EXTRACTION: 'gpt-4o-mini'
  },
  ANTHROPIC: {
    DEFAULT: 'claude-3-5-haiku-latest',
    FAST: 'claude-3-5-haiku-latest',
    STANDARD: 'claude-3-7-sonnet-latest',
    ADVANCED: 'claude-3-opus-latest',
    EXTRACTION: 'claude-3-5-haiku-latest'
  },
  // Mapping from generic model names to provider-specific models
  GENERIC: {
    'hybrid': {
      'openai': 'gpt-4o',
      'anthropic': 'claude-3-opus-latest'
    },
    'o3-mini': {
      'openai': 'gpt-4o-mini',
      'anthropic': 'claude-3-7-sonnet-latest'
    },
    'gpt-4o-mini': {
      'openai': 'gpt-4o-mini',
      'anthropic': 'claude-3-5-haiku-latest'
    }
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
  
  // Feature Flags for enabling/disabling functionality
  export const FEATURES = {
    // AI Model Features
    MULTI_MODEL_CHECK: true,       // Use multiple models for fact checking
    MODEL_AUTO_SELECTION: true,    // Automatically select optimal model based on content
    
    // Search Features
    BRAVE_SEARCH: true,            // Use Brave Search for context
    SEARCH_QUERY_OPTIMIZATION: true, // Generate optimized search queries
    
    // Content Extraction Features
    CONTENT_EXTRACTION: {
      READABILITY: true,           // Use Readability for article extraction
      PARAGRAPH_ANALYSIS: true,    // Use paragraph analysis as fallback
      INTELLIGENT_SAMPLING: true,  // Use intelligent sampling for large documents
      TEXT_COMPLEXITY_ANALYSIS: true // Analyze text complexity for model selection
    },
    
    // Performance Features
    CACHING: {
      ENABLED: true,               // Enable caching of API responses
      PERSIST_TO_STORAGE: true,    // Persist cache to chrome.storage
      TTL_HOURS: 24                // Cache time-to-live in hours
    },
    
    // Error Handling
    ERROR_HANDLING: {
      RETRY_MECHANISM: true,       // Enable retry with exponential backoff
      FALLBACK_MODELS: true,       // Fall back to simpler models on error
      ERROR_TELEMETRY: true        // Send anonymous error telemetry
    },
    
    // UI Features
    UI: {
      PROGRESS_INDICATORS: true,   // Show detailed progress indicators
      DARK_MODE_DETECTION: true,   // Auto-detect dark mode
      ANIMATED_TRANSITIONS: true    // Use animations for smoother UX
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
      'scientificamerican.com',
      // Additional credible news sources
      'theguardian.com',
      'bloomberg.com',
      'ft.com', // Financial Times
      'theatlantic.com',
      'newyorker.com',
      'time.com',
      'pbs.org',
      'cnn.com',
      'cbsnews.com',
      'abcnews.go.com',
      'nbcnews.com',
      'thehill.com',
      'politico.com',
      // Academic and research sources
      'pnas.org', // Proceedings of the National Academy of Sciences
      'sciencedirect.com',
      'nih.gov', // National Institutes of Health
      'cdc.gov', // Centers for Disease Control
      'who.int', // World Health Organization
      'un.org', // United Nations
      'worldbank.org',
      'imf.org' // International Monetary Fund
    ],
    FACT_CHECK: [
      'factcheck.org',
      'politifact.com',
      'snopes.com',
      'fullfact.org',
      'reuters.com/fact-check',
      'apnews.com/hub/ap-fact-check',
      // Additional fact-checking sites
      'factchecker.washingtonpost.com',
      'checkyourfact.com',
      'truthorfiction.com',
      'factcheck.afp.com',
      'leadstories.com',
      'mediabiasfactcheck.com',
      'poynter.org/ifcn', // International Fact-Checking Network
      'bbc.com/news/reality_check',
      'channel4.com/news/factcheck',
      'vox.com/pages/facts-matter',
      'factcrescendo.com',
      'hoax-slayer.net',
      'verafiles.org',
      'africacheck.org'
    ]
  };