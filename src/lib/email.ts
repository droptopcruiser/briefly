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
 *   MAIL_FROM             — the default From, e.g. "Briefly <luke@brieflyhub.app>".
 *   MAIL_FROM_ADDRESS     — optional bare address used when building per-firm
 *                           sender names; derived from MAIL_FROM when unset.
 *   MAIL_REPLY_TO         — optional Reply-To (e.g. the firm's own address).
 *
 * When the token or from-address is missing, isEmailConfigured() reports false
 * and the UI falls back to letting the professional send from their own client.
 */

const POSTMARK_ENDPOINT = "https://api.postmarkapp.com/email";

/** The seed placeholder in accounts.name — treated as "firm name not set yet". */
const FIRM_PLACEHOLDER = "Default firm";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.MAIL_FROM);
}

/** The bare sending address (no display name). Used to build per-firm From lines. */
export function senderAddress(): string {
  const explicit = process.env.MAIL_FROM_ADDRESS?.trim();
  if (explicit) return explicit;
  // Fall back to the address inside MAIL_FROM ("Name <addr>"), or MAIL_FROM itself.
  const inAngles = process.env.MAIL_FROM?.match(/<([^>]+)>/);
  return (inAngles ? inAngles[1] : process.env.MAIL_FROM ?? "").trim();
}

/**
 * Build the From line for a firm. While every firm sends from the shared,
 * verified address, we present it honestly as "Briefly on behalf of {Firm}" —
 * which matches the sending domain and avoids a name/domain mismatch that would
 * look like spoofing. Falls back to the plain MAIL_FROM when the firm hasn't set
 * a name. The display name is sanitised to prevent header injection.
 */
export function senderFrom(firmName?: string | null): string {
  const defaultFrom = process.env.MAIL_FROM ?? "";
  const name = firmName?.replace(/["\r\n]/g, "").trim();
  if (!name || name === FIRM_PLACEHOLDER) return defaultFrom;
  const address = senderAddress();
  if (!address) return defaultFrom;
  return `"Briefly on behalf of ${name}" <${address}>`;
}

/**
 * Compose the final email body sent to the client: the drafted content plus the
 * firm's signature/footer. The pipeline draft ends WITHOUT a sign-off, so this
 * provides the closing — the firm's signature when set, otherwise a plain
 * "Kind regards, {Firm}" (or "The team" before a firm name is set).
 */
export function composeEmailBody(
  draftBody: string,
  opts: { signature?: string | null; firmName?: string | null },
): string {
  const body = draftBody.trim();
  const signature = opts.signature?.trim();
  if (signature) return `${body}\n\n${signature}`;
  const name = opts.firmName?.trim();
  const closer = name && name !== FIRM_PLACEHOLDER ? name : "The team";
  return `${body}\n\nKind regards,\n${closer}`;
}

/**
 * The "Ready for you" nudge — sent to the assignee/owner when a client reply
 * completes a matter. Internal (to the firm), so it uses the firm sender line.
 */
export async function sendMatterReadyEmail(
  to: string,
  firmName: string,
  clientName: string | null,
  matterUrl: string,
): Promise<void> {
  const who = clientName || "A matter";
  await sendEmail({
    to,
    from: senderFrom(firmName),
    subject: `Ready for review: ${who}`,
    body: `${who} is now ready for your review — everything required is in.

Open it: ${matterUrl}

— Briefly`,
  });
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  /** Overrides MAIL_FROM for this message (e.g. a per-firm sender line). */
  from?: string;
  /** Overrides MAIL_REPLY_TO for this message. */
  replyTo?: string;
}

/**
 * Send one plain-text email through Postmark. Resolves on success; throws with a
 * human-readable message (Postmark's own, when available) on failure.
 */
export async function sendEmail({ to, subject, body, from, replyTo }: SendEmailInput): Promise<void> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const fromLine = from ?? process.env.MAIL_FROM;
  if (!token || !fromLine) {
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
      From: fromLine,
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
