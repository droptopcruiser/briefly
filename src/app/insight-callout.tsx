import type { BriefInsight } from "@/lib/work-brief";

/**
 * "Briefly noticed" — the signature interpretation rendered as a VISIBLE CHAIN, so
 * the synthesis is unmistakable rather than buried in prose: the separate factors
 * (the links), the consequence they force ("so what"), and the single decision that
 * follows. Shared by the Now overview and the Next step brief so they read alike.
 */
export function InsightCallout({
  insight,
  therefore,
}: {
  insight: BriefInsight;
  therefore: string | null;
}) {
  return (
    <div className="space-y-3 rounded-lg border-l-4 border-accent bg-accent/5 px-4 py-3.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-accent">Briefly noticed</div>

      {/* The links being connected. */}
      {insight.factors.length > 0 ? (
        <div className="space-y-1">
          {insight.factors.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 select-none text-xs font-semibold text-muted">
                {i === 0 ? "" : "+"}
              </span>
              <span>{f}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* → the consequence they force. */}
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="select-none text-muted">↳</span>
        <p className="text-sm">
          <span className="font-semibold">So:</span> {insight.consequence}
        </p>
      </div>

      {/* → the one decision that follows. */}
      {therefore ? (
        <div className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg">
          Decision now: {therefore}
        </div>
      ) : null}

      {insight.afterThis ? (
        <p className="text-xs text-muted">
          <span className="font-medium">After you decide:</span> {insight.afterThis}
        </p>
      ) : null}
    </div>
  );
}
