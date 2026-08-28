import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import type { PipelineResult } from "./types";

/**
 * Typed critical dates — settlement first, finance/unconditional second.
 *
 * A conveyance turns on its dates, so the queue should know "settlement in 3 days"
 * / "finance approval due tomorrow", not just "how ready is this file?". The hard
 * safety rule (Luke's, explicit): an UNCONFIRMED extracted date must never silently
 * drive a Critical alert as if it were fact. So every date has three confidence
 * states —
 *   · confirmed  — a human confirmed it → it CAN drive Critical urgency
 *   · suggested  — a clear date was extracted, awaiting confirmation → prompts, never alarms
 *   · review     — a low-confidence/partial mention → "review the source", never alarms
 *
 * Extraction is LAZY and GROUNDED: candidates are derived on read from the facts
 * and timeline Briefly already extracted (with their source quotes) — no extra model
 * call, no write on ingest. Only the human's DECISION (confirm / edit / reject) is
 * stored, in matter_critical_dates. Each KIND carries its own keywords, label, and
 * display language; adding cooling-off / contract later is one config entry.
 */

export type CriticalDateKind = "settlement" | "finance";
/**
 * confirmed — a human confirmed it → may drive Critical.
 * suggested — one clear date extracted, awaiting confirmation → prompts.
 * review    — a partial/low-confidence mention → "review the source".
 * conflict  — TWO+ different dates found for this kind; Briefly refuses to pick one.
 *             Cannot drive Critical until the human resolves it.
 */
export type DateConfidence = "confirmed" | "suggested" | "review" | "conflict";

/** One extracted date candidate, with its own evidence. */
export interface DateCandidate {
  value: string;
  iso: string | null;
  source: string | null;
  fromDocument?: { fileName: string; page: number | null } | null;
}

interface KindConfig {
  /** Words that identify this date in a fact label/key or timeline event. */
  keywords: RegExp;
  /** Full label for the on-matter strip. */
  label: string;
  /** Noun used in queue language, e.g. "Settlement", "Finance approval". */
  noun: string;
  /** How many days out a CONFIRMED date of this kind counts as Critical. */
  criticalWithinDays: number;
}

const KIND: Record<CriticalDateKind, KindConfig> = {
  settlement: {
    keywords: /settle(ment|s|d)?/i,
    label: "Settlement date",
    noun: "Settlement",
    criticalWithinDays: 10,
  },
  finance: {
    // "finance approval", "finance clause", "subject to finance", "unconditional".
    keywords: /\b(finance|unconditional)\b/i,
    label: "Finance / unconditional date",
    noun: "Finance approval",
    criticalWithinDays: 7,
  },
};

export const DATE_KINDS: CriticalDateKind[] = ["settlement", "finance"];
export function kindLabel(kind: CriticalDateKind): string {
  return KIND[kind].label;
}
export function kindNoun(kind: CriticalDateKind): string {
  return KIND[kind].noun;
}
export function kindCriticalWindow(kind: CriticalDateKind): number {
  return KIND[kind].criticalWithinDays;
}

/** The date a matter effectively has for a kind, after resolving decision vs derived. */
export interface CriticalDate {
  kind: CriticalDateKind;
  /** Human display value, e.g. "13 Mar 2027" or the raw phrase if unparseable. */
  value: string;
  /** ISO YYYY-MM-DD when the value is a clean full date; null for partial/relative. */
  iso: string | null;
  confidence: DateConfidence;
  /** The evidence: a verbatim quote or provenance line. */
  source: string | null;
  /** Set when the date came from a read document. */
  fromDocument?: { fileName: string; page: number | null } | null;
  confirmedAt?: string | null;
  /** Present when confidence === "conflict" — the disagreeing dates, to resolve between. */
  candidates?: DateCandidate[];
}

