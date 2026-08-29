"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * The landing "briefing". One ownable idea: you arrive to a desk that was
 * prepared overnight. Fewer, larger motion moments — the work becoming ready,
 * never decoration. One easing curve; everything resolves instantly under
 * prefers-reduced-motion.
 */

const EASE = "cubic-bezier(0.16,1,0.3,1)";

/**
 * The dark hero's decorative layer — sage/cream circles, contour lines, dotted
 * grid — with light scroll PARALLAX: the shapes drift at different rates as the
 * page moves, so the hero feels alive. Disabled under reduced-motion.
 */
export function HeroBackdrop() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        el.style.setProperty("--pa", `${y * 0.18}px`);
        el.style.setProperty("--pb", `${y * -0.12}px`);
        el.style.setProperty("--pc", `${y * 0.06}px`);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Moving green aurora — two drifting glows + a brighter beam sweeping across */}
      <div
        className="aurora-a absolute h-[78vh] w-[78vh] rounded-full will-change-transform"
        style={{
          top: "-20%",
          left: "3%",
          background: "radial-gradient(circle, #7fb086 0%, rgba(127,176,134,0) 68%)",
          opacity: 0.5,
          filter: "blur(18px)",
        }}
      />
      <div
        className="aurora-b absolute h-[64vh] w-[64vh] rounded-full will-change-transform"
        style={{
          bottom: "-24%",
          right: "1%",
          background: "radial-gradient(circle, #3f7a49 0%, rgba(63,122,73,0) 66%)",
          opacity: 0.6,
          filter: "blur(18px)",
        }}
      />
      <div
        className="aurora-sweep absolute left-0 w-[46%] will-change-transform"
        style={{
          top: "-25%",
          bottom: "-25%",
          background:
            "linear-gradient(90deg, transparent, rgba(127,176,134,0.22), rgba(196,224,190,0.55), rgba(127,176,134,0.18), transparent)",
          filter: "blur(44px)",
        }}
      />

      {/* Fine detail: dotted grid + topographic contour lines, with scroll parallax */}
      <div
        className="absolute bottom-12 left-12 hidden h-40 w-64 sm:block will-change-transform"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(163,178,150,0.5) 1.1px, transparent 1.3px)",
          backgroundSize: "16px 16px",
          maskImage: "radial-gradient(circle at 32% 45%, #000, transparent 72%)",
          WebkitMaskImage: "radial-gradient(circle at 32% 45%, #000, transparent 72%)",
          transform: "translateY(var(--pb,0px))",
        }}
      />
      <svg
        className="absolute right-0 top-0 h-full w-[300px] will-change-transform sm:w-[420px]"
        viewBox="0 0 300 700"
        preserveAspectRatio="xMaxYMid slice"
        fill="none"
        style={{ transform: "translateY(var(--pc,0px))" }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <path
            key={i}
            d="M150 -40 C 96 110, 214 210, 150 340 S 92 560, 150 720 S 214 900, 150 1060"
            transform={`translate(${i * 17 - 46} 0)`}
            stroke="#5f7054"
            strokeWidth="1"
            opacity={0.5 - i * 0.045}
          />
        ))}
      </svg>

      {/* Faint document grid — like paper under the light, masked to the centre */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(160,175,150,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(160,175,150,0.05) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(ellipse at 50% 42%, #000 10%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 42%, #000 10%, transparent 78%)",
        }}
      />

      {/* Film grain — a whisper of texture so the light reads as an environment */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.05] mix-blend-overlay">
        <filter id="briefly-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#briefly-grain)" />
      </svg>
    </div>
  );
}

/**
 * The hero's living matter — ONE conveyancing file that fills in over time as
 * Briefly reads and prepares it: the enquiry arrives, a contract lands, facts are
 * checked against the firm's rulebook, a missing item surfaces, a chase is drafted,
 * the reply comes back, and the file reaches "Ready for review". The SAME object
 * accumulates state — it never resets between isolated cards. Calm and cumulative;
 * frozen at "ready" under reduced-motion.
 */
const MATTER_STEPS = 8; // 0..8

export function MatterScene() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced) {
      setStep(MATTER_STEPS);
      return;
    }
    let s = 0;
    let timer = 0;
    const tick = () => {
      setStep(s);
      const delay = s === MATTER_STEPS ? 3400 : s === 0 ? 1000 : 1450;
      s = s >= MATTER_STEPS ? 0 : s + 1;
      timer = window.setTimeout(tick, delay);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [reduced]);

  const on = (k: number) => step >= k;
  const reveal = (k: number, dy = 10) => ({
    opacity: on(k) ? 1 : 0,
    transform: on(k) ? "none" : `translateY(${dy}px)`,
    transition: reduced ? undefined : `opacity 640ms ${EASE}, transform 640ms ${EASE}`,
  });

  const telemetry =
    step >= MATTER_STEPS
      ? "Ready for review · Settlement 5 June 2027"
      : step >= 6
        ? "2 documents received · reading the contract"
        : step >= 5
          ? "1 draft awaiting your approval"
          : step >= 4
            ? "1 item missing"
            : step >= 2
              ? "2 sources verified"
              : "New enquiry · 1 document";

  return (
    <div className="relative">
      {/* ambient green backlight — the object sits IN the light, not on a flat bg */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[135%] w-[125%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse at 50% 42%, rgba(140,190,150,0.5), rgba(127,176,134,0) 66%)",
          filter: "blur(56px)",
        }}
      />

      {/* the work surface — layered depth, bright top edge, deep shadow */}
      <div
        className="overflow-hidden rounded-[18px] text-left"
        style={{
          background: "#f5f6f0",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 6px rgba(0,0,0,0.2), 0 44px 70px -24px rgba(0,0,0,0.55), 0 90px 150px -40px rgba(0,0,0,0.6)",
        }}
      >
        <div
          className="flex items-center gap-2 px-5 py-3.5 sm:px-6"
          style={{ background: "#ecefe6", borderBottom: "1px solid rgba(29,38,33,0.06)" }}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#d7b3aa" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#e6d3a0" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#b6c9ad" }} />
          <span className="ml-2 truncate text-[12.5px] text-muted">
            Property Purchase — Conveyancing · Tomas Nowak
          </span>
          <span
            className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-500"
            style={
              step >= MATTER_STEPS
                ? { background: "var(--accent-soft)", color: "var(--accent)" }
                : { background: "var(--inset)", color: "var(--muted)" }
            }
          >
            {step >= MATTER_STEPS ? "✓ Ready for review" : "Preparing…"}
          </span>
        </div>

        <div className="space-y-3 px-5 py-6 sm:px-7 sm:py-7">
          <div className="rounded-xl border border-border bg-surface px-4 py-3.5" style={reveal(0)}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
                TN
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">Tomas Nowak</div>
                <div className="truncate text-xs text-muted">New enquiry · just now</div>
              </div>
            </div>
            <p className="mt-2.5 text-sm text-foreground/85">
              &ldquo;We&apos;re buying at 8 Ellery Lane, Fitzroy North. Contract&apos;s attached &mdash; can
              you handle the conveyancing?&rdquo;
            </p>
            <div
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-inset px-2.5 py-1 text-xs text-foreground/75"
              style={reveal(1, 6)}
            >
              <span aria-hidden>📎</span> Contract of Sale.pdf
            </div>
          </div>

          <div className="rounded-xl border border-border bg-inset/60 px-4 py-3.5" style={reveal(2)}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Checked against your Property Purchase rulebook
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li className="flex items-center gap-2.5" style={reveal(2, 6)}>
                <span className="text-accent">&#10003;</span>
                <span className="text-foreground/85">Property · 8 Ellery Lane, Fitzroy North</span>
                <span className="ml-auto text-xs text-muted">from email</span>
              </li>
              <li className="flex items-center gap-2.5" style={reveal(3, 6)}>
                <span className="text-accent">&#10003;</span>
                <span className="text-foreground/85">Vendors · Kwame &amp; Abena Osei</span>
                <span className="ml-auto text-xs text-muted">Contract p.1</span>
              </li>
              <li className="flex items-center gap-2.5" style={reveal(4, 6)}>
                <span className="text-error">&#9675;</span>
                <span className="text-foreground/85">Signed transfer</span>
                <span className="ml-auto text-xs font-medium text-error">missing</span>
              </li>
            </ul>
          </div>

          <div
            className="rounded-xl border px-4 py-3.5"
            style={{
              ...reveal(5),
              borderColor: "color-mix(in srgb, var(--awaiting) 40%, transparent)",
              background: "color-mix(in srgb, var(--awaiting-soft) 55%, transparent)",
            }}
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="text-awaiting" aria-hidden>&#9998;</span>
              <span className="font-medium text-foreground/85">Drafted a request for the signed transfer</span>
              <span className="ml-auto text-xs text-muted">awaiting your approval</span>
            </div>
            <p className="mt-1.5 pl-6 text-xs italic text-muted">
              &ldquo;Hi Tomas — could you send the signed transfer when you have a moment?&rdquo;
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface px-4 py-3.5" style={reveal(6)}>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-accent" aria-hidden>&#9993;</span>
              <span className="font-medium text-foreground/85">Reply received — signed Contract of Sale</span>
              <span className="ml-auto text-xs text-muted">folded into this matter</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5 pl-6 text-xs" style={reveal(7, 6)}>
              <span className="text-accent">&#10003;</span>
              <span className="text-foreground/80">Settlement · 5 June 2027</span>
              <span className="text-muted">— read, Contract p.3</span>
            </div>
          </div>

          <div
            className="flex items-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-medium"
            style={{ ...reveal(8), background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <span aria-hidden>&#10003;</span>
            Ready for your review · Settlement 5 June 2027
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-xs tracking-wide" style={{ color: "#93a98c" }}>
        {telemetry}
      </div>
    </div>
  );
}

