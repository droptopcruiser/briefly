import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key.
 *
 * Client submissions are firm data (PRD §8, Privacy): the service role bypasses
 * RLS and must NEVER be exposed to the browser. Only import this from server
 * code (server actions, route handlers).
 */

let supabase: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (supabase !== undefined) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  supabase =
    url && key
      ? createClient(url, key, { auth: { persistSession: false } })
      : null;
  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}
