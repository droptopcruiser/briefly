import { after } from "next/server";
import { ingestSubmission, ingestReply } from "@/lib/ingest";
import { getMatter, findOpenMatterByClient } from "@/lib/store";
import { QuotaExceededError, getAccountByInboundToken } from "@/lib/metering";
import { getEffectiveRubrics } from "@/lib/rubric-store";
import { uploadDocument, updateDocument, type MatterDocument } from "@/lib/documents";
import { readStoredDocument, countPdfPages, AUTO_READ_MAX_PAGES } from "@/lib/document-service";
import { addEvent } from "@/lib/events";
import { attachToLatestInbound } from "@/lib/messages";
import { getActiveBrief, isBriefStale, createBriefForMatter } from "@/lib/work-brief";
import type { Matter } from "@/lib/types";

// The pipeline (~15s) plus a background auto-read (~15-40s) run in one invocation
// via after() — give the whole thing room (Fluid Compute allows up to 300s).
export const maxDuration = 300;

const ATTACH_MAX_BYTES = 20 * 1024 * 1024; // 20 MB — matches the manual upload cap.

/**
 * Auto-store a client's PDF email attachments onto the matter, so replying WITH
 * the signed document just works — no manual upload. Best-effort per file: a bad
 * attachment is skipped, never failing the whole inbound. Records each file's
 * page count so the caller can decide auto-read eligibility. Returns the stored
 * document rows.
 */
async function storeInboundPdfAttachments(
  accountId: string,
  matterId: string,
  fields: Record<string, unknown>,
): Promise<MatterDocument[]> {
  const list = Array.isArray(fields.Attachments) ? (fields.Attachments as Array<Record<string, unknown>>) : [];
  const stored: MatterDocument[] = [];
  for (const a of list) {
    const name = str(a.Name) || "attachment.pdf";
    const contentType = str(a.ContentType);
    const content = str(a.Content); // Postmark delivers base64
    const isPdf = contentType.toLowerCase().includes("pdf") || /\.pdf$/i.test(name);
    if (!isPdf || !content) continue;
    try {
      const bytes = new Uint8Array(Buffer.from(content, "base64"));
      if (bytes.byteLength === 0 || bytes.byteLength > ATTACH_MAX_BYTES) continue;
      const doc = await uploadDocument(accountId, matterId, name, "application/pdf", bytes);
      doc.pageCount = await countPdfPages(bytes);
      await updateDocument(doc);
      await addEvent(accountId, matterId, "document_attached", `Client attached ${doc.fileName}`);
      stored.push(doc);
    } catch (err) {
      console.error("storeInboundPdfAttachments: failed on", name, err);
    }
  }
  return stored;
}

/**
 * After storing, auto-read the small PDFs (<= AUTO_READ_MAX_PAGES) in the
 * background so the webhook still answers fast. Larger docs stay "attached" for a
 * one-click manual read. Facts land PENDING — the confirmation gate is unchanged.
 * Marks eligible docs "reading" up front so the matter shows the loading state.
 */
async function autoReadInboundDocuments(
  matter: Matter,
  accountId: string,
  docs: MatterDocument[],
): Promise<void> {
  const eligible = docs.filter((d) => d.pageCount === null || d.pageCount <= AUTO_READ_MAX_PAGES);
  if (eligible.length === 0) return;

  for (const d of eligible) {
    d.status = "reading";
    await updateDocument(d);
  }

  const rubrics = await getEffectiveRubrics(accountId);
  const rubric = rubrics.find((r) => r.id === matter.result?.rubricId);

  after(async () => {
    for (const d of eligible) {
      try {
        await readStoredDocument(matter, rubric, d, { autoMaxPages: AUTO_READ_MAX_PAGES });
      } catch (err) {
        console.error("autoReadInboundDocuments: read failed for", d.fileName, err);
      }
    }
  });
}

/**
 * Keep "Briefly noticed" current with the conversation after a reply. If the reply
 * made an UNAPPROVED brief stale, regenerate it in the background (via after(), so
 * the webhook stays fast) so the insight/decision reflect the latest back-and-forth.
 * An APPROVED brief is never silently rewritten — it's only flagged stale.
 */
