/**
 * P5d — the migration Needs-Attention ladder. Pure and deterministic; no model, no
 * persistence, no property/finance language.
 *
 * Migration matters do NOT run the conveyancing urgency scorer (settlement/finance
 * windows, "waiting on N client details"). They rank on a fixed six-rule ladder,
 * FIRST MATCH WINS, and the queue card shows the matched REASON string — never a score:
 *
 *   1. PPI / further-information request due            (critical)
 *   2. A validity dies before the lodgement target      (critical)  ← stale-before-lodge
 *   3. Consultation within 48h and packet not approved  (critical)
 *   4. New material since the last review                (review)
 *   5. Unresolved date conflict                         (review)
 *   6. Ready to lodge except named gaps                 (waiting)
 *
 * Because first match wins: rule 2 beats rule 5 (a validity that dies before lodgement
 * is more urgent than two dates to reconcile), and rule 5 beats rule 6 — a conflict
 * ("we don't know which number is true") gets a human eye before the file is called
 * "waiting on the client", so the queue never says "waiting on Hua's passport" while
 * two expiries are unresolved. Nothing matches → "Prepared — ready to lodge".
 */

import type { Matter, MigrationProfile, Gap } from "./types";
import type { MatterChanges } from "./reviews";
import type { Urgency } from "./urgency";
import type { MigrationDateSlot } from "./migration-dates";
import { getBook } from "./migration-books";
import { buildMigrationGaps } from "./migration-gaps";
import { fillDatesFromText, slotStatus, staleSlotKeys } from "./migration-dates";

const HOUR = 3_600_000;
const BASE: Record<Urgency["priority"], number> = {
  critical: 500,
  review: 400,
  waiting: 300,
  ready: 200,
  parked: 100,
};

