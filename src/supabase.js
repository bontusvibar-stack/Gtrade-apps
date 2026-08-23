import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly at startup instead of silently breaking auth calls later.
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project's values."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Must be true for Google (and any OAuth) sign-in to work — this is
    // what lets the client pick up the access token Supabase appends to
    // the URL when it redirects back from Google.
    detectSessionInUrl: true,
  },
});

// Supabase Auth is email/password based. Since the product only ever asks
// for a username, we derive a deterministic, non-deliverable "shadow email"
// from it and use that everywhere we'd otherwise use a real email. The
// actual username a person sees is stored in public.profiles (see
// supabase/functions.sql for how it gets there on signUp).
//
// IMPORTANT: because confirmation emails would be sent to an address nobody
// owns, "Confirm email" MUST be turned off for the Email provider in the
// Supabase dashboard (Authentication -> Providers -> Email). See README.md.
const SHADOW_EMAIL_DOMAIN = "users.noreply.multidevice-sync.local";

export function usernameToEmail(username) {
  const normalized = String(username).trim().toLowerCase();
  return `${normalized}@${SHADOW_EMAIL_DOMAIN}`;
}

export function isValidUsername(username) {
  // 3-24 chars, letters/numbers/underscore, must start with a letter.
  return /^[a-zA-Z][a-zA-Z0-9_]{2,23}$/.test(username);
}