async function refreshBriefAfterReply(matter: Matter, accountId: string): Promise<void> {
  const active = await getActiveBrief(matter.id);
  if (!active || !isBriefStale(active, matter)) return;

  if (active.state === "approved") {
    await addEvent(accountId, matter.id, "brief_stale", "New information arrived — brief may need a refresh");
    return;
  }

  const rubrics = await getEffectiveRubrics(accountId);
  const rubric = rubrics.find((r) => r.id === matter.result?.rubricId);
  after(async () => {
    try {
      const refreshed = await createBriefForMatter(matter, rubric, { supersede: true, withJudgment: true });
      if (refreshed) {
        await addEvent(
          accountId,
          matter.id,
          "brief_refreshed",
          `Brief updated with the latest reply (v${refreshed.version})`,
        );
      }
    } catch (err) {
      console.error("refreshBriefAfterReply failed:", err);
    }
  });
}

/**
 * Inbound email webhook (PRD Phase 1). An inbound mail service (Postmark,
 * SendGrid Inbound Parse, etc.) POSTs a parsed email here; we run the pipeline
 * and auto-create a matter — the "log in and it's already done" experience.
 *
 * Auth: this endpoint can create matters and spend model tokens, so it is gated
 * by a shared secret (INBOUND_WEBHOOK_SECRET), supplied as `?token=`, an
 * `x-webhook-secret` header, or `Authorization: Bearer <secret>`. Configure the
 * mail provider's webhook URL with the same secret. Fails closed if unset.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providedSecret(req: Request): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("token");
  if (q) return q;
  const header = req.headers.get("x-webhook-secret");
  if (header) return header;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Normalise Postmark / SendGrid / generic-JSON inbound shapes to what we need. */
function parseEmail(f: Record<string, unknown>) {
  const fromFull = (f.FromFull as Record<string, unknown> | undefined) ?? {};
  let fromEmail = str(fromFull.Email || f.From || f.from || f.sender);
  let fromName = str(fromFull.Name || f.FromName || f.fromName);

  // Handle a combined "Name <email>" value.
  const angle = fromEmail.match(/<([^>]+)>/);
  if (angle) {
    if (!fromName) {
      fromName = fromEmail.slice(0, fromEmail.indexOf("<")).trim().replace(/^"|"$/g, "");
    }
    fromEmail = angle[1].trim();
  }

  const subject = str(f.Subject || f.subject);
  // Prefer the stripped reply (quoted history removed) when the provider gives it.
  const body = str(
    f.StrippedTextReply || f.TextBody || f.text || f["body-plain"],
  ).trim();

  return {
    fromEmail: fromEmail || null,
    fromName: fromName || null,
    subject,
    body,
  };
}

/**
 * Threading headers off the inbound message, so our replies land in the SAME
 * mailbox conversation. Postmark delivers the raw headers as a `Headers` array;
 * we read the RFC Message-ID + References (the client's reply already carries the
 * full chain, including our own earlier sends).
 */
function parseThreadMeta(f: Record<string, unknown>): {
  messageId: string | null;
  references: string | null;
  subject: string | null;
} {
  const headers = Array.isArray(f.Headers)
    ? (f.Headers as Array<Record<string, unknown>>)
    : [];
  const h = (name: string): string | null => {
    const hit = headers.find((x) => str(x.Name).toLowerCase() === name.toLowerCase());
    const v = hit ? str(hit.Value).trim() : "";
    return v || null;
  };
  const references = h("References");
  const inReplyTo = h("In-Reply-To");
  return {
    messageId: h("Message-ID"),
    // Prefer an explicit References chain; fall back to In-Reply-To when that's all
    // the client sent (still enough to keep the thread linked).
    references: references || inReplyTo,
    subject: str(f.Subject || f.subject).trim() || null,
  };
}

/**
 * The intake localpart the email was delivered to. Routes to the owning firm and,
 * for replies to a follow-up, carries a `+{matterId}` sub-address so we can thread
 * the reply back to the exact matter. For forwarded mail, Postmark's
 * OriginalRecipient is the intake address (not the client's To), so it wins.
 */
