// utils/supabase-config.js

/**
 * Supabase configuration settings
 * Contains project URL and anon key for analytics tracking
 */
export const SUPABASE_CONFIG = {
  // Your Supabase project URL (required)
  // Format: https://your-project-id.supabase.co
  // Find this in your Supabase dashboard under Project Settings > API
  PROJECT_URL: 'https://kfslskcyvxvqrgoyaqav.supabase.co',
  
  // Your Supabase anon/public key (required)
  // This is the public API key, not the secret key
  // Find this in your Supabase dashboard under Project Settings > API
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmc2xza2N5dnh2cXJnb3lhcWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0NTc2MjQsImV4cCI6MjA1NzAzMzYyNH0.biy2AFUHYuw79_viprgAd9S5tU9hnF7GWhKc93F-FcM',
  
  // Table names - make sure these match your actual Supabase table names
  TABLES: {
    ANALYTICS: 'fact_check_analytics',
    FEEDBACK: 'user_feedback'
  }
};

// ----------------------------------------------------------------------------
// SQL SETUP REFERENCE
// ----------------------------------------------------------------------------
/*
 * If you need to recreate the tables in Supabase, here's the SQL:
 *
 * CREATE TABLE fact_check_analytics (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 *   domain TEXT,
 *   text_length INTEGER,
 *   model_used TEXT,
 *   rating INTEGER,
 *   search_used BOOLEAN,
 *   client_id TEXT,
 *   session_id TEXT
 * );
 * 
 * CREATE TABLE user_feedback (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   analytics_id UUID REFERENCES fact_check_analytics(id),
 *   rating TEXT,
 *   timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 *
 * -- Enable Row Level Security
 * ALTER TABLE fact_check_analytics ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
 *
 * -- Create insert-only policy for the client
 * CREATE POLICY "Allow anonymous inserts" ON fact_check_analytics FOR INSERT WITH CHECK (true);
 * CREATE POLICY "Allow anonymous inserts" ON user_feedback FOR INSERT WITH CHECK (true);
 */