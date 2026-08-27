import type { Matter, QueuePriority } from "./types";
import type { MatterChanges } from "./reviews";
import { formatWhen } from "./format";

/**
 * The urgency scorer — the brain of the Needs Attention queue.
 *
 * Readiness answers "how complete is this file?". Urgency answers the different
 * question a professional actually opens the app with: "what do I act on first,
 * what's blocking progress, and what changed since I last looked?". A file that is
 * 100% ready but settles in two months is less urgent than a 40% file with a
 * deadline tomorrow — so priority is derived from DATES, NEW ACTIVITY since the
 * last review, CHASE AGE, and readiness, in that order — never readiness alone.
 *
 * Pure and deterministic: given a matter + its since-review changes it returns a
 * bucket, a sortable score, a plain-English headline, and the explainable list of
 * signals behind the ranking ("why is this here?"). No model calls. Typed critical
 * dates (settlement/finance/cooling-off) plug into the same function next.
 */

export interface Urgency {
  priority: QueuePriority;
  /** Higher = more urgent. Sorts rows within a group and across the flat queue. */
  score: number;
  /** One-line, plain-English reason shown on the row — the URGENCY dimension. */
  reason: string;
  /** The signals that produced the ranking — shown under "Why is this here?". */
  signals: string[];
  /** A compact date chip when a real date is known (today only: consultation). */
  when: string | null;
  /** The ONE dominant next action for this state — the row's primary button label.
   *  The NEXT-ACTION dimension, kept distinct from urgency and readiness. */
  actionLabel: string;
}

export const PRIORITY_ORDER: QueuePriority[] = [
  "critical",
  "review",
  "waiting",
  "ready",
  "parked",
];

export const PRIORITY_META: Record<
  QueuePriority,
  { label: string; blurb: string }
> = {
  critical: {
    label: "Critical",
    blurb: "A consultation or date is close, or an action is overdue — handle first.",
  },
  review: {
    label: "Needs your review",
    blurb: "New information arrived that you haven't looked at yet.",
  },
  waiting: { label: "Waiting on client", blurb: "The next move is the client's." },
  ready: { label: "Ready to proceed", blurb: "Prepared — waiting on your action." },
  parked: { label: "No action today", blurb: "Complete or safely set aside." },
};

const DAY = 86_400_000;

/** Whole days until an ISO instant (negative = in the past). */
function daysUntil(iso: string, now: number): number {
  return Math.ceil((new Date(iso).getTime() - now) / DAY);
}
/** Whole days since an ISO instant, or null when absent. */
function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / DAY);
}
/** "today" / "tomorrow" / "in 3 days" / "5 days ago". */
function relDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** Join up to three item labels naturally, with "(+N more)" for the rest. */
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

/** Is this matter currently snoozed out of the queue? */
export function isSnoozed(matter: Matter, now: number = Date.now()): boolean {
  return !!matter.snoozedUntil && new Date(matter.snoozedUntil).getTime() > now;
}

const BASE: Record<QueuePriority, number> = {
  critical: 500,
  review: 400,
  waiting: 300,
  ready: 200,
  parked: 100,
};

/** The effective settlement date fed into scoring — only a CONFIRMED one may drive
 *  Critical (the safety rule: an unconfirmed extracted date never alarms). */
export interface SettlementInput {
  value: string;
  iso: string | null;
  confidence: "confirmed" | "suggested" | "review";
  source?: string | null;
}