/**
 * The proof CHAPTER — the recurring "evidence thread" motif, finished and accessible.
 * A fact connects to its exact contract source AND to what it means: fact → verified
 * source → readiness effect → next action. Selectable by hover, click, or keyboard
 * focus (works on touch + for keyboard users); a default fact is active so the
 * relationship is visible at rest. Threads are measured from the live DOM (re-measured
 * on resize + after fonts settle) and are decorative only — the colour highlights and
 * the reasoning chain carry the meaning, so it degrades cleanly where threads are
 * hidden (mobile / reduced-motion).
 */
const EVIDENCE = [
  {
    key: "settlement",
    label: "Settlement date",
    value: "5 June 2027",
    page: 3,
    src: "Settlement Date: 5 June 2027",
    effect: "Settlement in 8 days",
    next: "Signed authority still missing",
  },
  {
    key: "price",
    label: "Purchase price",
    value: "$1,295,000",
    page: 3,
    src: "Purchase Price: $1,295,000 (AUD)",
    effect: "Funds to reconcile before settlement",
    next: "Confirm the deposit was paid",
  },
  {
    key: "vendors",
    label: "Vendors",
    value: "Kwame & Abena Osei",
    page: 1,
    src: "Vendors: Kwame Osei and Abena Osei",
    effect: "Two proprietors on title",
    next: "Order a title search on both",
  },
  {
    key: "property",
    label: "Property",
    value: "8 Ellery Lane, Fitzroy North",
    page: 1,
    src: "Property: 8 Ellery Lane, Fitzroy North VIC 3068",
    effect: "Title and plan identified",
    next: "Begin the property certificates",
  },
];

