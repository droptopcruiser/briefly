import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import type { PipelineResult } from "./types";

/**
 * Typed critical dates — settlement first.
 *
 * A conveyance turns on its dates, so the queue should know "settlement in 3 days
 * — signed authority still missing", not just "how ready is this file?". The hard
 * safety rule (Luke's, explicit): an UNCONFIRMED extracted date must never silently
 * drive a Critical alert as if it were fact. So there are three confidence states —
 *   · confirmed  — a human confirmed it → it CAN drive Critical urgency
 *   · suggested  — a clear date was extracted, awaiting confirmation → prompts, never alarms
 *   · review     — a low-confidence/partial mention → "review the source", never alarms
 *
 * Extraction is LAZY and GROUNDED: the candidate is derived on read from the facts
 * and timeline Briefly already extracted (with their source quotes) — no extra model
 * call, no write on ingest. Only the human's DECISION (confirm / edit / reject) is
 * stored, in matter_critical_dates. The "effective" date a matter shows is that
 * decision if present, else the derived candidate.
 */

export type CriticalDateKind = "settlement";
export type DateConfidence = "confirmed" | "suggested" | "review";

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
 * strings in LOCAL time and can shift the day) so a settlement date is exact.
 */
function parseFullDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  const isoM = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoM) return `${isoM[1]}-${isoM[2]}-${isoM[3]}`;

  // "13 March 2027" / "13 Mar 2027" / "March 13, 2027" — need day, month name, year.
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

const SETTLEMENT_RE = /settle(ment|s|d)?/i;

/**
 * Derive a settlement-date CANDIDATE from what Briefly already extracted — never
 * stored, always recomputed. Prefers a settlement-labelled fact (most structured),
 * then a settlement timeline event. A clean full date → "suggested"; a partial or
 * keyword-only mention → "review". Returns null when nothing references settlement.
 */
export function deriveSettlement(result: PipelineResult | null): CriticalDate | null {
  if (!result) return null;

  // 1) A fact whose label/key names settlement.
  for (const f of result.fields) {
    if (!f.present || !f.value) continue;
    if (!SETTLEMENT_RE.test(f.label) && !SETTLEMENT_RE.test(f.key)) continue;
    const iso = parseFullDate(f.value);
    return {
      kind: "settlement",
      value: iso ? formatDate(iso) : f.value,
      iso,
      confidence: iso ? "suggested" : "review",
      source: f.source ?? null,
      fromDocument: f.fromDocument ?? null,
    };
  }

  // 2) A timeline event that mentions settlement and carries a date.
  for (const e of result.timeline) {
    if (!SETTLEMENT_RE.test(e.description) && !(e.source && SETTLEMENT_RE.test(e.source))) continue;
    const iso = e.date ? parseFullDate(e.date) : null;
    if (!iso && !e.date) continue;
    return {
      kind: "settlement",
      value: iso ? formatDate(iso) : e.date!,
      iso,
      confidence: iso ? "suggested" : "review",
      source: e.source ?? e.description ?? null,
    };
  }

  return null;
}

/** Resolve the date a matter effectively has: the human decision wins, else derived. */
export function resolveSettlement(
  result: PipelineResult | null,
  decision: DateDecision | null,
): CriticalDate | null {
  if (decision?.status === "rejected") return null;
  if (decision?.status === "confirmed") {
    return {
      kind: "settlement",
      value: decision.value,
      iso: decision.iso,
      confidence: "confirmed",
      source: decision.source,
      fromDocument: decision.fromDocument,
      confirmedAt: decision.confirmedAt,
    };
  }
  return deriveSettlement(result);
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

/** The stored decision for one matter's date kind, or null. */
export async function getDateDecision(
  matterId: string,
  kind: CriticalDateKind = "settlement",
): Promise<DateDecision | null> {
  const db = getSupabase();
  if (!db) return memory.get(memKey(matterId, kind)) ?? null;
  try {
    const { data } = await db
      .from("matter_critical_dates")
      .select("*")
      .eq("matter_id", matterId)
      .eq("kind", kind)
      .maybeSingle();
    return data ? rowToDecision(data as DecisionRow) : null;
  } catch (err) {
    console.error("getDateDecision failed (run critical-dates.sql?):", err);
    return null;
  }
}

/** Stored decisions for many matters, keyed by matterId — one query for the queue. */
export async function getDateDecisionsMap(
  accountId: string,
  kind: CriticalDateKind = "settlement",
): Promise<Map<string, DateDecision>> {
  const map = new Map<string, DateDecision>();
  const db = getSupabase();
  if (!db) {
    for (const d of memory.values()) if (d.kind === kind) map.set(d.matterId, d);
    return map;
  }
  try {
    const { data } = await db
      .from("matter_critical_dates")
      .select("*")
      .eq("account_id", accountId)
      .eq("kind", kind);
    for (const r of (data ?? []) as DecisionRow[]) map.set(r.matter_id, rowToDecision(r));
  } catch (err) {
    console.error("getDateDecisionsMap failed (run critical-dates.sql?):", err);
  }
  return map;
}

/** Persist a human decision (confirm or reject) about a matter's date. Upsert on
 *  (matter_id, kind) so a matter has at most one settlement decision. */
export async function saveDateDecision(
  accountId: string,
  d: DateDecision,
): Promise<void> {
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
  kind: CriticalDateKind = "settlement",
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
