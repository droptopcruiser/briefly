import { getSupabase } from "./supabase";

/**
 * Account activity stats for the dashboard overview. "Hours saved" is an
 * estimate: manual intake for one matter — reading the enquiry, structuring the
 * facts, working out what's missing, drafting the chase — is conservatively
 * ~15 minutes of a professional's time that Briefly does instead.
 */
export const MINUTES_SAVED_PER_MATTER = 15;

export interface MonthStats {
  matters: number;
  ready: number;
  needsInfo: number;
  approved: number;
  hoursSaved: number;
}

function monthStartISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getMonthStats(accountId: string): Promise<MonthStats | null> {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from("matters")
    .select("status")
    .eq("account_id", accountId)
    .gte("created_at", monthStartISO());
  if (error) throw new Error(`getMonthStats: ${error.message}`);

  const rows = (data ?? []) as { status: string }[];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const matters = rows.length;

  return {
    matters,
    ready: count("ready_for_review"),
    needsInfo: count("needs_info"),
    approved: count("approved"),
    hoursSaved: Math.round(((matters * MINUTES_SAVED_PER_MATTER) / 60) * 10) / 10,
  };
}