function recipientParts(f: Record<string, unknown>): { token: string | null; matterRef: string | null } {
  const toFull = f.ToFull as Array<Record<string, unknown>> | undefined;
  const raw =
    str(f.OriginalRecipient) ||
    str(toFull?.[0]?.Email) ||
    str(f.To || f.to || f.recipient);
  if (!raw) return { token: null, matterRef: null };
  const angle = raw.match(/<([^>]+)>/);
  const email = (angle ? angle[1] : raw).trim().toLowerCase();
  const at = email.indexOf("@");
  if (at <= 0) return { token: null, matterRef: null };
  const localpart = email.slice(0, at);
  const plus = localpart.indexOf("+");
  if (plus >= 0) {
    return { token: localpart.slice(0, plus), matterRef: localpart.slice(plus + 1) || null };
  }
  return { token: localpart, matterRef: null };
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    return jsonResponse(503, { error: "inbound email not configured" });
  }
  if (providedSecret(req) !== secret) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  // Parse the payload (JSON for Postmark/generic, form-data for SendGrid).
  let fields: Record<string, unknown>;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      fields = (await req.json()) as Record<string, unknown>;
    } else if (contentType.includes("form")) {
      fields = Object.fromEntries((await req.formData()).entries());
    } else {
      fields = (await req.json()) as Record<string, unknown>;
    }
  } catch {
    return jsonResponse(400, { error: "could not parse request body" });
  }

  const email = parseEmail(fields);
  if (!email.body) {
    return jsonResponse(400, { error: "empty email body" });
  }

  // Route to the firm whose intake address this was sent to. Unknown address =>
  // skip (200 so the provider doesn't retry); no tokens are spent.
  const { token, matterRef } = recipientParts(fields);
  const account = token ? await getAccountByInboundToken(token) : null;
  if (!account) {
    return jsonResponse(200, { status: "skipped", reason: "unknown_recipient" });
  }

  // Is this a reply to an existing matter? Prefer the tagged matter id, else fall
  // back to the most recent open matter from this client's email address.
  let existing = matterRef ? await getMatter(matterRef, account.id) : null;
  if (!existing && email.fromEmail) {
    existing = await findOpenMatterByClient(account.id, email.fromEmail);
  }

  const threadMeta = parseThreadMeta(fields);

  try {
    let matter;
    let threaded = false;
    if (existing) {
      matter = await ingestReply({
        account,
        matter: existing,
        message: email.body,
        emailMeta: threadMeta,
      });
      threaded = true;
    } else {
      const submission = email.subject
        ? `Subject: ${email.subject}\n\n${email.body}`
        : email.body;
      matter = await ingestSubmission({
        submission,
        account,
        clientNameHint: email.fromName,
        clientEmailHint: email.fromEmail,
        emailMeta: threadMeta,
      });
    }

    // Slice 4 — a client can just reply WITH the signed document. PDF attachments
    // are auto-stored, then small ones (<= 30 pages) are auto-read in the
    // background (larger stay one-click manual); facts land pending for confirmation.
    const stored = await storeInboundPdfAttachments(account.id, matter.id, fields);
    if (stored.length) {
      // Link the files to the inbound message so they show on its conversation bubble.
      await attachToLatestInbound(
        matter.id,
        stored.map((d) => ({ fileName: d.fileName, docId: d.id })),
      );
      await autoReadInboundDocuments(matter, account.id, stored);
    }
    // Keep the brief current with the conversation (background, so the response stays fast).
    if (threaded) await refreshBriefAfterReply(matter, account.id);
    const attachments = stored.map((d) => d.fileName);

    return jsonResponse(200, {
      id: matter.id,
      status: matter.status,
      readiness: matter.result?.readiness ?? null,
      ...(threaded ? { threaded: true } : {}),
      ...(attachments.length ? { attachments } : {}),
    });
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      // Over the monthly cap — don't process. 200 so the provider doesn't retry.
      return jsonResponse(200, { status: "skipped", reason: "quota_exceeded" });
    }
    console.error("inbound ingest failed:", err);
    return jsonResponse(500, { error: "ingest failed" });
  }
}