export function computeUrgency(
  matter: Matter,
  changes: MatterChanges | null,
  now: number = Date.now(),
  settlement: SettlementInput | null = null,
): Urgency {
  const r = matter.result;
  const status = matter.status;
  const readiness = r?.readiness ?? 0;
  const gaps = r?.gaps ?? [];
  const gapLabels = gaps.map((g) => g.label);

  // --- Date signals: booked consultation + (confirmed) settlement deadline -------
  const consultDays = matter.consultationAt ? daysUntil(matter.consultationAt, now) : null;
  const consultSoon =
    consultDays !== null && consultDays >= 0 && consultDays <= 3 && status !== "completed";
  const consultUpcoming =
    consultDays !== null && consultDays > 3 && consultDays <= 14 && status !== "completed";

  // Settlement: ONLY a confirmed date drives urgency. suggested/review are prompts.
  const settleDays = settlement?.iso ? daysUntil(settlement.iso, now) : null;
  const settleConfirmed = settlement?.confidence === "confirmed";
  const settleSoon =
    settleConfirmed && settleDays !== null && settleDays >= 0 && settleDays <= 10 && status !== "completed";
  const settleUnconfirmed = !!settlement && settlement.confidence !== "confirmed";
  const blocker = gapLabels[0] ? gapLabels[0].toLowerCase() : null;
  const settlementLabel = settleSoon
    ? `Settlement ${relDays(settleDays!)}${blocker ? ` — ${blocker} still missing` : ""}`
    : null;

  // --- New-since-last-review signals -------------------------------------------
  const newDocs = changes?.newDocuments.length ?? 0;
  const newMsgs = changes?.newMessages ?? 0;
  const newFactsN = changes?.newFacts.length ?? 0;
  const drop =
    changes?.readinessDelta && changes.readinessDelta.to < changes.readinessDelta.from
      ? changes.readinessDelta
      : null;
  const hasNew = newDocs > 0 || newMsgs > 0 || newFactsN > 0;

  // --- Waiting / chase age ------------------------------------------------------
  const waitingDays = status === "awaiting_client" ? daysSince(matter.updatedAt, now) ?? 0 : 0;
  const chaseDays = daysSince(matter.lastNudgedAt, now);
  const overdueWaiting = status === "awaiting_client" && waitingDays >= 7;

  // --- Decide the bucket (highest applicable wins) -----------------------------
  let priority: QueuePriority;
  if (status === "completed" || status === "preparing") {
    priority = "parked";
  } else if (settleSoon || consultSoon || drop || overdueWaiting) {
    priority = "critical";
  } else if (status === "ready_for_review" || hasNew || settleUnconfirmed) {
    priority = "review";
  } else if (status === "awaiting_client") {
    priority = "waiting";
  } else if (status === "ready_for_you" || status === "in_progress") {
    priority = "ready";
  } else {
    priority = "parked";
  }

  // A firm can pin a matter to a bucket — that wins over the computed one.
  const overridden = !!matter.priorityOverride;
  if (matter.priorityOverride) priority = matter.priorityOverride;

  // --- Explainable signals (most-urgent first) ---------------------------------
  const signals: string[] = [];
  if (overridden) signals.push("Priority set manually by you");
  if (settlement) {
    if (settleConfirmed && settleDays !== null)
      signals.push(`Settlement ${relDays(settleDays)} (${settlement.value}) — confirmed`);
    else if (settlement.confidence === "suggested")
      signals.push(`Settlement date suggested: ${settlement.value} — confirm it to track the deadline`);
    else signals.push(`Possible settlement date: ${settlement.value} — review the source`);
    if (settlement.source) signals.push(`Date source: “${settlement.source}”`);
  }
  if (consultSoon || consultUpcoming)
    signals.push(`Consultation ${relDays(consultDays!)}`);
  if (drop) signals.push(`Readiness fell ${drop.from}% → ${drop.to}% since the last review`);
  if (newDocs > 0)
    signals.push(`${newDocs} ${newDocs === 1 ? "document" : "documents"} received — not yet reviewed`);
  if (newMsgs > 0)
    signals.push(`${newMsgs} client ${newMsgs === 1 ? "reply" : "replies"} since your last review`);
  if (newFactsN > 0 && newDocs === 0)
    signals.push(`${newFactsN} new ${newFactsN === 1 ? "fact" : "facts"} since your last review`);
  if (status === "awaiting_client") {
    const chaseClause =
      chaseDays === null ? "not chased yet" : chaseDays === 0 ? "chased today" : `chased ${chaseDays}d ago`;
    signals.push(
      `Waiting on the client ${waitingDays} ${waitingDays === 1 ? "day" : "days"} · ${chaseClause}`,
    );
    if (gapLabels.length) signals.push(`Outstanding: ${joinItems(gapLabels)}`);
  }
  if (status === "ready_for_review") signals.push("A follow-up is drafted — ready to review & send");
  if (status === "ready_for_you")
    signals.push(gaps.length === 0 ? "Prepared — nothing missing" : "Prepared — awaiting your action");
  if (status === "in_progress") signals.push("In progress — you're working this matter");
  if (readiness < 100 && status !== "completed" && status !== "awaiting_client" && gapLabels.length)
    signals.push(
      `Readiness ${readiness}% — ${gaps.length} required ${gaps.length === 1 ? "item" : "items"} missing`,
    );
  if (signals.length === 0) signals.push(status === "completed" ? "Matter complete" : "No open actions");

  // A human "Consultation today · 2:00 PM" — the date AND time we already know,
  // shown before the full typed-critical-dates system exists. consultationAt is a
  // wall-clock appointment, so it's formatted tz-agnostically (formatWhen), never
  // shifted by the server's zone.
  let consultLabel: string | null = null;
  if (consultDays !== null && status !== "completed") {
    const full = formatWhen(matter.consultationAt!, { compact: true }); // "27 Aug · 2:00 PM" | ""
    const timePart = full.includes("·") ? full.split("·").pop()!.trim() : "";
    consultLabel = `Consultation ${relDays(consultDays)}${timePart ? ` · ${timePart}` : ""}`;
  }

  // The review-bucket prompt when a settlement date is extracted but not confirmed.
  const settleConfirmPrompt =
    settlement?.confidence === "suggested"
      ? `Confirm settlement date — ${settlement.value}`
      : settlement?.confidence === "review"
        ? `Possible settlement date: ${settlement.value} — review source`
        : null;

  // --- Headline reason for the row ---------------------------------------------
  const reason = headlineFor(priority, {
    settleSoon,
    settlementLabel,
    settleConfirmPrompt,
    consultSoon,
    consultLabel,
    drop,
    overdueWaiting,
    waitingDays,
    chaseDays,
    newDocs,
    newMsgs,
    newFactsN,
    status,
    gapLabels,
  });

  // --- Sortable score ----------------------------------------------------------
  let score = BASE[priority];
  if (overridden) {
    score += 95; // pin near the top of the chosen bucket
  } else if (priority === "critical") {
    if (settleSoon) score += 100 - settleDays! * 8; // the sharpest conveyancing deadline
    if (consultSoon) score += 80 - consultDays! * 15;
    if (drop) score += Math.min(60, drop.from - drop.to);
    if (overdueWaiting) score += Math.min(60, waitingDays);
  } else if (priority === "review") {
    score += newDocs * 20 + newMsgs * 10 + newFactsN * 3;
    if (status === "ready_for_review") score += 15;
    if (settleUnconfirmed) score += settlement?.confidence === "suggested" ? 12 : 6;
  } else if (priority === "waiting") {
    score += Math.min(90, waitingDays * 3);
  } else if (priority === "ready") {
    score += readiness / 2;
    if (consultUpcoming) score += 20;
  }

  // The meta date chip — a confirmed settlement (not already the reason) leads,
  // else the consultation. Never duplicates the reason.
  let when: string | null = null;
  if (settleConfirmed && settleDays !== null && !settleSoon) {
    when = `Settlement ${relDays(settleDays)}`;
  } else if (consultLabel && !(priority === "critical" && consultSoon)) {
    when = consultLabel;
  }

  const actionLabel = actionFor(status, {
    newDocs,
    newMsgs,
    drop: !!drop,
    pendingChase: status === "awaiting_client" && !!matter.lastNudgedAt,
    settleUnconfirmed,
  });

  return { priority, score, reason, signals, when, actionLabel };
}

