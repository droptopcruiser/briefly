"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { enableCriminalWorkflows } from "@/app/criminal-actions";

/**
 * The manual "Use Criminal Chambers Workflows" control — shown on a matter that
 * isn't already a criminal matter. One click re-extracts it against the criminal
 * rubric and reveals the Preparation tab. No AI classifier; counsel's explicit choice.
 */
export function UseCriminalButton({ matterId }: { matterId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-inset/40 px-4 py-3">
      <span className="text-sm text-muted">
        Criminal matter? Switch on the Chambers Workflows — File Open, Disclosure Note, and Correspondence.
      </span>
      <button
        type="button"
        onClick={() => start(async () => {
          await enableCriminalWorkflows(matterId);
          router.refresh();
        })}
        disabled={pending}
        className="shrink-0 rounded-lg border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
      >
        {pending ? "Switching…" : "Use Criminal Chambers Workflows"}
      </button>
    </div>
  );
}
