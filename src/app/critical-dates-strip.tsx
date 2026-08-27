"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CriticalDate } from "@/lib/critical-dates";
import { confirmSettlement, rejectSettlement, clearSettlement } from "@/app/critical-date-actions";

/**
 * The on-matter critical-dates strip (settlement first). It shows the date, its
 * source, and its confidence state — and NEVER presents an unconfirmed extraction
 * as fact. A suggested/review date is framed as a prompt ("Confirm settlement
 * date") the professional must accept before the queue treats it as a real
 * deadline; the human can confirm, correct, or dismiss it.
 */

const TONE: Record<CriticalDate["confidence"], { dot: string; label: string; chip: string }> = {
  confirmed: { dot: "bg-accent", label: "Confirmed", chip: "bg-accent-soft text-accent" },
  suggested: { dot: "bg-awaiting", label: "Suggested — confirm to track", chip: "bg-awaiting-soft text-awaiting" },
  review: { dot: "bg-error", label: "Low confidence — review the source", chip: "bg-error-soft text-error" },
};

export function CriticalDatesStrip({ matterId, date }: { matterId: string; date: CriticalDate | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(date?.iso ?? "");

  if (!date) return null;
  const tone = TONE[date.confidence];

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      setEditing(false);
      router.refresh();
    });

  return (
    <section
      className={`glass-card glass-sheen rounded-2xl px-5 py-4 ${pending ? "opacity-60" : ""}`}
      aria-label="Critical dates"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Settlement date
          </div>
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

        {/* Controls depend on the state — but confirming is always the human gate. */}
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
              onClick={() => run(() => confirmSettlement(matterId, { value: draft, iso: draft || null }))}
              className="btn-primary rounded-md px-3 py-1.5 text-sm font-medium"
            >
              Save &amp; confirm
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {date.confidence !== "confirmed" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => confirmSettlement(matterId))}
                className="btn-primary rounded-md px-3 py-1.5 font-medium"
              >
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
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => clearSettlement(matterId))}
                title="Return to Briefly's suggestion"
                className="rounded-md border border-border px-3 py-1.5 text-muted hover:bg-inset hover:text-foreground"
              >
                Unconfirm
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => rejectSettlement(matterId))}
                title="This isn't a settlement date"
                className="rounded-md border border-border px-3 py-1.5 text-muted hover:bg-inset hover:text-foreground"
              >
                Not a settlement date
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
