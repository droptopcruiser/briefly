"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runFileOpen, completeFileOpenAdmin, reviewFileOpen } from "@/app/file-open-actions";
import type { FileOpenRun } from "@/lib/file-open";
import type { FileOpenNote, NoteItem } from "@/lib/criminal";

/**
 * The Preparation Workflows panel — File Open. Prepares a source-backed DRAFT note
 * from a criminal matter's charge + SOF, for counsel to review. Nothing is sent; a
 * fact that isn't in the material shows as a bracketed gap, never invented.
 *
 * Mirrors the Initial Work Brief panel's optimistic model: the action returns the
 * run, the client renders it immediately, then reconciles the page with router
 * refresh. Two-phase: the facts render at once; the administrative sections (first
 * letter + first job) fill in behind a skeleton.
 */

function gapText(label: string): string {
  return `[${label.toLowerCase()} not stated]`;
}

function Item({ item }: { item: NoteItem }) {
  const absent = item.value == null;
  return (
    <div className="py-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{item.label}</div>
      {absent ? (
        <div className="text-sm italic text-muted/80">{gapText(item.label)}</div>
      ) : (
        <>
          <div className="text-sm font-medium text-foreground">{item.value}</div>
          {item.source ? (
            <div className="mt-0.5 text-xs italic text-muted">
              &ldquo;{item.source}&rdquo;
              {item.from ? <span className="not-italic"> · {item.from}</span> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Group({ title, items }: { title: string; items: NoteItem[] }) {
  return (
    <div className="rounded-xl border border-border bg-raise p-4">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{title}</div>
      <div className="divide-y divide-border">
        {items.map((it) => (
          <Item key={it.label} item={it} />
        ))}
      </div>
    </div>
  );
}

function NoteView({ note }: { note: FileOpenNote }) {
  return (
    <div className="space-y-3">
      <Group title="Matter identifiers" items={note.identifiers} />
      <Group title="Charge" items={note.charge} />
      <Group title="Status" items={[note.firstAppearance, note.disclosureStatus]} />

      {/* Administrative first letter + first job — two-phase (skeleton while pending) */}
      <div className="rounded-xl border border-border bg-raise p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          Administrative first steps
        </div>
        {note.adminPending ? (
          <div className="space-y-2" aria-label="Preparing the first letter">
            <div className="h-3 w-3/4 animate-pulse rounded bg-inset" />
            <div className="h-3 w-full animate-pulse rounded bg-inset" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-inset" />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">First letter · draft</div>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-foreground">
                {note.clientLetterDraft ?? gapText("first letter")}
              </pre>
            </div>
            <div className="border-t border-border pt-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">First assistant job</div>
              <div className="mt-1 text-sm text-foreground">{note.firstAssistantJob ?? gapText("first job")}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FileOpenPanel({
  matterId,
  initialRun,
  gateOk,
  gateReason,
  missing,
}: {
  matterId: string;
  initialRun: FileOpenRun | null;
  gateOk: boolean;
  gateReason: string | null;
  missing: string[];
}) {
  const router = useRouter();
  const [run, setRun] = useState<FileOpenRun | null>(initialRun);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Two-phase: once a facts-only run exists, fill the admin sections behind a skeleton.
  useEffect(() => {
    if (run && run.content.adminPending) {
      completeFileOpenAdmin(matterId)
        .then((updated) => {
          if (updated) setRun(updated);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.content.adminPending]);

  const onRun = () =>
    start(async () => {
      setError(null);
      const res = await runFileOpen(matterId);
      if (res.ok) {
        setRun(res.run);
        router.refresh();
      } else {
        setError(res.reason);
      }
    });

  const onReview = () =>
    start(async () => {
      const res = await reviewFileOpen(matterId);
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
              <path d="M14 3v5h5" />
              <path d="M6 3h8l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
            </svg>
          </span>
          <div>
            <div className="font-semibold">File Open</div>
            <div className="text-xs text-muted">Preparation workflow · criminal matter</div>
          </div>
        </div>
        {run ? (
          <span
            className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium ${
              approved ? "bg-accent-soft text-accent" : "bg-inset text-muted"
            }`}
          >
            {approved ? "✓ Reviewed by counsel" : "Draft"}
          </span>
        ) : null}
      </div>

      {/* State 1 — no run yet */}
      {!run ? (
        gateOk ? (
          <div className="space-y-3 pt-4">
            <p className="text-sm text-muted">
              Prepares a source-backed File Open note — identifiers, charge, elements, disclosure status,
              a draft first letter, and the first assistant job. It only ever prepares a draft; nothing is
              sent, and anything not in the material is left as a bracketed gap.
            </p>
            <button
              type="button"
              onClick={onRun}
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Preparing…" : "Run File Open"}
            </button>
            {error ? <p className="text-sm text-error">{error}</p> : null}
          </div>
        ) : (
          <div className="pt-4">
            <div className="rounded-xl border border-awaiting/40 bg-awaiting-soft px-4 py-3">
              <div className="text-sm font-medium text-foreground">File Open isn&apos;t ready to run yet.</div>
              <p className="mt-1 text-sm text-muted">{gateReason ?? "Add the required documents to run File Open."}</p>
              {missing.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missing.map((m) => (
                    <span key={m} className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground/80">
                      Missing · {m}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )
      ) : (
        // State 2 — the prepared note
        <div className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>Rulebook {run.content.workflowVersion}</span>
            <span>·</span>
            <span>v{run.version}</span>
            <span>·</span>
            <span>Prepared {new Date(run.createdAt).toLocaleString()}</span>
          </div>

          <NoteView note={run.content} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted">Briefly prepares. You review, decide, and send — nothing leaves your desk on its own.</span>
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
      )}
    </div>
  );
}
