import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local\n' +
    'Get these from your Supabase project: https://supabase.com/dashboard → Settings → API'
  );
}

// Use sessionStorage for auth so each browser window/tab maintains its own
// independent session. Without this, the JWT is stored in localStorage (shared
// across all windows), causing the last-logged-in user to "take over" every tab.
export const supabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
        storageKey: 'sb-auth-token',
      },
    })
  : null;
