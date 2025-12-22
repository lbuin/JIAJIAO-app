import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Helper to retrieve environment variables compatible with Vite
const getEnv = (key: string) => {
  // 1. Vite / Modern Standard
  const meta = import.meta as any;
  if (meta.env && meta.env[key]) {
    return meta.env[key];
  }
  // 2. LocalStorage Fallback
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key) || '';
  }
  return '';
};

// Internal client reference
let currentClient: SupabaseClient;

// Initialize client with fallback to prevent crashes
const initClient = (url: string, key: string) => {
  const safeUrl = url || 'https://placeholder.supabase.co';
  const safeKey = key || 'placeholder';
  
  try {
    return createClient(safeUrl, safeKey);
  } catch (e) {
    console.warn("Supabase init failed, using placeholder:", e);
    return createClient('https://placeholder.supabase.co', 'placeholder');
  }
};

// Hardcoded defaults provided by user
const HARDCODED_URL = 'https://kweocrvfibksftnxomtr.supabase.co';
const HARDCODED_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZW9jcnZmaWJrc2Z0bnhvbXRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MjM3MTMsImV4cCI6MjA4MTk5OTcxM30.elzLNdEvyPLE_gsrGJEnacA4t9JlY4qkw2_N6Nt2ufQ';

// Load initial config
// Priority: Env Vars -> LocalStorage -> Hardcoded Defaults
const initialUrl = getEnv('VITE_SUPABASE_URL') || HARDCODED_URL;
const initialKey = getEnv('VITE_SUPABASE_ANON_KEY') || HARDCODED_KEY;

currentClient = initClient(initialUrl, initialKey);

/**
 * Updates the Supabase client instance with new credentials.
 * Saves to localStorage for persistence.
 */
export const setupSupabase = (url: string, key: string) => {
  try {
    localStorage.setItem('VITE_SUPABASE_URL', url);
    localStorage.setItem('VITE_SUPABASE_ANON_KEY', key);
    currentClient = initClient(url, key);
    return true;
  } catch (e) {
    console.error("Failed to setup supabase:", e);
    return false;
  }
};

/**
 * Check if the client has valid (non-placeholder) credentials.
 */
export const isConfigured = () => {
  const url = getEnv('VITE_SUPABASE_URL') || HARDCODED_URL;
  const key = getEnv('VITE_SUPABASE_ANON_KEY') || HARDCODED_KEY;
  return !!(url && key && !url.includes('placeholder.supabase.co'));
};

/**
 * Export a Proxy that always delegates to the `currentClient`.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => {
    return (currentClient as any)[prop];
  }
});