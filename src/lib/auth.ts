import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase-server";
import type { User } from "@supabase/supabase-js";

/**
 * Data Access Layer for auth. `getAuthUser` reads the signed-in user (cached
 * per request). `requireUser` is the auth gate — call it at the top of any
 * protected page or server action; it redirects unauthenticated users to /login.
 *
 * Signup is open (any Google user may authenticate); access to the app itself is
 * gated by having a provisioned, onboarded account — see `requireAccount` in
 * metering.ts, which is invite-code gated at provisioning time.
 */

export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const requireUser = cache(async (): Promise<User> => {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
});
