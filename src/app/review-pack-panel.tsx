"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareReviewPack, reviewReviewPack } from "@/app/review-pack-actions";
import type { ReviewPackRun } from "@/lib/review-pack-service";
import type { ReviewPack } from "@/lib/review-pack";

/**
 * The Counsel Review Pack panel. One click assembles a source-backed orientation for
 * before court or a call — identity, charge/SOF, fixture, latest disclosure, unresolved
 * gaps, prepared drafts, and what changed. Explicitly an orientation, not advice.
 */

function Field({ item }: { item: { label: string; value: string | null; source?: string | null } }) {
  return (
    <div>
      <span className="text-xs text-muted">{item.label} · </span>
      {item.value ? (
        <span className="text-sm font-medium">{item.value}</span>
      ) : (
        <span className="text-sm italic text-muted/80">[{item.label.toLowerCase()} not stated]</span>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-raise p-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{title}</div>
      {children}
    </div>
  );
}

function PackView({ pack }: { pack: ReviewPack }) {
  return (
    <div className="space-y-3">
      <Block title="The matter">
        <div className="space-y-1">{pack.identity.map((i) => <Field key={i.label} item={i} />)}</div>
        <div className="mt-2 text-sm text-foreground/85">{pack.chargeStatus}</div>
      </Block>

      <Block title="Next fixture">
        <div className="text-sm font-medium">{pack.fixture}{pack.hearingTypeLabel ? ` · ${pack.hearingTypeLabel}` : ""}</div>
        {pack.directions.length ? (
          <ul className="mt-1 space-y-0.5 text-xs text-muted">{pack.directions.map((d, i) => <li key={i}>· {d}</li>)}</ul>
        ) : null}
      </Block>

      <Block title="Latest disclosure">
        <div className="text-sm text-foreground/85">{pack.disclosure}</div>
        {pack.disclosureAsks.length ? (
          <div className="mt-2">
            <div className="text-xs text-muted">Requests drafted:</div>
            <ul className="mt-0.5 space-y-0.5 text-sm text-foreground/85">{pack.disclosureAsks.map((a, i) => <li key={i}>· {a}</li>)}</ul>
          </div>
        ) : null}
      </Block>

      {pack.unresolvedGaps.length ? (
        <Block title="Unresolved">
          <ul className="space-y-0.5 text-sm text-foreground/85">{pack.unresolvedGaps.map((g, i) => <li key={i}>○ {g}</li>)}</ul>
        </Block>
      ) : null}

      {pack.preparedDrafts.length ? (
        <Block title="Prepared drafts">
          <ul className="space-y-0.5 text-sm text-foreground/85">
            {pack.preparedDrafts.map((d) => (
              <li key={d.label} className="flex items-center gap-2">
                <span className={d.state === "approved" ? "text-accent" : "text-muted"}>{d.state === "approved" ? "✓" : "○"}</span>
                {d.label}<span className="text-xs text-muted">· {d.state === "approved" ? "reviewed" : "draft"}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {pack.changed.length ? (
        <Block title="Recent activity">
          <ul className="space-y-0.5 text-sm text-muted">{pack.changed.map((c, i) => <li key={i}>· {c}</li>)}</ul>
        </Block>
      ) : null}

      <p className="text-xs italic text-muted">{pack.disclaimer}</p>
    </div>
  );
}

export function ReviewPackPanel({ matterId, initialRun }: { matterId: string; initialRun: ReviewPackRun | null }) {
  const router = useRouter();
  const [run, setRun] = useState<ReviewPackRun | null>(initialRun);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onPrepare = () =>
    start(async () => {
      setError(null);
      const res = await prepareReviewPack(matterId);
      if (res.ok) {
        setRun(res.run);
        router.refresh();
      } else setError(res.reason);
    });

  const onReview = () =>
    start(async () => {
      const res = await reviewReviewPack(matterId);
      if (res.ok && run) {
        setRun({ ...run, state: "approved" });
        router.refresh();
      }
    });

  const approved = run?.state === "approved";

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
              <path d="M14 4v5h5M8 13h8M8 17h5" />
            </svg>
          </span>
          <div>
            <div className="font-semibold">Counsel Review Pack</div>
            <div className="text-xs text-muted">One orientation before court or a call</div>
          </div>
        </div>
        {run ? (
          <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium ${approved ? "bg-accent-soft text-accent" : "bg-inset text-muted"}`}>
            {approved ? "✓ Reviewed" : "Snapshot"}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2 pt-4">
        <button type="button" onClick={onPrepare} disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50">
          {pending ? "Assembling…" : run ? "Refresh review pack" : "Prepare review pack"}
        </button>
        <span className="text-xs text-muted">Source-backed orientation. Not advice.</span>
      </div>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}

      {run ? (
        <div className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>Rulebook {run.content.workflowVersion}</span>
            <span>·</span>
            <span>v{run.version}</span>
            <span>·</span>
            <span>Prepared {new Date(run.createdAt).toLocaleString()}</span>
          </div>
          <PackView pack={run.content} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted">A snapshot for your review — you decide what to take into court.</span>
            {approved ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent"><span className="h-2 w-2 rounded-full bg-accent" /> Reviewed</span>
            ) : (
              <button type="button" onClick={onReview} disabled={pending} className="rounded-lg border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-60">
                {pending ? "Saving…" : "Mark reviewed"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
