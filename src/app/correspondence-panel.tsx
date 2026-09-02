"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareCorrespondence, reviewCorrespondence } from "@/app/correspondence-actions";
import type { CorrespondenceRun } from "@/lib/correspondence-service";
import type { PreSendFlag } from "@/lib/correspondence";

/**
 * The Draft Correspondence panel. Counsel gives the addressee, the matter, and the
 * point; Briefly prepares a short administrative DRAFT and runs the Pre-Send check —
 * flagging unfilled brackets and any PRN/CRN/date the matter doesn't support. Nothing
 * is sent; counsel copies the draft into their own mail client to edit and send.
 */

export function CorrespondencePanel({
  matterId,
  initialRun,
  initialFlags,
}: {
  matterId: string;
  initialRun: CorrespondenceRun | null;
  initialFlags: PreSendFlag[];
}) {
  const router = useRouter();
  const [run, setRun] = useState<CorrespondenceRun | null>(initialRun);
  const [flags, setFlags] = useState<PreSendFlag[]>(initialFlags);
  const [to, setTo] = useState(initialRun?.content.request.to ?? "");
  const [about, setAbout] = useState(initialRun?.content.request.about ?? "");
  const [point, setPoint] = useState(initialRun?.content.request.point ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onDraft = () =>
    start(async () => {
      setError(null);
      const res = await prepareCorrespondence(matterId, to, about, point);
      if (res.ok) {
        setRun(res.run);
        setFlags(res.flags);
        router.refresh();
      } else {
        setError(res.reason);
      }
    });

  const onReview = () =>
    start(async () => {
      const res = await reviewCorrespondence(matterId);
      if (res.ok && run) {
        setRun({ ...run, state: "approved" });
        router.refresh();
      }
    });

  const approved = run?.state === "approved";
  const draft = run?.content.draft;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </span>
          <div>
            <div className="font-semibold">Draft Correspondence</div>
            <div className="text-xs text-muted">Preparation workflow · criminal matter</div>
          </div>
        </div>
        {run ? (
          <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium ${approved ? "bg-accent-soft text-accent" : "bg-inset text-muted"}`}>
            {approved ? "✓ Reviewed by counsel" : "Draft"}
          </span>
        ) : null}
      </div>

      {/* The request */}
      <div className="grid gap-2 pt-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">To (addressee)</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="e.g. Officer in charge / disclosure inbox" className="w-full rounded-lg border border-border bg-raise px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Matter / subject</span>
          <input value={about} onChange={(e) => setAbout(e.target.value)} placeholder="e.g. R v Tane — disclosure" className="w-full rounded-lg border border-border bg-raise px-3 py-2 text-sm" />
        </label>
      </div>
      <label className="mt-2 block text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">The point to make</span>
        <textarea value={point} onChange={(e) => setPoint(e.target.value)} rows={2} placeholder="e.g. Request the outstanding officer notebook referred to in the SOF." className="w-full rounded-lg border border-border bg-raise px-3 py-2 text-sm" />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onDraft}
          disabled={pending || !point.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Drafting…" : run ? "Redraft" : "Draft correspondence"}
        </button>
        <span className="text-xs text-muted">Prepares a draft — nothing is sent.</span>
      </div>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}

      {/* The draft + pre-send check */}
      {draft ? (
        <div className="space-y-3 pt-4">
          <div className="rounded-xl border border-border bg-raise p-4">
            <div className="text-xs text-muted">Subject</div>
            <div className="mb-2 text-sm font-medium">{draft.subject}</div>
            <div className="text-xs text-muted">Draft</div>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-foreground">{draft.body}</pre>
          </div>

          {/* Pre-Send check */}
          {flags.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-4 py-2.5 text-sm text-accent">
              <span>✓</span> Pre-send check clear — no unfilled placeholders or unsupported references.
            </div>
          ) : (
            <div className="rounded-xl border border-awaiting/40 bg-awaiting-soft p-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-awaiting">
                Before you send · {flags.length} to check
              </div>
              <ul className="space-y-1 text-sm text-foreground/85">
                {flags.map((f, i) => <li key={i}>{f.detail}</li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted">Briefly prepares. You review, edit, and send it yourself — nothing leaves on its own.</span>
            {approved ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                <span className="h-2 w-2 rounded-full bg-accent" /> Reviewed
              </span>
            ) : (
              <button
                type="button"
                onClick={onReview}
                disabled={pending}
                className="rounded-lg border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
              >
                {pending ? "Saving…" : "Mark reviewed by counsel"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
