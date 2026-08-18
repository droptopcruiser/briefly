"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/app/pending-button";
import {
  setConsultationDate,
  clearConsultationDate,
  completePacketJudgment,
  refreshPacket,
  approvePacket,
} from "@/app/consultation-actions";
import type { WorkPacket } from "@/lib/consultation-packet";

/**
 * The Pre-Consultation Packet on the matter view. Field-based trigger: pick a
 * consultation date → Briefly compiles the packet (source-backed facts + document
 * status render instantly; the agenda + unresolved questions fill in behind a
 * skeleton). Nothing is sent — this is an internal briefing for the meeting.
 */
export function ConsultationPanel({
  matterId,
  initialConsultationAt,
  initialPacket,
  initialStale,
}: {
  matterId: string;
  initialConsultationAt: string | null;
  initialPacket: WorkPacket | null;
  initialStale: boolean;
}) {
  const router = useRouter();
  const [consultationAt, setConsultationAt] = useState(initialConsultationAt);
  const [packet, setPacket] = useState<WorkPacket | null>(initialPacket);
  const [stale, setStale] = useState(initialStale);
  const [dateInput, setDateInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  async function book() {
    if (!dateInput) return;
    setBusy(true);
    try {
      const p = await setConsultationDate(matterId, dateInput);
      setConsultationAt(new Date(dateInput).toISOString());
      if (p) {
        setPacket(p);
        setStale(false);
        setApproved(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function reschedule() {
    setBusy(true);
    try {
      await clearConsultationDate(matterId);
      setConsultationAt(null);
      setDateInput("");
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

  // No consultation booked yet → the date picker.
  if (!consultationAt) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <div className="text-sm font-medium">Consultation booked?</div>
          <p className="text-xs text-muted">
            Set the date and Briefly prepares a briefing packet for the meeting — facts, documents,
            open questions, and a suggested agenda.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="datetime-local"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={book}
            disabled={busy || !dateInput}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {busy ? (
              <>
                <Spinner /> Preparing…
              </>
            ) : (
              "Set & prepare packet"
            )}
          </button>
        </div>
      </div>
    );
  }

  const c = packet?.content;
  const judgmentPending = !!c?.judgmentPending;

  return (
    <div className="overflow-hidden rounded-xl border border-accent bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <h3 className="text-lg font-semibold tracking-tight">Pre-consultation packet</h3>
        {packet ? (
          <span className="rounded-full bg-inset px-2 py-0.5 text-xs text-muted tabular-nums">
            v{packet.version}
          </span>
        ) : null}
        <span className="text-sm text-muted">
          Consultation · {new Date(consultationAt).toLocaleString()}
        </span>
        <button
          type="button"
          onClick={reschedule}
          disabled={busy}
          className="ml-auto text-xs text-muted hover:text-foreground"
        >
          Reschedule
        </button>
      </div>

      {stale ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-awaiting bg-awaiting-soft px-5 py-3">
          <div className="text-sm text-awaiting">
            <span className="font-medium">New information since this packet.</span> Refresh it before
            the meeting.
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
              "Refresh packet"
            )}
          </button>
        </div>
      ) : null}

      {c ? (
        <div className="space-y-6 px-5 py-5">
          <Section title="Matter summary">
            <p className="text-sm">{c.matterSummary}</p>
          </Section>

          {c.keyFacts.length > 0 ? (
            <Section title="Key facts">
              <dl className="rounded-lg border border-border divide-y divide-border">
                {c.keyFacts.map((f, i) => (
                  <div key={i} className="px-4 py-3">
                    <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
                    <dd className="font-medium">{f.value}</dd>
                    {f.source ? (
                      f.carried ? (
                        <dd className="mt-1 text-xs text-muted">📎 {f.source}</dd>
                      ) : (
                        <dd className="mt-1 text-xs text-muted italic">“{f.source}”</dd>
                      )
                    ) : null}
                  </div>
                ))}
              </dl>
            </Section>
          ) : null}

          {c.documentStatus.length > 0 ? (
            <Section title="Document status">
              <ul className="space-y-1.5">
                {c.documentStatus.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    {d.provided ? (
                      <span className="text-accent">✓</span>
                    ) : (
                      <span className="text-awaiting">○</span>
                    )}
                    <span className={d.provided ? "" : "text-muted"}>{d.label}</span>
                    <span className="text-xs text-muted">
                      {d.provided ? "provided" : "outstanding"}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {judgmentPending ? (
            <div className="space-y-3 rounded-lg border border-dashed border-border bg-inset px-4 py-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Spinner />
                <span className="font-medium">Preparing the agenda and open questions…</span>
              </div>
              <div className="space-y-2" aria-hidden="true">
                <div className="h-2.5 w-2/3 animate-pulse rounded bg-border" />
                <div className="h-2.5 w-11/12 animate-pulse rounded bg-border" />
                <div className="h-2.5 w-4/5 animate-pulse rounded bg-border" />
              </div>
            </div>
          ) : null}

          {c.unresolvedQuestions.length > 0 ? (
            <Section title="Unresolved — worth confirming in the meeting">
              <Bullets items={c.unresolvedQuestions} tone="awaiting" />
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
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
        {approved ? (
          <span className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent">
            ✓ Ready for the meeting
          </span>
        ) : judgmentPending ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner /> Finishing the packet…
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

function Bullets({ items, tone }: { items: string[]; tone?: "awaiting" }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${tone === "awaiting" ? "bg-awaiting" : "bg-muted"}`} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
