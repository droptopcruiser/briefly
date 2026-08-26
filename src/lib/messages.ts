import { getSupabase } from "./supabase";

/**
 * Conversation log — every message exchanged on a matter, both directions.
 * Inbound is the client's own words (also folded into `submission` for scoring);
 * outbound is what the firm sent via Briefly. Powers the two-sided thread in the
 * Evidence drawer. Best-effort — logging never breaks the main flow.
 */

export type MessageDirection = "inbound" | "outbound";

/** A file that arrived with a message, linked to its stored document. */
export interface MessageAttachment {
  fileName: string;
  docId: string;
}

export interface MatterMessage {
  id: string;
  direction: MessageDirection;
  subject: string | null;
  body: string;
  attachments: MessageAttachment[];
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
  type Row = {
    id: string;
    direction: MessageDirection;
    subject: string | null;
    body: string;
    attachments?: unknown;
    created_at: string;
  };

  let rows: Row[] = [];
  const full = await db
    .from("matter_messages")
    .select("id,direction,subject,body,attachments,created_at")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: true });
  if (full.error) {
    // The attachments column may not exist yet (migration pending) — retry without
    // it rather than dropping the whole (two-sided) thread.
    const lite = await db
      .from("matter_messages")
      .select("id,direction,subject,body,created_at")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: true });
    if (lite.error) {
      // The table itself may not exist — degrade quietly so the drawer falls back
      // to parsing the submission instead of erroring.
      console.error("listMessages failed:", lite.error.message);
      return [];
    }
    rows = (lite.data ?? []) as Row[];
  } else {
    rows = (full.data ?? []) as Row[];
  }
  return rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    subject: r.subject,
    body: r.body,
    attachments: Array.isArray(r.attachments) ? (r.attachments as MessageAttachment[]) : [],
    createdAt: r.created_at,
  }));
}

/**
 * Link stored files to the matter's most recent inbound message — the one that
 * just arrived carrying them. Called by the inbound webhook after the attachments
 * are stored, so the conversation bubble can show "📎 Contract.pdf".
 */
export async function attachToLatestInbound(
  matterId: string,
  attachments: MessageAttachment[],
): Promise<void> {
  const db = getSupabase();
  if (!db || attachments.length === 0) return;
  try {
    const { data } = await db
      .from("matter_messages")
      .select("id")
      .eq("matter_id", matterId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.id) return;
    await db.from("matter_messages").update({ attachments }).eq("id", data.id);
  } catch (err) {
    console.error("attachToLatestInbound failed:", err);
  }
}
