"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MatterStatus, QueuePriority } from "@/lib/types";
import { markMatterReviewed, assignMatter } from "@/app/actions";
import { snoozeMatter, unsnoozeMatter, setQueuePriority, undoReview } from "@/app/queue-actions";
import {
  bulkMarkReviewed,
  bulkUndoReviewed,
  bulkSnooze,
  bulkUnsnooze,
  bulkAssign,
  restoreAssignments,
} from "@/app/batch-actions";

/**
 * The Needs Attention queue — the dashboard's command centre. Each row keeps three
 * things VISIBLY SEPARATE (urgency reason · labelled "Prep" meter · one dominant
 * next action). Rows can be selected for SAFE bulk actions (Mark reviewed / Snooze
 * / Assign) via a toolbar that appears only once something is selected — the queue
 * stays calm until then. Bulk send, approve, date-confirmation, and conflict
 * resolution are deliberately absent; those stay per-matter with their own gate.
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
  assigneeId: string | null;
  priorityOverride: QueuePriority | null;
  settlementWarning: string | null;
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
type FlatRow = QueueRow & { priority: QueuePriority };
type Member = { userId: string; label: string };

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
const PRIORITY_LABEL: Record<QueuePriority, string> = {
  critical: "Critical",
  review: "Needs review",
  waiting: "Waiting",
  ready: "Ready",
  parked: "Parked",
};

const PRIORITY_OPTS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto priority" },
  { value: "critical", label: "Critical" },
  { value: "review", label: "Needs review" },
  { value: "waiting", label: "Waiting on client" },
  { value: "ready", label: "Ready to proceed" },
  { value: "parked", label: "No action today" },
];

function fmtReturn(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function NeedsAttention({
  groups,
  members,
  snoozed,
}: {
  groups: QueueGroup[];
  members: Member[];
  snoozed: SnoozedRow[];
}) {
  const active = groups.filter((g) => g.items.length > 0);
  const totalActive = active.reduce((n, g) => n + g.items.length, 0);

  const allRows = useMemo<FlatRow[]>(
    () => active.flatMap((g) => g.items.map((r) => ({ ...r, priority: g.priority }))),
    [active],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<unknown> } | null>(null);

  // Prune selection to rows that still exist after a refresh.
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(allRows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [allRows]);

  const selectedRows = allRows.filter((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setSelected(new Set());

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
    <div className="space-y-6 pb-20">
      {active.map((g) => (
        <section key={g.priority} className="space-y-2.5">
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-2.5">
              <span className={`h-2 w-2 shrink-0 translate-y-[3px] rounded-full ${DOT[g.priority]}`} />
              <h3 className={`text-sm font-semibold uppercase tracking-wide ${LABEL_TONE[g.priority]}`}>
                {g.label}
              </h3>
              <span className="text-xs text-muted tabular-nums">{g.items.length}</span>
            </div>
            {/* Define the category so the user never has to guess what qualifies. */}
            <p className="pl-[18px] text-xs text-muted">{g.blurb}</p>
          </div>
          <div className="glass-card glass-sheen overflow-hidden rounded-2xl">
            <ul className="divide-y divide-border/60">
              {g.items.map((row) => (
                <li key={row.id}>
                  <Row
                    row={row}
                    priority={g.priority}
                    members={members}
                    selected={selected.has(row.id)}
                    onToggle={() => toggle(row.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
      {snoozed.length > 0 ? <SnoozedFooter snoozed={snoozed} /> : null}

      {selectedRows.length > 0 ? (
        <BulkBar
          rows={selectedRows}
          members={members}
          onClear={clear}
          onActed={(u) => {
            setUndo(u);
            clear();
          }}
        />
      ) : undo ? (
        <UndoBar undo={undo} onClose={() => setUndo(null)} />
      ) : null}
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
  selected,
  onToggle,
}: {
  row: QueueRow;
  priority: QueuePriority;
  members: Member[];
  selected: boolean;
  onToggle: () => void;
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
    <div className={`px-4 py-4 transition-opacity ${pending && !justReviewed ? "opacity-50" : ""} ${selected ? "bg-accent-soft/40" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${row.clientName}`}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
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

          {/* DATE (when known) + READINESS + owner — separate, labelled dimensions */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-4 text-xs text-muted">
            {row.when ? (
              <>
                <span className="font-medium text-foreground/75">{row.when}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
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
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-11 text-xs">
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
        <ul className="ml-11 mt-2.5 space-y-1 rounded-lg border border-border bg-inset/60 px-3.5 py-2.5">
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
        <div className="ml-11 mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-inset/60 px-3.5 py-2.5 text-xs">
          <button
            type="button"
            disabled={pending}
            onClick={confirmReview}
            title="Marks this queue item as seen — it does NOT confirm the extracted facts (confirm those inside the matter)."
            className="rounded-md border border-border bg-surface px-2.5 py-1 font-medium hover:bg-inset disabled:opacity-60"
          >
            Confirm review
          </button>
          <select
            aria-label="Assign"
            disabled={pending}
            value={members.find((m) => m.userId === row.assigneeId)?.userId ?? ""}
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
          <p className="w-full text-[11px] leading-snug text-muted">
            <span className="font-medium">Confirm review</span> marks this item as seen — it doesn&apos;t
            confirm the extracted facts. Confirm those inside the matter.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The bulk toolbar — appears only when ≥1 row is selected. Every action is SAFE
 *  (seen / snoozed / assigned), each explains itself before applying, and each
 *  hands an Undo up to the parent. */
function BulkBar({
  rows,
  members,
  onClear,
  onActed,
}: {
  rows: FlatRow[];
  members: Member[];
  onClear: () => void;
  onActed: (u: { label: string; run: () => Promise<unknown> }) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "reviewed" | "snooze" | "assign">(null);
  const [snoozeDays, setSnoozeDays] = useState(3);
  const [assignTo, setAssignTo] = useState("");
  const [pending, startTransition] = useTransition();

  const ids = rows.map((r) => r.id);
  const count = ids.length;
  const noun = count === 1 ? "matter" : "matters";
  const warnRows = rows.filter((r) => r.settlementWarning);

  // A per-priority breakdown so a mixed selection is explicit.
  const breakdown = useMemo(() => {
    const by = new Map<QueuePriority, number>();
    for (const r of rows) by.set(r.priority, (by.get(r.priority) ?? 0) + 1);
    return [...by.entries()].map(([p, n]) => `${n} ${PRIORITY_LABEL[p]}`).join(" · ");
  }, [rows]);

  const act = (label: string, action: () => Promise<unknown>, undoRun: () => Promise<unknown>) =>
    startTransition(async () => {
      await action();
      setMode(null);
      onActed({ label, run: undoRun });
      router.refresh();
    });

  const doReviewed = () => act(`${count} ${count === 1 ? "item" : "items"} marked reviewed`, () => bulkMarkReviewed(ids), () => bulkUndoReviewed(ids));
  const doSnooze = () => act(`${count} ${noun} snoozed`, () => bulkSnooze(ids, snoozeDays), () => bulkUnsnooze(ids));
  const doAssign = () => {
    const prev = rows.map((r) => ({ id: r.id, userId: r.assigneeId }));
    const userId = assignTo === "__unassign__" ? null : assignTo || null;
    act(`${count} ${noun} reassigned`, () => bulkAssign(ids, userId), () => restoreAssignments(prev));
  };

  const assigneeLabel =
    assignTo === "__unassign__" ? "Unassigned" : members.find((m) => m.userId === assignTo)?.label ?? null;

  return (
    <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="glass-card w-full max-w-2xl overflow-hidden rounded-2xl">
        {/* Contextual panel above the bar */}
        {mode === "reviewed" ? (
          <div className="space-y-2 border-b border-border px-4 py-3 text-sm">
            <p className="font-medium">Mark {count} {count === 1 ? "item" : "items"} as reviewed?</p>
            <p className="text-xs text-muted">
              This records that you have <span className="font-medium">seen</span> these queue items. It
              does not confirm extracted facts, approve drafts, or resolve conflicts.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={pending} onClick={doReviewed} className="btn-primary rounded-md px-3 py-1.5 text-sm font-medium">
                Mark reviewed
              </button>
              <button type="button" onClick={() => setMode(null)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset">
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {mode === "snooze" ? (
          <div className="space-y-2 border-b border-border px-4 py-3 text-sm">
            <p className="font-medium">Snooze {count} {noun}</p>
            <div className="flex flex-wrap items-center gap-2">
              {[1, 3, 7, 14].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSnoozeDays(d)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    snoozeDays === d ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {d === 1 ? "1 day" : d === 7 ? "1 week" : d === 14 ? "2 weeks" : `${d} days`}
                </button>
              ))}
              <span className="text-xs text-muted">Returns {fmtReturn(snoozeDays)}</span>
            </div>
            {warnRows.length > 0 ? (
              <div className="rounded-lg border border-awaiting bg-awaiting-soft px-3 py-2 text-xs text-awaiting">
                <span className="font-medium">
                  {warnRows.length} selected {warnRows.length === 1 ? "matter has" : "matters have"} a confirmed
                  settlement date soon:
                </span>{" "}
                {warnRows.map((r) => `${r.clientName} (${r.settlementWarning})`).join("; ")}. Snoozing hides{" "}
                {warnRows.length === 1 ? "it" : "them"} until {fmtReturn(snoozeDays)}.
              </div>
            ) : null}
            <div className="flex gap-2 pt-1">
              <button type="button" disabled={pending} onClick={doSnooze} className="btn-primary rounded-md px-3 py-1.5 text-sm font-medium">
                Snooze until {fmtReturn(snoozeDays)}
              </button>
              <button type="button" onClick={() => setMode(null)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset">
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {mode === "assign" ? (
          <div className="space-y-2 border-b border-border px-4 py-3 text-sm">
            <p className="font-medium">Assign {count} {noun}</p>
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="">Choose an assignee…</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.label}
                </option>
              ))}
              <option value="__unassign__">Unassigned</option>
            </select>
            {assigneeLabel ? (
              <p className="text-xs text-muted">
                {assignTo === "__unassign__" ? `Unassign all ${count} ${noun}?` : `Assign all ${count} ${noun} to `}
                {assignTo === "__unassign__" ? null : <span className="font-medium text-foreground">{assigneeLabel}</span>}
              </p>
            ) : null}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={pending || !assignTo}
                onClick={doAssign}
                className="btn-primary rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
              >
                Apply
              </button>
              <button type="button" onClick={() => setMode(null)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset">
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* The bar itself */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
          <span className="font-medium">
            {count} selected
            {breakdown ? <span className="ml-1 font-normal text-muted">· {breakdown}</span> : null}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setMode(mode === "reviewed" ? null : "reviewed")} className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-inset">
              Mark reviewed
            </button>
            <button type="button" onClick={() => setMode(mode === "snooze" ? null : "snooze")} className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-inset">
              Snooze
            </button>
            <button type="button" onClick={() => setMode(mode === "assign" ? null : "assign")} className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-inset">
              Assign
            </button>
            <button type="button" onClick={onClear} className="rounded-md px-3 py-1.5 text-muted hover:text-foreground">
              Clear selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The Undo bar shown immediately after a bulk action, until dismissed. */
function UndoBar({
  undo,
  onClose,
}: {
  undo: { label: string; run: () => Promise<unknown> };
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="glass-card flex items-center gap-3 rounded-full px-5 py-2.5 text-sm">
        <span className="font-medium">{undo.label}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await undo.run();
              onClose();
              router.refresh();
            })
          }
          className="font-medium text-accent hover:text-accent-h disabled:opacity-60"
        >
          Undo
        </button>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
          Dismiss
        </button>
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
