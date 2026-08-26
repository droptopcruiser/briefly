/**
 * Reconstruct the client's side of the conversation from a matter's `submission`.
 *
 * A matter accumulates the client's words in one field: the original enquiry,
 * then each reply appended by ingestReply as `--- Client reply (YYYY-MM-DD) ---`.
 * This splits that back into discrete, dated messages so the Evidence drawer can
 * show the actual back-and-forth — not just the facts extracted from it.
 *
 * Only the CLIENT side lives here (that's all `submission` holds); messages the
 * firm sent are tracked as activity events.
 */

export interface ConversationMessage {
  kind: "enquiry" | "reply";
  /** The reply's date (from its marker); null for the enquiry. */
  date: string | null;
  /** The email subject, when the enquiry carried one (inbound email only). */
  subject: string | null;
  text: string;
}

// The exact marker ingestReply writes, with its date captured.
const REPLY_MARKER = /\n\n--- Client reply \((\d{4}-\d{2}-\d{2})\) ---\n/g;

export function parseConversation(submission: string | null | undefined): ConversationMessage[] {
  const s = (submission ?? "").trim();
  if (!s) return [];

  // split() with a capturing group interleaves the captured dates:
  //   [enquiry, date1, reply1, date2, reply2, ...]
  const parts = s.split(REPLY_MARKER);
  const messages: ConversationMessage[] = [];

  // Enquiry — strip a leading "Subject: …" line (inbound email prepends one).
  let enquiry = (parts[0] ?? "").trim();
  let subject: string | null = null;
  const sm = enquiry.match(/^Subject:\s*(.+?)\n\n([\s\S]*)$/);
  if (sm) {
    subject = sm[1].trim() || null;
    enquiry = sm[2].trim();
  }
  if (enquiry) messages.push({ kind: "enquiry", date: null, subject, text: enquiry });

  for (let i = 1; i < parts.length; i += 2) {
    const date = parts[i] ?? null;
    const text = (parts[i + 1] ?? "").trim();
    if (text) messages.push({ kind: "reply", date, subject: null, text });
  }

  return messages;
}