export function EvidenceProof() {
  const [selected, setSelected] = useState("settlement");
  const [hovered, setHovered] = useState<string | null>(null);
  const active = hovered ?? selected;
  const wrapRef = useRef<HTMLDivElement>(null);
  const factRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const srcRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [paths, setPaths] = useState<Record<string, string>>({});

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.getBoundingClientRect();
    const next: Record<string, string> = {};
    for (const e of EVIDENCE) {
      const f = factRefs.current[e.key];
      const s = srcRefs.current[e.key];
      if (!f || !s) continue;
      const fr = f.getBoundingClientRect();
      const sr = s.getBoundingClientRect();
      const x1 = fr.right - w.left;
      const y1 = fr.top + fr.height / 2 - w.top;
      const x2 = sr.left - w.left;
      const y2 = sr.top + sr.height / 2 - w.top;
      const mx = (x1 + x2) / 2;
      next[e.key] = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    }
    setPaths(next);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", measure);
    const t1 = window.setTimeout(measure, 300);
    const t2 = window.setTimeout(measure, 900); // after web fonts settle
    if (document.fonts?.ready) void document.fonts.ready.then(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [measure]);

  const cur = EVIDENCE.find((e) => e.key === active) ?? EVIDENCE[0];
  const handlers = (k: string) => ({
    onMouseEnter: () => setHovered(k),
    onMouseLeave: () => setHovered(null),
    onFocus: () => setSelected(k),
    onClick: () => setSelected(k),
  });

  return (
    <div className="space-y-6">
      <p className="text-center text-xs text-muted">Select a fact to trace it through the file.</p>
      <div ref={wrapRef} className="relative grid gap-6 sm:grid-cols-2 sm:items-start">
        {/* evidence threads — decorative connectors (hidden on mobile) */}
        <svg className="pointer-events-none absolute inset-0 z-10 hidden h-full w-full sm:block" aria-hidden>
          {EVIDENCE.map((e) => (
            <path
              key={e.key}
              d={paths[e.key] ?? ""}
              fill="none"
              stroke={active === e.key ? "var(--accent)" : "var(--muted)"}
              strokeWidth={active === e.key ? 1.75 : 1}
              strokeDasharray={active === e.key ? "0" : "2 5"}
              className="transition-all duration-300"
              style={{ opacity: active === e.key ? 1 : hovered || selected ? 0.14 : 0.3 }}
            />
          ))}
        </svg>

        {/* Read from the contract (facts) */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="border-b border-border bg-inset px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            Read from the contract
          </div>
          <ul>
            {EVIDENCE.map((e) => (
              <li key={e.key} className="border-b border-border last:border-0">
                <button
                  type="button"
                  ref={(el) => {
                    factRefs.current[e.key] = el;
                  }}
                  {...handlers(e.key)}
                  aria-pressed={active === e.key}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                    active === e.key ? "bg-accent-soft" : "hover:bg-inset"
                  }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full transition-colors ${active === e.key ? "bg-accent" : "bg-border"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] uppercase tracking-wide text-muted">{e.label}</span>
                    <span className="block text-sm font-medium">{e.value}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      active === e.key ? "bg-accent text-accent-fg" : "bg-inset text-muted"
                    }`}
                  >
                    p.{e.page}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* The contract (source) */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-sm)]">
          <div className="border-b border-border bg-inset px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            Contract of Sale · PDF
          </div>
          <div className="space-y-2 p-4">
            <div className="text-center font-serif text-[11px] font-semibold">CONTRACT OF SALE OF REAL ESTATE</div>
            <div className="h-1.5 rounded bg-border/70" style={{ width: "100%" }} />
            <div className="h-1.5 rounded bg-border/70" style={{ width: "82%" }} />
            {EVIDENCE.map((e) => (
              <button
                type="button"
                key={e.key}
                ref={(el) => {
                  srcRefs.current[e.key] = el;
                }}
                {...handlers(e.key)}
                aria-pressed={active === e.key}
                className={`flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-[11px] font-medium transition-colors ${
                  active === e.key ? "bg-accent text-accent-fg" : "bg-accent-soft text-foreground/85 hover:bg-accent/20"
                }`}
              >
                <span className="truncate">{e.src}</span>
                <span className={active === e.key ? "shrink-0 opacity-70" : "shrink-0 text-muted"}>p.{e.page}</span>
              </button>
            ))}
            <div className="h-1.5 rounded bg-border/70" style={{ width: "70%" }} />
            <div className="h-1.5 rounded bg-border/70" style={{ width: "60%" }} />
          </div>
        </div>
      </div>

      {/* The evidence trail: fact → verified source → effect → next action. Kept
          deliberately quiet — a trail of chips + separators, not four cards that
          compete with the panels above. */}
      <div className="rounded-2xl border border-border bg-inset/30 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1 sm:gap-y-2">
          <TrailStep cap="Fact" body={`${cur.label} · ${cur.value}`} />
          <TrailSep />
          <TrailStep tone="accent" cap="Verified source" body={`Contract of Sale, p.${cur.page}`} check />
          <TrailSep />
          <TrailStep cap="What it means" body={cur.effect} />
          <TrailSep />
          <TrailStep tone="awaiting" cap="Next action" body={cur.next} />
        </div>
      </div>
    </div>
  );
}

function TrailSep() {
  return (
    <span className="text-muted/60 sm:px-1" aria-hidden>
      <span className="hidden sm:inline">→</span>
      <span className="sm:hidden">↓</span>
    </span>
  );
}

function TrailStep({
  tone = "neutral",
  cap,
  body,
  check,
}: {
  tone?: "neutral" | "accent" | "awaiting";
  cap: string;
  body: string;
  check?: boolean;
}) {
  const capCls = tone === "accent" ? "text-accent" : tone === "awaiting" ? "text-awaiting" : "text-muted";
  return (
    <span className="min-w-0">
      <span className={`mr-2 text-[10px] font-semibold uppercase tracking-wide ${capCls}`}>{cap}</span>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground/90">
        {check ? <span className="text-accent">✓</span> : null}
        {body}
      </span>
    </span>
  );
}

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

function useInView<T extends HTMLElement>(threshold = 0.3) {
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
  const { ref, inView } = useInView<HTMLDivElement>(0.18);
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

// The finished-matter data behind every proof surface (hero brief, workflow,
// the explore overlay). One engine, different intake per business.
type Intake = {
  client: string;
  type: string;
  vertical: string;
  readiness: number;
  fields: { label: string; value: string; source: string }[];
  gap: string;
  draft: string;
};

const INTAKES: Record<string, Intake> = {
  "Family Law": {
    client: "Priya Sharma",
    type: "Spousal visa",
    vertical: "Immigration",
    readiness: 82,
    fields: [
      { label: "Applicant", value: "Priya Sharma", source: "“my name is Priya Sharma and I’m hoping to apply…”" },
      { label: "Marriage date", value: "14 Sep 2023", source: "“we got married on 2023-09-14”" },
      { label: "Sponsor", value: "Daniel Okafor", source: "“my partner Daniel Okafor, he’s a citizen here”" },
      { label: "Current status", value: "Student visa", source: "“I’m currently on a student visa and living in-country”" },
    ],
    gap: "Marriage certificate not attached",
    draft: "Hi Priya — to complete your application we just need your marriage certificate. Everything else is in order; send that across and we’ll proceed.",
  },
  Veterinary: {
    client: "Sofia Bianchi",
    type: "New patient intake",
    vertical: "Veterinary",
    readiness: 74,
    fields: [
      { label: "Owner", value: "Sofia Bianchi", source: "“this is Sofia, bringing in my dog Rocco”" },
      { label: "Pet", value: "Rocco · Labrador", source: "“Rocco, he’s a 4-year-old Labrador”" },
      { label: "Symptoms", value: "Limping, off food", source: "“he’s been limping and off his food for 3 days”" },
      { label: "Vaccination", value: "Up to date (2024)", source: "“vaccinations done in spring, records attached”" },
    ],
    gap: "Weight not provided (needed for dosing)",
    draft: "Hi Sofia — thanks, Rocco’s records came through. Could you confirm his current weight so we can prepare the right dosage before your visit?",
  },
  Accounting: {
    client: "James Alvarez",
    type: "Year-end accounts",
    vertical: "Accounting",
    readiness: 68,
    fields: [
      { label: "Business", value: "Alvarez Design Ltd", source: "“I run Alvarez Design, a limited company”" },
      { label: "Tax year", value: "2023–24", source: "“this is for the 2023 to 2024 year”" },
      { label: "GST / VAT", value: "Registered", source: "“we’re VAT registered, quarterly”" },
      { label: "Turnover", value: "~£240k", source: "“turnover was around 240 thousand”" },
    ],
    gap: "Bank statements for Q4 missing",
    draft: "Hi James — I’ve got the year mapped out. To finish I just need your Q4 bank statements; once those are in we can file well ahead of the deadline.",
  },
};

// ── 1. Hero: one email resolves into a prepared matter ───────────────────────
// The signature moment: a single recognisable client email — with a key fact and
// a document — resolves into a prepared matter and a drafted next step. Loops
// gently so it's never missed; holds on the resolved state under reduced motion.

export function PreparedDesk() {
  const reduced = useReducedMotion();
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (reduced) {
      setOn(true);
      return;
    }
    let t: number;
    const cycle = (state: boolean) => {
      setOn(state);
      t = window.setTimeout(() => cycle(!state), state ? 3800 : 2600);
    };
    t = window.setTimeout(() => cycle(true), 1000);
    return () => window.clearTimeout(t);
  }, [reduced]);

  const ease = (delay: number, dur = 650) => (reduced ? undefined : `all ${dur}ms ${EASE} ${delay}ms`);

  return (
    <div className="anim-float relative h-[420px] select-none sm:h-[460px]">
      {/* The incoming client email */}
      <div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2"
        style={{
          opacity: on ? 0 : 1,
          transform: on ? "translateY(-18px) scale(0.97)" : "none",
          filter: on ? "blur(3px)" : "none",
          transition: ease(0),
          pointerEvents: on ? "none" : undefined,
        }}
        aria-hidden={on}
      >
        <div className="glass glass-sheen rounded-3xl p-5">
          <div className="flex items-center gap-3 border-b border-border pb-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              TN
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium">Tomas Nowak</div>
              <div className="truncate text-xs text-muted">tomas.nowak@gmail.com</div>
            </div>
            <span className="ml-auto text-[11px] text-muted">New enquiry</span>
          </div>
          <div className="pt-3">
            <div className="text-sm font-medium">Buying at 8 Ellery Lane</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Hi, we&apos;re buying a place at 8 Ellery Lane, Fitzroy North. Settlement&apos;s{" "}
              <mark className="rounded bg-accent-soft px-1 text-foreground">5 June</mark> — contract&apos;s
              attached. I&apos;ll send the signed transfer once I have it.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-raise px-2 py-1 text-[11px]">
              <MiniDoc /> Contract-of-Sale.pdf
            </div>
          </div>
        </div>
      </div>

      {/* …resolved into a prepared matter with a drafted next step */}
      <div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2"
        style={{
          opacity: on ? 1 : 0,
          transform: on ? "none" : "translateY(22px)",
          transition: ease(180),
          pointerEvents: on ? undefined : "none",
        }}
        aria-hidden={!on}
      >
        <div className="glass glass-sheen rounded-3xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 px-1 pb-3">
            <div>
              <div className="text-sm font-semibold">Tomas Nowak · Property purchase</div>
              <div className="text-xs text-muted">Prepared from his email</div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
              <Check /> Ready to review
            </span>
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Settlement date</div>
              <div className="text-sm font-medium">5 June 2027</div>
              <div className="text-xs italic text-muted">“settlement&apos;s 5 June”</div>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3 text-sm">
              <Check /> Contract-of-Sale.pdf
              <span className="text-xs text-muted">— read · p.1</span>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-3 text-sm">
              <span aria-hidden="true" className="text-awaiting">○</span>
              <span className="font-medium">Signed transfer</span>
              <span className="ml-auto text-xs font-medium text-awaiting">missing</span>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-accent/40 bg-accent-soft p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <MiniDoc /> Drafted · request for the signed transfer
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-accent/20 pt-2 text-xs font-medium text-accent">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4Z" />
              </svg>
              Waiting for your approval
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Explore a sample intake — the interactive walkthrough ────────────────────
function FieldExplore({ field }: { field: Intake["fields"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-raise">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{field.value}</div>
          <div className="text-[11px] text-muted">{field.label}</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-accent">
          source
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: `transform 200ms ${EASE}` }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      <div
        className="overflow-hidden px-3.5"
        style={{ maxHeight: open ? 80 : 0, transition: `max-height 260ms ${EASE}` }}
      >
        <p className="border-t border-border py-2.5 text-xs italic leading-relaxed text-muted">
          {field.source}
        </p>
      </div>
    </div>
  );
}

function MatterDetail({ intake }: { intake: Intake }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-tight">{intake.client}</div>
          <div className="text-sm text-muted">
            {intake.type} · {intake.vertical}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold tabular-nums text-accent">
          {intake.readiness}%
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
          Extracted facts — open one to see its source
        </div>
        <div className="space-y-2">
          {intake.fields.map((f) => (
            <FieldExplore key={f.label} field={f} />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-error/40 bg-error-soft px-3.5 py-2.5 text-sm text-error">
        <span className="font-medium">Missing</span> · {intake.gap}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-inset px-3.5 py-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Follow-up drafted
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground">{intake.draft}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
          <span className="h-2 w-2 rounded-full bg-accent" /> Ready for your review
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-muted">Nothing sends until you approve</span>
          <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">
            Approve &amp; send
          </span>
        </span>
      </div>
    </div>
  );
}

export function ExploreIntake({
  label = "Explore a sample intake",
  variant = "link",
}: {
  label?: string;
  variant?: "link" | "button";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const industries = Object.keys(INTAKES);
  const [active, setActive] = useState(industries[0]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const trigger =
    variant === "button" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-5 py-3 text-sm font-medium transition-colors hover:bg-inset"
      >
        {label}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-foreground hover:text-accent"
      >
        {label} →
      </button>
    );

  return (
    <>
      {trigger}
      {mounted
        ? createPortal(
            <div
              className={`fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-8 ${
                open ? "" : "pointer-events-none"
              }`}
              aria-hidden={!open}
            >
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300"
          style={{ opacity: open ? 1 : 0 }}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Explore a sample intake"
          className="glass glass-sheen relative z-10 my-auto w-full max-w-2xl rounded-3xl p-4 transition-all duration-300 sm:p-5"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "none" : "translateY(12px) scale(0.98)",
          }}
        >
          <div className="flex items-center justify-between gap-4 px-1 pb-3">
            <div>
              <div className="font-serif text-lg font-semibold tracking-tight">A sample intake</div>
              <div className="text-xs text-muted">Same engine, your business — switch below.</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted hover:bg-inset hover:text-foreground"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 inline-flex rounded-full border border-border bg-surface p-1">
            {industries.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setActive(name)}
                aria-pressed={active === name}
                className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  active === name ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          <div key={active} className="anim-swapin">
            <MatterDetail intake={INTAKES[active]} />
          </div>
        </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ── 2. The fit: one living rubric workspace ──────────────────────────────────
/** A tasteable sample run per business line — a real inbound enquiry, the facts
 *  Briefly extracts (each with its source), the documents it recognises, and the
 *  first deliverable it drafts. Same engine, a different rulebook each time. */
type Fact = { label: string; value: string; src: string };
type Biz = {
  blurb: string;
  /** The firm's own WHEN → REQUIRE → DRAFT rule, shown so "how does it learn?" is answered up front. */
  rule: { trigger: string; requires: string[]; draft: string };
  email: { from: string; subject: string; body: string };
  facts: Fact[];
  docs: string[];
  deliverable: { title: string; preview: string };
  alsoDrafts: string[];
};
const BUSINESSES: Record<string, Biz> = {
  Legal: {
    blurb: "New client matter",
    rule: { trigger: "a new family-law matter", requires: ["parties", "key dates", "supporting documents"], draft: "consultation confirmation" },
    email: {
      from: "Sarah Whitfield",
      subject: "Starting divorce proceedings",
      body: "Hi, my husband James and I separated a few months ago after 9 years. We married on 14 September 2015 and have two children. I'd like to begin proceedings — I've attached our marriage certificate and a summary of our finances.",
    },
    facts: [
      { label: "Client & party", value: "Sarah Whitfield · v. James Whitfield", src: "my husband James and I separated" },
      { label: "Matter", value: "Divorce · 2 children", src: "have two children" },
      { label: "Key date", value: "Married 14 Sep 2015", src: "married on 14 September 2015" },
    ],
    docs: ["Marriage certificate", "Financial summary"],
    deliverable: {
      title: "Consultation confirmation",
      preview:
        "Dear Sarah, thank you for getting in touch. I've held a consultation slot and outlined the first steps and documents we'll need to begin…",
    },
    alsoDrafts: ["Engagement email", "Internal case brief"],
  },
  Property: {
    blurb: "Appraisal request",
    rule: { trigger: "a property appraisal", requires: ["address", "owner details", "reason for sale"], draft: "appraisal booking" },
    email: {
      from: "Grace Lim",
      subject: "Appraisal for 22 Hillcrest Road",
      body: "Hi, I'm looking to sell my home at 22 Hillcrest Road and would like an appraisal. I'm the owner and hoping to list before the school year. Happy to arrange a time that suits.",
    },
    facts: [
      { label: "Owner", value: "Grace Lim", src: "I'm the owner" },
      { label: "Property", value: "22 Hillcrest Road", src: "my home at 22 Hillcrest Road" },
      { label: "Reason & timing", value: "Selling · before school year", src: "hoping to list before the school year" },
    ],
    docs: ["Proof of ownership"],
    deliverable: {
      title: "Appraisal booking",
      preview:
        "Hi Grace, thanks for reaching out. I'd be glad to appraise 22 Hillcrest Road — here are a couple of times this week that could work…",
    },
    alsoDrafts: ["Listing response", "Landlord update"],
  },
  Accounting: {
    blurb: "New client onboarding",
    rule: { trigger: "a new client onboarding", requires: ["entity", "tax period", "required records"], draft: "onboarding next steps" },
    email: {
      from: "Mei Tan",
      subject: "Bookkeeping + tax for my Pte Ltd",
      body: "Hi, I run a small Pte Ltd (retail) and need bookkeeping plus help with this year's tax. Financial year ends 31 March and we're GST-registered. I can share Xero access and last year's return.",
    },
    facts: [
      { label: "Entity", value: "Pte Ltd · retail", src: "a small Pte Ltd (retail)" },
      { label: "Tax period", value: "FY end 31 Mar · GST-registered", src: "Financial year ends 31 March" },
      { label: "Service need", value: "Bookkeeping + tax", src: "need bookkeeping plus help with … tax" },
    ],
    docs: ["Xero access", "Prior year return"],
    deliverable: {
      title: "Onboarding next steps",
      preview:
        "Hi Mei, welcome aboard. Here's what we'll set up first and the access we'll need to get your books current…",
    },
    alsoDrafts: ["Engagement email", "Internal client brief"],
  },
};

function BusinessIcon({ name }: { name: string }) {
  const p = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "Legal")
    return (
      <svg {...p}>
        <path d="M12 3v18M6 21h12M5 7h14l-2-3H7L5 7Z" />
        <path d="M5 7l-2.5 5a2.5 2.5 0 0 0 5 0L5 7Zm14 0-2.5 5a2.5 2.5 0 0 0 5 0L19 7Z" />
      </svg>
    );
  if (name === "Property")
    return (
      <svg {...p}>
        <path d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M9.5 20v-6h5v6" />
      </svg>
    );
  return (
    <svg {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </svg>
  );
}

function MiniDoc() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3v5h5" />
      <path d="M6 3h8l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function RubricWorkspace() {
  const names = Object.keys(BUSINESSES);
  const [active, setActive] = useState(names[0]);
  const [stage, setStage] = useState(0); // 0 arriving · 1 extracting · 2 ready · 3 drafted
  const [runId, setRunId] = useState(0);
  const rm = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const startedRef = useRef(false);
  const b = BUSINESSES[active];

  // Auto-play the first run when the section scrolls into view.
  useEffect(() => {
    if (inView && !startedRef.current) {
      startedRef.current = true;
      setRunId((n) => n + 1);
    }
  }, [inView]);

  // Drive the run whenever it (re)starts. Reduced motion → jump to the end.
  useEffect(() => {
    if (runId === 0) return;
    if (rm) {
      setStage(3);
      return;
    }
    setStage(0);
    const t = [
      setTimeout(() => setStage(1), 500),
      setTimeout(() => setStage(2), 1750),
      setTimeout(() => setStage(3), 2900),
    ];
    return () => t.forEach(clearTimeout);
  }, [runId, rm]);

  function pick(name: string) {
    setActive(name);
    setRunId((n) => n + 1);
  }

  const pct = stage === 0 ? 0 : stage === 1 ? 64 : 100;
  const reveal = (on: boolean, dy = 8, delay = 0) => ({
    opacity: on ? 1 : 0,
    transform: on ? "none" : `translateY(${dy}px)`,
    transition: `opacity 460ms ${EASE} ${delay}ms, transform 460ms ${EASE} ${delay}ms`,
  });

  return (
    <div ref={ref} className="mx-auto max-w-5xl">
      {/* Business line tabs */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-border bg-surface p-1">
          {names.map((name) => {
            const on = active === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => pick(name)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  on ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
                }`}
              >
                <BusinessIcon name={name} />
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* The rule the firm set — stated as a clean sentence, so "how does it
          learn?" is answered before the run below shows it in action. */}
      <div key={`rule-${active}`} className="anim-swapin mx-auto mt-6 max-w-2xl text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          The rule you set
        </div>
        <p className="mt-2 text-base leading-relaxed">
          When <span className="font-medium">{b.rule.trigger}</span> arrives, require{" "}
          {b.rule.requires.map((rq, i) => (
            <span key={rq}>
              <span className="font-medium">{rq}</span>
              {i < b.rule.requires.length - 1 ? ", " : ""}
            </span>
          ))}
          . Once it&apos;s complete, draft the{" "}
          <span className="font-medium text-accent">{b.rule.draft}</span>.
        </p>
      </div>

      {/* The run — the rule above, in action */}
      <div className="glass glass-sheen mt-6 overflow-hidden rounded-3xl">
        <div className="grid gap-px bg-border md:grid-cols-2">
          {/* Left — the inbound enquiry */}
          <div className="bg-surface p-6 sm:p-7">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Inbound client email
            </div>
            <div key={`mail-${active}`} className="anim-swapin mt-4 rounded-xl border border-border bg-raise p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                  {b.email.from.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
                {b.email.from}
              </div>
              <div className="mt-3 text-sm font-medium">{b.email.subject}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{b.email.body}</p>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted" style={reveal(stage >= 1, 4)}>
              <span className={`h-1.5 w-1.5 rounded-full ${stage >= 2 ? "bg-accent" : "bg-awaiting"}`} />
              {stage === 0
                ? "Arriving…"
                : stage === 1
                  ? "Reading & checking your rulebook…"
                  : "Matched to your " + active + " rulebook"}
            </div>
          </div>

          {/* Right — the prepared file building */}
          <div key={`out-${active}`} className="anim-swapin bg-surface p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Prepared file
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                  stage >= 2 ? "bg-accent-soft text-accent" : "bg-inset text-muted"
                }`}
              >
                {stage >= 2 ? <Check /> : null}
                {stage === 0 ? "—" : `${pct}% ready`}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-inset">
              <div
                className={`h-full rounded-full ${stage >= 2 ? "bg-accent" : "bg-awaiting"}`}
                style={{ width: `${pct}%`, transition: `width 900ms ${EASE}, background-color 300ms` }}
              />
            </div>

            {/* Extracted, source-backed facts */}
            <ul className="mt-4 space-y-2.5">
              {b.facts.map((f, i) => (
                <li key={f.label} style={reveal(stage >= 1, 8, i * 140)}>
                  <div className="text-[11px] uppercase tracking-wide text-muted">{f.label}</div>
                  <div className="text-sm font-medium">{f.value}</div>
                  <div className="text-xs italic text-muted">“{f.src}”</div>
                </li>
              ))}
            </ul>

            {/* Documents recognised */}
            <div className="mt-4 flex flex-wrap gap-2" style={reveal(stage >= 2, 8)}>
              {b.docs.map((d) => (
                <span key={d} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raise px-2.5 py-1 text-xs">
                  <Check /> {d}
                </span>
              ))}
            </div>

            {/* The drafted deliverable + human gate */}
            <div className="mt-5 rounded-xl border border-accent/40 bg-accent-soft p-4" style={reveal(stage >= 3, 10)}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                <MiniDoc /> Drafted · {b.deliverable.title}
              </div>
              <p className="mt-1.5 text-sm text-foreground">{b.deliverable.preview}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {b.alsoDrafts.map((d) => (
                  <span key={d} className="rounded-md bg-surface px-2 py-0.5 text-[11px] text-muted">
                    + {d}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-accent/20 pt-3 text-xs font-medium text-accent">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4Z" />
                </svg>
                Waiting for your approval
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-6 py-3">
          <p className="text-xs text-muted">
            Same engine, your rulebook — a real {active.toLowerCase()} enquiry, prepared and stopped
            at your review.
          </p>
          <button
            type="button"
            onClick={() => setRunId((n) => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-inset"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 3. The process: one full-width transformation ────────────────────────────
const PIPELINE = ["Classify", "Extract", "Flag gaps", "Draft reply", "Ready for review"];

export function ProcessCanvas() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(reduced ? PIPELINE.length : 0);

  useEffect(() => {
    if (reduced) {
      setStage(PIPELINE.length);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let timers: number[] = [];
    // Start only once the canvas is centred in view, and pace the beats slowly
    // so the visitor can follow each step. Replays if they scroll back to it.
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        timers.forEach(clearTimeout);
        setStage(0);
        timers = PIPELINE.map((_, i) => window.setTimeout(() => setStage(i + 1), 650 + i * 780));
      },
      { rootMargin: "-30% 0px -35% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [reduced]);

  const intake = INTAKES["Family Law"];

  return (
    <div ref={ref} className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)]">
      {/* Raw email */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Incoming email</div>
        <div className="mt-3 text-sm font-medium">Priya Sharma</div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Hi, my name is Priya Sharma and I’m hoping to apply for a spousal visa to stay with my
          partner. We got married on 2023-09-14. My partner Daniel Okafor is a citizen here; I’m
          currently on a student visa…
        </p>
        <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-inset px-1.5 py-0.5 text-[11px]">
          passport.pdf
        </div>
      </div>

      {/* Pipeline lighting up */}
      <div className="flex flex-row items-center justify-center gap-3 lg:flex-col lg:items-stretch lg:gap-2">
        {PIPELINE.map((p, i) => {
          const done = stage >= i + 1;
          return (
            <div key={p} className="flex items-center gap-2">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-medium tabular-nums transition-colors duration-300"
                style={
                  done
                    ? { background: "var(--accent)", color: "var(--accent-fg)" }
                    : { border: "1px solid var(--border)", color: "var(--muted)" }
                }
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className="hidden whitespace-nowrap text-xs transition-colors duration-300 lg:inline"
                style={{ color: done ? "var(--foreground)" : "var(--muted)" }}
              >
                {p}
              </span>
            </div>
          );
        })}
      </div>

      {/* Prepared matter builds */}
      <div className="glass glass-sheen rounded-3xl p-3 sm:p-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{intake.client}</div>
              <div
                className="text-xs text-muted"
                style={{ opacity: stage >= 1 ? 1 : 0, transition: `opacity 300ms ${EASE}` }}
              >
                {intake.type} · matched
              </div>
            </div>
            <span
              className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-accent"
              style={{ opacity: stage >= 2 ? 1 : 0, transition: `opacity 300ms ${EASE}` }}
            >
              {intake.readiness}%
            </span>
          </div>

          <div
            className="overflow-hidden"
            style={{ maxHeight: stage >= 2 ? 200 : 0, marginTop: stage >= 2 ? 12 : 0, transition: `max-height 450ms ${EASE}, margin-top 450ms ${EASE}` }}
          >
            <div className="space-y-2 rounded-xl border border-border bg-raise p-3">
              {intake.fields.slice(0, 3).map((f, i) => (
                <div
                  key={f.label}
                  className="flex items-baseline justify-between gap-3"
                  style={{ opacity: stage >= 2 ? 1 : 0, transition: `opacity 300ms ${EASE} ${i * 90}ms` }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{f.value}</div>
                    <div className="text-[11px] text-muted">{f.label}</div>
                  </div>
                  <span className="shrink-0 text-[10px] text-accent">from message</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="overflow-hidden"
            style={{ maxHeight: stage >= 3 ? 60 : 0, marginTop: stage >= 3 ? 12 : 0, transition: `max-height 400ms ${EASE}, margin-top 400ms ${EASE}` }}
          >
            <div className="flex items-center gap-2 rounded-xl border border-error/40 bg-error-soft px-3 py-2 text-xs text-error">
              <span className="font-medium">Missing</span> · {intake.gap}
            </div>
          </div>

          <div
            className="overflow-hidden"
            style={{ maxHeight: stage >= 4 ? 120 : 0, marginTop: stage >= 4 ? 12 : 0, transition: `max-height 400ms ${EASE}, margin-top 400ms ${EASE}` }}
          >
            <div className="rounded-xl border border-border bg-inset px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Follow-up drafted</div>
              <p className="mt-1 text-xs leading-relaxed text-foreground">{intake.draft}</p>
            </div>
          </div>

          <div
            className="overflow-hidden"
            style={{ maxHeight: stage >= 5 ? 60 : 0, transition: `max-height 400ms ${EASE}` }}
          >
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
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
    </div>
  );
}

// ── Thread stays together ────────────────────────────────────────────────────
export function ThreadingProof() {
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const [folded, setFolded] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setFolded(true);
      return;
    }
    const t = window.setTimeout(() => setFolded(true), 450);
    return () => window.clearTimeout(t);
  }, [inView, reduced]);

  // Three loose pieces of the same conversation — scattered until they fold into
  // one clean matter timeline.
  const items = [
    { t: "Original enquiry", d: "“…hoping to apply for a spousal visa to join my partner.”", meta: "readiness 41%", attach: null as string | null, rot: -2.5, dx: 14 },
    { t: "Client reply", d: "“Here's our marriage certificate as requested.”", meta: "readiness 41% → 100%", attach: "marriage_certificate.pdf", rot: 2.2, dx: -18 },
    { t: "Your follow-up", d: "“Thank you — we now have everything we need.”", meta: "sent", attach: null, rot: -1.4, dx: 10 },
  ];

  return (
    <div ref={ref} className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
      <div>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          One client intake. <span className="italic text-accent">One matter.</span>
        </h2>
        <p className="mt-4 text-muted">
          The first email, the reply with an attachment, the follow-up — Briefly folds every loose
          piece into a single matter that just gets more complete. Only a genuinely new client uses
          a matter.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <span className="tabular-nums font-medium">18 / 60</span>
          <span className="text-muted">matters used this month</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">
            unchanged
          </span>
        </div>
      </div>

      {/* The fold: scattered pieces → one clean timeline */}
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold">Priya Sharma · Spousal visa</div>
          <span
            className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent"
            style={{ opacity: folded ? 1 : 0, transition: `opacity 500ms ${EASE} 500ms` }}
          >
            1 matter
          </span>
        </div>
        <div className="relative">
          {/* timeline spine — draws in once folded */}
          <div
            className="absolute bottom-3 left-[7px] top-3 w-px bg-border"
            style={{ opacity: folded ? 1 : 0, transition: `opacity 500ms ${EASE} 350ms` }}
          />
          <ol className="space-y-3">
            {items.map((it, i) => (
              <li
                key={it.t}
                className="relative pl-6"
                style={{
                  transform: folded ? "none" : `rotate(${it.rot}deg) translateX(${it.dx}px)`,
                  transition: `transform 700ms ${EASE} ${i * 110}ms`,
                }}
              >
                {/* node */}
                <span
                  className="absolute left-1 top-3 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent"
                  style={{ opacity: folded ? 1 : 0, transition: `opacity 400ms ${EASE} ${450 + i * 110}ms` }}
                />
                <div
                  className={`rounded-xl border bg-raise px-3.5 py-2.5 ${
                    folded ? "border-border shadow-none" : "border-border shadow-sm"
                  }`}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {it.t}
                  </div>
                  <div className="mt-0.5 text-sm">{it.d}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {it.attach ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-inset px-1.5 py-0.5 text-[11px] text-foreground">
                        <MiniDoc /> {it.attach}
                      </span>
                    ) : null}
                    <span className={`text-[11px] ${it.meta.includes("→") ? "text-accent" : "text-muted"}`}>
                      {it.meta}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ── Two-path triage ───────────────────────────────────────────────────────────

/** Ease a number 0 → target once `run` flips true (instant under reduced-motion). */
function useCountUp(target: number, run: boolean, ms = 1100): number {
  const [v, setV] = useState(0);
  const rm = useReducedMotion();
  useEffect(() => {
    if (!run) return;
    if (rm) {
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, ms, rm]);
  return v;
}

function MailGlyph() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    </span>
  );
}

function ForkGlyph() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-accent shadow-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="18" cy="6" r="2.4" />
        <circle cx="12" cy="19" r="2.4" />
        <path d="M6 8.5v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2" />
        <path d="M12 13.5v3" />
      </svg>
    </span>
  );
}

/** One outcome card — Path A (missing) in honey, Path B (ready) in forest. */
function PathCard({
  variant,
  show,
  delay,
}: {
  variant: "A" | "B";
  show: boolean;
  delay: number;
}) {
  const a = variant === "A";
  return (
    <div
      className="glass glass-sheen lift relative overflow-hidden rounded-2xl p-6 sm:p-7"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(18px)",
        transition: `opacity 620ms ${EASE} ${delay}ms, transform 620ms ${EASE} ${delay}ms`,
      }}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${a ? "bg-awaiting" : "bg-accent"}`} />
        {a ? "Path A · Incomplete" : "Path B · 100% complete"}
      </div>
      <h3 className="mt-4 font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
        {a ? (
          <>
            Facts or documents <span className="italic text-awaiting">are missing.</span>
          </>
        ) : (
          <>
            The file is ready <span className="italic text-accent">for action.</span>
          </>
        )}
      </h3>
      <p className="mt-3 text-sm text-muted">
        {a
          ? "Briefly drafts a precise request for exactly what's outstanding — nothing more."
          : "Briefly drafts the first deliverable your complete-when rule calls for."}
      </p>

      <div
        className={`mt-5 rounded-xl border px-4 py-3 ${
          a ? "border-awaiting/40 bg-awaiting-soft" : "border-accent/40 bg-accent-soft"
        }`}
      >
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold ${
            a ? "text-awaiting" : "text-accent"
          }`}
        >
          {a ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 3v5h5" />
              <path d="M6 3h8l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
              <path d="M9 13h6M9 16h4" />
            </svg>
          )}
          {a ? "Drafted request" : "Drafted initial work"}
        </div>
        <p className="mt-1.5 text-sm font-medium">
          {a
            ? "“Please send the signed transfer and confirm the settlement date.”"
            : "“Confirmation, next steps & the settlement timeline.”"}
        </p>
        <p className="mt-1 text-xs text-muted">
          {a ? "Then: Awaiting the client" : "Or: costs disclosure · matter opening"}
        </p>
      </div>
    </div>
  );
}

export function TwoPathTriage() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const rm = useReducedMotion();
  const show = inView || rm;
  const readiness = useCountUp(68, show);

  return (
    <div ref={ref}>
      {/* Asymmetric header */}
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Missing, or ready — the two paths
          </div>
          <h2 className="mt-4 font-serif text-2xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-3xl">
            Every enquiry reaches <span className="italic text-accent">a clear fork.</span>
          </h2>
        </div>
        <p className="text-muted lg:pb-2">
          Briefly checks the email against your checklist, scores how ready the file is, then drafts
          the right first move — whether something&apos;s missing or the file is complete.
        </p>
      </div>

      {/* Intake card */}
      <div className="mt-10">
        <div className="glass glass-sheen relative flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <MailGlyph />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Inbound client email
              </div>
              <div className="font-semibold">Read it &amp; check your checklist</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">Readiness score</span>
            <span className="rounded-md bg-accent-soft px-2.5 py-1 text-sm font-semibold tabular-nums text-accent">
              {readiness}%
            </span>
          </div>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-inset">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${show ? 68 : 0}%`, transition: `width 1100ms ${EASE}` }}
          />
        </div>
      </div>

      {/* Fork connector */}
      <div className="flex flex-col items-center pt-6">
        <div className={`line-draw ${show ? "in" : ""} h-8 w-px bg-border`} />
        <ForkGlyph />
        <p className="mt-3 text-center text-sm font-medium text-accent">
          Briefly matches the next action to the state of the matter
        </p>
      </div>

      {/* Split rule (desktop) */}
      <div className="relative mx-auto mt-4 hidden h-6 w-2/3 lg:block" aria-hidden>
        <div className={`line-grow ${show ? "in" : ""} absolute left-1/4 right-1/4 top-0 border-t border-border`} />
        <div className={`line-draw ${show ? "in" : ""} absolute left-1/4 top-0 h-6 w-px bg-border`} />
        <div className={`line-draw ${show ? "in" : ""} absolute right-1/4 top-0 h-6 w-px bg-border`} />
      </div>

      {/* The two paths */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <PathCard variant="A" show={show} delay={120} />
        <PathCard variant="B" show={show} delay={240} />
      </div>

      {/* Professional review */}
      <div className="mt-6 rounded-xl border border-border bg-inset px-5 py-4">
        <p className="text-sm">
          <span className="font-medium">You keep the call.</span>{" "}
          <span className="text-muted">
            Whichever path, Briefly stops at your desk — review, adjust if needed, then approve and
            send.
          </span>
        </p>
      </div>
    </div>
  );
}

