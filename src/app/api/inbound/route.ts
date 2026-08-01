import { ingestSubmission } from "@/lib/ingest";

// Runs the pipeline (3 sequential Haiku calls, ~10-20s) — give it headroom.
export const maxDuration = 60;

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

  const submission = email.subject
    ? `Subject: ${email.subject}\n\n${email.body}`
    : email.body;

  try {
    const matter = await ingestSubmission({
      submission,
      clientNameHint: email.fromName,
      clientEmailHint: email.fromEmail,
    });
    return jsonResponse(200, {
      id: matter.id,
      status: matter.status,
      readiness: matter.result?.readiness ?? null,
    });
  } catch (err) {
    console.error("inbound ingest failed:", err);
    return jsonResponse(500, { error: "ingest failed" });
  }
}
