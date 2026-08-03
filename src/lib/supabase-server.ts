import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase auth client bound to the request cookies (Next 16:
 * cookies() is async). Used by the Data Access Layer to read the signed-in
 * user. Writing cookies from a Server Component throws — that's fine, the proxy
 * (proxy.ts) is what refreshes the session cookie on each request.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore; the proxy handles refresh.
          }
        },
      },
    },
  );
}
