"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CriticalDate } from "@/lib/critical-dates";
import { kindLabel } from "@/lib/critical-dates";
import { confirmDate, rejectDate, clearDate } from "@/app/critical-date-actions";

/**
 * The on-matter critical-dates strip (settlement + finance/unconditional). Each date
 * shows its value, source, and confidence state — and NEVER presents an unconfirmed
 * extraction as fact. A suggested/review date is framed as a prompt the professional
 * must accept before the queue treats it as a real deadline; each can be confirmed,
 * corrected, or dismissed independently.
 */

const TONE: Record<CriticalDate["confidence"], { dot: string; label: string; chip: string }> = {
  confirmed: { dot: "bg-accent", label: "Confirmed", chip: "bg-accent-soft text-accent" },
  suggested: { dot: "bg-awaiting", label: "Suggested — confirm to track", chip: "bg-awaiting-soft text-awaiting" },
  review: { dot: "bg-error", label: "Low confidence — review the source", chip: "bg-error-soft text-error" },
};

export function CriticalDatesStrip({ matterId, dates }: { matterId: string; dates: CriticalDate[] }) {
  if (dates.length === 0) return null;
  return (
    <section className="glass-card glass-sheen space-y-4 rounded-2xl px-5 py-4" aria-label="Critical dates">
      {dates.map((d) => (
        <DateRow key={d.kind} matterId={matterId} date={d} />
      ))}
    </section>
  );
}

function DateRow({ matterId, date }: { matterId: string; date: CriticalDate }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(date.iso ?? "");
  const tone = TONE[date.confidence];

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      setEditing(false);
      router.refresh();
    });

  return (
    <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-3 ${pending ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{kindLabel(date.kind)}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="font-serif text-lg font-medium tracking-tight">{date.value}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {tone.label}
          </span>
        </div>
        {date.source ? (
          <div className="mt-1 text-xs text-muted">
            {date.fromDocument ? (
              <>
                ▤ {date.fromDocument.fileName}
                {date.fromDocument.page !== null ? ` · p.${date.fromDocument.page}` : ""}
              </>
            ) : (
              <span className="italic">“{date.source}”</span>
            )}
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={pending || !draft}
            onClick={() => run(() => confirmDate(matterId, date.kind, { value: draft, iso: draft || null }))}
            className="btn-primary rounded-md px-3 py-1.5 text-sm font-medium"
          >
            Save &amp; confirm
          </button>
          <button type="button" disabled={pending} onClick={() => setEditing(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {date.confidence !== "confirmed" ? (
            <button type="button" disabled={pending} onClick={() => run(() => confirmDate(matterId, date.kind))} className="btn-primary rounded-md px-3 py-1.5 font-medium">
              Confirm
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setDraft(date.iso ?? "");
              setEditing(true);
            }}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-inset"
          >
            Edit
          </button>
          {date.confidence === "confirmed" ? (
            <button type="button" disabled={pending} onClick={() => run(() => clearDate(matterId, date.kind))} title="Return to Briefly's suggestion" className="rounded-md border border-border px-3 py-1.5 text-muted hover:bg-inset hover:text-foreground">
              Unconfirm
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => run(() => rejectDate(matterId, date.kind))} title={`This isn't a ${date.kind} date`} className="rounded-md border border-border px-3 py-1.5 text-muted hover:bg-inset hover:text-foreground">
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
