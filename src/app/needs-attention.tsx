"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MatterStatus, QueuePriority } from "@/lib/types";
import { markMatterReviewed, assignMatter } from "@/app/actions";
import { snoozeMatter, unsnoozeMatter, setQueuePriority, undoReview } from "@/app/queue-actions";

/**
 * The Needs Attention queue — the dashboard's command centre. Each row keeps three
 * things VISIBLY SEPARATE, because they answer different questions:
 *   · URGENCY   — why it's here now (the reason, coloured by bucket)
 *   · READINESS — how prepared the file is (a labelled "Prep" meter, never a bare
 *                 % that reads as "done")
 *   · ACTION    — the one dominant next step (a state-specific primary button)
 * Everything else — assign, snooze, change priority, confirm review — sits behind
 * "More actions" so a row reads as a task, not a control panel. The ranking is
 * computed server-side (src/lib/urgency.ts); this renders it and turns Briefly's
 * read into one-click action, human gate intact.
 */

export interface QueueRow {
  id: string;
  href: string;
  clientName: string;
  rubricName: string | null;
  status: MatterStatus;
  readiness: number | null;
  gapsCount: number;
  reason: string;
  detail: string | null;
  actionLabel: string;
  signals: string[];
  when: string | null;
  assignee: string | null;
  priorityOverride: QueuePriority | null;
}
export interface QueueGroup {
  priority: QueuePriority;
  label: string;
  blurb: string;
  items: QueueRow[];
}
export interface SnoozedRow {
  id: string;
  href: string;
  clientName: string;
  rubricName: string | null;
}

const DOT: Record<QueuePriority, string> = {
  critical: "bg-error",
  review: "bg-awaiting",
  waiting: "bg-muted",
  ready: "bg-accent",
  parked: "bg-muted",
};
const LABEL_TONE: Record<QueuePriority, string> = {
  critical: "text-error",
  review: "text-awaiting",
  waiting: "text-muted",
  ready: "text-accent",
  parked: "text-muted",
};

const PRIORITY_OPTS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto priority" },
  { value: "critical", label: "Critical" },
  { value: "review", label: "Needs review" },
  { value: "waiting", label: "Waiting on client" },
  { value: "ready", label: "Ready to proceed" },
  { value: "parked", label: "No action today" },
];

