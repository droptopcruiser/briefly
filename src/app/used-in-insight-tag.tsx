"use client";

import { highlightFactor } from "@/app/evidence-drawer";

/**
 * Marks a fact in the evidence drawer that fed the "Briefly noticed" insight — the
 * reverse of the source link. Clicking it closes the drawer and lights the factor
 * this fact supports, so the loop runs both ways: conclusion → evidence, and
 * evidence → where it changed the conclusion.
 */
export function UsedInInsightTag({ slug }: { slug: string }) {
  return (
    <button
      type="button"
      onClick={() => highlightFactor(slug)}
      title="Used in Briefly noticed — show the factor"
      aria-label="Used in Briefly noticed — show the factor"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent outline-none transition-colors hover:bg-accent/15 focus-visible:ring-2 focus-visible:ring-accent @[44rem]/evi:px-2"
    >
      <span aria-hidden="true">◆</span>
      <span className="hidden @[44rem]/evi:inline">used in Briefly noticed</span>
    </button>
  );
}
