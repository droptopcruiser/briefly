"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importDisclosurePack, importDisclosurePackFromDocument, prepareDisclosureNote, reviewDisclosureNote } from "@/app/disclosure-actions";
import type { DisclosureNoteRun } from "@/lib/disclosure-service";
import type { DisclosureNote } from "@/lib/disclosure";

/**
 * The Disclosure Note panel. Counsel imports a Police disclosure index (pasted), and
 * Briefly prepares a source-backed DRAFT: what's new vs the last pack, the rebuilt
 * index, witnesses, initial-disclosure checks, inconsistencies to check, and at most
 * four proper requests with a draft letter. Nothing is sent; nothing is invented.
 */

const CAT_LABEL: Record<string, string> = {
  charge: "Charge", sof: "SOF", statement: "Statements", notebook: "Notebooks",
  exhibit: "Exhibits", photo: "Photos/CCTV", interview: "Interview", index: "Index",
  withheld: "Withheld", other: "Other",
};

function NoteView({ note }: { note: DisclosureNote }) {
  const id = note.identifiers;
  return (
    <div className="space-y-3">
      {/* Identifiers + pack */}
      <div className="rounded-xl border border-border bg-raise p-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span><span className="text-muted">Defendant</span> · {id.defendant ?? <em className="text-muted/80">[not stated]</em>}</span>
          {id.prn ? <span><span className="text-muted">PRN</span> · {id.prn}</span> : null}
          <span><span className="text-muted">Pack</span> · {note.packNo}{note.packDate ? ` · ${note.packDate}` : ""}</span>
        </div>
        {id.charge ? <div className="mt-1 text-muted">{id.charge}</div> : null}
      </div>

      {/* What's new (the diff) */}
      <div className="rounded-xl border border-border bg-raise p-4">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">What&apos;s new since the last pack</div>
        <ul className="space-y-1 text-sm">
          {note.whatIsNew.map((w, i) => (
            <li key={i} className="text-foreground/85">{w}</li>
          ))}
        </ul>
      </div>

      {/* Index summary */}
      <div className="rounded-xl border border-border bg-raise p-4">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          Index · {note.indexSummary.totalItems} {note.indexSummary.totalItems === 1 ? "item" : "items"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {note.indexSummary.byCategory.map((c) => (
            <span key={c.category} className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
              {CAT_LABEL[c.category] ?? c.category} · {c.count}
            </span>
          ))}
        </div>
        {note.witnesses.length ? (
          <div className="mt-2 text-xs text-muted">Witnesses: {note.witnesses.join("; ")}</div>
        ) : null}
      </div>

      {/* Initial disclosure checklist */}
      <div className="rounded-xl border border-border bg-raise p-4">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Initial disclosure</div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {note.initialDisclosureChecklist.map((c) => (
            <li key={c.item} className="flex items-center gap-2 text-sm">
              <span className={c.present ? "text-accent" : "text-awaiting"}>{c.present ? "✓" : "○"}</span>
              <span className={c.present ? "text-foreground/85" : "text-foreground/70"}>{c.item}</span>
              {!c.present ? <span className="ml-auto text-xs font-medium text-awaiting">not on index</span> : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Clashes to check */}
      {note.clashes.length ? (
        <div className="rounded-xl border border-awaiting/40 bg-awaiting-soft p-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-awaiting">To check</div>
          <ul className="space-y-1 text-sm text-foreground/85">
            {note.clashes.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      ) : null}

      {/* Proper asks */}
      <div className="rounded-xl border border-border bg-raise p-4">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          Requests to consider {note.asks.length ? `· ${note.asks.length} of 4 max` : ""}
        </div>
        {note.asks.length === 0 ? (
          <p className="text-sm text-muted">No proper requests arise from this pack.</p>
        ) : (
          <ol className="space-y-2.5">
            {note.asks.map((a, i) => (
              <li key={i} className="text-sm">
                <div className="font-medium text-foreground">{i + 1}. {a.text}</div>
                <div className="mt-0.5 text-xs text-muted">Why: {a.reason}</div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Draft letter */}
      {note.draftLetter ? (
        <div className="rounded-xl border border-border bg-raise p-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Draft request letter</div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{note.draftLetter}</pre>
        </div>
      ) : null}
    </div>
  );
}

export function DisclosurePanel({
  matterId,
  initialPackCount,
  initialNote,
  documents = [],
}: {
  matterId: string;
  initialPackCount: number;
  initialNote: DisclosureNoteRun | null;
  documents?: { id: string; fileName: string }[];
}) {
  const router = useRouter();
  const [packCount, setPackCount] = useState(initialPackCount);
  const [note, setNote] = useState<DisclosureNoteRun | null>(initialNote);
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [docId, setDocId] = useState(documents[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const applyImport = (res: Awaited<ReturnType<typeof importDisclosurePack>>) => {
    if (res.ok) {
      setPackCount((n) => Math.max(n, res.packNo));
      setText("");
      setDate("");
      setMsg(`Pack ${res.packNo} imported · ${res.itemCount} ${res.itemCount === 1 ? "item" : "items"}${res.mocked ? " (parsed)" : ""}`);
      router.refresh();
    } else {
      setError(res.reason);
    }
  };

  const onImportDoc = () =>
    start(async () => {
      setError(null);
      setMsg(null);
      if (!docId) return;
      applyImport(await importDisclosurePackFromDocument(matterId, docId, date || null));
    });

  const onImport = () =>
    start(async () => {
      setError(null);
      setMsg(null);
      applyImport(await importDisclosurePack(matterId, text, date || null));
    });

  const onPrepare = () =>
    start(async () => {
      setError(null);
      const res = await prepareDisclosureNote(matterId);
      if (res.ok) {
        setNote(res.run);
        router.refresh();
      } else {
        setError(res.reason);
      }
    });

  const onReview = () =>
    start(async () => {
      const res = await reviewDisclosureNote(matterId);
      if (res.ok && note) {
        setNote({ ...note, state: "approved" });
        router.refresh();
      }
    });

  const approved = note?.state === "approved";

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </span>
          <div>
            <div className="font-semibold">Disclosure Note</div>
            <div className="text-xs text-muted">
              {packCount === 0 ? "No packs imported yet" : `${packCount} ${packCount === 1 ? "pack" : "packs"} imported`}
            </div>
          </div>
        </div>
        {note ? (
          <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium ${approved ? "bg-accent-soft text-accent" : "bg-inset text-muted"}`}>
            {approved ? "✓ Reviewed by counsel" : "Draft"}
          </span>
        ) : null}
      </div>

      {/* Import a pack */}
      <div className="space-y-2 pt-4">
        <label className="text-sm font-medium">Import a disclosure pack</label>
        <p className="text-xs text-muted">
          Briefly reads only what the index says — it never infers withholding, and it compares this pack
          against the last.
        </p>

        {/* From an uploaded index PDF */}
        {documents.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-raise px-3 py-2">
            <span className="text-xs font-medium text-muted">From an uploaded index</span>
            <select
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              aria-label="Choose an uploaded index PDF"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fileName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onImportDoc}
              disabled={pending || !docId}
              className="rounded-md border border-border px-2.5 py-1 text-sm font-medium transition-colors hover:bg-inset disabled:opacity-50"
            >
              {pending ? "Reading…" : "Read index"}
            </button>
          </div>
        ) : null}

        <p className="text-xs text-muted">{documents.length > 0 ? "…or paste the index text:" : "Paste the pack's index (one numbered item per line):"}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={"1. Charging document — full\n2. Summary of Facts — full\n3. Statement of Const. Smith — full\n4. CCTV footage — withheld"}
          className="w-full rounded-lg border border-border bg-raise px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Pack date"
            className="rounded-lg border border-border bg-raise px-3 py-1.5 text-sm text-muted"
          />
          <button
            type="button"
            onClick={onImport}
            disabled={pending || !text.trim()}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-inset disabled:opacity-50"
          >
            {pending ? "Importing…" : "Import pack"}
          </button>
          <button
            type="button"
            onClick={onPrepare}
            disabled={pending || packCount === 0}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Preparing…" : note ? "Refresh disclosure note" : "Prepare disclosure note"}
          </button>
        </div>
        {msg ? <p className="text-sm text-accent">{msg}</p> : null}
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>

      {/* The note */}
      {note ? (
        <div className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>Rulebook {note.content.workflowVersion}</span>
            <span>·</span>
            <span>v{note.version}</span>
            <span>·</span>
            <span>Prepared {new Date(note.createdAt).toLocaleString()}</span>
          </div>
          <NoteView note={note.content} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted">Briefly prepares. You review, decide, and send — every request and letter is yours to approve.</span>
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
