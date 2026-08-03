import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase-server";
import type { User } from "@supabase/supabase-js";

/**
 * Data Access Layer for auth. `getAuthUser` reads the signed-in user (cached
 * per request). `requireUser` is the gate — call it at the top of any protected
 * page or server action; it redirects unauthenticated users to /login and
 * authenticated-but-not-allowlisted users to /access-denied.
 *
 * The allowlist (ALLOWED_EMAILS, comma-separated) keeps the app locked to the
 * professional(s) even though anyone can technically authenticate with Google.
 * If ALLOWED_EMAILS is unset, any authenticated user is allowed (dev fallback).
 */

export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

function allowlist(): string[] | null {
  const raw = process.env.ALLOWED_EMAILS?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string | null | undefined): boolean {
  const list = allowlist();
  if (!list) return true;
  return Boolean(email && list.includes(email.toLowerCase()));
}

export const requireUser = cache(async (): Promise<User> => {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (!isAllowed(user.email)) redirect("/access-denied");
  return user;
});
