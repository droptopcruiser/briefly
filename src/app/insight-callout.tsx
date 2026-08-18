import type { BriefInsight } from "@/lib/work-brief";

/**
 * "Briefly noticed" — the signature interpretation rendered as a VISIBLE reasoning
 * chain, not a paragraph: because (facts → implication) → therefore (the action) →
 * based on (the facts + rule connected) → after this (forward motion). The point is
 * to show the connection that makes the conclusion feel earned. Shared by the Now
 * overview and the Next step brief so they read identically.
 */
export function InsightCallout({
  insight,
  therefore,
}: {
  insight: BriefInsight;
  therefore: string | null;
}) {
  return (
    <div className="space-y-2.5 rounded-lg border-l-4 border-accent bg-accent/5 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-accent">Briefly noticed</div>
      <p className="text-[15px] leading-relaxed">{insight.because}</p>
      {therefore ? (
        <p className="text-sm">
          <span className="font-semibold text-accent">Therefore:</span> {therefore}
        </p>
      ) : null}
      {insight.basedOn.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-xs text-muted">Based on:</span>
          {insight.basedOn.map((chip, i) => (
            <span key={i} className="rounded-full bg-inset px-2 py-0.5 text-xs text-foreground/80">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      {insight.afterThis ? (
        <p className="text-xs text-muted">
          <span className="font-medium">After this:</span> {insight.afterThis}
        </p>
      ) : null}
    </div>
  );
}