// A PPI / further-information request due date, if the date model ever carries one.
// No book produces this slot today, so rule 1 stays dormant until it does.
const PPI_ITEMS = new Set(["ppi_due", "further_info_due"]);
const LODGEMENT_ITEM = "lodgement_target";
const SHORT_ITEM: Record<string, string> = {
  passport_expiry: "passport",
  police_cert_validity: "police certificate",
  emedical_validity: "medical",
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}
function personName(profile: MigrationProfile, personId: string | undefined): string {
  if (!personId || personId === "matter") return "Matter";
  const a = profile.applicants.find((x) => x.id === personId);
  if (a) return firstName(a.fullName);
  if (profile.sponsor?.id === personId) return firstName(profile.sponsor.fullName);
  if (profile.employer?.id === personId) return profile.employer.legalName;
  return "Unassigned";
}
function humanDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[(m || 1) - 1]}`;
}
function relHours(h: number): string {
  if (h < 1) return "within the hour";
  if (h < 24) return `in ${Math.round(h)} hours`;
  const d = Math.round(h / 24);
  return d === 1 ? "tomorrow" : `in ${d} days`;
}
function joinItems(items: string[]): string {
  const shown = items.slice(0, 3);
  const extra = items.length - shown.length;
  let s =
    shown.length <= 1
      ? shown[0] ?? ""
      : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  if (extra > 0) s += ` (+${extra} more)`;
  return s;
}
function shortItem(itemKey: string): string {
  return SHORT_ITEM[itemKey] ?? itemKey.replace(/_/g, " ");
}

/** Build the (filled) date slots for a migration matter — cited spans only, never guessed. */
function slotsFor(matter: Matter, profile: MigrationProfile): MigrationDateSlot[] {
  const book = getBook(profile.stream);
  if (!book) return [];
  const sub = matter.submission ?? "";
  return fillDatesFromText(buildMigrationGaps(book, profile, sub).dateSlots, sub, profile);
}

/** The single dominant next action for the matched rule. */
function actionFor(rule: number, ctx: { newDocs: number; newMsgs: number }): string {
  switch (rule) {
    case 1:
      return "Prepare response";
    case 2:
      return "Review lodgement";
    case 3:
      return "Approve packet";
    case 4:
      return ctx.newDocs > 0
        ? ctx.newDocs === 1
          ? "Review document"
          : "Review documents"
        : ctx.newMsgs > 0
          ? "Review reply"
          : "Review new material";
    case 5:
      return "Resolve date conflict";
    case 6:
      return "Open matter";
    default:
      return "Open matter";
  }
}

/**
 * The migration urgency for one matter. Assumes a migration matter (result.migration
 * set) — the caller branches on isMigrationMatter. Returns the same Urgency shape the
 * conveyancing scorer does, so the queue renders both uniformly.
 */
export function computeMigrationUrgency(
  matter: Matter,
  changes: MatterChanges | null,
  now: number = Date.now(),
): Urgency {
  const profile = matter.result?.migration ?? null;
  const gaps: Gap[] = matter.result?.gaps ?? [];

  // Completed/preparing matters sit out of the daily ladder.
  if (!profile || matter.status === "completed") {
    return {
      priority: "parked",
      score: BASE.parked,
      reason: matter.status === "completed" ? "Complete" : "Still preparing",
      signals: [matter.status === "completed" ? "Matter complete" : "No open actions"],
      when: null,
      actionLabel: "Open matter",
    };
  }

  const slots = slotsFor(matter, profile);
  const lodge = slots.find((s) => s.itemKey === LODGEMENT_ITEM);
  const lodgeStatus = lodge ? slotStatus(lodge) : { state: "empty" as const };
  const lodgeHuman = lodgeStatus.state === "set" ? humanDate(lodgeStatus.value) : null;

  // Signals that back the ranking (shown under "Why is this here?").
  const signals: string[] = [];
  if (lodgeHuman) signals.push(`Lodgement target ${lodgeHuman}`);

  let rule = 0;
  let priority: Urgency["priority"] = "ready";
  let reason = "Prepared — ready to lodge";

  // --- Rule 1: PPI / further-information request due ---------------------------
  const ppi = slots
    .filter((s) => PPI_ITEMS.has(s.itemKey))
    .map((s) => ({ s, st: slotStatus(s) }))
    .find((x) => x.st.state === "set");
  if (ppi && ppi.st.state === "set") {
    rule = 1;
    priority = "critical";
    reason = `Further-information request due ${humanDate(ppi.st.value)}`;
    signals.unshift(reason);
  }

  // --- Rule 2: a validity dies before the lodgement target (stale-before-lodge) -
  if (!rule) {
    const stale = staleSlotKeys(slots);
    if (stale.size > 0) {
      const staleSlots = slots.filter((s) => stale.has(s.key));
      const names = staleSlots.map((s) => `${personName(profile, s.personId)} ${shortItem(s.itemKey)}`);
      rule = 2;
      priority = "critical";
      reason = `${joinItems(names)} ${names.length === 1 ? "expires" : "expire"} before the ${lodgeHuman} lodgement`;
      signals.unshift(reason);
      for (const s of staleSlots) {
        const st = slotStatus(s);
        if (st.state === "set")
          signals.push(`${personName(profile, s.personId)} ${shortItem(s.itemKey)} valid to ${humanDate(st.value)} — before lodgement`);
      }
    }
  }

  // --- Rule 3: consultation within 48h and packet not approved -----------------
  const consultH = matter.consultationAt ? (new Date(matter.consultationAt).getTime() - now) / HOUR : null;
  const consultSoon = consultH !== null && consultH >= 0 && consultH <= 48;
  const packetReady = !!matter.approvedAt && !(matter.updatedAt != null && matter.updatedAt > matter.approvedAt);
  if (!rule && consultSoon && !packetReady) {
    rule = 3;
    priority = "critical";
    reason = `Consultation ${relHours(consultH!)} — packet not approved`;
    signals.unshift(reason);
  }

  // --- Rule 4: new material since the last review ------------------------------
  const newDocs = changes?.newDocuments.length ?? 0;
  const newMsgs = changes?.newMessages ?? 0;
  const newFacts = changes?.newFacts.length ?? 0;
  if (!rule && (newDocs > 0 || newMsgs > 0 || newFacts > 0)) {
    rule = 4;
    priority = "review";
    reason =
      newDocs > 0
        ? `New ${newDocs === 1 ? "document" : "documents"} since your last review`
        : newMsgs > 0
          ? `Client replied — ${newMsgs} ${newMsgs === 1 ? "reply" : "replies"} to review`
          : `${newFacts} new ${newFacts === 1 ? "fact" : "facts"} since your last review`;
    signals.unshift(reason);
  }

  // --- Rule 5: unresolved date conflict ---------------------------------------
  // A conflict is "we don't know which number is true" — a human eye is needed
  // before the file can be called merely "waiting on the client". So it outranks
  // rule 6: never say "waiting on Hua's passport" while two expiries are unresolved.
  if (!rule) {
    const conflicts = slots
      .map((s) => ({ s, st: slotStatus(s) }))
      .filter((x) => x.st.state === "conflict");
    if (conflicts.length > 0) {
      const names = conflicts.map((x) => `${personName(profile, x.s.personId)} ${shortItem(x.s.itemKey)}`);
      rule = 5;
      priority = "review";
      reason = `Unresolved date conflict — ${joinItems(names)}`;
      signals.unshift(reason);
      for (const x of conflicts) {
        if (x.st.state === "conflict")
          signals.push(`${personName(profile, x.s.personId)} ${shortItem(x.s.itemKey)}: ${x.st.candidates.map((c) => c.value).join(" vs ")}`);
      }
    }
  }

  // --- Rule 6: ready to lodge except named gaps -------------------------------
  if (!rule && gaps.length > 0) {
    const names = gaps.map((g) => `${personName(profile, g.personId ?? "matter")} ${g.label}`);
    rule = 6;
    priority = "waiting";
    reason = `Ready to lodge except: ${joinItems(names)}`;
    signals.unshift(reason);
  }

  if (!rule) signals.unshift(gaps.length === 0 ? "Prepared — nothing outstanding" : "Prepared");

  // Firm override wins over the computed bucket (parity with the conveyancing scorer).
  if (matter.priorityOverride) {
    priority = matter.priorityOverride;
    signals.unshift("Priority set manually by you");
  }

  // The date chip: the lodgement target when known, else the consultation.
  const when = lodgeHuman
    ? `Lodge ${lodgeHuman}`
    : consultH !== null && consultH >= 0
      ? `Consultation ${relHours(consultH)}`
      : null;

  const score = BASE[priority] + (rule ? Math.max(0, 60 - rule * 8) : 0) + (matter.priorityOverride ? 95 : 0);

  return { priority, score, reason, signals, when, actionLabel: actionFor(rule, { newDocs, newMsgs }) };
}
