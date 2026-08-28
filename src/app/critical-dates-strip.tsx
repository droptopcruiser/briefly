"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CriticalDate, DateCandidate } from "@/lib/critical-date-types";
import { kindLabel, kindNoun } from "@/lib/critical-date-types";
import { confirmDate, rejectDate, clearDate } from "@/app/critical-date-actions";

/**
 * The on-matter critical-dates strip (settlement + finance/unconditional). It never
 * presents an unconfirmed extraction as fact. When sources DISAGREE it refuses to
 * choose: it shows each date with its own evidence and asks the professional which
 * source to use — a consequential confirmation (recorded with who + when), with a
 * "Keep unresolved" escape so nobody is forced to pick an unreliable date. A
 * confirmed date that a LATER source contradicts is reopened as stale, not hidden.
 */

const TONE: Record<CriticalDate["confidence"], { dot: string; label: string; chip: string }> = {
  confirmed: { dot: "bg-accent", label: "Confirmed", chip: "bg-accent-soft text-accent" },
  suggested: { dot: "bg-awaiting", label: "Suggested — confirm to track", chip: "bg-awaiting-soft text-awaiting" },
  review: { dot: "bg-error", label: "Low confidence — review the source", chip: "bg-error-soft text-error" },
  conflict: { dot: "bg-error", label: "Conflict — sources disagree", chip: "bg-error-soft text-error" },
};

/** A candidate's evidence line (page-cited document, or the verbatim quote). */
function Evidence({ c }: { c: DateCandidate }) {
  if (!c.source && !c.fromDocument) return null;
  return (
    <div className="text-xs text-muted">
      {c.fromDocument ? (
        <>
          ▤ {c.fromDocument.fileName}
          {c.fromDocument.page !== null ? `, p.${c.fromDocument.page}` : ""}
        </>
      ) : (
        <span className="italic">“{c.source}”</span>
      )}
    </div>
  );
}

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
  const [confirming, setConfirming] = useState<{
    value: string;
    iso: string | null;
    source?: string | null;
    fromDocument?: { fileName: string; page: number | null } | null;
  } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const noun = kindNoun(date.kind).toLowerCase();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      setEditing(false);
      setConfirming(null);
      router.refresh();
    });

  // The consequential confirmation step — shared by conflict resolution, stale
  // switching, and re-confirming. Says exactly what is being recorded.
  const confirmStep = confirming ? (
    <div className="space-y-2 rounded-lg border border-accent/60 bg-accent-soft/40 px-3.5 py-3">
      <p className="text-sm font-medium">
        Confirm {confirming.value} as the {noun} date?
      </p>
      <p className="text-xs text-muted">Recorded as confirmed by you, with the time and source.</p>
      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => confirmDate(matterId, date.kind, confirming))}
          className="btn-primary rounded-md px-3 py-1.5 text-sm font-medium"
        >
          Confirm {confirming.value}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset">
          Back
        </button>
      </div>
    </div>
  ) : null;

  const editRow = (
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
  );

  // ── CONFLICT — two+ dates disagree; the human resolves by choosing a source ──
  if (date.confidence === "conflict" && date.candidates && !editing) {
    if (collapsed) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-error/50 bg-error-soft/30 px-3.5 py-2.5 text-sm">
          <span className="text-error">
            <span aria-hidden="true">⚠</span> {kindLabel(date.kind)}: conflict left unresolved ({date.candidates.length} dates)
          </span>
          <button type="button" onClick={() => setCollapsed(false)} className="shrink-0 font-medium text-accent hover:text-accent-h">
            Resolve
          </button>
        </div>
      );
    }
    return (
      <div className={`space-y-3 rounded-lg border border-error/60 bg-error-soft/40 px-3.5 py-3 ${pending ? "opacity-60" : ""}`}>
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-error">
            <span aria-hidden="true">⚠</span>
            {kindLabel(date.kind)} conflict — {date.candidates.length} dates found
          </div>
          <p className="mt-1 text-xs text-muted">
            Briefly won&apos;t choose between them — this date can&apos;t drive urgency until it&apos;s resolved.
          </p>
        </div>

        {confirmStep ?? (
          <>
            <ul className="space-y-2">
              {date.candidates.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium">{c.value}</div>
                    <Evidence c={c} />
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirming({ value: c.value, iso: c.iso, source: c.source, fromDocument: c.fromDocument })}
                    className="shrink-0 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
                  >
                    Use {c.value}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs font-medium text-muted">Which source should Briefly use?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => { setDraft(""); setEditing(true); }} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset">
                Enter a different date
              </button>
              <button type="button" disabled={pending} onClick={() => setCollapsed(true)} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-inset hover:text-foreground">
                Keep unresolved
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── STALE — a confirmed date a LATER source now disagrees with ───────────────
  if (date.confidence === "confirmed" && date.stale && date.candidates && !editing) {
    return (
      <div className={`space-y-3 ${pending ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{kindLabel(date.kind)}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="font-serif text-lg font-medium tracking-tight">{date.value}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Confirmed by you
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-2 rounded-lg border border-awaiting/60 bg-awaiting-soft/50 px-3.5 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-awaiting">
            <span aria-hidden="true">⚠</span> A newer source disagrees with the confirmed date
          </div>
          {confirmStep ?? (
            <>
              <ul className="space-y-2">
                {date.candidates.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{c.value}</div>
                      <Evidence c={c} />
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirming({ value: c.value, iso: c.iso, source: c.source, fromDocument: c.fromDocument })}
                      className="shrink-0 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
                    >
                      Switch to {c.value}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => confirmDate(matterId, date.kind, { value: date.value, iso: date.iso, source: date.source, fromDocument: date.fromDocument }))}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-inset"
                >
                  Keep {date.value}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── NORMAL — confirmed (clean) / suggested / review ──────────────────────────
  const tone = TONE[date.confidence];
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
        <div className="mt-1">
          <Evidence c={{ value: date.value, iso: date.iso, source: date.source, fromDocument: date.fromDocument }} />
        </div>
      </div>

      {editing ? (
        editRow
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
            <button type="button" disabled={pending} onClick={() => run(() => rejectDate(matterId, date.kind))} title={`This isn't a ${noun} date`} className="rounded-md border border-border px-3 py-1.5 text-muted hover:bg-inset hover:text-foreground">
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
