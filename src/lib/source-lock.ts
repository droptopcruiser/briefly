/**
 * Source lock — the trust feature. Pure and client-safe.
 *
 * Two pieces:
 *  1. The sourced-fact list (registry): every fact the matter actually supports, each
 *     tagged with where it came from (index line / PDF page / minute paragraph, or —
 *     File Open only — an enquiry snippet).
 *  2. The export gate: a draft (letter or note) may only export if every number, date,
 *     PRN/CRN, and name it ASSERTS is on that list. Anything left in [brackets] is an
 *     acknowledged gap and still exports. The gate is what lets counsel not re-read the
 *     pack; if the draft states a fact the file doesn't back, export dies.
 *
 * The precise checks (references, dates) are exact. The name check is deliberately
 * conservative — a stop-list keeps salutations, courts, and months from false-flagging.
 */

export type SourceKind = "index_line" | "pdf_page" | "minute_para" | "enquiry_snippet";

export interface SourcedFact {
  /** The supported value (e.g. "5 June 2027", "R. Tane", "00000"). */
  value: string;
  /** Human label of where it came from (e.g. "Disclosure index, item 4", "Minute p.2"). */
  tag: string;
  kind: SourceKind;
}

export interface SourceList {
  facts: SourcedFact[];
  /** Lowercased concatenation of every supported value + quote — the gate's basis. */
  haystack: string;
}

/**
 * Assemble the sourced list from workflow outputs. `facts` are the tagged values;
 * `supportingText` is extra sourced text (e.g. the enquiry, verbatim index lines,
 * minute quotes) that also counts as support for the gate.
 */
export function buildSourceList(facts: SourcedFact[], supportingText: string[] = []): SourceList {
  const parts = [...facts.map((f) => f.value), ...supportingText];
  return { facts, haystack: parts.join("  ").toLowerCase() };
}

// ── The export gate ───────────────────────────────────────────────────────────

export type ExportViolationKind = "unsupported_ref" | "unsupported_date" | "unsupported_name";

export interface ExportViolation {
  kind: ExportViolationKind;
  /** The offending text. */
  text: string;
  /** Counsel-facing explanation. */
  detail: string;
}

const REF_RE = /\b(PRN|CRN|CRI|MED|QID)\s*[:#]?\s*([A-Z0-9][A-Z0-9./-]{2,})/gi;
const DATE_RE =
  /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi;
// A candidate person/party name: two or more consecutive Title-case words (a lone
// initial like "R." allowed as a token). A word does NOT carry a trailing period, so a
// sentence-ending period ("Court. We") stops the name; and tokens are joined only by
// spaces/tabs, never a line break, so a paragraph boundary ("Court\n\nWe") can't fuse
// the end of one sentence to the start of the next.
const NAME_RE = /\b((?:[A-Z][a-z]+|[A-Z]\.)(?:[^\S\r\n]+(?:[A-Z][a-z]+|[A-Z]\.)){1,3})\b/g;

// Words that look like names but aren't — salutations, sign-offs, courts, months,
// and the fixed furniture of a chambers letter. A candidate made ONLY of these is safe.
const NAME_STOP = new Set(
  [
    "dear", "sir", "madam", "yours", "faithfully", "sincerely", "kind", "regards", "re",
    "thank", "you", "please", "confirm", "review", "the", "and", "of", "to", "for",
    "district", "high", "youth", "court", "police", "prosecution", "defendant", "counsel",
    "officer", "charge", "charging", "document", "summary", "facts", "statement", "notebook",
    "exhibit", "disclosure", "index", "pack", "hearing", "callover", "case", "matter",
    "january", "february", "march", "april", "may", "june", "july", "august", "september",
    "october", "november", "december", "monday", "tuesday", "wednesday", "thursday", "friday",
  ].map((w) => w.toLowerCase()),
);

/** Strip [bracketed] spans — acknowledged gaps that are allowed to export. */
function withoutBrackets(text: string): string {
  return text.replace(/\[[^\]]*\]/g, " ");
}

function inHaystack(hay: string, value: string): boolean {
  return hay.includes(value.toLowerCase());
}

/**
 * Return every assertion in the draft that the source list does NOT support. Empty
 * array = safe to export. Bracketed content is ignored (it exports as a visible gap).
 */
export function exportGate(text: string, list: SourceList): ExportViolation[] {
  const body = withoutBrackets(text ?? "");
  const hay = list.haystack;
  const out: ExportViolation[] = [];
  const seen = new Set<string>();

  for (const m of body.matchAll(REF_RE)) {
    const value = m[2].replace(/[.\/-]+$/, "");
    const whole = m[0].replace(/[.\/-]+$/, "").trim();
    // A real PRN/CRN carries a digit — "PRN reference" / "PRN differs" are prose, not facts.
    if (!/\d/.test(value)) continue;
    if (value && !inHaystack(hay, value) && !seen.has("r:" + value.toLowerCase())) {
      seen.add("r:" + value.toLowerCase());
      out.push({ kind: "unsupported_ref", text: whole, detail: `"${whole}" is not on the sourced list — remove it or bracket it before export.` });
    }
  }

  for (const m of body.matchAll(DATE_RE)) {
    const d = m[0];
    if (!inHaystack(hay, d) && !seen.has("d:" + d.toLowerCase())) {
      seen.add("d:" + d.toLowerCase());
      out.push({ kind: "unsupported_date", text: d, detail: `The date "${d}" is not on the sourced list — confirm it, or bracket it, before export.` });
    }
  }

  for (const m of body.matchAll(NAME_RE)) {
    // Trim leading/trailing furniture words (e.g. "Re", "Dear") down to the name core,
    // so a real name attached to a stop-word ("Re R. Tane") isn't mis-flagged.
    const words = m[1].trim().split(/\s+/);
    const isStop = (w: string) => NAME_STOP.has(w.toLowerCase().replace(/\.$/, ""));
    while (words.length && isStop(words[0])) words.shift();
    while (words.length && isStop(words[words.length - 1])) words.pop();
    if (words.length < 2) continue; // furniture, or a lone token — not a party name
    const core = words.join(" ");
    if (!inHaystack(hay, core) && !seen.has("n:" + core.toLowerCase())) {
      seen.add("n:" + core.toLowerCase());
      out.push({ kind: "unsupported_name", text: core, detail: `The name "${core}" is not on the sourced list — confirm it, or bracket it, before export.` });
    }
  }

  return out;
}

/** True when the draft may export (nothing unsupported). */
export function canExport(text: string, list: SourceList): boolean {
  return exportGate(text, list).length === 0;
}
