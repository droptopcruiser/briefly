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
      if (dateInput) setConsultationAt(new Date(dateInput).toISOString());
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
        setConsultationAt(new Date(dateInput).toISOString());
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

  return (
    <div className="overflow-hidden rounded-xl border border-accent bg-surface">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold tracking-tight">Consultation plan</h3>
          <span className="rounded-full bg-inset px-2 py-0.5 text-xs text-muted tabular-nums">
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
              <span className="inline-flex items-center gap-1.5 rounded-full bg-inset px-2.5 py-1 text-xs">
                📅 {new Date(consultationAt).toLocaleString()}
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

        {/* Lead with the decision — the insight converted into what the meeting must decide. */}
        {c.keyQuestion ? (
          <div className="rounded-lg border-l-4 border-accent bg-accent/5 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Decision for the meeting</div>
            <p className="mt-1 text-[15px] leading-relaxed font-medium">{c.keyQuestion}</p>
          </div>
        ) : null}

        {c.meetingObjective ? (
          <div className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Your objective for this meeting</div>
            <p className="mt-1 text-sm">{c.meetingObjective}</p>
          </div>
        ) : null}

        <Section title="Purpose — why is this client meeting with us">
          <p className="text-sm">{c.whyHere}</p>
        </Section>

        {judgmentPending ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border bg-inset px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner />
              <span className="font-medium">Planning the meeting — agenda, decisions, next commitment…</span>
            </div>
            <div className="space-y-2" aria-hidden="true">
              <div className="h-2.5 w-2/3 animate-pulse rounded bg-border" />
              <div className="h-2.5 w-11/12 animate-pulse rounded bg-border" />
              <div className="h-2.5 w-4/5 animate-pulse rounded bg-border" />
            </div>
          </div>
        ) : null}

        {c.decisionsToLeaveWith.length > 0 ? (
          <Section title="Resolve today — what this meeting must decide">
            <Bullets items={c.decisionsToLeaveWith} tone="accent" />
          </Section>
        ) : null}

        {c.suggestedAgenda.length > 0 ? (
          <Section title="Suggested agenda (for your review)">
            <ol className="space-y-1.5">
              {c.suggestedAgenda.map((a, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="font-medium text-accent tabular-nums">{i + 1}.</span>
                  <span>{a}</span>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {c.stillUncertain.length > 0 ? (
          <Section title="Questions to ask — still uncertain">
            <Bullets items={c.stillUncertain} tone="awaiting" />
          </Section>
        ) : null}

        {missing.length > 0 ? (
          <Section title="Not yet provided — chase in the meeting">
            <ul className="space-y-1.5">
              {missing.map((m, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-awaiting">○</span>
                  <span className="rounded px-1.5 py-0.5 text-[10px] uppercase border border-border text-muted">{m.kind}</span>
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

        {c.nextCommitment ? (
          <Section title="Next commitment — after the meeting">
            <p className="rounded-lg border border-border bg-inset px-4 py-3 text-sm">{c.nextCommitment}</p>
          </Section>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
        {approved ? (
          <span className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent">
            ✓ Ready for the meeting
          </span>
        ) : judgmentPending ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner /> Finishing the plan…
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={markReviewed}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
            >
              Mark ready for the meeting
            </button>
            {!stale ? (
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-inset disabled:opacity-60"
              >
                {refreshing ? (
                  <>
                    <Spinner /> Refreshing…
                  </>
                ) : (
                  "Refresh"
                )}
              </button>
            ) : null}
          </>
        )}
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
