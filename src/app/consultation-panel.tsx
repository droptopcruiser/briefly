"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/app/pending-button";
import {
  prepareConsultationPacket,
  setConsultationDate,
  clearConsultationDate,
  completePacketJudgment,
  refreshPacket,
  approvePacket,
} from "@/app/consultation-actions";
import type { WorkPacket } from "@/lib/consultation-packet";
import { formatWhen, weekday, toWallClock } from "@/lib/format";

/**
 * The Consultation plan — the "we're meeting, how do we use this well" view. A
 * deliberately distinct professional moment from the Matter record (the facts) and
 * Next step (the current decision). It does NOT reprint the facts: a tiny snapshot,
 * then purpose · resolve today · agenda · questions · changes since intake · next
 * commitment. Prepared on demand (a date is optional); works even before the matter
 * is complete, highlighting what's still missing rather than pretending it's done.
 */
export function ConsultationPanel({
  matterId,
  initialConsultationAt,
  initialPacket,
  initialStale,
  incomplete,
  missing,
}: {
  matterId: string;
  initialConsultationAt: string | null;
  initialPacket: WorkPacket | null;
  initialStale: boolean;
  /** Matter isn't 100% ready — the plan is based on what's currently known. */
  incomplete: boolean;
  /** Outstanding required items, surfaced so the meeting can chase them. */
  missing: { label: string; kind: "field" | "document" }[];
}) {
  const router = useRouter();
  const [consultationAt, setConsultationAt] = useState(initialConsultationAt);
  const [packet, setPacket] = useState<WorkPacket | null>(initialPacket);
  const [stale, setStale] = useState(initialStale);
  const [dateInput, setDateInput] = useState("");
  const [objectiveInput, setObjectiveInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dateEditing, setDateEditing] = useState(false);
  const [approved, setApproved] = useState(initialPacket?.state === "approved");

  const completedFor = useRef<Set<number>>(new Set());
  const runComplete = useCallback(
    async (v: number) => {
      if (completedFor.current.has(v)) return;
      completedFor.current.add(v);
      const updated = await completePacketJudgment(matterId);
      if (updated) setPacket(updated);
    },
    [matterId],
  );
  useEffect(() => {
    if (packet?.content.judgmentPending) void runComplete(packet.version);
  }, [packet?.version, packet?.content.judgmentPending, runComplete]);

  async function prepare() {
    setBusy(true);
    try {
      const p = await prepareConsultationPacket(
        matterId,
        dateInput || null,
        objectiveInput.trim() || null,
      );
      if (dateInput) setConsultationAt(toWallClock(dateInput));
      if (p) {
        setPacket(p);
        setStale(false);
        setApproved(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveDate() {
    if (!dateInput) return;
    setBusy(true);
    try {
      const res = await setConsultationDate(matterId, dateInput);
      if (res.ok) {
        setConsultationAt(toWallClock(dateInput));
        setDateEditing(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function clearDate() {
    setBusy(true);
    try {
      await clearConsultationDate(matterId);
      setConsultationAt(null);
      setDateInput("");
      setDateEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const p = await refreshPacket(matterId);
      if (p) {
        setPacket(p);
        setStale(false);
        setApproved(false);
      }
    } finally {
      setRefreshing(false);
    }
    router.refresh();
  }

  async function markReviewed() {
    setApproved(true); // optimistic
    await approvePacket(matterId);
    router.refresh();
  }

  // No plan yet → the intelligent empty state (date optional, objective optional).
  if (!packet) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <div className="text-base font-semibold tracking-tight">Prepare consultation plan</div>
          <p className="mt-1 text-sm text-muted">
            Briefly will organise the purpose, questions, agenda, and decisions for the meeting. The
            date is optional.
          </p>
        </div>
        {incomplete ? (
          <p className="rounded-lg border border-awaiting bg-awaiting-soft px-4 py-2.5 text-sm text-awaiting">
            This matter isn&apos;t complete yet — the plan will be based on what&apos;s currently
            known, with missing information highlighted for the consultation.
          </p>
        ) : null}
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs text-muted">Consultation date &amp; time (optional)</span>
            <input
              type="datetime-local"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="block rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted">What do you want out of this meeting? (optional)</span>
            <textarea
              value={objectiveInput}
              onChange={(e) => setObjectiveInput(e.target.value)}
              rows={2}
              placeholder="e.g. Confirm the client wants to proceed and agree the appraisal date."
              className="block w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={prepare}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {busy ? (
            <>
              <Spinner /> Preparing…
            </>
          ) : (
            "Prepare consultation plan"
          )}
        </button>
      </div>
    );
  }

  const c = packet.content;
  const judgmentPending = !!c.judgmentPending;
  const runOfShow = [
    ...c.suggestedAgenda.map((t) => ({ text: t, fromBrief: false })),
    ...(c.promotedAgenda ?? []).map((t) => ({ text: t, fromBrief: true })),
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-accent bg-surface">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-serif text-lg font-medium tracking-tight">Consultation plan</h3>
          <span className="ml-auto text-[11px] text-muted tabular-nums" title="Plan version">
            v{packet.version}
          </span>
        </div>
        {c.preparedFrom ? (
          <p className="mt-1 text-xs text-muted">
            Prepared from <span className="font-medium text-foreground">{c.preparedFrom}</span> rulebook
          </p>
        ) : null}

        {/* Date row — optional; "to be confirmed" until set. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {dateEditing ? (
            <>
              <input
                type="datetime-local"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={saveDate}
                disabled={busy || !dateInput}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setDateEditing(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </>
          ) : consultationAt ? (
            <>
              <span className="text-sm font-medium text-foreground" suppressHydrationWarning>
                {formatWhen(consultationAt)}
              </span>
              <button
                type="button"
                onClick={() => setDateEditing(true)}
                className="text-xs text-muted hover:text-foreground"
              >
                Change
              </button>
              <button
                type="button"
                onClick={clearDate}
                disabled={busy}
                className="text-xs text-muted hover:text-foreground"
              >
                Clear
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted">
                Consultation date: to be confirmed
              </span>
              <button
                type="button"
                onClick={() => setDateEditing(true)}
                className="text-xs font-medium text-accent hover:underline"
              >
                Add date
              </button>
            </>
          )}
        </div>
      </div>

      {stale ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-awaiting bg-awaiting-soft px-5 py-3">
          <div className="text-sm text-awaiting">
            <span className="font-medium">New information since this plan.</span> Refresh it before the
            meeting.
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-inset disabled:opacity-60"
          >
            {refreshing ? (
              <>
                <Spinner /> Refreshing…
              </>
            ) : (
              "Refresh plan"
            )}
          </button>
        </div>
      ) : null}

      <div className="space-y-6 px-5 py-5">
        {incomplete ? (
          <p className="rounded-lg border border-awaiting bg-awaiting-soft px-4 py-2.5 text-sm text-awaiting">
            This plan is based on what is currently known. Missing information is highlighted below for
            the consultation.
          </p>
        ) : null}

        {/* The outcome — what the whole meeting hangs on. */}
        {c.keyQuestion ? (
          <div className="rounded-xl rounded-l-md border-l-[3px] border-accent bg-accent/5 px-4 py-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">The meeting needs to resolve</div>
            <p className="mt-1.5 font-serif text-base leading-snug">{c.keyQuestion}</p>
            {c.decisionsToLeaveWith.length > 0 ? (
              <ul className="mt-2.5 space-y-1">
                {c.decisionsToLeaveWith.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground/85">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Why it matters — one line, not a paragraph explaining the request. */}
        <Section title="Why this meeting matters">
          <p className="text-sm">{c.whyHere}</p>
        </Section>

        {c.meetingObjective ? (
          <Section title="Your objective for this meeting">
            <p className="text-sm">{c.meetingObjective}</p>
          </Section>
        ) : null}

        {judgmentPending ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border bg-inset px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner />
              <span className="font-medium">Planning the meeting — run of show, questions, next step…</span>
            </div>
            <div className="space-y-2" aria-hidden="true">
              <div className="h-2.5 w-2/3 animate-pulse rounded bg-border" />
              <div className="h-2.5 w-11/12 animate-pulse rounded bg-border" />
              <div className="h-2.5 w-4/5 animate-pulse rounded bg-border" />
            </div>
          </div>
        ) : null}

        {/* Run of show — the order to conduct the meeting. */}
        {runOfShow.length > 0 ? (
          <Section title="Run of show">
            <ol className="space-y-3">
              {runOfShow.map((step, i) => (
                <li key={i} className="anim-swapin flex gap-3">
                  <span className="mt-px shrink-0 font-serif text-sm font-semibold text-accent tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{step.text}</p>
                    {step.fromBrief ? (
                      <span className="text-[11px] text-muted">added from the brief</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {/* Questions to leave answered. */}
        {c.stillUncertain.length > 0 ? (
          <Section title="Questions to leave answered">
            <Bullets items={c.stillUncertain} tone="awaiting" />
          </Section>
        ) : null}

        {missing.length > 0 ? (
          <Section title="Not yet provided — chase in the meeting">
            <ul className="space-y-1.5">
              {missing.map((m, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-awaiting">○</span>
                  <span className="rounded border border-awaiting/50 px-1.5 py-0.5 text-[10px] uppercase text-awaiting">{m.kind}</span>
                  <span>{m.label}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {c.changedSinceIntake.length > 0 ? (
          <Section title="Changes since intake">
            <Bullets items={c.changedSinceIntake} tone="accent" />
          </Section>
        ) : null}

        {/* After the meeting — the lifecycle continues, it doesn't end here. */}
        {c.nextCommitment ? (
          <Section title="After the meeting">
            <p className="rounded-lg border border-border bg-inset px-4 py-3 text-sm">{c.nextCommitment}</p>
            <p className="mt-1.5 text-xs text-muted">
              Once you&apos;ve met, add the meeting notes and Briefly will re-score the matter and prepare the next step.
            </p>
          </Section>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
        {approved ? (
          // A STATUS, not a button — it tells you the plan is ready, it isn't clickable.
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent" suppressHydrationWarning>
            ✓ Prepared for {consultationAt ? `${weekday(consultationAt)}'s consultation` : "the consultation"}
          </span>
        ) : judgmentPending ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner /> Finishing the plan…
          </span>
        ) : (
          <button
            type="button"
            onClick={markReviewed}
            className="btn-primary rounded-md px-4 py-2 text-sm font-medium"
          >
            Mark plan ready
          </button>
        )}
        {!approved && !judgmentPending && !stale ? (
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 text-xs text-muted underline decoration-dotted underline-offset-4 hover:text-foreground disabled:opacity-60"
          >
            {refreshing ? (
              <>
                <Spinner /> Refreshing…
              </>
            ) : (
              "Refresh plan"
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </section>
  );
}

function Bullets({ items, tone }: { items: string[]; tone?: "awaiting" | "accent" }) {
  const dot = tone === "awaiting" ? "bg-awaiting" : tone === "accent" ? "bg-accent" : "bg-muted";
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${dot}`} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
