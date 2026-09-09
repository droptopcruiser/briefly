"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareHearingPrep, prepareHearingPrepFromDocument, reviewHearingPrep } from "@/app/hearing-prep-actions";
import type { HearingPrepRun } from "@/lib/hearing-prep-service";
import type { HearingPrepNote, HearingType } from "@/lib/hearing-prep";

/**
 * The Hearing Prep panel. Counsel enters a fixture and/or pastes a minute; Briefly
 * prepares a one-page hearing-folder checklist — fixture, custody/bail, folder
 * readiness, what's missing, and the same-day admin jobs. Strictly logistical: no
 * plea, argument, or sentence. Nothing sent; a draft for counsel.
 */

const TYPES: { value: HearingType; label: string }[] = [
  { value: "first_appearance", label: "First appearance" },
  { value: "callover", label: "Callover" },
  { value: "case_review", label: "Case review" },
  { value: "sentencing", label: "Sentencing" },
  { value: "trial", label: "Trial / defended hearing" },
  { value: "hearing", label: "Other hearing" },
];

function NoteView({ note }: { note: HearingPrepNote }) {
  const f = note.fixture;
  const fixtureLine = `${f.date ?? "[date not stated]"}${f.time ? ` at ${f.time}` : ""}, ${f.court ?? "[court not stated]"}`;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-raise p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Fixture</div>
        <div className="mt-1 text-sm font-medium">{fixtureLine}</div>
        {f.type ? <div className="text-xs text-muted">{TYPES.find((t) => t.value === f.type)?.label}</div> : null}
        <div className="mt-1 text-sm text-foreground/85">{note.custodyLine}</div>
        {note.fixtureSource ? <div className="mt-1 text-xs italic text-muted">from the minute: &ldquo;{note.fixtureSource}&rdquo;</div> : null}
        {note.fromMinute && (!f.date || !f.court) ? (
          <div className="mt-1 text-xs text-awaiting">The minute is silent on anything shown in brackets — confirm it before relying on it.</div>
        ) : null}
      </div>

      {note.directions.length ? (
        <div className="rounded-xl border border-border bg-raise p-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Directions (from the minute)</div>
          <ul className="space-y-1 text-sm text-foreground/85">
            {note.directions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-raise p-4">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Hearing folder</div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {note.folderContents.map((c) => (
            <li key={c.item} className="flex items-center gap-2 text-sm">
              <span className={c.present ? "text-accent" : "text-awaiting"}>{c.present ? "✓" : "○"}</span>
              <span className={c.present ? "text-foreground/85" : "text-foreground/70"}>{c.item}</span>
              {!c.present ? <span className="ml-auto text-xs font-medium text-awaiting">missing</span> : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-raise p-4">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Same-day admin</div>
        <ol className="space-y-1 text-sm text-foreground/85">
          {note.adminJobs.map((j, i) => <li key={i}>{i + 1}. {j}</li>)}
        </ol>
      </div>
    </div>
  );
}

export function HearingPrepPanel({
  matterId,
  initialRun,
  documents = [],
}: {
  matterId: string;
  initialRun: HearingPrepRun | null;
  documents?: { id: string; fileName: string }[];
}) {
  const router = useRouter();
  const [run, setRun] = useState<HearingPrepRun | null>(initialRun);
  const [minute, setMinute] = useState("");
  const [docId, setDocId] = useState(documents[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [court, setCourt] = useState("");
  const [type, setType] = useState<HearingType | "">("");
  const [custody, setCustody] = useState<"" | "bail" | "remand">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onPrepare = () =>
    start(async () => {
      setError(null);
      const res = await prepareHearingPrep(
        matterId,
        { date: date || null, time: time || null, court: court || null, type: type || null, custody: custody || null },
        minute,
      );
      if (res.ok) {
        setRun(res.run);
        router.refresh();
      } else {
        setError(res.reason);
      }
    });

  const onReadMinute = () =>
    start(async () => {
      setError(null);
      if (!docId) return;
      const res = await prepareHearingPrepFromDocument(matterId, docId);
      if (res.ok) {
        setRun(res.run);
        router.refresh();
      } else {
        setError(res.reason);
      }
    });

  const onReview = () =>
    start(async () => {
      const res = await reviewHearingPrep(matterId);
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
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" />
            </svg>
          </span>
          <div>
            <div className="font-semibold">Hearing Prep</div>
            <div className="text-xs text-muted">Preparation workflow · criminal matter</div>
          </div>
        </div>
        {run ? (
          <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium ${approved ? "bg-accent-soft text-accent" : "bg-inset text-muted"}`}>
            {approved ? "✓ Reviewed by counsel" : "Draft"}
          </span>
        ) : null}
      </div>

      {/* Inputs */}
      <div className="space-y-2 pt-4">
        <p className="text-xs text-muted">Read an attached minute PDF, enter the fixture, or paste the minute — Briefly reads only what the minute says and never invents a court detail.</p>

        {documents.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-raise px-3 py-2">
            <span className="text-xs font-medium text-muted">From an attached minute</span>
            <select value={docId} onChange={(e) => setDocId(e.target.value)} aria-label="Choose an attached minute PDF" className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm">
              {documents.map((d) => <option key={d.id} value={d.id}>{d.fileName}</option>)}
            </select>
            <button type="button" onClick={onReadMinute} disabled={pending || !docId} className="rounded-md border border-border px-2.5 py-1 text-sm font-medium transition-colors hover:bg-inset disabled:opacity-50">
              {pending ? "Reading…" : "Read minute"}
            </button>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="Fixture date (e.g. 12 August 2026)" className="rounded-lg border border-border bg-raise px-3 py-2 text-sm" />
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="Time (e.g. 10:00am)" className="rounded-lg border border-border bg-raise px-3 py-2 text-sm" />
          <input value={court} onChange={(e) => setCourt(e.target.value)} placeholder="Court (e.g. Auckland District Court)" className="rounded-lg border border-border bg-raise px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as HearingType | "")} aria-label="Hearing type" className="rounded-lg border border-border bg-raise px-2 py-2 text-sm">
              <option value="">Type…</option>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={custody} onChange={(e) => setCustody(e.target.value as "" | "bail" | "remand")} aria-label="Custody status" className="rounded-lg border border-border bg-raise px-2 py-2 text-sm">
              <option value="">Custody…</option>
              <option value="bail">On bail</option>
              <option value="remand">In custody</option>
            </select>
          </div>
        </div>
        <textarea value={minute} onChange={(e) => setMinute(e.target.value)} rows={3} placeholder="…or paste the court minute here" className="w-full rounded-lg border border-border bg-raise px-3 py-2 text-sm" />
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrepare} disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? "Preparing…" : run ? "Re-prepare folder" : "Prepare hearing folder"}
          </button>
          <span className="text-xs text-muted">Folder checklist + admin only. Nothing is sent.</span>
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>

      {/* The checklist */}
      {run ? (
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
            <span className="text-xs text-muted">Briefly prepares the folder. You review and decide — no plea, argument, or sentence here.</span>
            {approved ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                <span className="h-2 w-2 rounded-full bg-accent" /> Reviewed
              </span>
            ) : (
              <button type="button" onClick={onReview} disabled={pending} className="rounded-lg border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-60">
                {pending ? "Saving…" : "Mark reviewed by counsel"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
