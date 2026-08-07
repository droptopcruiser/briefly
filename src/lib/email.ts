/**
 * Outbound email — the "act" step of the pipeline.
 *
 * Briefly never sends on its own: a human approves each drafted follow-up (the
 * gate), and only then do we send it to the client. We reuse Postmark — already
 * wired for inbound — via its plain HTTP API, so there's no extra SDK or second
 * provider to maintain.
 *
 * Configure with:
 *   POSTMARK_SERVER_TOKEN — a Postmark *Server* API token (distinct from the
 *                           inbound webhook secret).
 *   MAIL_FROM             — a verified sender signature or domain address,
 *                           e.g. "Briefly <luke@brieflyhub.app>".
 *   MAIL_REPLY_TO         — optional Reply-To (e.g. the firm's own address).
 *
 * When the token or from-address is missing, isEmailConfigured() reports false
 * and the UI falls back to letting the professional send from their own client.
 */

const POSTMARK_ENDPOINT = "https://api.postmarkapp.com/email";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.MAIL_FROM);
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  /** Overrides MAIL_REPLY_TO for this message. */
  replyTo?: string;
}

/**
 * Send one plain-text email through Postmark. Resolves on success; throws with a
 * human-readable message (Postmark's own, when available) on failure.
 */
export async function sendEmail({ to, subject, body, replyTo }: SendEmailInput): Promise<void> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.MAIL_FROM;
  if (!token || !from) {
    throw new Error("Email not configured (POSTMARK_SERVER_TOKEN / MAIL_FROM).");
  }

  const res = await fetch(POSTMARK_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: subject,
      TextBody: body,
      ReplyTo: replyTo ?? process.env.MAIL_REPLY_TO ?? undefined,
      MessageStream: "outbound",
    }),
  });

  // Postmark returns HTTP 200 with ErrorCode 0 on success, or a 4xx with a
  // { ErrorCode, Message } body on failure (e.g. unverified sender signature).
  const payload = (await res.json().catch(() => null)) as
    | { ErrorCode?: number; Message?: string }
    | null;

  if (!res.ok || (payload?.ErrorCode ?? 0) !== 0) {
    throw new Error(payload?.Message ?? `Postmark returned HTTP ${res.status}`);
  }
}
