"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveMigrationBook, setUnroutedMigration, keepMigrationRouting } from "@/app/migration-classify-actions";
import type { MigrationStream } from "@/lib/types";

/** P5c — the visible routing banner. "Routed to {book} because {cue}" with Keep · Move ·
 *  Unrouted; or an Unrouted state with Move options. No book is ever assumed silently. */

const BOOKS: { stream: MigrationStream; label: string }[] = [
  { stream: "partner", label: "Partner of a New Zealander" },
  { stream: "aewv", label: "AEWV" },
  { stream: "student", label: "Student" },
];

export function MigrationRoutingBanner({
  matterId, status, streamDetail, cue, reason, confirmed,
}: { matterId: string; status: "routed" | "unrouted"; streamDetail?: string; cue?: string; reason?: string; confirmed?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean }>) => start(async () => { await fn(); router.refresh(); });

  // Move targets: every book except the one currently routed.
  const current = BOOKS.find((b) => streamDetail?.startsWith(b.stream))?.stream;
  const moveTargets = BOOKS.filter((b) => b.stream !== current);

  if (status === "routed" && confirmed) {
    return (
      <div className="rounded-xl border border-accent/25 bg-accent-soft/25 px-3 py-2 text-sm text-muted">
        Routed to <b className="text-accent-ink">{streamDetail}</b> · confirmed
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 ${status === "routed" ? "border-accent/40 bg-accent-soft/40" : "border-awaiting/50 bg-awaiting-soft"}`}>
      <div className="text-sm">
        {status === "routed" ? (
          <>Routed to <b className="text-accent-ink">{streamDetail}</b> because {cue}.</>
        ) : (
          <><b className="text-awaiting">Unrouted</b> — {reason}. No book is assumed; gaps wait until you pick one.</>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {status === "routed" ? (
          <button type="button" onClick={() => run(() => keepMigrationRouting(matterId))} disabled={pending}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? "…" : "Keep"}
          </button>
        ) : null}
        <span className="text-xs text-muted">Move to:</span>
        {moveTargets.map((b) => (
          <button key={b.stream} type="button" onClick={() => run(() => moveMigrationBook(matterId, b.stream))} disabled={pending}
            className="rounded-lg border border-border px-2.5 py-1.5 text-sm transition-colors hover:bg-inset disabled:opacity-50">
            {b.label}
          </button>
        ))}
        {status === "routed" ? (
          <button type="button" onClick={() => run(() => setUnroutedMigration(matterId))} disabled={pending}
            className="ml-auto rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-inset disabled:opacity-50">
            Unrouted
          </button>
        ) : null}
      </div>
    </div>
  );
}
