import type { Matter, QueuePriority } from "./types";
import type { MatterChanges } from "./reviews";
import { formatWhen } from "./format";
import { kindCriticalWindow, type CriticalDateKind, type DateConfidence } from "./critical-dates";

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

/** A typed critical date fed into scoring — only a CONFIRMED one may drive Critical
 *  (the safety rule: an unconfirmed extracted date never alarms). */
export interface CriticalDateInput {
  kind: CriticalDateKind;
  value: string;
  iso: string | null;
  confidence: DateConfidence;
  source?: string | null;
  /** A confirmed date a later source now disagrees with — surfaced, still confirmed. */
  stale?: boolean;
}

/** The urgency headline for a confirmed date of a kind (its own language). */
function dateReason(kind: CriticalDateKind, rel: string, blocker: string | null): string {
  const base = kind === "finance" ? `Finance approval due ${rel}` : `Settlement ${rel}`;
  return blocker ? `${base} — ${blocker} still missing` : base;
}
/** The review-bucket prompt when a date is extracted but not yet confirmed. */
function confirmPrompt(d: CriticalDateInput): string {
  const noun = d.kind === "finance" ? "finance date" : "settlement date";
  if (d.confidence === "conflict") return `Resolve ${noun} conflict — sources disagree`;
  return d.confidence === "suggested"
    ? `Confirm ${noun} — ${d.value}`
    : `Possible ${noun}: ${d.value} — review source`;
}
/** The confirmed date's meta chip, e.g. "Settlement in 30 days". */
function dateChip(kind: CriticalDateKind, rel: string): string {
  return kind === "finance" ? `Finance approval ${rel}` : `Settlement ${rel}`;
}

export function computeUrgency(
  matter: Matter,
  changes: MatterChanges | null,
  now: number = Date.now(),
  dates: CriticalDateInput[] = [],
): Urgency {
  const r = matter.result;
  const status = matter.status;
  const readiness = r?.readiness ?? 0;
  const gaps = r?.gaps ?? [];
  const gapLabels = gaps.map((g) => g.label);
  const blocker = gapLabels[0] ? gapLabels[0].toLowerCase() : null;

  // --- Consultation (a wall-clock appointment) ---------------------------------
  const consultDays = matter.consultationAt ? daysUntil(matter.consultationAt, now) : null;
  const consultSoon =
    consultDays !== null && consultDays >= 0 && consultDays <= 3 && status !== "completed";
  const consultUpcoming =
    consultDays !== null && consultDays > 3 && consultDays <= 14 && status !== "completed";

  // --- Typed critical dates: ONLY confirmed dates drive urgency ----------------
  const confirmedDated = dates
    .filter((d) => d.confidence === "confirmed" && d.iso)
    .map((d) => ({ d, days: daysUntil(d.iso!, now) }));
  // The soonest confirmed date inside its kind's critical window (settlement 10d,
  // finance 7d) — the deadline that makes this matter Critical.
  const topCrit =
    status === "completed"
      ? null
      : confirmedDated
          .filter((x) => x.days >= 0 && x.days <= kindCriticalWindow(x.d.kind))
          .sort((a, b) => a.days - b.days)[0] ?? null;
  // A confirmed date further out (or a different kind) → shown as a meta chip.
  const farConfirmed =
    confirmedDated
      .filter((x) => x.days >= 0 && (!topCrit || x.d.kind !== topCrit.d.kind))
      .sort((a, b) => a.days - b.days)[0] ?? null;
  // The most relevant UNCONFIRMED date → a "confirm this" prompt (never alarms).
  const topUnconfirmed =
    dates
      .filter((d) => d.confidence !== "confirmed")
      .sort((a, b) => {
        // A conflict is the most urgent to resolve, then a clear suggestion.
        const rank = (c: DateConfidence) => (c === "conflict" ? 0 : c === "suggested" ? 1 : 2);
        if (rank(a.confidence) !== rank(b.confidence)) return rank(a.confidence) - rank(b.confidence);
        return (a.iso ?? "9999").localeCompare(b.iso ?? "9999");
      })[0] ?? null;
  const critDateLabel = topCrit ? dateReason(topCrit.d.kind, relDays(topCrit.days), blocker) : null;

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
  } else if (topCrit || consultSoon || drop || overdueWaiting) {
    priority = "critical";
  } else if (status === "ready_for_review" || hasNew || topUnconfirmed) {
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
  for (const d of dates) {
    const rel = d.iso ? relDays(daysUntil(d.iso, now)) : "";
    if (d.confidence === "confirmed") {
      signals.push(`${dateReason(d.kind, rel, null)} (${d.value}) — confirmed`);
      if (d.stale)
        signals.push(`A newer source disagrees with the confirmed ${d.kind} date — review it`);
    } else {
      signals.push(confirmPrompt(d));
      if (d.confidence === "conflict") signals.push(`Dates found: ${d.value} — confirm the correct one`);
    }
    if (d.source) signals.push(`Date source: “${d.source}”`);
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

  // The review-bucket prompt when a date is extracted but not confirmed.
  const dateConfirmPrompt = topUnconfirmed ? confirmPrompt(topUnconfirmed) : null;

  // --- Headline reason for the row ---------------------------------------------
  const reason = headlineFor(priority, {
    critDateLabel,
    dateConfirmPrompt,
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
    if (topCrit) score += 100 - topCrit.days * 8; // the sharpest conveyancing deadline
    if (consultSoon) score += 80 - consultDays! * 15;
    if (drop) score += Math.min(60, drop.from - drop.to);
    if (overdueWaiting) score += Math.min(60, waitingDays);
  } else if (priority === "review") {
    score += newDocs * 20 + newMsgs * 10 + newFactsN * 3;
    if (status === "ready_for_review") score += 15;
    if (topUnconfirmed)
      score += topUnconfirmed.confidence === "conflict" ? 14 : topUnconfirmed.confidence === "suggested" ? 12 : 6;
  } else if (priority === "waiting") {
    score += Math.min(90, waitingDays * 3);
  } else if (priority === "ready") {
    score += readiness / 2;
    if (consultUpcoming) score += 20;
  }

  // The meta date chip — a confirmed date that isn't already the reason leads,
  // else the consultation. Never duplicates the reason.
  let when: string | null = null;
  if (farConfirmed) {
    when = dateChip(farConfirmed.d.kind, relDays(farConfirmed.days));
  } else if (consultLabel && !(priority === "critical" && consultSoon)) {
    when = consultLabel;
  }

  const actionLabel = actionFor(status, {
    newDocs,
    newMsgs,
    drop: !!drop,
    pendingChase: status === "awaiting_client" && !!matter.lastNudgedAt,
    // A confirmed critical date drives the row → keep its state action; only prompt
    // "Review <kind> date" when the unconfirmed date is the actual reason it's here.
    unconfirmedKind: topCrit ? null : topUnconfirmed?.kind ?? null,
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
  ctx: {
    newDocs: number;
    newMsgs: number;
    drop: boolean;
    pendingChase: boolean;
    unconfirmedKind: CriticalDateKind | null;
  },
): string {
  if (ctx.newDocs > 0) return ctx.newDocs === 1 ? "Review document" : "Review documents";
  if (ctx.newMsgs > 0) return "Review reply";
  if (ctx.unconfirmedKind) return `Review ${ctx.unconfirmedKind === "finance" ? "finance" : "settlement"} date`;
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
    critDateLabel: string | null;
    dateConfirmPrompt: string | null;
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
      if (ctx.critDateLabel) return ctx.critDateLabel;
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
      if (ctx.dateConfirmPrompt) return ctx.dateConfirmPrompt;
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
