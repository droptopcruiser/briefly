"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveMigrationPacket, exportMigrationPacketDocx } from "@/app/migration-packet-actions";
import { downloadDocx } from "@/app/download";
import type { ExportViolation } from "@/lib/source-lock";

/** Review gate + export for the consultation packet. Nothing exports until approved;
 *  new material since approval makes it stale (re-approve). Export is source-locked. */
export function PacketControls({ matterId, approved, stale }: { matterId: string; approved: boolean; stale: boolean }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState<ExportViolation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canExport = approved && !stale;

  const onApprove = () =>
    start(async () => {
      setError(null);
      const r = await approveMigrationPacket(matterId);
      if (r.ok) router.refresh();
      else setError(r.reason ?? "Could not approve.");
    });

  const onExport = () =>
    start(async () => {
      setBlocked(null);
      setError(null);
      const r = await exportMigrationPacketDocx(matterId);
      if (r.ok) downloadDocx(r.fileName, r.base64);
      else if ("violations" in r) setBlocked(r.violations);
      else setError(r.reason);
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!canExport ? (
          <button
            type="button"
            onClick={onApprove}
            disabled={pending}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : stale ? "Re-approve for consult" : "Approve for consult"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onExport}
          disabled={pending || !canExport}
          title={canExport ? "" : "Approve the packet before exporting"}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-inset disabled:opacity-50"
        >
          {pending ? "Checking…" : "Export packet (.docx)"}
        </button>
        <span className="text-xs text-muted">Review, decide, then send. Nothing leaves the tool on its own.</span>
      </div>
      {blocked && blocked.length ? (
        <div className="rounded-lg border border-error/40 bg-error-soft p-3 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-error">Export blocked · {blocked.length} unsourced</div>
          <ul className="mt-1 space-y-0.5 text-foreground/85">{blocked.map((v, i) => <li key={i}>{v.detail}</li>)}</ul>
        </div>
      ) : null}
      {error ? <p className="text-sm text-error">{error}</p> : null}
    </div>
  );
}
