"use client";

import { useEffect, useState } from "react";
import type { BriefInsight, InsightFactor } from "@/lib/work-brief";
import { factSlug } from "@/lib/matter-status";
import { openEvidence } from "@/app/evidence-drawer";

/**
 * "Briefly noticed" — the signature interpretation as a VISIBLE, TRACEABLE chain of
 * links. Flat on the workspace (not a card): the label and the connected factors,
 * each openable (hover, tap, keyboard) to the exact client phrase it was drawn from.
 * The consequence and the decision live below, in the floating decision lens — this
 * surface just shows what Briefly connected.
 */
export function InsightCallout({ insight }: { insight: BriefInsight }) {
  // Tolerate older briefs whose factors were plain strings (no source links).
  const factors: InsightFactor[] = (insight.factors as unknown as (string | InsightFactor)[]).map(
    (f) => (typeof f === "string" ? { text: f, sources: [] } : { text: f.text ?? "", sources: f.sources ?? [] }),
  );
  const traceCount = factors.filter((f) => f.sources.length > 0).length;

  // The "prepared" reveal: as judgment lands, each link settles in turn (--i stagger,
  // instant under prefers-reduced-motion).
  let step = 0;
  const at = (): React.CSSProperties => ({ ["--i" as string]: step++ } as React.CSSProperties);

  // Reverse traceability: when a fact in the drawer points back here, light the
  // factor(s) it supports (the drawer has already closed itself).
  useEffect(() => {
    const onFactor = (e: Event) => {
      const slug = (e as CustomEvent<{ slug: string }>).detail?.slug;
      if (!slug) return;
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-factor-sources~="${slug}"]`);
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("evi-lit");
        window.setTimeout(() => el.classList.remove("evi-lit"), 1900);
      }, 220);
    };
    window.addEventListener("briefly-highlight-factor", onFactor);
    return () => window.removeEventListener("briefly-highlight-factor", onFactor);
  }, []);

  return (
    <div className="space-y-2">
      <div className="stagger-in flex items-center justify-between gap-2" style={at()}>
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">Briefly noticed</div>
        {traceCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-awaiting">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-awaiting" />
            {traceCount} source-backed
          </span>
        ) : null}
      </div>

      {/* Matter context — the orienting purpose, read before the evidence. */}
      {insight.context?.trim() ? (
        <p className="stagger-in text-sm leading-relaxed text-foreground/80" style={at()}>
          {insight.context.trim()}
        </p>
      ) : null}

      {factors.length > 0 ? (
        <div className="space-y-1.5">
          {factors.map((f, i) => (
            <div
              key={i}
              className="stagger-in rounded-md"
              style={at()}
              data-factor-sources={f.sources.map((s) => factSlug(s.label)).join(" ")}
            >
              <TraceFactor factor={f} first={i === 0} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One factor — traceable to its source phrase. Works by hover, focus, tap, and
 * keyboard: it's a real button (Enter/Space toggle, Escape closes, tap pins on
 * touch where there's no hover). aria-expanded announces that evidence is available.
 */
function TraceFactor({ factor, first }: { factor: InsightFactor; first: boolean }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const traceable = factor.sources.length > 0;
  const open = traceable && (hover || pinned);

  if (!traceable) {
    return (
      <div className="flex items-start gap-2 text-sm">
        <span aria-hidden="true" className="mt-0.5 select-none text-xs font-semibold text-muted">
          {first ? "" : "+"}
        </span>
        <span>{factor.text}</span>
      </div>
    );
  }

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        onClick={() => setPinned((p) => !p)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setPinned(false);
        }}
        aria-expanded={open}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-awaiting/5 focus-visible:ring-2 focus-visible:ring-awaiting"
      >
        <span aria-hidden="true" className="mt-0.5 select-none text-xs font-semibold text-muted">
          {first ? "" : "+"}
        </span>
        <span className="underline decoration-dotted decoration-awaiting/70 underline-offset-4">
          {factor.text}
        </span>
        <span className="mt-px inline-flex shrink-0 items-center gap-1 rounded-full bg-awaiting/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-awaiting">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-awaiting" />
          source
        </span>
      </button>

      {/* Evidence brought forward — the one place a frosted glass surface earns it. */}
      {open ? (
        <div
          className="anim-swapin mt-1.5 ml-5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-fill)] px-3 py-2 backdrop-blur-xl"
          style={{ boxShadow: "var(--glass-shadow), var(--glass-hi)" }}
        >
          <div className="space-y-1.5 border-l-2 border-awaiting pl-2.5">
            {factor.sources.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => openEvidence(factSlug(s.label))}
                className="group/src block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-awaiting/50"
                title="Show this in the evidence drawer"
              >
                <span className="text-xs italic">“{s.quote}”</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] not-italic text-muted">
                  {s.label}
                  <span className="text-awaiting opacity-0 transition-opacity group-hover/src:opacity-100">
                    in evidence →
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
