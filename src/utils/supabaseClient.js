// utils/supabaseClient.js
//
// Phone OTP is handled directly against Supabase Auth from the browser —
// this is the standard, recommended pattern (the anon key is meant to be
// public; Row Level Security is what actually protects your data). It's
// also the fastest path: no extra hop through Express for the part of the
// flow that's most latency-sensitive.
//
// Requires an SMS provider (Twilio, MessageBird, Vonage, or TextLocal)
// configured under Authentication -> Providers -> Phone in your Supabase
// project. Supabase generates, hashes, expires, and rate-limits the OTP
// for you — none of that needs to be built by hand.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in dev rather than silently making broken requests.
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env file."
  );
}

// console.log("Supabase URL:", supabaseUrl, "Key present:", !!supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});