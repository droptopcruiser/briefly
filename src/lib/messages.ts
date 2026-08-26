import { getSupabase } from "./supabase";

/**
 * Conversation log — every message exchanged on a matter, both directions.
 * Inbound is the client's own words (also folded into `submission` for scoring);
 * outbound is what the firm sent via Briefly. Powers the two-sided thread in the
 * Evidence drawer. Best-effort — logging never breaks the main flow.
 */

export type MessageDirection = "inbound" | "outbound";

export interface MatterMessage {
  id: string;
  direction: MessageDirection;
  subject: string | null;
  body: string;
  createdAt: string;
}

export async function addMessage(
  accountId: string | null,
  matterId: string,
  direction: MessageDirection,
  body: string,
  subject: string | null = null,
): Promise<void> {
  const db = getSupabase();
  const text = (body ?? "").trim();
  if (!db || !accountId || !text) return;
  try {
    await db.from("matter_messages").insert({
      account_id: accountId,
      matter_id: matterId,
      direction,
      subject: subject?.trim() || null,
      body: text,
    });
  } catch (err) {
    console.error("addMessage failed:", err);
  }
}

export async function listMessages(matterId: string): Promise<MatterMessage[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("matter_messages")
    .select("id,direction,subject,body,created_at")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: true });
  if (error) {
    // The table may not exist yet (migration pending) — degrade quietly so the
    // drawer falls back to parsing the submission instead of erroring.
    console.error("listMessages failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    direction: r.direction,
    subject: r.subject,
    body: r.body,
    createdAt: r.created_at,
  }));
}
