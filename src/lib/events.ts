import { getSupabase } from "./supabase";

/**
 * Matter activity trail. Events power the lifecycle timeline on the matter view
 * ("Client replied · readiness 83→96 · Ready for review"). Logging is best-effort
 * — a failure here never breaks the main flow.
 */

export type MatterEventType =
  | "created"
  | "client_replied"
  | "readiness_changed"
  | "became_ready"
  | "approved"
  | "sent"
  | "assigned"
  | "nudge"
  | "brief_created"
  | "brief_refreshed"
  | "brief_approved"
  | "brief_stale"
  | "reviewed"
  | "consultation_set"
  | "packet_created"
  | "packet_refreshed"
  | "packet_reviewed"
  | "completed";

export interface MatterEvent {
  id: string;
  type: MatterEventType;
  detail: string | null;
  createdAt: string;
}

export async function addEvent(
  accountId: string | null,
  matterId: string,
  type: MatterEventType,
  detail: string | null = null,
): Promise<void> {
  const db = getSupabase();
  if (!db || !accountId) return;
  try {
    await db.from("matter_events").insert({
      account_id: accountId,
      matter_id: matterId,
      type,
      detail,
    });
  } catch (err) {
    console.error("addEvent failed:", err);
  }
}

export async function listEvents(matterId: string): Promise<MatterEvent[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("matter_events")
    .select("id,type,detail,created_at")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listEvents: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}
