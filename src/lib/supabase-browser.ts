import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for authentication (Google OAuth, sign-out).
 * Uses the PUBLISHABLE (anon) key — safe to expose to the browser. This is the
 * auth surface only; all matter data is read/written server-side with the
 * service-role client in supabase.ts.
 */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
