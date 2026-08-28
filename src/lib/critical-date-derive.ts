import type { PipelineResult } from "./types";
import type {
  CriticalDate,
  CriticalDateKind,
  DateCandidate,
  DateDecision,
} from "./critical-date-types";
import { formatDate } from "./critical-date-types";

/**
 * Critical-date DERIVATION — pure, deterministic, client-safe (no database, no
 * secrets). Candidates are derived on read from the facts/timeline Briefly already
 * extracted (with their source quotes) — no extra model call, nothing written on
 * ingest. Detects when sources DISAGREE (conflict) and, for a confirmed date, when
 * a genuinely NEW later source contradicts it (stale) — never re-triggered by the
 * losing candidate the user already saw.
 */

const KEYWORDS: Record<CriticalDateKind, RegExp> = {
  settlement: /settle(ment|s|d)?/i,
  // "finance approval", "finance clause", "subject to finance", "unconditional".
  finance: /\b(finance|unconditional)\b/i,
};

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function isoFrom(year: string, monthName: string, day: string): string | null {
  const mi = MONTH_KEYS.findIndex((k) => monthName.toLowerCase().startsWith(k));
  const d = Number(day);
  if (mi < 0 || d < 1 || d > 31) return null;
  return `${year}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Find a full calendar date ANYWHERE in a string — ISO, "6 March 2027", or
 * "March 6, 2027" — so a date stated inside an otherwise-undated timeline event's
 * text is still detected (the case that made a real 6-vs-9 March discrepancy show
 * as a single suggestion instead of a conflict). Null for partial/relative/none.
 * Components are read directly (never through `new Date(str)`, which parses non-ISO
 * strings in LOCAL time and can shift the day) so a critical date is exact.
 */
function parseFullDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  let m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?,?\\s+(\\d{4})\\b`, "i"));
  if (m) return isoFrom(m[3], m[2], m[1]);
  m = s.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i"));
  if (m) return isoFrom(m[3], m[1], m[2]);
  return null;
}

/** Every date candidate that mentions a kind, from facts (first) then timeline. */
function gatherCandidates(result: PipelineResult, kind: CriticalDateKind): DateCandidate[] {
  const re = KEYWORDS[kind];
  const cands: DateCandidate[] = [];
  for (const f of result.fields) {
    if (!f.present || !f.value) continue;
    if (!re.test(f.label) && !re.test(f.key)) continue;
    const iso = parseFullDate(f.value);
    cands.push({ value: iso ? formatDate(iso) : f.value, iso, source: f.source ?? null, fromDocument: f.fromDocument ?? null });
  }
  for (const e of result.timeline) {
    if (!re.test(e.description) && !(e.source && re.test(e.source))) continue;
    // The event's own date, or a full date stated in its description/source text —
    // some extractions leave the event "undated" but name the date in the text.
    const iso = parseFullDate(e.date ?? "") ?? parseFullDate(e.description) ?? parseFullDate(e.source ?? "");
    if (!iso && !e.date) continue;
    cands.push({ value: iso ? formatDate(iso) : e.date!, iso, source: e.source ?? e.description ?? null });
  }
  return cands;
}

/** The distinct parseable dates (ISO) found for a kind — recorded at confirmation
 *  time so a later new date can be told apart from a candidate already seen. */
export function candidateIsos(result: PipelineResult | null, kind: CriticalDateKind): string[] {
  if (!result) return [];
  return [...new Set(gatherCandidates(result, kind).map((c) => c.iso).filter((x): x is string => !!x))];
}

export function deriveDate(result: PipelineResult | null, kind: CriticalDateKind): CriticalDate | null {
  if (!result) return null;
  const cands = gatherCandidates(result, kind);
  if (cands.length === 0) return null;

  // Two or more DIFFERENT parseable dates → a conflict Briefly must not resolve
  // silently. One candidate is kept per distinct date, with its own evidence.
  const withIso = cands.filter((c) => c.iso);
  const distinct = [...new Set(withIso.map((c) => c.iso))];
  if (distinct.length >= 2) {
    const perDate = distinct.map((iso) => withIso.find((c) => c.iso === iso)!);
    return {
      kind,
      value: perDate.map((c) => c.value).join(" / "),
      iso: null, // ambiguous → no single date → cannot drive Critical
      confidence: "conflict",
      source: null,
      candidates: perDate,
    };
  }

  // A single date (or only partial mentions) — prefer a document-sourced candidate.
  const best =
    withIso.slice().sort((a, b) => (b.fromDocument ? 1 : 0) - (a.fromDocument ? 1 : 0))[0] ?? cands[0];
  return {
    kind,
    value: best.value,
    iso: best.iso ?? null,
    confidence: best.iso ? "suggested" : "review",
    source: best.source,
    fromDocument: best.fromDocument ?? null,
  };
}

/**
 * Resolve the date a matter effectively has for a kind: decision wins, else derived.
 *
 * `staleEnabled` gates stale/third-date detection EXPLICITLY (Release B). It must be
 * passed true ONLY when the known_isos persistence is guaranteed (migration run +
 * feature flag on). When false, stale is never computed — Briefly does not claim to
 * be watching for new conflicting evidence when the mechanism isn't guaranteed.
 */
export function resolveDate(
  result: PipelineResult | null,
  decision: DateDecision | null,
  kind: CriticalDateKind,
  staleEnabled = false,
): CriticalDate | null {
  if (decision?.status === "rejected") return null;
  if (decision?.status === "confirmed") {
    const base: CriticalDate = {
      kind,
      value: decision.value,
      iso: decision.iso,
      confidence: "confirmed",
      source: decision.source,
      fromDocument: decision.fromDocument,
      confirmedAt: decision.confirmedAt,
    };
    // Reopen (mark stale) only when stale detection is ENABLED, we RECORDED the
    // candidates known at confirmation, AND a later source has a DIFFERENT date not
    // among them — so the losing candidate the user already saw never re-triggers a
    // false stale, and stale never runs while its persistence isn't guaranteed.
    if (staleEnabled && result && (decision.knownIsos?.length ?? 0) > 0) {
      const known = new Set([...decision.knownIsos, decision.iso].filter((x): x is string => !!x));
      const fresh: DateCandidate[] = [];
      const seen = new Set<string>();
      for (const c of gatherCandidates(result, kind)) {
        if (!c.iso || known.has(c.iso) || seen.has(c.iso)) continue;
        seen.add(c.iso);
        fresh.push(c);
      }
      if (fresh.length) {
        base.stale = true;
        base.candidates = fresh;
      }
    }
    return base;
  }
  return deriveDate(result, kind);
}

/** All of a matter's effective critical dates, soonest first. */
export function resolveMatterDates(
  result: PipelineResult | null,
  decisions: Partial<Record<CriticalDateKind, DateDecision>>,
  opts: { staleEnabled?: boolean } = {},
): CriticalDate[] {
  const out: CriticalDate[] = [];
  for (const k of ["settlement", "finance"] as CriticalDateKind[]) {
    const d = resolveDate(result, decisions[k] ?? null, k, opts.staleEnabled ?? false);
    if (d) out.push(d);
  }
  return out.sort((a, b) => {
    if (a.iso && b.iso) return a.iso.localeCompare(b.iso);
    if (a.iso) return -1;
    if (b.iso) return 1;
    return 0;
  });
}
