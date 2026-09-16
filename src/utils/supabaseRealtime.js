// utils/supabaseRealtime.js
//
// Thin browser client used ONLY for realtime subscriptions (anon key —
// RLS does the access control, so this is safe to ship client-side).
// Your REST writes still go through the Express API above, which uses
// the service-role key server-side; this client never writes.
import { createClient } from "@supabase/supabase-js";

export const supabaseRealtime = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { realtime: { params: { eventsPerSecond: 10 } } }
);