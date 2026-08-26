"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkBrief } from "@/lib/work-brief";
import type { MatterStatus } from "@/lib/types";
import { WorkBriefCard } from "@/app/work-brief-card";
import { Spinner } from "@/app/pending-button";
import {
  prepareBrief,
  completeJudgment,
  refreshBrief,
  approveBrief_,
  completeMatter,
} from "@/app/brief-actions";

/**
 * Client orchestrator for the ready-path (Path B) — the Initial Work Brief.
 *
 * The whole point is perceived speed: every action calls a server function that
 * RETURNS its artifact, and we render it from local state immediately. No action
 * blocks on a full-page revalidation. The deterministic facts appear in ~1s
 * (prepare), the judgment fills in behind a skeleton (completeJudgment), and
 * approve flips instantly (optimistic) then reconciles the rest of the page with
 * router.refresh() in the background.
 */
export function BriefPanel({
  matterId,
  clientEmail,
  initialBrief,
  initialStatus,
  initialStale,
  briefsEnabled,
  threadSubject,
}: {
  matterId: string;
  clientEmail: string | null;
  initialBrief: WorkBrief | null;
  initialStatus: MatterStatus;
  initialStale: boolean;
  briefsEnabled: boolean;
  /** Default outbound subject (the conversation's "Re:" subject), or null. */
  threadSubject?: string | null;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState<WorkBrief | null>(initialBrief);
  const [status, setStatus] = useState<MatterStatus>(initialStatus);
  const [stale, setStale] = useState(initialStale);
  const [preparing, setPreparing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(false);

  // Track which brief versions we've already kicked judgment completion for, so
  // the auto-trigger fires exactly once per facts-only brief.
  const completedFor = useRef<Set<number>>(new Set());

  const runComplete = useCallback(
    async (v: number) => {
      if (completedFor.current.has(v)) return;
      completedFor.current.add(v);
      const updated = await completeJudgment(matterId);
      if (updated) setBrief(updated);
    },
    [matterId],
  );

  // When a facts-only brief is present (fresh or server-provided), fill judgment.
  useEffect(() => {
    if (brief?.content.judgmentPending) void runComplete(brief.version);
  }, [brief?.version, brief?.content.judgmentPending, runComplete]);

  async function handlePrepare() {
    setPreparing(true);
    try {
      const b = await prepareBrief(matterId);
      if (b) {
        setBrief(b);
        setStale(false);
      }
    } finally {
      setPreparing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const b = await refreshBrief(matterId);
      if (b) {
        setBrief(b);
        setStale(false);
        setStatus((s) => (s === "in_progress" || s === "completed" ? "ready_for_you" : s));
      }
    } finally {
      setRefreshing(false);
    }
    router.refresh(); // reconcile page-level bits (status, since-review) in the background
  }

  async function handleApprove() {
    setApproving(true);
    // Optimistic: flip the card to approved and the matter to in-progress at once.
    setBrief((b) => (b ? { ...b, state: "approved" } : b));
    setStatus("in_progress");
    await approveBrief_(matterId);
    setApproving(false);
    router.refresh();
  }

  async function handleComplete() {
    setStatus("completed"); // optimistic
    await completeMatter(matterId);
    router.refresh();
  }

  // No brief yet.
  if (!brief) {
    if (status === "completed") return <CompletedNotice />;
    if (!briefsEnabled) return null; // opt-out handled by the page's fallback
    return (
      <div className="space-y-3 rounded-lg border border-accent bg-surface px-4 py-4 text-sm">
        <p className="font-medium text-accent">This matter is ready — nothing missing.</p>
        <p className="text-muted">
          Prepare the Initial Work Brief so you can review the matter and decide the next step
          without reconstructing the email thread.
        </p>
        <button
          type="button"
          onClick={handlePrepare}
          disabled={preparing}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-70"
        >
          {preparing ? (
            <>
              <Spinner /> Preparing…
            </>
          ) : (
            "Prepare Initial Work Brief"
          )}
        </button>
        <p className="text-xs text-muted">
          The source-backed facts appear immediately; the summary and suggested next steps finish a
          moment later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WorkBriefCard
        matterId={matterId}
        clientEmail={clientEmail}
        version={brief.version}
        state={brief.state}
        content={brief.content}
        stale={stale}
        mocked={brief.mocked}
        approving={approving}
        refreshing={refreshing}
        onApprove={handleApprove}
        onRefresh={handleRefresh}
        threadSubject={threadSubject}
      />
      {status === "in_progress" ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleComplete}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-inset"
          >
            Mark matter complete
          </button>
          <span className="text-xs text-muted">Close this matter once the work is done.</span>
        </div>
      ) : status === "completed" ? (
        <CompletedNotice />
      ) : null}
    </div>
  );
}

/** Confirmation shown after a matter is marked complete, with next steps. */
function CompletedNotice() {
  return (
    <div className="space-y-3 rounded-lg border border-accent bg-surface px-4 py-4">
      <p className="text-sm font-medium text-accent">✓ Matter completed.</p>
      <p className="text-sm text-muted">
        This matter is done and now lives in your Completed list — searchable whenever you need it.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/app/matters"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          Back to active matters
        </Link>
        <Link
          href="/app/matters?view=completed"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-inset"
        >
          View completed matters
        </Link>
      </div>
    </div>
  );
}
