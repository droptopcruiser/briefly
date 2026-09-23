"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveMigrationDate, reopenMigrationDate } from "@/app/migration-date-actions";

/** The KEY DATES conflict + resolved chips. A conflict lists each sourced candidate with
 *  a one-click "Use this"; the read (document) date is marked so the adviser sees the
 *  evidence. Resolving clears the conflict and keeps the others cited; Reopen undoes it. */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[(m || 1) - 1]} ${y}`;
}
const isRead = (source: string) => /\(read\)$/.test(source);

export function ConflictChip({
  matterId, slotKey, label, candidates,
}: { matterId: string; slotKey: string; label: string; candidates: { value: string; source: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const use = (value: string) =>
    start(async () => { await resolveMigrationDate(matterId, slotKey, value); router.refresh(); });

  return (
    <details className="group rounded-lg border border-awaiting/50 bg-awaiting-soft px-2.5 py-1 text-awaiting">
      <summary className="flex cursor-pointer list-none items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide">Conflict</span>
        <span className="font-medium">{label} — two dates, pick one</span>
        <span aria-hidden="true" className="text-xs">▸</span>
      </summary>
      <ul className="mt-1.5 space-y-1.5 border-t border-awaiting/30 pt-1.5">
        {candidates.map((c, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 text-foreground/85">
              <span className="font-medium tabular-nums">{fmtISO(c.value)}</span>
              {isRead(c.source) ? <span className="ml-1 rounded bg-accent-soft px-1 py-0.5 text-[10px] font-medium text-accent">document</span> : null}
              <span className="block text-muted">“{c.source}”</span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => use(c.value)}
              className="shrink-0 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Use this
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ResolvedChip({
  matterId, slotKey, label, value, candidates,
}: { matterId: string; slotKey: string; label: string; value: string; candidates: { value: string; source: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const others = candidates.filter((c) => c.value !== value);
  const reopen = () => start(async () => { await reopenMigrationDate(matterId, slotKey); router.refresh(); });

  return (
    <details className="group rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1 text-accent">
      <summary className="flex cursor-pointer list-none items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide">Resolved</span>
        <span className="font-medium">{label} {fmtISO(value)}</span>
        {others.length ? <span aria-hidden="true" className="text-xs">▸</span> : null}
      </summary>
      {others.length ? (
        <div className="mt-1.5 space-y-1 border-t border-accent/30 pt-1.5 text-xs text-foreground/70">
          <div className="text-muted">Other values seen (kept for the record):</div>
          {others.map((c, i) => (
            <div key={i}><span className="tabular-nums">{fmtISO(c.value)}</span> — “{c.source}”</div>
          ))}
          <button type="button" disabled={pending} onClick={reopen} className="mt-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted hover:bg-inset disabled:opacity-50">
            Reopen
          </button>
        </div>
      ) : null}
    </details>
  );
}
