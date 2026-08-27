"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MatterStatus, QueuePriority } from "@/lib/types";
import { markMatterReviewed, assignMatter } from "@/app/actions";
import { snoozeMatter, unsnoozeMatter, setQueuePriority } from "@/app/queue-actions";

/**
 * The Needs Attention queue — the dashboard's command centre. Matters are grouped
 * by URGENCY (Critical · Needs review · Waiting · Ready · Parked), each row carries
 * a plain-English reason, an expandable "Why is this here?" that shows the signals
 * behind the ranking, and inline controls: open, mark reviewed, assign, snooze,
 * change priority. The ranking is computed server-side (src/lib/urgency.ts); this
 * component renders it and turns Briefly's read into one-click action.
 */

export interface QueueRow {
  id: string;
  href: string;
  clientName: string;
  rubricName: string | null;
  status: MatterStatus;
  readiness: number | null;
  reason: string;
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

const READY_TONE = (v: number) =>
  v >= 100 ? "bg-accent text-accent-fg" : v >= 60 ? "bg-awaiting-soft text-awaiting" : "bg-error-soft text-error";

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
                  <Row row={row} members={members} />
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

function Row({ row, members }: { row: QueueRow; members: { userId: string; label: string }[] }) {
  const router = useRouter();
  const [why, setWhy] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className={`px-4 py-3.5 transition-opacity ${pending ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Identity */}
          <div className="truncate">
            <Link href={row.href} className="font-serif text-[15px] font-medium tracking-tight hover:underline">
              {row.clientName}
            </Link>
            {row.rubricName ? <span className="text-sm text-muted"> · {row.rubricName}</span> : null}
          </div>
          {/* Reason — the one-line decision cue */}
          <div className="mt-0.5 text-sm text-foreground/80">{row.reason}</div>
          {/* Quiet meta */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {row.when ? <span>{row.when}</span> : null}
            {row.when && row.assignee ? <span aria-hidden="true">·</span> : null}
            <span>{row.assignee ? row.assignee : "Unassigned"}</span>
            <button
              type="button"
              onClick={() => setWhy((v) => !v)}
              aria-expanded={why}
              className="text-accent underline decoration-dotted underline-offset-2 hover:text-accent-h"
            >
              {why ? "Hide why" : "Why is this here?"}
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {typeof row.readiness === "number" ? (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${READY_TONE(row.readiness)}`}>
              {row.readiness}%
            </span>
          ) : null}
          <Link
            href={row.href}
            className="btn-control inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium"
          >
            Open →
          </Link>
        </div>
      </div>

      {/* Why is this here? — the signals behind the ranking */}
      {why ? (
        <ul className="mt-2.5 space-y-1 rounded-lg border border-border bg-inset/60 px-3.5 py-2.5">
          {row.signals.map((s, i) => (
            <li key={i} className="flex gap-2 text-xs text-foreground/80">
              <span aria-hidden="true" className="text-muted">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Controls — insight to action in one click, human gate intact */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("id", row.id);
            run(() => markMatterReviewed(fd));
          }}
          className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-inset disabled:opacity-60"
        >
          Mark reviewed
        </button>

        <select
          aria-label="Assign"
          disabled={pending}
          value={members.find((m) => m.label === row.assignee)?.userId ?? ""}
          onChange={(e) => run(() => assignMatter(row.id, e.target.value || null))}
          className="rounded-md border border-border bg-raise px-2 py-1 text-muted hover:text-foreground disabled:opacity-60"
        >
          <option value="">Unassigned</option>
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