// ── Sticky decision fork ──────────────────────────────────────────────────────

/** Progress 0→1 as the sticky child is pinned through its tall track. */
function useTrackProgress(ref: React.RefObject<HTMLElement | null>) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const total = rect.height - window.innerHeight;
        const scrolled = -rect.top;
        setP(total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
  return p;
}

/** The persistent matter workspace — one file whose readiness and requirements
 *  evolve as the client replies. Real Briefly UI language. */
function ForkWorkspace({
  readiness,
  received,
  ready,
  replyIn,
}: {
  readiness: number;
  received: boolean;
  ready: boolean;
  replyIn: boolean;
}) {
  return (
    <div className="glass glass-sheen rounded-3xl p-5 sm:p-6">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
          TN
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Tomas Nowak</div>
          <div className="truncate text-xs text-muted">Property Purchase · 8 Ellery Lane</div>
        </div>
        <span
          className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-500"
          style={
            ready
              ? { background: "var(--accent-soft)", color: "var(--accent)" }
              : { background: "var(--awaiting-soft)", color: "var(--awaiting)" }
          }
        >
          {ready ? "✓ Ready for your review" : "Preparing…"}
        </span>
      </div>

      {/* readiness */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Readiness</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-inset">
          <div
            className="h-full rounded-full"
            style={{
              width: `${readiness}%`,
              background: ready ? "var(--accent)" : "var(--awaiting)",
              transition: "width 300ms linear, background-color 500ms",
            }}
          />
        </div>
        <span
          className="text-xs font-semibold tabular-nums"
          style={{ color: ready ? "var(--accent)" : "var(--awaiting)" }}
        >
          {readiness}%
        </span>
      </div>

      {/* requirements — checked against the firm's rulebook */}
      <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Checked against your Property Purchase rulebook
      </div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {[
          { label: "Property · 8 Ellery Lane, Fitzroy North", src: "from email" },
          { label: "Vendors · Kwame & Abena Osei", src: "Contract p.1" },
          { label: "Settlement · 5 June 2027", src: "Contract p.3" },
        ].map((r) => (
          <li key={r.label} className="flex items-center gap-2.5">
            <span className="text-accent">&#10003;</span>
            <span className="min-w-0 flex-1 truncate text-foreground/85">{r.label}</span>
            <span className="shrink-0 text-xs text-muted">{r.src}</span>
          </li>
        ))}
        {/* the pivotal requirement — the fork turns on this row */}
        <li
          id="fork-pivot"
          className="flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors"
          style={
            received
              ? { background: "var(--accent-soft)" }
              : { background: "color-mix(in srgb, var(--awaiting-soft) 60%, transparent)" }
          }
        >
          <span style={{ color: received ? "var(--accent)" : "var(--awaiting)" }}>
            {received ? "✓" : "○"}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground/85">Signed transfer</span>
          <span
            className="shrink-0 text-xs font-medium"
            style={{ color: received ? "var(--accent)" : "var(--awaiting)" }}
          >
            {received ? "received · reply p.1" : "missing"}
          </span>
        </li>
      </ul>

      {/* the client reply — folds into the same matter */}
      <div
        className="mt-3 overflow-hidden"
        style={{
          maxHeight: replyIn ? 84 : 0,
          opacity: replyIn ? 1 : 0,
          transition: `max-height 500ms ${EASE}, opacity 400ms ${EASE}`,
        }}
      >
        <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-accent" aria-hidden>
              &#9993;
            </span>
            <span className="font-medium text-foreground/85">Tomas replied</span>
            <span className="ml-auto text-muted">folded into this matter</span>
          </div>
          <p className="mt-1 pl-6 text-xs italic text-muted">
            &ldquo;Done — I&apos;ve signed the Contract of Sale and attached it.&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}

/** One outcome of the fork — Path A (chase, awaiting) or Path B (work brief, ready). */
function ForkOutcome({ variant }: { variant: "A" | "B" }) {
  const a = variant === "A";
  return (
    <div
      className={`h-full rounded-3xl border p-5 sm:p-6 ${
        a ? "border-awaiting/40 bg-awaiting-soft/50" : "border-accent/40 bg-accent-soft/60"
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
        <span className={`h-1.5 w-1.5 rounded-full ${a ? "bg-awaiting" : "bg-accent"}`} />
        <span className={a ? "text-awaiting" : "text-accent"}>
          {a ? "Path A · Awaiting information" : "Path B · Ready for action"}
        </span>
      </div>
      <h3 className="mt-3 font-serif text-xl font-semibold tracking-tight sm:text-2xl">
        {a ? (
          <>
            One item is <span className="italic text-awaiting">still missing.</span>
          </>
        ) : (
          <>
            The file is <span className="italic text-accent">ready.</span>
          </>
        )}
      </h3>
      <p className="mt-2 text-sm text-muted">
        {a
          ? "Briefly prepares the exact request for what's outstanding — nothing more — and stops."
          : "Every requirement is met and sourced. Briefly prepares the Initial Work Brief and your next decision."}
      </p>

      <div
        className={`mt-4 rounded-xl border bg-surface px-4 py-3 ${a ? "border-awaiting/30" : "border-accent/30"}`}
      >
        <div
          className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${
            a ? "text-awaiting" : "text-accent"
          }`}
        >
          <MiniDoc />
          {a ? "Prepared request" : "Initial Work Brief"}
        </div>
        {a ? (
          <p className="mt-2 text-sm text-foreground/85">
            &ldquo;Hi Tomas — could you send the signed transfer when you have a moment? Once it&apos;s in
            we can proceed.&rdquo;
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-foreground/85">
            <li className="flex items-center gap-2">
              <span className="text-accent">&#10003;</span> Parties, property &amp; settlement — all sourced
            </li>
            <li className="flex items-center gap-2">
              <span className="text-accent">&#10003;</span> Signed Contract of Sale on file
            </li>
            <li className="flex items-center gap-2 text-muted">
              <span className="text-accent">→</span> Next: order title search on both proprietors
            </li>
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${a ? "text-awaiting" : "text-accent"}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4Z" />
          </svg>
          {a ? "Awaiting your review" : "Ready for your review"}
        </span>
        <span
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            a ? "border border-awaiting/50 text-awaiting" : "bg-accent text-accent-fg"
          }`}
        >
          {a ? "Review & send" : "Open the work brief"}
        </span>
      </div>
    </div>
  );
}

/** The signature evidence thread for this chapter — a single connector between the
 *  matter and its prepared outcome. Unresolved (dashed, honey) on Path A; resolved
 *  (solid, forest) on Path B. Relative geometry, so it never misaligns; decorative,
 *  hidden on mobile. */
function ForkThread({ resolved }: { resolved: boolean }) {
  return (
    <svg
      className="pointer-events-none hidden h-full w-full lg:block"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M 2 50 C 40 50, 60 50, 98 50"
        fill="none"
        stroke={resolved ? "var(--accent)" : "var(--awaiting)"}
        strokeWidth={resolved ? 2 : 1.5}
        strokeDasharray={resolved ? "0" : "3 4"}
        vectorEffect="non-scaling-stroke"
        style={{ transition: "stroke 500ms" }}
      />
      <circle cx="2" cy="50" r="2.4" fill={resolved ? "var(--accent)" : "var(--awaiting)"} vectorEffect="non-scaling-stroke" />
      <circle cx="98" cy="50" r="2.4" fill={resolved ? "var(--accent)" : "var(--awaiting)"} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function DecisionFork() {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollP = useTrackProgress(trackRef);
  const p = scrollP;

  // Phase mapping. Reduced motion presents both outcomes at rest (no scroll).
  const aOpacity = reduced ? 1 : Math.min(1, Math.max(0, (0.6 - p) / 0.12));
  const bOpacity = reduced ? 1 : Math.min(1, Math.max(0, (p - 0.52) / 0.12));
  const replyIn = reduced ? false : p >= 0.44;
  const received = reduced ? false : p >= 0.52;
  const ready = reduced ? false : p >= 0.6;
  const readiness = reduced ? 66 : Math.round(66 + Math.min(1, Math.max(0, (p - 0.4) / 0.25)) * 34);

  const Header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          One file · two paths
        </div>
        <h2 className="mt-3 font-serif text-3xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-4xl">
          Every enquiry reaches a clear fork.
        </h2>
      </div>
      {/* which path is live */}
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
        <span
          className="rounded-full px-2.5 py-1 transition-colors"
          style={
            ready
              ? { background: "var(--inset)", color: "var(--muted)" }
              : { background: "var(--awaiting-soft)", color: "var(--awaiting)" }
          }
        >
          Path A
        </span>
        <span aria-hidden className="text-muted">
          →
        </span>
        <span
          className="rounded-full px-2.5 py-1 transition-colors"
          style={
            ready
              ? { background: "var(--accent-soft)", color: "var(--accent)" }
              : { background: "var(--inset)", color: "var(--muted)" }
          }
        >
          Path B
        </span>
      </div>
    </div>
  );

  const Stage = (
    <div className="mx-auto max-w-6xl px-6">
      {Header}
      <div className="mt-8 grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] lg:gap-0">
        {/* the one matter */}
        <ForkWorkspace readiness={readiness} received={received} ready={ready} replyIn={replyIn} />

        {/* evidence thread */}
        <div className="hidden h-24 items-center justify-center lg:flex">
          <ForkThread resolved={ready} />
        </div>

        {/* the active outcome */}
        {reduced ? (
          <div className="space-y-4">
            <ForkOutcome variant="A" />
            <ForkOutcome variant="B" />
          </div>
        ) : (
          <div className="relative min-h-[300px]">
            <div
              className="lg:absolute lg:inset-0"
              style={{ opacity: aOpacity, transition: "opacity 300ms linear", pointerEvents: aOpacity > 0.5 ? "auto" : "none" }}
              aria-hidden={aOpacity < 0.5}
            >
              <ForkOutcome variant="A" />
            </div>
            <div
              className="mt-4 lg:absolute lg:inset-0 lg:mt-0"
              style={{ opacity: bOpacity, transition: "opacity 300ms linear", pointerEvents: bOpacity > 0.5 ? "auto" : "none" }}
              aria-hidden={bOpacity < 0.5}
            >
              <ForkOutcome variant="B" />
            </div>
          </div>
        )}
      </div>

      {/* the automatic-prep promise + the human boundary */}
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">
        By the time you open the file, Briefly has already done the prep.{" "}
        <span className="font-medium text-foreground/80">You review, decide, and send.</span> Whichever
        path, nothing leaves your desk until you approve it.
      </p>
    </div>
  );

  // Reduced motion → a calm, static presentation of both outcomes (no pinning).
  if (reduced) {
    return <div className="py-4">{Stage}</div>;
  }

  return (
    <div ref={trackRef} className="relative h-[260vh]">
      <div className="sticky top-0 flex min-h-screen items-center py-16">{Stage}</div>
    </div>
  );
}

// ── A summary is not a workflow ───────────────────────────────────────────────

export function SummaryVsWorkflow() {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      {/* Generic summary — deliberately flat and inert */}
      <div className="rounded-2xl border border-border bg-inset p-6 sm:p-7">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          A generic summary
        </div>
        <p className="mt-4 font-serif text-xl leading-relaxed text-muted">
          “The client is seeking advice regarding a property settlement and has supplied some
          financial information.”
        </p>
        <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm text-muted">
          <p>What is missing?</p>
          <p>Who owns the next step?</p>
          <p>Is it ready?</p>
        </div>
      </div>

      {/* Briefly triage — the answer, glass and alive */}
      <div className="glass glass-sheen lift rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 5h16M4 12h16M4 19h10" />
              </svg>
            </span>
            Briefly triage
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
            <Check /> 68% ready
          </span>
        </div>

        <div className="grid gap-5 py-5 sm:grid-cols-3">
          {[
            { k: "Source-backed facts", v: "Parties · assets · children" },
            { k: "Gap identified", v: "Marriage certificate" },
            { k: "Next step", v: "Follow-up drafted" },
          ].map((c) => (
            <div key={c.k}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                {c.k}
              </div>
              <div className="mt-1.5 text-sm font-medium">{c.v}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4Z" />
            </svg>
            Waiting for your approval
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
