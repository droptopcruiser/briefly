import { getSupabase } from "./supabase";

/**
 * Waitlist capture for people who want in but don't have an invite code yet.
 * Idempotent: a repeat email is treated as success (no duplicate rows).
 */
export async function addToWaitlist(email: string, note: string | null): Promise<void> {
  const db = getSupabase();
  if (!db) return; // no-op without a database (local demo)

  const { error } = await db
    .from("waitlist")
    .insert({ email: email.toLowerCase(), note: note?.trim() || null });

  // 23505 = unique violation => already on the list, which is fine.
  if (error && error.code !== "23505") {
    throw new Error(`addToWaitlist: ${error.message}`);
  }
}
