/**
 * P5c — visible migration routing. Pure, client-safe, headless-testable.
 *
 * Decides which NZ book an enquiry belongs to AND why (the cue), so the matter can show
 * "Routed to partner_of_nz_citizen because …" with Keep / Move / Unrouted. The rule is
 * conservative: a weak, absent, or MIXED cue (a purchase phrase alongside visa words) →
 * UNROUTED, never a guess. A purchase-shaped email never becomes partner or conveyancing;
 * the conveyancing book is simply unreachable from here. Returns null when the text has no
 * immigration OR purchase signal at all (a bookkeeping/other matter — no banner).
 */

import type { MigrationStream } from "./types";

export type MigrationRouting =
  | { status: "routed"; stream: MigrationStream; cue: string }
  | { status: "unrouted"; reason: string };

// Purchase / conveyancing signals — their presence blocks an immigration guess.
const PURCHASE = /\b(conveyanc\w*|settlement date|sale and purchase|\bLIM\b|property (?:purchase|sale)|\bvendor\b|first home|buying (?:a|an|the|our|my|in|at)\b)\b/i;

// Migration cues, each with the phrase to show. Order = tie-break within one stream.
const CUES: { stream: MigrationStream; re: RegExp; cue: string }[] = [
  { stream: "partner", re: /partner of a new zealander/i, cue: "“Partner of a New Zealander”" },
  { stream: "partner", re: /\bpartnership\b|my (?:husband|wife|partner)\b/i, cue: "a partnership (spouse named)" },
  { stream: "aewv", re: /\baewv\b|accredited employer|job (?:offer|check|token)/i, cue: "AEWV / a job offer" },
  { stream: "student", re: /student visa|confirmation of enrolment|\bcoe\b/i, cue: "a student visa" },
  { stream: "resident", re: /resident visa|residence/i, cue: "residence" },
  { stream: "visitor", re: /visitor visa/i, cue: "a visitor visa" },
];

export function classifyMigration(text: string): MigrationRouting | null {
  const purchase = PURCHASE.test(text);
  // A visa named as the applicant's CURRENT status ("on a visitor visa", "currently on
  // a student visa") is NOT a target book — it must not read as a competing stream when
  // a real target (AEWV, partner, …) is present.
  const cur = text.match(/\b(?:on|currently on|currently|hold|holding|current)\s+(?:a\s+|an\s+|my\s+)?(visitor|student|working holiday|work)\s+visa/i);
  const currentStream: MigrationStream | null = cur
    ? (/visitor/i.test(cur[1]) ? "visitor" : /student/i.test(cur[1]) ? "student" : null)
    : null;
  let hits = CUES.filter((c) => c.re.test(text));
  // Drop the current-status stream unless it's the only signal (then it IS the target).
  if (currentStream && hits.some((h) => h.stream !== currentStream)) {
    hits = hits.filter((h) => h.stream !== currentStream);
  }
  const streams = [...new Set(hits.map((h) => h.stream))];

  if (purchase && hits.length) return { status: "unrouted", reason: "mixed signals — purchase and visa cues; pick the book" };
  if (purchase && !hits.length) return { status: "unrouted", reason: "purchase-shaped — no visa stream" };
  if (!hits.length) return null; // not immigration-relevant → no banner
  if (streams.length > 1) return { status: "unrouted", reason: "mixed visa streams — pick the book" };

  return { status: "routed", stream: streams[0], cue: hits[0].cue };
}