export function NeedsAttention({
  groups,
  members,
  snoozed,
}: {
  groups: QueueGroup[];
  members: { userId: string; label: string }[];
  snoozed: SnoozedRow[];
}) {
  const active = groups.filter((g) => g.items.length > 0);
  const totalActive = active.reduce((n, g) => n + g.items.length, 0);

  if (totalActive === 0) {
    return (
      <div className="glass-card glass-sheen rounded-2xl px-5 py-12 text-center">
        <p className="text-sm font-medium">You&apos;re clear.</p>
        <p className="mt-1 text-sm text-muted">
          Nothing needs you right now — Briefly is watching the inbox and will surface the next
          thing here the moment it needs a decision.
        </p>
        {snoozed.length > 0 ? <SnoozedFooter snoozed={snoozed} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {active.map((g) => (
        <section key={g.priority} className="space-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className={`h-2 w-2 shrink-0 translate-y-[3px] rounded-full ${DOT[g.priority]}`} />
            <h3 className={`text-sm font-semibold uppercase tracking-wide ${LABEL_TONE[g.priority]}`}>
              {g.label}
            </h3>
            <span className="text-xs text-muted tabular-nums">{g.items.length}</span>
            <span className="hidden text-xs text-muted sm:inline">· {g.blurb}</span>
          </div>
          <div className="glass-card glass-sheen overflow-hidden rounded-2xl">
            <ul className="divide-y divide-border/60">
              {g.items.map((row) => (
                <li key={row.id}>
                  <Row row={row} priority={g.priority} members={members} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
      {snoozed.length > 0 ? <SnoozedFooter snoozed={snoozed} /> : null}
    </div>
  );
}

/** READINESS dimension — a labelled meter, explicitly "Prep", so 100% reads as
 *  "fully prepared" and never gets confused with "nothing left to do". */
function Prep({ readiness, gaps }: { readiness: number; gaps: number }) {
  const done = readiness >= 100;
  const bar = done ? "bg-accent" : readiness >= 60 ? "bg-awaiting" : "bg-error";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Prep</span>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-inset">
        <span className={`block h-full rounded-full ${bar}`} style={{ width: `${readiness}%` }} />
      </span>
      <span className="tabular-nums text-foreground/70">{readiness}%</span>
      <span className="text-muted">
        {done ? "· ready" : gaps > 0 ? `· ${gaps} ${gaps === 1 ? "item" : "items"} missing` : ""}
      </span>
    </span>
  );
}

function Row({
  row,
  priority,
  members,
}: {
  row: QueueRow;
  priority: QueuePriority;
  members: { userId: string; label: string }[];
}) {
  const router = useRouter();
  const [why, setWhy] = useState(false);
  const [more, setMore] = useState(false);
  const [pending, startTransition] = useTransition();
  const [justReviewed, setJustReviewed] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  // Confirm review — records a baseline, then leaves a 6s Undo window before the
  // queue re-ranks (so it never feels like the matter silently vanished).
  function confirmReview() {
    const fd = new FormData();
    fd.set("id", row.id);
    setJustReviewed(true);
    startTransition(async () => {
      await markMatterReviewed(fd);
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => router.refresh(), 6000);
  }
  function undo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setJustReviewed(false);
    run(() => undoReview(row.id));
  }

  return (
    <div className={`px-4 py-4 transition-opacity ${pending && !justReviewed ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Identity */}
          <div className="truncate">
            <Link href={row.href} className="font-serif text-[15px] font-medium tracking-tight hover:underline">
              {row.clientName}
            </Link>
            {row.rubricName ? <span className="text-sm text-muted"> · {row.rubricName}</span> : null}
          </div>

          {/* URGENCY — why it's here now */}
          <div className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${DOT[priority]}`} />
            <span className="font-medium text-foreground">{row.reason}</span>
          </div>

          {/* The exact change (review rows) */}
          {row.detail ? <div className="pl-4 text-xs text-muted">{row.detail}</div> : null}

          {/* READINESS + owner — a separate, labelled dimension */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-4 text-xs text-muted">
            {typeof row.readiness === "number" ? <Prep readiness={row.readiness} gaps={row.gapsCount} /> : null}
            {typeof row.readiness === "number" ? <span aria-hidden="true">·</span> : null}
            <span>{row.assignee ? row.assignee : "Unassigned"}</span>
          </div>
        </div>

        {/* NEXT ACTION — the one dominant, state-specific button */}
        <Link
          href={row.href}
          className="btn-primary inline-flex shrink-0 items-center gap-1 rounded-md px-3.5 py-2 text-sm font-medium"
        >
          {row.actionLabel} →
        </Link>
      </div>

      {/* Secondary line: explainability + more actions + the review audit note */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-4 text-xs">
        <button
          type="button"
          onClick={() => setWhy((v) => !v)}
          aria-expanded={why}
          className="text-accent underline decoration-dotted underline-offset-2 hover:text-accent-h"
        >
          {why ? "Hide why" : "Why is this here?"}
        </button>
        {justReviewed ? (
          <span className="text-muted">
            Reviewed just now ·{" "}
            <button type="button" onClick={undo} className="font-medium text-accent hover:text-accent-h">
              Undo
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className="text-muted hover:text-foreground"
          >
            {more ? "Fewer actions" : "More actions"}
          </button>
        )}
      </div>

      {/* Why is this here? — the signals behind the ranking */}
      {why ? (
        <ul className="ml-4 mt-2.5 space-y-1 rounded-lg border border-border bg-inset/60 px-3.5 py-2.5">
          {row.signals.map((s, i) => (
            <li key={i} className="flex gap-2 text-xs text-foreground/80">
              <span aria-hidden="true" className="text-muted">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* More actions — secondary controls, out of the row's default reading path */}
      {more && !justReviewed ? (
        <div className="ml-4 mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-inset/60 px-3.5 py-2.5 text-xs">
          <button
            type="button"
            disabled={pending}
            onClick={confirmReview}
            className="rounded-md border border-border bg-surface px-2.5 py-1 font-medium hover:bg-inset disabled:opacity-60"
          >
            Confirm review
          </button>
          <select
            aria-label="Assign"
            disabled={pending}
            value={members.find((m) => m.label === row.assignee)?.userId ?? ""}
            onChange={(e) => run(() => assignMatter(row.id, e.target.value || null))}
            className="rounded-md border border-border bg-raise px-2 py-1 text-muted hover:text-foreground disabled:opacity-60"
          >
            <option value="">Assign…</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Snooze"
            disabled={pending}
            value=""
            onChange={(e) => {
              const d = Number(e.target.value);
              if (d > 0) run(() => snoozeMatter(row.id, d));
            }}
            className="rounded-md border border-border bg-raise px-2 py-1 text-muted hover:text-foreground disabled:opacity-60"
          >
            <option value="">Snooze…</option>
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">1 week</option>
          </select>
          <select
            aria-label="Change priority"
            disabled={pending}
            value={row.priorityOverride ?? "auto"}
            onChange={(e) =>
              run(() => setQueuePriority(row.id, e.target.value === "auto" ? null : (e.target.value as QueuePriority)))
            }
            className="rounded-md border border-border bg-raise px-2 py-1 text-muted hover:text-foreground disabled:opacity-60"
          >
            {PRIORITY_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function SnoozedFooter({ snoozed }: { snoozed: SnoozedRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted hover:text-foreground"
      >
        {open ? "Hide" : "Show"} snoozed ({snoozed.length})
      </button>
      {open ? (
        <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border">
          {snoozed.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Link href={s.href} className="min-w-0 flex-1 truncate hover:underline">
                <span className="font-medium">{s.clientName}</span>
                {s.rubricName ? <span className="text-muted"> · {s.rubricName}</span> : null}
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await unsnoozeMatter(s.id);
                    router.refresh();
                  })
                }
                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-inset disabled:opacity-60"
              >
                Unsnooze
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
