"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * The landing "briefing" — every animated moment shows the work becoming ready,
 * never decoration. One easing curve (--ease), calm durations, and every
 * explanation resolves instantly to its final state under prefers-reduced-motion.
 */

const EASE = "cubic-bezier(0.16,1,0.3,1)";

function useReducedMotion() {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setRm(m.matches);
    set();
    m.addEventListener("change", set);
    return () => m.removeEventListener("change", set);
  }, []);
  return rm;
}

// Fires once when the element scrolls into view.
function useInView<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ── Small shared UI ──────────────────────────────────────────────────────────
function Check({ className = "text-accent" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Meter({ pct, bar = "bg-accent" }: { pct: number; bar?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-inset">
      <div
        className={`h-full rounded-full ${bar}`}
        style={{ width: `${pct}%`, transition: `width 700ms ${EASE}` }}
      />
    </div>
  );
}

function Field({ value, label, source }: { value: string; label: string; source?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-foreground">{value}</div>
        <div className="text-[11px] text-muted">{label}</div>
      </div>
      {source ? <span className="shrink-0 text-[10px] text-accent">{source}</span> : null}
    </div>
  );
}

// The prepared matter — the artifact the whole page keeps resolving toward.
// `show` gates each element so the workflow stage can build it up step by step.
function PreparedMatter({
  show = 6,
  pct = 82,
}: {
  show?: number;
  pct?: number;
}) {
  const step = (n: number, node: ReactNode) => (
    <div
      className="overflow-hidden"
      style={{
        transition: `max-height 420ms ${EASE}, opacity 320ms ${EASE}, transform 320ms ${EASE}`,
        maxHeight: show >= n ? 240 : 0,
        opacity: show >= n ? 1 : 0,
        transform: show >= n ? "none" : "translateY(6px)",
      }}
      aria-hidden={show < n}
    >
      {node}
    </div>
  );
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Priya Sharma</div>
          {step(2, <div className="text-xs text-muted">Spousal visa · matched</div>)}
        </div>
        <span
          className="swap shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-accent"
          style={{ opacity: show >= 3 ? 1 : 0 }}
        >
          {pct}%
        </span>
      </div>

      <div className="mt-3">{show >= 3 ? <Meter pct={pct} /> : <Meter pct={0} />}</div>

      <div className="mt-3 space-y-2">
        {step(
          3,
          <div className="space-y-2 rounded-xl border border-border bg-raise p-3">
            <Field value="Priya Sharma" label="Applicant" source="from message" />
            <Field value="14 Sep 2023" label="Marriage date" source="from message" />
            <Field value="Daniel Okafor" label="Sponsor" source="from message" />
          </div>,
        )}
        {step(
          4,
          <div className="flex items-center gap-2 rounded-xl border border-error/40 bg-error-soft px-3 py-2 text-xs text-error">
            <span className="font-medium">Missing</span> · Marriage certificate not attached
          </div>,
        )}
        {step(
          5,
          <div className="rounded-xl border border-border bg-inset px-3 py-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Follow-up drafted
            </div>
            <p className="mt-1 text-xs text-foreground">
              Hi Priya — could you send your marriage certificate so we can complete your
              application?
            </p>
          </div>,
        )}
      </div>

      {step(
        6,
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Ready for your review
          </span>
          <span className="rounded-md border border-accent px-2.5 py-1 text-xs font-medium text-accent">
            Approve &amp; send
          </span>
        </div>,
      )}
    </div>
  );
}

// ── 1. Hero: the arrival — email fragments resolve into a prepared matter ─────
export function HeroSequence() {
  const reduced = useReducedMotion();
  const [runId, setRunId] = useState(0);
  return (
    <div className="relative">
      {/* keyed so "See it happen" remounts and replays from the start */}
      <MatterReveal key={runId} reduced={reduced} />
      <button
        type="button"
        onClick={() => setRunId((n) => n + 1)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-accent"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        See it happen
      </button>
    </div>
  );
}

/**
 * One continuous transformation inside a single, stable matter-card frame. The
 * email content fades and blurs out as the matched-rubric header rises into the
 * same space; the card then grows as extracted fields (staggered 75ms, with
 * source tags just after), a missing-information panel, and a drafted-follow-up
 * panel expand from zero height + padding; finally a "Ready for your review"
 * action bar slides up from the bottom of the same card and holds. One easing
 * curve, no bounce, no loop. Under reduced motion it resolves instantly.
 */
function MatterReveal({ reduced }: { reduced: boolean }) {
  const [on, setOn] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setOn(true);
      return;
    }
    const r = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(r);
  }, [reduced]);

  // A transition with a per-property delay, or none at all under reduced motion.
  const tr = (delay: number, dur: number, props: string) =>
    reduced
      ? undefined
      : props
          .split(",")
          .map((p) => `${p.trim()} ${dur}ms ${EASE} ${delay}ms`)
          .join(", ");

  // Panels grow from zero height + padding; content inside reveals shortly after.
  const panel = (start: number) => ({
    overflow: "hidden" as const,
    maxHeight: on ? 260 : 0,
    marginTop: on ? 12 : 0,
    opacity: on ? 1 : 0,
    transition: tr(start, 450, "max-height, margin-top, opacity"),
  });

  const fields = [
    { value: "Priya Sharma", label: "Applicant", source: "from message" },
    { value: "14 Sep 2023", label: "Marriage date", source: "from message" },
    { value: "Daniel Okafor", label: "Sponsor", source: "from message" },
  ];

  return (
    <div className="glass glass-sheen rounded-[28px] p-3 sm:p-4">
      <div className="rounded-2xl border border-border bg-surface p-4">
        {/* The name persists; the email collapses + blurs as the rubric header rises */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Priya Sharma</div>

            <div
              style={{
                overflow: "hidden",
                maxHeight: on ? 0 : 84,
                opacity: on ? 0 : 1,
                filter: on ? "blur(4px)" : "blur(0px)",
                transform: on ? "translateY(-6px)" : "none",
                transition: tr(150, 620, "max-height, opacity, filter, transform"),
              }}
              aria-hidden={on}
            >
              <p className="mt-1 text-[11px] leading-snug text-muted">
                …hoping to apply for a spousal visa to stay with my partner. We got married on
                2023-09-14…
              </p>
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-inset px-1.5 py-0.5 text-[11px] text-foreground">
                passport.pdf
              </div>
            </div>

            <div
              style={{
                overflow: "hidden",
                maxHeight: on ? 22 : 0,
                opacity: on ? 1 : 0,
                transform: on ? "none" : "translateY(6px)",
                transition: tr(320, 600, "max-height, opacity, transform"),
              }}
            >
              <div className="mt-1 text-xs text-muted">Spousal visa · matched</div>
            </div>
          </div>

          <span
            className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-accent"
            style={{
              opacity: on ? 1 : 0,
              transform: on ? "none" : "translateY(4px)",
              transition: tr(650, 400, "opacity, transform"),
            }}
          >
            82%
          </span>
        </div>

        {/* Readiness meter fills */}
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-inset">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: on ? "82%" : "0%", transition: tr(760, 720, "width") }}
          />
        </div>

        {/* Extracted fields — staggered, source tags revealing just after each */}
        <div style={panel(920)}>
          <div className="space-y-2 rounded-xl border border-border bg-raise p-3">
            {fields.map((f, i) => (
              <div
                key={f.label}
                className="flex items-baseline justify-between gap-3"
                style={{
                  opacity: on ? 1 : 0,
                  transform: on ? "none" : "translateY(6px)",
                  transition: tr(1020 + i * 75, 340, "opacity, transform"),
                }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-foreground">{f.value}</div>
                  <div className="text-[11px] text-muted">{f.label}</div>
                </div>
                <span
                  className="shrink-0 text-[10px] text-accent"
                  style={{ opacity: on ? 1 : 0, transition: tr(1020 + i * 75 + 140, 300, "opacity") }}
                >
                  {f.source}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Missing information — expands from zero, then content */}
        <div style={panel(1560)}>
          <div
            className="flex items-center gap-2 rounded-xl border border-error/40 bg-error-soft px-3 py-2 text-xs text-error"
            style={{ opacity: on ? 1 : 0, transition: tr(1760, 300, "opacity") }}
          >
            <span className="font-medium">Missing</span> · Marriage certificate not attached
          </div>
        </div>

        {/* Drafted follow-up — expands from zero, then content */}
        <div style={panel(2040)}>
          <div
            className="rounded-xl border border-border bg-inset px-3 py-2"
            style={{ opacity: on ? 1 : 0, transition: tr(2240, 300, "opacity") }}
          >
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Follow-up drafted
            </div>
            <p className="mt-1 text-xs text-foreground">
              Hi Priya — could you send your marriage certificate so we can complete your
              application?
            </p>
          </div>
        </div>

        {/* Review action bar slides up from the bottom of the same card, then holds */}
        <div
          style={{
            overflow: "hidden",
            maxHeight: on ? 64 : 0,
            transition: tr(2560, 500, "max-height"),
          }}
        >
          <div
            className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3"
            style={{
              opacity: on ? 1 : 0,
              transform: on ? "none" : "translateY(12px)",
              transition: tr(2620, 500, "opacity, transform"),
            }}
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Ready for your review
            </span>
            <span className="rounded-md border border-accent px-2.5 py-1 text-xs font-medium text-accent">
              Approve &amp; send
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 2. The fit: one living rubric workspace ──────────────────────────────────
const RUBRICS: Record<
  string,
  { fields: string[]; docs: string[]; ready: string }
> = {
  "Family Law": {
    fields: ["Parties", "Marriage date", "Children", "Assets", "Separation date"],
    docs: ["Marriage certificate", "Financial disclosure"],
    ready: "All parties, key dates, and financial disclosure are present.",
  },
  Veterinary: {
    fields: ["Owner", "Pet name", "Species", "Symptoms", "Vaccination history"],
    docs: ["Vaccination record"],
    ready: "Species, symptoms, and vaccination history are present.",
  },
  Accounting: {
    fields: ["Business type", "Tax year", "GST status", "Turnover"],
    docs: ["Bank statements", "Prior return"],
    ready: "Tax year, entity type, and bank statements are present.",
  },
};

export function RubricWorkspace() {
  const industries = Object.keys(RUBRICS);
  const [active, setActive] = useState(industries[0]);
  const r = RUBRICS[active];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="inline-flex rounded-full border border-border bg-surface p-1">
        {industries.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setActive(name)}
            aria-pressed={active === name}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              active === name ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        {/* keyed so each switch replays a small directional crossfade */}
        <div key={active} className="anim-swapin grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Fields this workflow captures
            </div>
            <ul className="mt-3 space-y-2">
              {r.fields.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-5">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Required documents
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.docs.map((d) => (
                  <span key={d} className="rounded-lg border border-border bg-raise px-2.5 py-1 text-xs">
                    {d}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Ready when
              </div>
              <p className="mt-2 text-sm text-foreground">{r.ready}</p>
            </div>
          </div>
        </div>

        {/* Your rubric, not just a library */}
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5">
          <span className="text-lg leading-none text-muted">+</span>
          <span className="text-sm text-muted">Add your own requirement…</span>
        </div>
      </div>
    </div>
  );
}

// ── 3. The process: scroll-led workflow with a persistent stage ──────────────
const STEPS = [
  "A client emails you.",
  "Briefly recognises which of your workflows applies.",
  "It extracts everything that workflow requires.",
  "It shows you exactly what's missing.",
  "It drafts the follow-up for the gaps.",
  "You review and approve — nothing leaves without you.",
];

function WorkflowStage({ active }: { active: number }) {
  // The stage builds the same matter as the visitor scrolls the steps.
  return (
    <div className="glass glass-sheen rounded-3xl p-4">
      <div
        className="swap mb-3 rounded-2xl border border-border bg-surface p-3"
        style={{ opacity: active >= 0 ? 1 : 0 }}
      >
        <div className="text-xs font-medium text-foreground">Priya Sharma</div>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          …hoping to apply for a spousal visa to stay with my partner…
        </p>
      </div>
      <PreparedMatter show={active >= 1 ? active + 1 : 1} />
    </div>
  );
}

export function WorkflowScroller() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.step);
            setActive(i);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* Desktop: sticky stage, scroll drives the active step */}
      <div className="hidden gap-12 lg:grid lg:grid-cols-2">
        <div>
          {STEPS.map((s, i) => (
            <div
              key={i}
              data-step={i}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              className="flex min-h-[54vh] items-center"
            >
              <div
                className="flex items-start gap-4 transition-all duration-500"
                style={{
                  opacity: active === i ? 1 : 0.45,
                  transitionTimingFunction: EASE,
                }}
              >
                <span
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-medium tabular-nums transition-colors"
                  style={
                    active === i
                      ? { background: "var(--accent)", color: "var(--accent-fg)" }
                      : { border: "1px solid var(--border)", color: "var(--muted)" }
                  }
                >
                  {i + 1}
                </span>
                <p
                  className="text-xl tracking-tight"
                  style={{ fontWeight: active === i ? 600 : 400 }}
                >
                  {s}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="relative">
          <div className="sticky top-28 self-start">
            <WorkflowStage active={active} />
          </div>
        </div>
      </div>

      {/* Mobile: steps as a list, then the fully-built stage */}
      <div className="space-y-8 lg:hidden">
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-medium tabular-nums text-accent-fg">
                {i + 1}
              </span>
              <p className="text-base">{s}</p>
            </li>
          ))}
        </ol>
        <WorkflowStage active={6} />
      </div>
    </>
  );
}

// ── 4. A summary is not a workflow ───────────────────────────────────────────
export function SummaryContrast() {
  return (
    <Reveal className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border border-border bg-inset p-6">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Generic AI</div>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Priya Sharma is writing to ask about applying for a spousal visa to stay with her partner.
          She mentions they married in September 2023 and has attached her passport. She would like
          to know the next steps.
        </p>
        <div className="mt-6 text-xs text-muted">It tells you what the email said.</div>
      </div>
      <div className="rounded-3xl border border-accent bg-surface p-6 shadow-sm">
        <div className="text-[11px] font-medium uppercase tracking-wide text-accent">Briefly</div>
        <div className="mt-4">
          <PreparedMatter show={6} />
        </div>
        <div className="mt-4 text-xs text-foreground">
          It prepares what happens next — structured, sourced, and ready to approve.
        </div>
      </div>
    </Reveal>
  );
}

// ── 5. Thread stays together ─────────────────────────────────────────────────
export function ThreadingProof() {
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const [folded, setFolded] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setFolded(true);
      return;
    }
    const t = window.setTimeout(() => setFolded(true), 500);
    return () => window.clearTimeout(t);
  }, [inView, reduced]);

  return (
    <div ref={ref} className="mx-auto grid max-w-4xl items-center gap-8 lg:grid-cols-2">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-balance">
          One client intake. One matter.
        </h2>
        <p className="mt-3 text-muted">
          Replies, documents, and follow-ups fold into the same thread — the matter just gets more
          complete. Only a genuinely new intake uses capacity.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <span className="tabular-nums font-medium">18 / 60</span>
          <span className="text-muted">matters used this month</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">
            unchanged
          </span>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <div className="text-sm font-semibold">Priya Sharma · Spousal visa</div>
        <ol className="mt-4 space-y-0 border-l border-border pl-5">
          {[
            { t: "Enquiry received", d: "readiness 41%" },
            { t: "Follow-up sent", d: "awaiting client" },
          ].map((e) => (
            <li key={e.t} className="relative pb-4">
              <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-border" />
              <div className="text-sm">{e.t}</div>
              <div className="text-xs text-muted">{e.d}</div>
            </li>
          ))}
          {/* The reply folds INTO the timeline rather than starting a new card */}
          <li
            className="relative overflow-hidden"
            style={{
              transition: `opacity 550ms ${EASE}, max-height 550ms ${EASE}, transform 550ms ${EASE}`,
              maxHeight: folded ? 80 : 0,
              opacity: folded ? 1 : 0,
              transform: folded ? "none" : "translateY(-6px)",
            }}
          >
            <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
            <div className="flex items-center gap-2 text-sm">
              Client replied
              <span className="inline-flex items-center gap-1 rounded-md bg-inset px-1.5 py-0.5 text-[11px] text-foreground">
                marriage_certificate.pdf
              </span>
            </div>
            <div className="text-xs text-accent">readiness 41% → 100% · same matter</div>
          </li>
        </ol>
      </div>
    </div>
  );
}

// ── 6. The human gate — a confident signature ────────────────────────────────
export function HumanGate() {
  return (
    <Reveal className="mx-auto max-w-3xl">
      <div className="grid items-center gap-8 sm:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Briefly prepares. Your team decides.
          </h2>
          <p className="mt-3 text-muted">
            Every matter stops at your review. The follow-up is written, the facts are sourced, the
            gaps are named — and nothing is sent until a person approves it.
          </p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
              <span className="h-2 w-2 rounded-full bg-accent" /> Ready for review
            </span>
            <span className="text-xs text-muted">Priya Sharma</span>
          </div>
          <div className="mt-4 rounded-xl border border-border bg-inset px-3 py-2 text-xs text-muted">
            Follow-up drafted · awaiting your approval
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg">
              Approve &amp; send
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              paused until you approve
            </span>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
