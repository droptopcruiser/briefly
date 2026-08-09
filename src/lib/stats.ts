import { getSupabase } from "./supabase";
import { monthStartISO } from "./month";

/**
 * Account activity stats for the dashboard overview. "Hours saved" is an
 * estimate: manual intake for one matter — reading the enquiry, structuring the
 * facts, working out what's missing, drafting the chase — is conservatively
 * ~15 minutes of a professional's time that Briefly does instead.
 */
export const MINUTES_SAVED_PER_MATTER = 15;

export interface MonthStats {
  matters: number;
  readyForYou: number;
  awaitingClient: number;
  hoursSaved: number;
}

export async function getMonthStats(
  accountId: string,
  timezone?: string | null,
): Promise<MonthStats | null> {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from("matters")
    .select("status")
    .eq("account_id", accountId)
    .gte("created_at", monthStartISO(timezone));
  if (error) throw new Error(`getMonthStats: ${error.message}`);

  const rows = (data ?? []) as { status: string }[];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const matters = rows.length;

  return {
    matters,
    readyForYou: count("ready_for_you"),
    awaitingClient: count("awaiting_client"),
    hoursSaved: Math.round(((matters * MINUTES_SAVED_PER_MATTER) / 60) * 10) / 10,
  };
}