/**
 * The single dominant next action for a matter's state — a specific verb, never a
 * bare "Open". New activity wins over the resting state (a reply on a ready matter
 * is "Review reply", not "Open brief"). This is the NEXT-ACTION dimension the row
 * leads with; the rest of the controls sit behind "More".
 */
function actionFor(
  status: Matter["status"],
  ctx: { newDocs: number; newMsgs: number; drop: boolean; pendingChase: boolean; settleUnconfirmed: boolean },
): string {
  if (ctx.newDocs > 0) return ctx.newDocs === 1 ? "Review document" : "Review documents";
  if (ctx.newMsgs > 0) return "Review reply";
  if (ctx.settleUnconfirmed) return "Review settlement date";
  if (ctx.drop) return "Review changes";
  switch (status) {
    case "ready_for_review":
      return "Review & send draft";
    case "ready_for_you":
      return "Open brief";
    case "in_progress":
      return "Continue matter";
    case "awaiting_client":
      return ctx.pendingChase ? "Review follow-up" : "Open matter";
    case "preparing":
      return "Open matter";
    case "completed":
      return "Open matter";
    default:
      return "Open matter";
  }
}

function headlineFor(
  priority: QueuePriority,
  ctx: {
    settleSoon: boolean;
    settlementLabel: string | null;
    settleConfirmPrompt: string | null;
    consultSoon: boolean;
    consultLabel: string | null;
    drop: { from: number; to: number } | null;
    overdueWaiting: boolean;
    waitingDays: number;
    chaseDays: number | null;
    newDocs: number;
    newMsgs: number;
    newFactsN: number;
    status: Matter["status"];
    gapLabels: string[];
  },
): string {
  switch (priority) {
    case "critical":
      if (ctx.settleSoon) return ctx.settlementLabel ?? "Settlement approaching";
      if (ctx.consultSoon) return ctx.consultLabel ?? "Consultation soon — prepare now";
      if (ctx.drop) return `Readiness dropped ${ctx.drop.from}% → ${ctx.drop.to}% since last review`;
      if (ctx.overdueWaiting) return `Waiting ${ctx.waitingDays} days — follow-up overdue`;
      return "Needs attention now";
    case "review":
      if (ctx.newDocs > 0)
        return `New ${ctx.newDocs === 1 ? "document" : "documents"} arrived — needs review`;
      if (ctx.newMsgs > 0)
        return `Client replied — ${ctx.newMsgs} ${ctx.newMsgs === 1 ? "reply" : "replies"} to review`;
      if (ctx.status === "ready_for_review") return "Follow-up drafted — review & send";
      if (ctx.newFactsN > 0)
        return `${ctx.newFactsN} new ${ctx.newFactsN === 1 ? "fact" : "facts"} since you last looked`;
      if (ctx.settleConfirmPrompt) return ctx.settleConfirmPrompt;
      return "New activity to review";
    case "waiting": {
      const items = ctx.gapLabels.length ? joinItems(ctx.gapLabels) : "the client's response";
      const chase =
        ctx.chaseDays === null
          ? "not chased yet"
          : ctx.chaseDays === 0
            ? "chased today"
            : `chased ${ctx.chaseDays}d ago`;
      return `Waiting on ${items} · ${chase}`;
    }
    case "ready":
      return ctx.status === "in_progress"
        ? "In progress — you're working this"
        : "Prepared — awaiting your action";
    case "parked":
      return ctx.status === "completed" ? "Complete" : "Still preparing";
  }
}
