/**
 * The Draft Correspondence workflow's SAFETY-CRITICAL core — pure and client-safe.
 *
 * Counsel gives the addressee, the matter, and the point to make; Briefly drafts a
 * short administrative letter/email in the chambers voice. The boundary: it NEVER
 * sends, gives NO advice, and — the rule counsel was firm about — never states a
 * filing, date, PRN, CRN, or other reference unless the matter's own material
 * supplies it. Anything not supplied is a square-bracketed gap.
 *
 * The Pre-Send check enforces that last rule mechanically: before counsel copies a
 * draft, it flags every unfilled bracket and any PRN/CRN/date in the body that the
 * matter doesn't support — so an unsupported fact can't slip out unnoticed.
 */

import type { PipelineResult } from "./types";

export const CORRESPONDENCE_VERSION = "correspondence/1";

export interface CorrespondenceRequest {
  /** The addressee (name/email/role), as counsel gives it. */
  to: string | null;
  /** The matter/subject line. */
  about: string;
  /** The point counsel needs the letter to make. */
  point: string;
}

export interface CorrespondenceDraft {
  to: string | null;
  subject: string;
  body: string;
}

// ── The Pre-Send check ────────────────────────────────────────────────────────

export type PreSendFlagKind = "no_addressee" | "unfilled_bracket" | "unsupported_ref" | "unsupported_date";

export interface PreSendFlag {
  kind: PreSendFlagKind;
  /** What to fix, in counsel-facing words. */
  detail: string;
}

/** Everything the matter actually supports — fact values + their sources + timeline.
 *  Pass `extra` (e.g. the matter's submission text) to widen the support base. */
function supportHaystack(result: PipelineResult | null, extra = ""): string {
  if (!result) return extra.toLowerCase();
  const parts: string[] = [extra, result.summary ?? ""];
  for (const f of result.fields) {
    if (f.value) parts.push(f.value);
    if (f.source) parts.push(f.source);
  }
  for (const t of result.timeline) {
    parts.push(t.description);
    parts.push(t.source);
    if (t.date) parts.push(t.date);
  }
  return parts.join("  ").toLowerCase();
}

const REF_RE = /\b(PRN|CRN|CRI|MED)\s*[:#]?\s*([A-Z0-9][A-Z0-9./-]{2,})/gi;
const DATE_RE =
  /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi;

/**
 * Check a draft before counsel sends it. Flags (it never blocks — counsel keeps
 * control): no addressee; any unfilled [bracket]; and any PRN/CRN/date stated in the
 * body that the matter's own material does not support.
 */
export function preSendCheck(
  draft: CorrespondenceDraft,
  result: PipelineResult | null,
  submission = "",
): PreSendFlag[] {
  const flags: PreSendFlag[] = [];
  const body = draft.body ?? "";

  if (!draft.to || !draft.to.trim()) {
    flags.push({ kind: "no_addressee", detail: "No addressee — set who this is going to." });
  }

  // Unfilled placeholders — but not a legitimate reviewer note in brackets, which we
  // still surface (counsel must resolve it before sending).
  const brackets = body.match(/\[[^\]]+\]/g) ?? [];
  for (const b of brackets) {
    flags.push({ kind: "unfilled_bracket", detail: `Unfilled placeholder: ${b}` });
  }

  const hay = supportHaystack(result, submission);

  for (const m of body.matchAll(REF_RE)) {
    const value = m[2].toLowerCase().replace(/[.\/-]+$/, "");
    const whole = m[0].replace(/[.\/-]+$/, "");
    if (value && !hay.includes(value)) {
      flags.push({ kind: "unsupported_ref", detail: `"${whole.trim()}" is stated but not found in the matter — confirm it before sending.` });
    }
  }

  for (const m of body.matchAll(DATE_RE)) {
    const d = m[0].toLowerCase();
    if (!hay.includes(d)) {
      flags.push({ kind: "unsupported_date", detail: `The date "${m[0]}" is stated but not found in the matter — confirm it before sending.` });
    }
  }

  return flags;
}

// ── The deterministic draft (demo/keyless mode + model fallback) ──────────────

/**
 * A grounded, no-advice template used when the model isn't available. It states only
 * the point counsel gave, brackets the addressee if none was provided, and never
 * invents a reference or date. Always a DRAFT.
 */
export function mockCorrespondence(req: CorrespondenceRequest): CorrespondenceDraft {
  const to = req.to?.trim() || null;
  const subject = req.about?.trim() || "Your matter";
  const greeting = to ? `Dear ${to},` : "Dear [addressee],";
  const body =
    `${greeting}\n\n` +
    `Re: ${subject}\n\n` +
    `${req.point.trim()}\n\n` +
    `[Review and confirm the details above before sending.]\n\n` +
    `Yours faithfully,`;
  return { to, subject, body };
}
