import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Helper to retrieve environment variables
const getEnv = (key: string) => {
  let val = '';
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      val = (import.meta as any).env[key];
    }
  } catch (e) {}

  if (!val) {
    try {
      if (typeof process !== 'undefined' && process.env && process.env[key]) {
        val = process.env[key];
      }
    } catch (e) {}
  }

  if (!val) {
    try {
      if (typeof window !== 'undefined') {
        val = localStorage.getItem(key) || '';
      }
    } catch (e) {}
  }

  return val ? val.trim() : '';
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

// Load initial config
const initialUrl = getEnv('VITE_SUPABASE_URL');
const initialKey = getEnv('VITE_SUPABASE_ANON_KEY');

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
  // We check the localStorage or the current client source
  const url = getEnv('VITE_SUPABASE_URL');
  const key = getEnv('VITE_SUPABASE_ANON_KEY');
  return !!(url && key && !url.includes('placeholder.supabase.co'));
};

/**
 * Export a Proxy that always delegates to the `currentClient`.
 * This allows other files to import `supabase` once and have it work
 * even after we call `setupSupabase`.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => {
    return (currentClient as any)[prop];
  }
});