/** A stored human decision about a matter's date (the only thing persisted). */
interface DateDecision {
  matterId: string;
  kind: CriticalDateKind;
  status: "confirmed" | "rejected";
  value: string;
  iso: string | null;
  source: string | null;
  fromDocument: { fileName: string; page: number | null } | null;
  confirmedBy: string | null;
  confirmedAt: string;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a clean ISO date as "13 Mar 2027" (tz-agnostic — a calendar date). */
export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${+m[3]} ${MONTHS_SHORT[+m[2] - 1]} ${m[1]}`;
}

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Parse a full calendar date to ISO YYYY-MM-DD; null for partial/relative/unclear.
 * Components are read directly (never through `new Date(str)`, which parses non-ISO
 * strings in LOCAL time and can shift the day) so a critical date is exact.
 */
function parseFullDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  const isoM = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoM) return `${isoM[1]}-${isoM[2]}-${isoM[3]}`;

  const yearM = s.match(/\b(\d{4})\b/);
  if (!yearM) return null;
  const rest = s.replace(yearM[0], " ");
  const monthM = rest.match(/[A-Za-z]{3,}/);
  const dayM = rest.match(/\b(\d{1,2})\b/);
  if (!monthM || !dayM) return null;
  const mi = MONTH_KEYS.findIndex((k) => monthM[0].toLowerCase().startsWith(k));
  const day = Number(dayM[1]);
  if (mi < 0 || day < 1 || day > 31) return null;
  return `${yearM[1]}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Derive a CANDIDATE date of a kind from what Briefly already extracted — never
 * stored, always recomputed. Prefers a matching fact (most structured), then a
 * matching timeline event. A clean full date → "suggested"; a partial or
 * keyword-only mention → "review". Returns null when nothing references the kind.
 */
export function deriveDate(result: PipelineResult | null, kind: CriticalDateKind): CriticalDate | null {
  if (!result) return null;
  const re = KIND[kind].keywords;

  // Gather EVERY candidate that mentions this kind (facts first, then timeline),
  // rather than returning the first — so we can DETECT when sources disagree.
  const cands: DateCandidate[] = [];
  for (const f of result.fields) {
    if (!f.present || !f.value) continue;
    if (!re.test(f.label) && !re.test(f.key)) continue;
    const iso = parseFullDate(f.value);
    cands.push({ value: iso ? formatDate(iso) : f.value, iso, source: f.source ?? null, fromDocument: f.fromDocument ?? null });
  }
  for (const e of result.timeline) {
    if (!re.test(e.description) && !(e.source && re.test(e.source))) continue;
    const iso = e.date ? parseFullDate(e.date) : null;
    if (!iso && !e.date) continue;
    cands.push({ value: iso ? formatDate(iso) : e.date!, iso, source: e.source ?? e.description ?? null });
  }
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

/** Resolve the date a matter effectively has for a kind: decision wins, else derived. */
export function resolveDate(
  result: PipelineResult | null,
  decision: DateDecision | null,
  kind: CriticalDateKind,
): CriticalDate | null {
  if (decision?.status === "rejected") return null;
  if (decision?.status === "confirmed") {
    return {
      kind,
      value: decision.value,
      iso: decision.iso,
      confidence: "confirmed",
      source: decision.source,
      fromDocument: decision.fromDocument,
      confirmedAt: decision.confirmedAt,
    };
  }
  return deriveDate(result, kind);
}

/** All of a matter's effective critical dates, soonest first. */
export function resolveMatterDates(
  result: PipelineResult | null,
  decisions: Partial<Record<CriticalDateKind, DateDecision>>,
): CriticalDate[] {
  const out: CriticalDate[] = [];
  for (const k of DATE_KINDS) {
    const d = resolveDate(result, decisions[k] ?? null, k);
    if (d) out.push(d);
  }
  return out.sort((a, b) => {
    if (a.iso && b.iso) return a.iso.localeCompare(b.iso);
    if (a.iso) return -1;
    if (b.iso) return 1;
    return 0;
  });
}

// --- Persistence (Supabase when configured; process-memory fallback) ----------

const globalStore = globalThis as unknown as { __brieflyDates?: Map<string, DateDecision> };
const memory: Map<string, DateDecision> = (globalStore.__brieflyDates ??= new Map());
const memKey = (matterId: string, kind: CriticalDateKind) => `${matterId}:${kind}`;

interface DecisionRow {
  matter_id: string;
  kind: CriticalDateKind;
  status: "confirmed" | "rejected";
  value: string | null;
  iso: string | null;
  source: string | null;
  from_document: { fileName: string; page: number | null } | null;
  confirmed_by: string | null;
  confirmed_at: string;
}

function rowToDecision(r: DecisionRow): DateDecision {
  return {
    matterId: r.matter_id,
    kind: r.kind,
    status: r.status,
    value: r.value ?? "",
    iso: r.iso,
    source: r.source,
    fromDocument: r.from_document,
    confirmedBy: r.confirmed_by,
    confirmedAt: r.confirmed_at,
  };
}

/** All stored date decisions for one matter, keyed by kind. */
export async function getMatterDateDecisions(
  matterId: string,
): Promise<Partial<Record<CriticalDateKind, DateDecision>>> {
  const out: Partial<Record<CriticalDateKind, DateDecision>> = {};
  const db = getSupabase();
  if (!db) {
    for (const d of memory.values()) if (d.matterId === matterId) out[d.kind] = d;
    return out;
  }
  try {
    const { data } = await db.from("matter_critical_dates").select("*").eq("matter_id", matterId);
    for (const r of (data ?? []) as DecisionRow[]) out[r.kind] = rowToDecision(r);
  } catch (err) {
    console.error("getMatterDateDecisions failed (run critical-dates.sql?):", err);
  }
  return out;
}

/** Stored decisions for a whole account, keyed by matterId then kind — one query. */
export async function getAccountDateDecisions(
  accountId: string,
): Promise<Map<string, Partial<Record<CriticalDateKind, DateDecision>>>> {
  const map = new Map<string, Partial<Record<CriticalDateKind, DateDecision>>>();
  const put = (d: DateDecision) => {
    const cur = map.get(d.matterId) ?? {};
    cur[d.kind] = d;
    map.set(d.matterId, cur);
  };
  const db = getSupabase();
  if (!db) {
    for (const d of memory.values()) put(d);
    return map;
  }
  try {
    const { data } = await db.from("matter_critical_dates").select("*").eq("account_id", accountId);
    for (const r of (data ?? []) as DecisionRow[]) put(rowToDecision(r));
  } catch (err) {
    console.error("getAccountDateDecisions failed (run critical-dates.sql?):", err);
  }
  return map;
}

/** Persist a human decision (confirm or reject) about a matter's date. Upsert on
 *  (matter_id, kind) so a matter has at most one decision per kind. */
export async function saveDateDecision(accountId: string, d: DateDecision): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.set(memKey(d.matterId, d.kind), d);
    return;
  }
  try {
    await db.from("matter_critical_dates").upsert(
      {
        id: randomUUID(),
        account_id: accountId,
        matter_id: d.matterId,
        kind: d.kind,
        status: d.status,
        value: d.value || null,
        iso: d.iso,
        source: d.source,
        from_document: d.fromDocument,
        confirmed_by: d.confirmedBy,
        confirmed_at: d.confirmedAt,
      },
      { onConflict: "matter_id,kind" },
    );
  } catch (err) {
    console.error("saveDateDecision failed (run critical-dates.sql?):", err);
  }
}

/** Remove a decision entirely, so the matter falls back to the derived candidate. */
export async function clearDateDecision(
  accountId: string,
  matterId: string,
  kind: CriticalDateKind,
): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.delete(memKey(matterId, kind));
    return;
  }
  try {
    await db
      .from("matter_critical_dates")
      .delete()
      .eq("account_id", accountId)
      .eq("matter_id", matterId)
      .eq("kind", kind);
  } catch (err) {
    console.error("clearDateDecision failed:", err);
  }
}

export type { DateDecision };
