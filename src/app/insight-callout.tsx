"use client";

import { useState } from "react";
import type { BriefInsight, InsightFactor } from "@/lib/work-brief";

/**
 * "Briefly noticed" — the signature interpretation as a VISIBLE, TRACEABLE chain.
 * Each factor is a link the professional would otherwise connect themselves; hover
 * (or focus) a link and the exact client phrase it was drawn from glows beneath it,
 * proving Briefly didn't invent the connection — it read it from the client's own
 * words. The chain ends in the one decision that follows.
 */
export function InsightCallout({
  insight,
  therefore,
}: {
  insight: BriefInsight;
  therefore: string | null;
}) {
  // Tolerate older briefs whose factors were plain strings (no source links).
  const factors: InsightFactor[] = (insight.factors as unknown as (string | InsightFactor)[]).map(
    (f) => (typeof f === "string" ? { text: f, sources: [] } : { text: f.text ?? "", sources: f.sources ?? [] }),
  );

  return (
    <div className="space-y-3 rounded-lg border-l-4 border-accent bg-accent/5 px-4 py-3.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-accent">Briefly noticed</div>

      {factors.length > 0 ? (
        <div className="space-y-1.5">
          {factors.map((f, i) => (
            <TraceFactor key={i} factor={f} first={i === 0} />
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

/** One factor — traceable to its source phrase on hover/focus. */
function TraceFactor({ factor, first }: { factor: InsightFactor; first: boolean }) {
  const [open, setOpen] = useState(false);
  const traceable = factor.sources.length > 0;

  return (
    <div
      onMouseEnter={() => traceable && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        tabIndex={traceable ? 0 : -1}
        onFocus={() => traceable && setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={traceable ? open : undefined}
        className={`flex items-start gap-2 text-sm outline-none ${traceable ? "cursor-help" : ""}`}
      >
        <span aria-hidden="true" className="mt-0.5 select-none text-xs font-semibold text-muted">
          {first ? "" : "+"}
        </span>
        <span
          className={
            traceable
              ? "underline decoration-dotted decoration-awaiting/70 underline-offset-4 transition-colors group-hover:text-foreground"
              : ""
          }
        >
          {factor.text}
        </span>
        {traceable ? (
          <span className="mt-0.5 shrink-0 text-[10px] font-medium uppercase tracking-wide text-awaiting/80">
            source
          </span>
        ) : null}
      </div>

      {traceable && open ? (
        <div className="anim-swapin mt-1.5 ml-5 space-y-1.5">
          {factor.sources.map((s, i) => (
            <blockquote
              key={i}
              className="rounded-md border-l-2 border-awaiting bg-awaiting-soft px-3 py-1.5 shadow-[0_0_0_3px_var(--awaiting-soft)]"
            >
              <span className="text-xs italic">“{s.quote}”</span>
              <span className="mt-0.5 block text-[11px] not-italic text-muted">{s.label}</span>
            </blockquote>
          ))}
        </div>
      ) : null}
    </div>
  );
}
