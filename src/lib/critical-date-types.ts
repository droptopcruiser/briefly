/**
 * Critical-date TYPES + display helpers — pure, client-safe (no database, no
 * secrets, no server-only imports). The client strip imports ONLY from here.
 * Derivation lives in critical-date-derive.ts; persistence in critical-dates.ts
 * (server-only).
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

/** The date a matter effectively has for a kind, after resolving decision vs derived. */
export interface CriticalDate {
  kind: CriticalDateKind;
  value: string;
  iso: string | null;
  confidence: DateConfidence;
  source: string | null;
  fromDocument?: { fileName: string; page: number | null } | null;
  confirmedAt?: string | null;
  /** Present when confidence === "conflict" — the disagreeing dates to resolve between;
   *  also on a CONFIRMED-but-stale date, the newer disagreeing candidate(s). */
  candidates?: DateCandidate[];
  /** A confirmed date that a LATER source now disagrees with — reopened for review. */
  stale?: boolean;
}

/** A stored human decision about a matter's date (persisted server-side). */
export interface DateDecision {
  matterId: string;
  kind: CriticalDateKind;
  status: "confirmed" | "rejected";
  value: string;
  iso: string | null;
  source: string | null;
  fromDocument: { fileName: string; page: number | null } | null;
  confirmedBy: string | null;
  confirmedAt: string;
  /** Distinct candidate dates (ISO) known when confirmed — powers stale detection. */
  knownIsos: string[];
}

interface DisplayConfig {
  label: string;
  noun: string;
  /** How many days out a CONFIRMED date of this kind counts as Critical. */
  criticalWithinDays: number;
}

const DISPLAY: Record<CriticalDateKind, DisplayConfig> = {
  settlement: { label: "Settlement date", noun: "Settlement", criticalWithinDays: 10 },
  finance: { label: "Finance / unconditional date", noun: "Finance approval", criticalWithinDays: 7 },
};

export const DATE_KINDS: CriticalDateKind[] = ["settlement", "finance"];
export function kindLabel(kind: CriticalDateKind): string {
  return DISPLAY[kind].label;
}
export function kindNoun(kind: CriticalDateKind): string {
  return DISPLAY[kind].noun;
}
export function kindCriticalWindow(kind: CriticalDateKind): number {
  return DISPLAY[kind].criticalWithinDays;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a clean ISO date as "13 Mar 2027" (tz-agnostic — a calendar date). */
export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${+m[3]} ${MONTHS_SHORT[+m[2] - 1]} ${m[1]}`;
}
