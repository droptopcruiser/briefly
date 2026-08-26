"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/app/pending-button";

/**
 * While a document is being read in the background (inbound auto-read), refresh
 * the page periodically so the pending facts appear the moment the read finishes.
 * Rendered only when something is reading; unmounts (and stops) once it isn't.
 */
export function ReadingPoller() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
import {
  uploadMatterDocument,
  deleteMatterDocument,
  readMatterDocument,
  confirmDocFact,
  rejectDocFact,
} from "@/app/document-actions";
import type { PendingDocFact, DocumentStatus } from "@/lib/documents";

/** Attach a PDF to the matter. Uploads through the server action, then refreshes. */
export function DocumentUpload({ matterId }: { matterId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadMatterDocument(matterId, fd);
      if (!res.ok) {
        setError(res.error ?? "Upload failed.");
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="btn-control inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm">
        {busy ? (
          <>
            <Spinner /> Uploading…
          </>
        ) : (
          <>
            <span aria-hidden="true">＋</span> Attach a PDF
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onChange}
          disabled={busy}
        />
      </label>
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </div>
  );
}

/** Remove an attached document (storage object + record). */
export function DeleteDocButton({
  matterId,
  docId,
  fileName,
}: {
  matterId: string;
  docId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(`Remove "${fileName}"? This deletes the stored file.`)) return;
    setBusy(true);
    try {
      await deleteMatterDocument(matterId, docId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="shrink-0 text-xs text-muted hover:text-error disabled:opacity-50"
      aria-label={`Remove ${fileName}`}
    >
      {busy ? "…" : "Remove"}
    </button>
  );
}

/** Manually read the PDF's content. Never auto-runs. */
export function ReadNowButton({
  matterId,
  docId,
  status,
}: {
  matterId: string;
  docId: string;
  status: DocumentStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "reading" || busy) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted">
        <Spinner /> Reading…
      </span>
    );
  }

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const res = await readMatterDocument(matterId, docId);
      if (!res.ok) {
        setError(res.error ?? "Reading failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={read}
        className="btn-control shrink-0 rounded-md px-2.5 py-1 text-xs font-medium"
      >
        {status === "read" ? "Re-read" : "Read now"}
      </button>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </>
  );
}

/**
 * One pending document fact awaiting confirmation. Confirm merges it into the matter
 * (empty fields only; conflicts are never overwritten); Reject discards it. Facts
 * with no page (image-only/scanned) carry an explicit "not page-verified" caution.
 */
export function PendingFactRow({
  matterId,
  docId,
  fact,
}: {
  matterId: string;
  docId: string;
  fact: PendingDocFact;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const conflict =
    !!fact.stated && fact.stated.trim().toLowerCase() !== fact.value.trim().toLowerCase();

  async function confirm() {
    setBusy("confirm");
    try {
      const res = await confirmDocFact(matterId, docId, fact.id);
      setDone(
        res.outcome === "merged"
          ? "✓ Confirmed — added to the matter"
          : res.outcome === "conflict"
            ? "Kept your stated value — conflict noted"
            : res.outcome === "already"
              ? "✓ Already on file"
              : "✓ Confirmed",
      );
      setTimeout(() => router.refresh(), 800);
    } finally {
      setBusy(null);
    }
  }
  async function reject() {
    setBusy("reject");
    try {
      await rejectDocFact(matterId, docId, fact.id);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (done) return <li className="py-2 text-xs font-medium text-accent">{done}</li>;

  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted">{fact.label}</div>
          <div className="text-sm font-medium">{fact.value}</div>
        </div>
        {fact.page !== null ? (
          <span className="shrink-0 rounded-full bg-inset px-2 py-0.5 text-[11px] font-medium text-muted">
            p.{fact.page}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-awaiting/50 px-2 py-0.5 text-[11px] font-medium text-awaiting">
            not page-verified
          </span>
        )}
      </div>

      {fact.page === null ? (
        <p className="text-[11px] text-awaiting">Read from a scan — check it against the document.</p>
      ) : null}
      {conflict ? (
        <p className="text-xs text-awaiting">
          ⚠ Conflicts with the enquiry: &ldquo;{fact.stated}&rdquo; — confirming won&apos;t overwrite it.
        </p>
      ) : null}
      {fact.quote ? (
        <p className="text-xs italic text-foreground/70">&ldquo;{fact.quote}&rdquo;</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={confirm}
          disabled={!!busy}
          className="btn-primary rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60"
        >
          {busy === "confirm" ? "…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={reject}
          disabled={!!busy}
          className="text-xs text-muted hover:text-foreground disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </li>
  );
}
