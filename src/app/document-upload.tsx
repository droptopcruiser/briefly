"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/app/pending-button";
import { uploadMatterDocument, deleteMatterDocument } from "@/app/document-actions";

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
